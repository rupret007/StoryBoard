import {
  BadRequestException,
  Injectable,
  ConflictException,
  ForbiddenException
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

function isAbortedSerialization(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "P2034") return true;
  // Prisma's pg adapter can expose a COMMIT serialization failure directly,
  // without a Prisma error code. SQLSTATE 40001 guarantees this transaction
  // aborted; unknown COMMIT/connection failures must never be replayed.
  if (!("name" in error) || error.name !== "DriverAdapterError" || !("cause" in error)) return false;
  const cause = error.cause;
  return Boolean(cause && typeof cause === "object" &&
    "originalCode" in cause && cause.originalCode === "40001" &&
    "kind" in cause && cause.kind === "TransactionWriteConflict");
}

async function createWithSerializationRetry<T>(transaction: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await transaction();
    } catch (error: unknown) {
      const aborted = isAbortedSerialization(error);
      if (aborted && attempt < 2) continue;
      if (aborted || (error && typeof error === "object" && "code" in error && error.code === "P2002")) {
        throw new ConflictException("Workspace creation conflicted with another change. Reload your band list before trying again.");
      }
      throw error;
    }
  }
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService
  ) {}

  async createAdditionalArtist(input: {
    operatorId: string; actorLabel: string; name: string; sourceArtistId: string; reply: FastifyReply;
  }) {
    return this.createWorkspace(input);
  }

  async createFirstArtist(input: {
    operatorId: string;
    actorLabel: string;
    name: string;
    slug?: string;
    reply: FastifyReply;
  }): Promise<{ artistId: string; slug: string }> {
    return this.createWorkspace(input);
  }

  private async createWorkspace(input: {
    operatorId: string; actorLabel: string; name: string; slug?: string;
    sourceArtistId?: string; reply: FastifyReply;
  }): Promise<{ artistId: string; slug: string }> {
    const { operatorId, actorLabel, name, reply } = input;
    const trimmedName = name?.trim();
    if (!trimmedName) {
      throw new BadRequestException("name required");
    }

    const artist = await createWithSerializationRetry(() => this.prisma.client.$transaction(async (tx) => {
      if (input.sourceArtistId !== undefined) {
        const owner = await tx.artistMembership.findUnique({
          where: { operatorId_artistId: { operatorId, artistId: input.sourceArtistId } }
        });
        if (owner?.role !== ArtistMembershipRole.owner) {
          throw new ForbiddenException("Only a band owner can create another workspace");
        }
      } else if (await tx.artistMembership.count({ where: { operatorId } }) > 0) {
        throw new BadRequestException("Use Team to create another band workspace");
      }
      const baseSlug = slugifyBase(input.slug?.trim() || trimmedName);
      let candidate = baseSlug;
      let attempt = 0;
      while (attempt < 50 && await tx.artist.findUnique({ where: { slug: candidate } })) {
        attempt += 1;
        candidate = `${baseSlug}-${attempt}`;
      }
      if (attempt >= 50) throw new ConflictException("Could not allocate a unique slug");
      const created = await tx.artist.create({ data: { name: trimmedName, slug: candidate } });
      const membership = await tx.artistMembership.create({
        data: { operatorId, artistId: created.id, role: ArtistMembershipRole.owner }
      });
      await this.audit.log({
        artistId: created.id, aggregateType: "artist", aggregateId: created.id,
        action: "artist.created_onboarding", actorLabel, actorOperatorId: operatorId,
        metadata: { name: trimmedName, slug: created.slug }
      }, tx);
      await this.audit.log({
        artistId: created.id, aggregateType: "artist_membership", aggregateId: membership.id,
        action: "artist_membership.created_onboarding", actorLabel, actorOperatorId: operatorId,
        metadata: { role: ArtistMembershipRole.owner }
      }, tx);
      return created;
    }, { isolationLevel: "Serializable" }));

    this.auth.applySessionCookie(
      reply,
      this.auth.newSessionPayload(operatorId, artist.id)
    );

    return { artistId: artist.id, slug: artist.slug };
  }
}
