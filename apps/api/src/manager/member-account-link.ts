import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";

type AccountLinkClient = Pick<Prisma.TransactionClient, "artistMembership" | "bandMember">;

/** A performer/account link is an owner decision, never a name or email match. */
export async function validateMemberAccountLink(client: AccountLinkClient, artistId: string, actorOperatorId: string, linkedOperatorId: string | null | undefined, memberId?: string) {
  if (linkedOperatorId === undefined) return;
  const actor = await client.artistMembership.findUnique({ where: { operatorId_artistId: { operatorId: actorOperatorId, artistId } } });
  if (actor?.role !== "owner") throw new ForbiddenException("Only an owner can link performer accounts");
  if (linkedOperatorId === null) return;
  const target = await client.artistMembership.findUnique({ where: { operatorId_artistId: { operatorId: linkedOperatorId, artistId } } });
  if (!target) throw new NotFoundException("Account membership not found in this band");
  if (target.role === "viewer") throw new BadRequestException("Use an owner or member account so the performer can update their work");
  const linked = await client.bandMember.findUnique({ where: { artistId_linkedOperatorId: { artistId, linkedOperatorId } }, select: { id: true } });
  if (linked && linked.id !== memberId) throw new ConflictException("That account is already linked to a performer in this band. Unlink it there first.");
}

/** One intake batch cannot assign the same account to two performers; rows do not exist yet, so the database cannot catch it first. */
export function assertDistinctAccountLinks(members: { linkedOperatorId?: string | null | undefined }[]) {
  const linked = new Set<string>();
  for (const member of members) {
    const operatorId = member.linkedOperatorId;
    if (!operatorId) continue;
    if (linked.has(operatorId)) throw new ConflictException("That account is linked to more than one performer. Link each account to one performer.");
    linked.add(operatorId);
  }
}

export function rethrowMemberAccountConflict(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    throw new ConflictException("That account was linked elsewhere. Reload the lineup before trying again.");
  }
  throw error;
}
