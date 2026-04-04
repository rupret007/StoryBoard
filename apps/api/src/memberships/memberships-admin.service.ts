import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { RolePolicyService } from "../auth/role-policy.service";
import { ArtistMembershipRole } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MembershipsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roles: RolePolicyService
  ) {}

  async listMembers(artistId: string, actorOperatorId: string) {
    await this.roles.assertOwner(actorOperatorId, artistId);
    return this.prisma.client.artistMembership.findMany({
      where: { artistId },
      include: {
        operator: { select: { id: true, email: true, name: true } }
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async updateRole(input: {
    artistId: string;
    targetOperatorId: string;
    role: ArtistMembershipRole;
    actorOperatorId: string;
    actorLabel: string;
  }): Promise<void> {
    const { artistId, targetOperatorId, role, actorOperatorId, actorLabel } =
      input;
    await this.roles.assertOwner(actorOperatorId, artistId);

    if (targetOperatorId === actorOperatorId && role !== ArtistMembershipRole.owner) {
      const ownerCount = await this.prisma.client.artistMembership.count({
        where: { artistId, role: ArtistMembershipRole.owner }
      });
      if (ownerCount <= 1) {
        throw new BadRequestException(
          "Cannot change role: you are the only owner for this artist"
        );
      }
    }

    const row = await this.prisma.client.artistMembership.findUnique({
      where: {
        operatorId_artistId: {
          operatorId: targetOperatorId,
          artistId
        }
      }
    });
    if (!row) {
      throw new NotFoundException("Membership not found");
    }

    if (
      row.role === ArtistMembershipRole.owner &&
      role !== ArtistMembershipRole.owner
    ) {
      const ownerCount = await this.prisma.client.artistMembership.count({
        where: { artistId, role: ArtistMembershipRole.owner }
      });
      if (ownerCount <= 1) {
        throw new BadRequestException(
          "Cannot demote the only owner for this artist"
        );
      }
    }

    await this.prisma.client.artistMembership.update({
      where: { id: row.id },
      data: { role }
    });

    await this.audit.log({
      artistId,
      aggregateType: "artist_membership",
      aggregateId: row.id,
      action: "artist_membership.role_changed",
      actorLabel,
      actorOperatorId,
      metadata: {
        targetOperatorId,
        previousRole: row.role,
        nextRole: role
      }
    });
  }

  async removeMember(input: {
    artistId: string;
    targetOperatorId: string;
    actorOperatorId: string;
    actorLabel: string;
  }): Promise<void> {
    const { artistId, targetOperatorId, actorOperatorId, actorLabel } = input;
    await this.roles.assertOwner(actorOperatorId, artistId);

    if (targetOperatorId === actorOperatorId) {
      throw new BadRequestException("Cannot remove yourself via this action");
    }

    const row = await this.prisma.client.artistMembership.findUnique({
      where: {
        operatorId_artistId: {
          operatorId: targetOperatorId,
          artistId
        }
      }
    });
    if (!row) {
      throw new NotFoundException("Membership not found");
    }

    if (row.role === ArtistMembershipRole.owner) {
      const ownerCount = await this.prisma.client.artistMembership.count({
        where: { artistId, role: ArtistMembershipRole.owner }
      });
      if (ownerCount <= 1) {
        throw new BadRequestException("Cannot remove the only owner");
      }
    }

    await this.prisma.client.artistMembership.delete({
      where: { id: row.id }
    });

    await this.audit.log({
      artistId,
      aggregateType: "artist_membership",
      aggregateId: row.id,
      action: "artist_membership.removed",
      actorLabel,
      actorOperatorId,
      metadata: { targetOperatorId, previousRole: row.role }
    });
  }
}
