import { ForbiddenException, Injectable } from "@nestjs/common";
import { ArtistMembershipRole } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

const RANK: Record<ArtistMembershipRole, number> = {
  [ArtistMembershipRole.viewer]: 0,
  [ArtistMembershipRole.member]: 1,
  [ArtistMembershipRole.owner]: 2
};

@Injectable()
export class RolePolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getRole(
    operatorId: string,
    artistId: string
  ): Promise<ArtistMembershipRole> {
    const m = await this.prisma.client.artistMembership.findUnique({
      where: { operatorId_artistId: { operatorId, artistId } }
    });
    if (!m) {
      throw new ForbiddenException("Not a member of this artist");
    }
    return m.role;
  }

  async assertMinRole(
    operatorId: string,
    artistId: string,
    min: ArtistMembershipRole
  ): Promise<void> {
    const role = await this.getRole(operatorId, artistId);
    if (RANK[role] < RANK[min]) {
      throw new ForbiddenException("Insufficient permissions for this artist");
    }
  }

  async assertCanRead(operatorId: string, artistId: string): Promise<void> {
    await this.assertMinRole(operatorId, artistId, ArtistMembershipRole.viewer);
  }

  async assertCanMutateWorkflow(
    operatorId: string,
    artistId: string
  ): Promise<void> {
    await this.assertMinRole(operatorId, artistId, ArtistMembershipRole.member);
  }

  async assertOwner(operatorId: string, artistId: string): Promise<void> {
    const role = await this.getRole(operatorId, artistId);
    if (role !== ArtistMembershipRole.owner) {
      throw new ForbiddenException("Owner only");
    }
  }
}
