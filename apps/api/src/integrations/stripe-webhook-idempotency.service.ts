import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { StripeWebhookEventStatus } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

export const STRIPE_WEBHOOK_CLAIM_LEASE_MS = 5 * 60 * 1000;
export const STRIPE_WEBHOOK_IN_FLIGHT_CODE = "STRIPE_WEBHOOK_IN_FLIGHT";

export class StripeWebhookInFlightError extends Error {
  readonly code = STRIPE_WEBHOOK_IN_FLIGHT_CODE;

  constructor(eventId: string) {
    super(`Stripe webhook event ${eventId} is already being processed`);
    this.name = "StripeWebhookInFlightError";
  }
}

export function isStripeWebhookInFlightError(
  error: unknown
): error is StripeWebhookInFlightError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === STRIPE_WEBHOOK_IN_FLIGHT_CODE
  );
}

export type StripeWebhookWork<T> = (tx: Prisma.TransactionClient) => Promise<T>;

export type StripeWebhookRunResult<T> =
  | { duplicate: false; result: T }
  | { duplicate: true };

type ClaimOutcome =
  | { outcome: "claimed"; leaseOwner: string }
  | { outcome: "duplicate" }
  | { outcome: "in_flight" };

type LockedEventRow = {
  id: string;
  status: StripeWebhookEventStatus;
  leaseOwner: string;
  leaseExpiresAt: Date;
  appliedAt: Date | null;
};

@Injectable()
export class StripeWebhookIdempotencyService {
  private readonly log = new Logger(StripeWebhookIdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claim a Stripe event id after signature verification.
   * Claim, handler work, `appliedAt`, and `completed` commit in one
   * serializable transaction that holds the row lock for the handler.
   * Completed rows and rows with `appliedAt` are durable duplicates.
   * An unexpired processing lease with no apply is in-flight (retry).
   * An expired unapplied processing lease can be reclaimed only when the
   * previous owner is no longer holding the row lock.
   */
  async runOnce<T>(
    eventId: string,
    work: StripeWebhookWork<T>,
    eventType?: string | null
  ): Promise<StripeWebhookRunResult<T>> {
    try {
      return await this.prisma.client.$transaction(
        async (tx) => {
          const claimed = await this.claim(tx, eventId, eventType);
          if (claimed.outcome === "in_flight") {
            throw new StripeWebhookInFlightError(eventId);
          }
          if (claimed.outcome === "duplicate") {
            await this.promoteApplied(tx, eventId);
            return { duplicate: true };
          }

          const { leaseOwner } = claimed;
          await this.markApplied(tx, eventId, leaseOwner);
          const result = await work(tx);
          await this.markCompleted(tx, eventId, leaseOwner);
          return { duplicate: false, result };
        },
        { isolationLevel: "Serializable" }
      );
    } catch (error) {
      if (isStripeWebhookInFlightError(error)) {
        throw error;
      }
      if (isTransactionConflict(error) || isLockNotAvailable(error)) {
        throw new StripeWebhookInFlightError(eventId);
      }
      throw error;
    }
  }

  private async claim(
    tx: Prisma.TransactionClient,
    eventId: string,
    eventType?: string | null
  ): Promise<ClaimOutcome> {
    const now = new Date();
    const leaseOwner = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + STRIPE_WEBHOOK_CLAIM_LEASE_MS);
    const inserted = await this.insertClaimIfAbsent(tx, {
      eventId,
      leaseOwner,
      leaseExpiresAt,
      eventType: eventType ?? null
    });
    if (inserted) {
      return { outcome: "claimed", leaseOwner };
    }

    const locked = await this.lockEventRow(tx, eventId);
    if (locked === "busy") {
      return { outcome: "in_flight" };
    }
    if (!locked) {
      throw new Error("stripe webhook claim disappeared after unique conflict");
    }
    if (locked.status === StripeWebhookEventStatus.completed || locked.appliedAt) {
      return { outcome: "duplicate" };
    }
    if (locked.leaseExpiresAt > now) {
      return { outcome: "in_flight" };
    }

    const reclaimed = await tx.stripeWebhookEvent.updateMany({
      where: {
        eventId,
        status: StripeWebhookEventStatus.processing,
        leaseExpiresAt: { lte: now },
        appliedAt: null
      },
      data: {
        leaseOwner,
        leaseExpiresAt,
        lastError: null,
        ...(eventType ? { eventType } : {})
      }
    });
    if (reclaimed.count === 1) {
      return { outcome: "claimed", leaseOwner };
    }
    return { outcome: "in_flight" };
  }

  /**
   * `INSERT ... ON CONFLICT DO NOTHING` does not abort the PostgreSQL
   * transaction. Catching Prisma P2002 from `create()` would leave the
   * transaction in 25P02, so duplicate acknowledgement and expired-claim
   * recovery could not lock or inspect the existing row.
   */
  private async insertClaimIfAbsent(
    tx: Prisma.TransactionClient,
    input: {
      eventId: string;
      leaseOwner: string;
      leaseExpiresAt: Date;
      eventType: string | null;
    }
  ): Promise<boolean> {
    const inserted = await tx.$queryRaw<Array<{ leaseOwner: string }>>`
      INSERT INTO "StripeWebhookEvent" (
        "id",
        "eventId",
        "status",
        "leaseOwner",
        "leaseExpiresAt",
        "eventType",
        "lastError",
        "createdAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${input.eventId},
        'processing'::"StripeWebhookEventStatus",
        ${input.leaseOwner},
        ${input.leaseExpiresAt},
        ${input.eventType ?? null},
        NULL,
        NOW()
      )
      ON CONFLICT ("eventId") DO NOTHING
      RETURNING "leaseOwner"
    `;
    return inserted.length === 1;
  }

  private async lockEventRow(
    tx: Prisma.TransactionClient,
    eventId: string
  ): Promise<LockedEventRow | "busy" | null> {
    try {
      const rows = await tx.$queryRaw<LockedEventRow[]>`
        SELECT "id", "status", "leaseOwner", "leaseExpiresAt", "appliedAt"
        FROM "StripeWebhookEvent"
        WHERE "eventId" = ${eventId}
        FOR UPDATE NOWAIT
      `;
      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        ...row,
        leaseExpiresAt: new Date(row.leaseExpiresAt),
        appliedAt: row.appliedAt ? new Date(row.appliedAt) : null
      };
    } catch (error) {
      if (isLockNotAvailable(error)) {
        return "busy";
      }
      throw error;
    }
  }

  private async markApplied(
    tx: Prisma.TransactionClient,
    eventId: string,
    leaseOwner: string
  ): Promise<void> {
    const updated = await tx.stripeWebhookEvent.updateMany({
      where: {
        eventId,
        leaseOwner,
        status: StripeWebhookEventStatus.processing,
        appliedAt: null
      },
      data: {
        appliedAt: new Date(),
        lastError: null
      }
    });
    if (updated.count !== 1) {
      throw new Error("stripe webhook claim apply update failed");
    }
  }

  private async markCompleted(
    tx: Prisma.TransactionClient,
    eventId: string,
    leaseOwner: string
  ): Promise<void> {
    const updated = await tx.stripeWebhookEvent.updateMany({
      where: {
        eventId,
        leaseOwner,
        status: StripeWebhookEventStatus.processing,
        appliedAt: { not: null }
      },
      data: {
        status: StripeWebhookEventStatus.completed,
        completedAt: new Date(),
        lastError: null
      }
    });
    if (updated.count !== 1) {
      throw new Error("stripe webhook claim complete update failed");
    }
  }

  private async promoteApplied(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
    try {
      await tx.stripeWebhookEvent.updateMany({
        where: {
          eventId,
          status: StripeWebhookEventStatus.processing,
          appliedAt: { not: null }
        },
        data: {
          status: StripeWebhookEventStatus.completed,
          completedAt: new Date(),
          lastError: null
        }
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.log.warn(
        `stripe webhook ${eventId} applied claim could not be promoted to completed: ${detail}`
      );
    }
  }
}

function isTransactionConflict(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "P2034"
  );
}

function isLockNotAvailable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  if (code === "55P03") {
    return true;
  }
  const meta =
    "meta" in error && error.meta && typeof error.meta === "object" ? error.meta : null;
  if (meta && "code" in meta && String(meta.code) === "55P03") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /lock_not_available|could not obtain lock/i.test(message);
}
