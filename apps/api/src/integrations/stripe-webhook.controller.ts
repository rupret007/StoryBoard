import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Post,
  Req,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import {
  isStripeWebhookInFlightError,
  StripeWebhookIdempotencyService
} from "./stripe-webhook-idempotency.service";
import {
  isStripeWebhookPayloadTooLargeError,
  readStripeRawBody
} from "./stripe-webhook-raw-body";
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

    let payload: string | null;
    try {
      payload = readStripeRawBody(req);
    } catch (error) {
      if (isStripeWebhookPayloadTooLargeError(error)) {
        throw new PayloadTooLargeException("Stripe webhook payload exceeds size limit");
      }
      throw error;
    }
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

    try {
      const outcome = await this.idempotency.runOnce(
        event.id,
        (tx) => this.stripe.process(event, tx),
        event.type
      );
      return { ok: true, duplicate: outcome.duplicate };
    } catch (error) {
      if (isStripeWebhookInFlightError(error)) {
        throw new ServiceUnavailableException(
          "Stripe webhook event is already being processed"
        );
      }
      throw error;
    }
  }
}
