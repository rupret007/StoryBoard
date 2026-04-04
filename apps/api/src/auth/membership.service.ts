import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { SessionPayloadV1 } from "./session-cookie";

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async assertMembership(operatorId: string, artistId: string): Promise<void> {
    const row = await this.prisma.client.artistMembership.findUnique({
      where: {
        operatorId_artistId: { operatorId, artistId }
      }
    });
    if (!row) {
      throw new ForbiddenException("Not a member of this artist");
    }
  }

  /**
   * @param headerArtistId optional `x-artist-id` header value
   * @param queryArtistId optional `artistId` query param (e.g. integrations status)
   */
  async resolveArtistId(
    operatorId: string,
    session: SessionPayloadV1 | null,
    headerArtistId?: string,
    queryArtistId?: string
  ): Promise<string> {
    const preferred =
      headerArtistId?.trim() ||
      queryArtistId?.trim() ||
      session?.currentArtistId?.trim() ||
      null;

    if (preferred) {
      await this.assertMembership(operatorId, preferred);
      return preferred;
    }

    const first = await this.prisma.client.artistMembership.findFirst({
      where: { operatorId },
      orderBy: { createdAt: "asc" }
    });
    if (!first) {
      throw new ForbiddenException("No artist access for this operator");
    }
    return first.artistId;
  }
}
