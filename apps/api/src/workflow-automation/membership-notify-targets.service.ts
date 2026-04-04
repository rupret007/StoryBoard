import { Injectable } from "@nestjs/common";
import { ArtistMembershipRole } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

export type NotifyOperator = {
  operatorId: string;
  email: string;
};

@Injectable()
export class MembershipNotifyTargetsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Owners and members — workflow action alerts (exclude viewers). */
  async listOwnerAndMembers(artistId: string): Promise<NotifyOperator[]> {
    const rows = await this.prisma.client.artistMembership.findMany({
      where: {
        artistId,
        role: { in: [ArtistMembershipRole.owner, ArtistMembershipRole.member] }
      },
      include: { operator: true }
    });
    return rows.map((r) => ({
      operatorId: r.operatorId,
      email: r.operator.email
    }));
  }

  async listOwners(artistId: string): Promise<NotifyOperator[]> {
    const rows = await this.prisma.client.artistMembership.findMany({
      where: { artistId, role: ArtistMembershipRole.owner },
      include: { operator: true }
    });
    return rows.map((r) => ({
      operatorId: r.operatorId,
      email: r.operator.email
    }));
  }
}
