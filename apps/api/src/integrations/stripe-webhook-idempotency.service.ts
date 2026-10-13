import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
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

export type StripeWebhookRunResult<T> =
  | { duplicate: false; result: T }
  | { duplicate: true };

type ClaimOutcome =
  | { outcome: "claimed"; leaseOwner: string }
  | { outcome: "duplicate" }
  | { outcome: "in_flight" };

@Injectable()
export class StripeWebhookIdempotencyService {
  private readonly log = new Logger(StripeWebhookIdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claim a Stripe event id after signature verification.
   * Completed rows and rows with `appliedAt` are durable duplicates.
   * An unexpired processing lease with no apply is in-flight (retry).
   * An expired unapplied processing lease can be reclaimed.
   */
  async runOnce<T>(
    eventId: string,
    work: () => Promise<T>,
    eventType?: string | null
  ): Promise<StripeWebhookRunResult<T>> {
    const claimed = await this.claim(eventId, eventType);
    if (claimed.outcome === "in_flight") {
      throw new StripeWebhookInFlightError(eventId);
    }
    if (claimed.outcome === "duplicate") {
      return { duplicate: true };
    }

    const { leaseOwner } = claimed;
    let sideEffectFinished = false;
    try {
      const result = await work();
      sideEffectFinished = true;
      await this.markApplied(eventId, leaseOwner);
      await this.markCompleted(eventId, leaseOwner);
      return { duplicate: false, result };
    } catch (error) {
      if (!sideEffectFinished) {
        await this.expireLease(eventId, leaseOwner, error);
      } else {
        this.log.warn(
          `stripe webhook ${eventId} side effect succeeded but the completed mark failed; leaving the applied claim in place`
        );
      }
      throw error;
    }
  }

  private async claim(eventId: string, eventType?: string | null): Promise<ClaimOutcome> {
    const now = new Date();
    const leaseOwner = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + STRIPE_WEBHOOK_CLAIM_LEASE_MS);
    try {
      await this.prisma.client.stripeWebhookEvent.create({
        data: {
          eventId,
          status: StripeWebhookEventStatus.processing,
          leaseOwner,
          leaseExpiresAt,
          eventType: eventType ?? null,
          lastError: null
        }
      });
      return { outcome: "claimed", leaseOwner };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }

    const reclaimed = await this.prisma.client.stripeWebhookEvent.updateMany({
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

    const existing = await this.prisma.client.stripeWebhookEvent.findUnique({
      where: { eventId }
    });
    if (!existing) {
      throw new Error("stripe webhook claim disappeared after unique conflict");
    }
    if (existing.status === StripeWebhookEventStatus.completed || existing.appliedAt) {
      await this.promoteApplied(eventId);
      return { outcome: "duplicate" };
    }
    return { outcome: "in_flight" };
  }

  private async markApplied(eventId: string, leaseOwner: string): Promise<void> {
    const updated = await this.prisma.client.stripeWebhookEvent.updateMany({
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

  private async markCompleted(eventId: string, leaseOwner: string): Promise<void> {
    const updated = await this.prisma.client.stripeWebhookEvent.updateMany({
      where: {
        eventId,
        leaseOwner,
        status: StripeWebhookEventStatus.processing
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

  private async promoteApplied(eventId: string): Promise<void> {
    try {
      await this.prisma.client.stripeWebhookEvent.updateMany({
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

  private async expireLease(
    eventId: string,
    leaseOwner: string,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await this.prisma.client.stripeWebhookEvent.updateMany({
        where: {
          eventId,
          leaseOwner,
          status: StripeWebhookEventStatus.processing,
          appliedAt: null
        },
        data: {
          leaseExpiresAt: new Date(0),
          lastError: message.slice(0, 500)
        }
      });
    } catch (expireError) {
      const detail = expireError instanceof Error ? expireError.message : String(expireError);
      this.log.warn(
        `stripe webhook lease expire failed after handler error (${message.slice(0, 200)}): ${detail}`
      );
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "P2002"
  );
}
