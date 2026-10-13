import { Injectable, Logger } from "@nestjs/common";
import type { StripeWebhookEvent } from "./stripe-webhook-signature";

export type StripeWebhookAck = {
  acknowledged: true;
  eventId: string;
  type: string | null;
};

type StripeEventProcessor = (
  event: StripeWebhookEvent
) => Promise<StripeWebhookAck> | StripeWebhookAck;

/**
 * Inbound Stripe event intake. Signature verification and the event-id
 * claim happen in the webhook controller before this runs. This does not
 * apply invoice payments or call Stripe — StoryBoard still records money
 * through the existing manual payment path.
 */
@Injectable()
export class StripeWebhookService {
  private readonly log = new Logger(StripeWebhookService.name);
  private processor: StripeEventProcessor = (event) => this.acknowledge(event);

  /** Test seam: replace the ack handler without a live Stripe call. */
  useProcessor(processor: StripeEventProcessor): void {
    this.processor = processor;
  }

  async process(event: StripeWebhookEvent): Promise<StripeWebhookAck> {
    return this.processor(event);
  }

  private acknowledge(event: StripeWebhookEvent): StripeWebhookAck {
    this.log.log(`stripe webhook acknowledged ${event.type ?? "unknown"} ${event.id}`);
    return { acknowledged: true, eventId: event.id, type: event.type };
  }
}
