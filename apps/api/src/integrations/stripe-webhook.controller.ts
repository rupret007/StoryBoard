import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import { stripeEventId } from "./inbound-webhook-ids";
import { StripeWebhookService } from "./stripe-webhook.service";
import { WebhookIdempotencyService } from "./webhook-idempotency.service";

@Controller("integrations/stripe")
export class StripeWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly idempotency: WebhookIdempotencyService,
    private readonly stripe: StripeWebhookService
  ) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: FastifyRequest,
    @Headers("x-stripe-webhook-secret") secretToken?: string
  ) {
    const expected = this.config.get<string>("STRIPE_WEBHOOK_SECRET")?.trim();
    if (expected && expected.length > 0) {
      if (secretToken !== expected) {
        throw new ForbiddenException("Invalid webhook secret");
      }
    }

    const body = req.body;
    const eventId = stripeEventId(body);
    if (!eventId) {
      throw new BadRequestException("Stripe event id required");
    }

    const outcome = await this.idempotency.runOnce("stripe", eventId, () =>
      this.stripe.process(body)
    );
    return { ok: true, duplicate: outcome.duplicate };
  }
}
