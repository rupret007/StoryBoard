import {
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
import { telegramUpdateId } from "../integrations/inbound-webhook-ids";
import { WebhookIdempotencyService } from "../integrations/webhook-idempotency.service";
import { TelegramRegistrationService } from "./telegram-registration.service";

@Controller("integrations/telegram")
export class TelegramWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly registration: TelegramRegistrationService,
    private readonly idempotency: WebhookIdempotencyService
  ) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: FastifyRequest,
    @Headers("x-telegram-bot-api-secret-token") secretToken?: string
  ) {
    const expected = this.config.get<string>("TELEGRAM_WEBHOOK_SECRET")?.trim();
    if (expected && expected.length > 0) {
      if (secretToken !== expected) {
        throw new ForbiddenException("Invalid webhook secret");
      }
    }

    const body = req.body;
    const eventId = telegramUpdateId(body);
    if (!eventId) {
      return { ok: true };
    }

    const outcome = await this.idempotency.runOnce("telegram", eventId, () =>
      this.registration.handleWebhookUpdate(body)
    );
    return { ok: true, duplicate: outcome.duplicate };
  }
}
