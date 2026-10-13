import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { StripeWebhookIdempotencyService } from "./stripe-webhook-idempotency.service";
import { readStripeRawBody } from "./stripe-webhook-raw-body";
import {
  parseStripeEvent,
  verifyStripeWebhookSignature
} from "./stripe-webhook-signature";
import { StripeWebhookService } from "./stripe-webhook.service";

@Controller("integrations/stripe")
export class StripeWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly idempotency: StripeWebhookIdempotencyService,
    private readonly stripe: StripeWebhookService
  ) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: FastifyRequest,
    @Headers("stripe-signature") signature?: string
  ) {
    const secret = this.config.get<string>("STRIPE_WEBHOOK_SECRET")?.trim();
    if (!secret) {
      throw new ServiceUnavailableException("Stripe webhook secret is not configured");
    }

    const payload = readStripeRawBody(req);
    const verified = verifyStripeWebhookSignature({
      payload,
      signatureHeader: signature,
      secret
    });
    if (!verified.ok || !payload) {
      throw new BadRequestException(
        verified.ok === false && verified.reason === "timestamp_expired"
          ? "Stripe webhook signature timestamp expired"
          : "Invalid Stripe webhook signature"
      );
    }

    const event = parseStripeEvent(payload);
    if (!event) {
      throw new BadRequestException("Stripe event id required");
    }

    const outcome = await this.idempotency.runOnce(
      event.id,
      () => this.stripe.process(event),
      event.type
    );
    return { ok: true, duplicate: outcome.duplicate };
  }
}
