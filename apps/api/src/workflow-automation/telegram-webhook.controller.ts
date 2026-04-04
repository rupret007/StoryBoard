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
import { TelegramRegistrationService } from "./telegram-registration.service";

@Controller("integrations/telegram")
export class TelegramWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly registration: TelegramRegistrationService
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
    await this.registration.handleWebhookUpdate(body);
    return { ok: true };
  }
}
