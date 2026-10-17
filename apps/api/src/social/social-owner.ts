import { ForbiddenException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

/** Rechecked by HTTP and service/job paths; a label is never authorization. */
export async function assertSocialOwner(
  client: Pick<Prisma.TransactionClient, "artistMembership">,
  artistId: string,
  operatorId?: string | null
) {
  if (!operatorId) throw new ForbiddenException("Social approval and execution require an owner.");
  const membership = await client.artistMembership.findUnique({
    where: { operatorId_artistId: { operatorId, artistId } }
  });
  if (membership?.role !== "owner") {
    throw new ForbiddenException("Social approval and execution require an owner.");
  }
}
