import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "crypto";
import type { FastifyReply } from "fastify";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { RolePolicyService } from "../auth/role-policy.service";
import {
  ArtistMembershipRole,
  MembershipInviteStatus
} from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { StoryboardQueueService } from "../queue/storyboard-queue.service";

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roles: RolePolicyService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly queue: StoryboardQueueService
  ) {}

  private expiryMs(): number {
    const days = this.config.get<number>("INVITE_EXPIRY_DAYS") ?? 14;
    return days * 24 * 60 * 60 * 1000;
  }

  async createInvite(input: {
    artistId: string;
    email: string;
    role: ArtistMembershipRole;
    actorOperatorId: string;
    actorLabel: string;
  }): Promise<{ inviteId: string; token: string; expiresAt: Date }> {
    const { artistId, actorOperatorId, actorLabel } = input;
    await this.roles.assertOwner(actorOperatorId, artistId);

    const email = normalizeInviteEmail(input.email);
    if (!email.includes("@")) {
      throw new BadRequestException("Invalid email");
    }

    const pendingOther = await this.prisma.client.artistMembershipInvite.findFirst({
      where: {
        artistId,
        email,
        status: MembershipInviteStatus.pending
      }
    });
    if (pendingOther) {
      throw new ConflictException(
        "A pending invite already exists for this email on this artist"
      );
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + this.expiryMs());

    const invite = await this.prisma.client.artistMembershipInvite.create({
      data: {
        artistId,
        email,
        role: input.role,
        tokenHash,
        expiresAt,
        createdByOperatorId: actorOperatorId
      }
    });

    await this.audit.log({
      artistId,
      aggregateType: "membership_invite",
      aggregateId: invite.id,
      action: "membership_invite.created",
      actorLabel,
      actorOperatorId: actorOperatorId,
      metadata: {
        email,
        role: input.role,
        expiresAt: expiresAt.toISOString()
      }
    });

    const artist = await this.prisma.client.artist.findUnique({
      where: { id: artistId },
      select: { name: true }
    });
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    const acceptPath = `/onboarding?invite=${encodeURIComponent(rawToken)}`;
    const acceptUrl = `${webUrl.replace(/\/$/, "")}${acceptPath}`;
    try {
      await this.queue.enqueueInviteSend({
        inviteId: invite.id,
        artistId,
        acceptUrl,
        inviteeEmail: email,
        artistName: artist?.name ?? "StoryBoard",
        role: input.role
      });
    } catch {
      /* best-effort; invite still valid for manual share */
    }

    return { inviteId: invite.id, token: rawToken, expiresAt };
  }

  async listPending(artistId: string, actorOperatorId: string) {
    await this.roles.assertOwner(actorOperatorId, artistId);
    return this.prisma.client.artistMembershipInvite.findMany({
      where: {
        artistId,
        status: MembershipInviteStatus.pending
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        createdByOperatorId: true,
        deliveredAt: true,
        deliveryChannel: true,
        deliveryLastError: true
      }
    });
  }

  async revoke(
    inviteId: string,
    artistId: string,
    actorOperatorId: string,
    actorLabel: string
  ): Promise<void> {
    await this.roles.assertOwner(actorOperatorId, artistId);

    const invite = await this.prisma.client.artistMembershipInvite.findFirst({
      where: { id: inviteId, artistId }
    });
    if (!invite) {
      throw new NotFoundException("Invite not found");
    }
    if (invite.status !== MembershipInviteStatus.pending) {
      throw new BadRequestException("Invite is not pending");
    }

    await this.prisma.client.artistMembershipInvite.update({
      where: { id: inviteId },
      data: {
        status: MembershipInviteStatus.revoked,
        revokedAt: new Date()
      }
    });

    await this.audit.log({
      artistId,
      aggregateType: "membership_invite",
      aggregateId: inviteId,
      action: "membership_invite.revoked",
      actorLabel,
      actorOperatorId,
      metadata: { email: invite.email }
    });
  }

  async accept(
    token: string,
    operatorId: string,
    operatorEmail: string,
    actorLabel: string,
    setCookieReply: FastifyReply
  ): Promise<{ artistId: string; role: ArtistMembershipRole }> {
    const t = token?.trim();
    if (!t) {
      throw new BadRequestException("token required");
    }
    const tokenHash = hashInviteToken(t);
    const invite = await this.prisma.client.artistMembershipInvite.findUnique({
      where: { tokenHash }
    });

    if (!invite) {
      throw new NotFoundException("Invalid or expired invite");
    }
    if (invite.status !== MembershipInviteStatus.pending) {
      throw new BadRequestException("Invite is no longer valid");
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.client.artistMembershipInvite.update({
        where: { id: invite.id },
        data: { status: MembershipInviteStatus.expired }
      });
      throw new BadRequestException("Invite has expired");
    }

    const opEmail = normalizeInviteEmail(operatorEmail);
    if (opEmail !== invite.email) {
      throw new BadRequestException(
        "Signed-in account email does not match this invite"
      );
    }

    const result = await this.prisma.client.$transaction(async (tx) => {
      const membership = await tx.artistMembership.upsert({
        where: {
          operatorId_artistId: { operatorId, artistId: invite.artistId }
        },
        create: {
          operatorId,
          artistId: invite.artistId,
          role: invite.role
        },
        update: { role: invite.role }
      });

      await tx.artistMembershipInvite.update({
        where: { id: invite.id },
        data: {
          status: MembershipInviteStatus.accepted,
          acceptedAt: new Date(),
          acceptedOperatorId: operatorId
        }
      });

      return membership;
    });

    await this.audit.log({
      artistId: invite.artistId,
      aggregateType: "membership_invite",
      aggregateId: invite.id,
      action: "membership_invite.accepted",
      actorLabel,
      actorOperatorId: operatorId,
      metadata: {
        email: invite.email,
        role: invite.role
      }
    });

    await this.audit.log({
      artistId: invite.artistId,
      aggregateType: "artist_membership",
      aggregateId: result.id,
      action: "artist_membership.upsert_via_invite",
      actorLabel,
      actorOperatorId: operatorId,
      metadata: { role: result.role }
    });

    try {
      await this.queue.enqueueMembershipInviteAccepted({
        artistId: invite.artistId,
        inviteeEmail: invite.email,
        role: invite.role
      });
    } catch {
      /* best-effort */
    }

    this.auth.applySessionCookie(
      setCookieReply,
      this.auth.newSessionPayload(operatorId, invite.artistId)
    );

    return { artistId: invite.artistId, role: result.role };
  }
}
