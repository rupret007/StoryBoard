import {
  BadRequestException,
  Injectable,
  ConflictException
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { ArtistMembershipRole } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

function slugifyBase(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s.length > 0 ? s : "artist";
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService
  ) {}

  async createFirstArtist(input: {
    operatorId: string;
    actorLabel: string;
    name: string;
    slug?: string;
    reply: FastifyReply;
  }): Promise<{ artistId: string; slug: string }> {
    const { operatorId, actorLabel, name, reply } = input;
    const trimmedName = name?.trim();
    if (!trimmedName) {
      throw new BadRequestException("name required");
    }

    const existingMemberships = await this.prisma.client.artistMembership.count({
      where: { operatorId }
    });
    if (existingMemberships > 0) {
      throw new BadRequestException(
        "Onboarding artist creation is only available when you have no memberships"
      );
    }

    const baseSlug = input.slug?.trim()
      ? slugifyBase(input.slug)
      : slugifyBase(trimmedName);

    let candidate = baseSlug;
    let attempt = 0;
    while (attempt < 50) {
      const clash = await this.prisma.client.artist.findUnique({
        where: { slug: candidate }
      });
      if (!clash) {
        break;
      }
      attempt += 1;
      candidate = `${baseSlug}-${attempt}`;
    }
    if (attempt >= 50) {
      throw new ConflictException("Could not allocate a unique slug");
    }

    const artist = await this.prisma.client.artist.create({
      data: {
        name: trimmedName,
        slug: candidate
      }
    });

    const membership = await this.prisma.client.artistMembership.create({
      data: {
        operatorId,
        artistId: artist.id,
        role: ArtistMembershipRole.owner
      }
    });

    await this.audit.log({
      artistId: artist.id,
      aggregateType: "artist",
      aggregateId: artist.id,
      action: "artist.created_onboarding",
      actorLabel,
      actorOperatorId: operatorId,
      metadata: { name: trimmedName, slug: artist.slug }
    });

    await this.audit.log({
      artistId: artist.id,
      aggregateType: "artist_membership",
      aggregateId: membership.id,
      action: "artist_membership.created_onboarding",
      actorLabel,
      actorOperatorId: operatorId,
      metadata: { role: ArtistMembershipRole.owner }
    });

    this.auth.applySessionCookie(
      reply,
      this.auth.newSessionPayload(operatorId, artist.id)
    );

    return { artistId: artist.id, slug: artist.slug };
  }
}
