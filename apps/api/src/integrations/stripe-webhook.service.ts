import { Injectable, Logger } from "@nestjs/common";

export type StripeWebhookAck = {
  acknowledged: true;
  eventId: string;
  type: string | null;
};

type StripeEventProcessor = (body: unknown) => Promise<StripeWebhookAck> | StripeWebhookAck;

/**
 * Inbound Stripe event intake. Claims happen in the webhook controller
 * before this runs. This does not apply invoice payments or call Stripe —
 * StoryBoard still records money through the existing manual payment path.
 */
@Injectable()
export class StripeWebhookService {
  private readonly log = new Logger(StripeWebhookService.name);
  private processor: StripeEventProcessor = (body) => this.acknowledge(body);

  /** Test seam: replace the ack handler without a live Stripe call. */
  useProcessor(processor: StripeEventProcessor): void {
    this.processor = processor;
  }

  async process(body: unknown): Promise<StripeWebhookAck> {
    return this.processor(body);
  }

  private acknowledge(body: unknown): StripeWebhookAck {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const eventId = typeof record.id === "string" ? record.id : "";
    const type = typeof record.type === "string" ? record.type : null;
    this.log.log(`stripe webhook acknowledged ${type ?? "unknown"} ${eventId || "missing-id"}`);
    return { acknowledged: true, eventId, type };
  }
}
