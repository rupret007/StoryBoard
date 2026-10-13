import { Injectable, Logger } from "@nestjs/common";
import { InboundWebhookClaimStatus } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import type { InboundWebhookProvider } from "./inbound-webhook-ids";

export type InboundWebhookRunResult<T> =
  | { duplicate: false; result: T }
  | { duplicate: true };

@Injectable()
export class WebhookIdempotencyService {
  private readonly log = new Logger(WebhookIdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claim the unique (provider, eventId) row before handler work.
   * A unique-constraint conflict is a duplicate delivery (skip).
   * Handler failure deletes the claim so the provider can retry.
   */
  async runOnce<T>(
    provider: InboundWebhookProvider,
    eventId: string,
    work: () => Promise<T>
  ): Promise<InboundWebhookRunResult<T>> {
    const claimed = await this.claim(provider, eventId);
    if (!claimed) {
      return { duplicate: true };
    }

    try {
      const result = await work();
      await this.markProcessed(provider, eventId);
      return { duplicate: false, result };
    } catch (error) {
      await this.release(provider, eventId, error);
      throw error;
    }
  }

  private async claim(provider: InboundWebhookProvider, eventId: string): Promise<boolean> {
    try {
      await this.prisma.client.inboundWebhookClaim.create({
        data: {
          provider,
          eventId,
          status: InboundWebhookClaimStatus.attempted,
          processedAt: null,
          lastError: null
        }
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return false;
      }
      throw error;
    }
  }

  private async markProcessed(provider: InboundWebhookProvider, eventId: string): Promise<void> {
    await this.prisma.client.inboundWebhookClaim.update({
      where: { provider_eventId: { provider, eventId } },
      data: {
        status: InboundWebhookClaimStatus.processed,
        processedAt: new Date(),
        lastError: null
      }
    });
  }

  private async release(
    provider: InboundWebhookProvider,
    eventId: string,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await this.prisma.client.inboundWebhookClaim.delete({
        where: { provider_eventId: { provider, eventId } }
      });
    } catch (releaseError) {
      const detail = releaseError instanceof Error ? releaseError.message : String(releaseError);
      this.log.warn(
        `webhook claim release failed after handler error (${message.slice(0, 200)}): ${detail}`
      );
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === "P2002"
  );
}
