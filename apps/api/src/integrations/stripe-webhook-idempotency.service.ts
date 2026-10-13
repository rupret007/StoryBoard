import { Injectable, Logger } from "@nestjs/common";
import { StripeWebhookEventStatus } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

export const STRIPE_WEBHOOK_CLAIM_LEASE_MS = 5 * 60 * 1000;

export type StripeWebhookRunResult<T> =
  | { duplicate: false; result: T }
  | { duplicate: true };

@Injectable()
export class StripeWebhookIdempotencyService {
  private readonly log = new Logger(StripeWebhookIdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claim a Stripe event id after signature verification.
   * Completed rows and unexpired processing leases are duplicates.
   * An expired processing lease can be reclaimed so a crash before
   * complete does not permanently suppress Stripe's retry.
   */
  async runOnce<T>(
    eventId: string,
    work: () => Promise<T>,
    eventType?: string | null
  ): Promise<StripeWebhookRunResult<T>> {
    const claimed = await this.claim(eventId, eventType);
    if (!claimed) {
      return { duplicate: true };
    }

    let sideEffectFinished = false;
    try {
      const result = await work();
      sideEffectFinished = true;
      await this.markCompleted(eventId);
      return { duplicate: false, result };
    } catch (error) {
      if (!sideEffectFinished) {
        await this.expireLease(eventId, error);
      } else {
        this.log.warn(
          `stripe webhook ${eventId} side effect succeeded but the completed mark failed; leaving the processing claim in place`
        );
      }
      throw error;
    }
  }

  private async claim(eventId: string, eventType?: string | null): Promise<boolean> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + STRIPE_WEBHOOK_CLAIM_LEASE_MS);
    try {
      await this.prisma.client.stripeWebhookEvent.create({
        data: {
          eventId,
          status: StripeWebhookEventStatus.processing,
          leaseExpiresAt,
          eventType: eventType ?? null,
          lastError: null
        }
      });
      return true;
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }

    const reclaimed = await this.prisma.client.stripeWebhookEvent.updateMany({
      where: {
        eventId,
        status: StripeWebhookEventStatus.processing,
        leaseExpiresAt: { lte: now }
      },
      data: {
        leaseExpiresAt,
        lastError: null,
        ...(eventType ? { eventType } : {})
      }
    });
    return reclaimed.count === 1;
  }

  private async markCompleted(eventId: string): Promise<void> {
    const updated = await this.prisma.client.stripeWebhookEvent.updateMany({
      where: {
        eventId,
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

  private async expireLease(eventId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await this.prisma.client.stripeWebhookEvent.updateMany({
        where: {
          eventId,
          status: StripeWebhookEventStatus.processing
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
