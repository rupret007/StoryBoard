import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { telegramSendMessageMock } from "../integrations/adapters/telegram/mock-telegram.adapter";
import { telegramSendMessage } from "../integrations/adapters/telegram/real-telegram.adapter";
import { hashTelegramRegistrationToken } from "./telegram-registration-crypto";
import { parseTelegramStartPayload } from "./telegram-start-parse";

/** Raw token length in bytes; hex encoding yields 64 chars (within Telegram start param limit). */
const TOKEN_BYTES = 32;

@Injectable()
export class TelegramRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService
  ) {}

  private ttlMs(): number {
    const mins =
      this.config.get<number>("TELEGRAM_REGISTRATION_TTL_MINUTES") ?? 20;
    return Math.min(Math.max(mins, 5), 120) * 60 * 1000;
  }

  /**
   * Owner-only caller must assert before invoke.
   */
  async createRegistrationToken(input: {
    artistId: string;
    createdByOperatorId: string;
    operatorLabel: string;
  }): Promise<{ startPayload: string; deepLink: string | null; expiresAt: Date }> {
    const raw = randomBytes(TOKEN_BYTES).toString("hex");
    const tokenHash = hashTelegramRegistrationToken(raw);
    const expiresAt = new Date(Date.now() + this.ttlMs());

    await this.prisma.client.telegramRegistrationToken.deleteMany({
      where: {
        artistId: input.artistId,
        consumedAt: null
      }
    });

    const row = await this.prisma.client.telegramRegistrationToken.create({
      data: {
        artistId: input.artistId,
        createdByOperatorId: input.createdByOperatorId,
        tokenHash,
        expiresAt
      }
    });

    await this.audit.log({
      artistId: input.artistId,
      aggregateType: "TelegramRegistrationToken",
      aggregateId: row.id,
      action: "telegram.registration.token_created",
      actorLabel: input.operatorLabel,
      actorOperatorId: input.createdByOperatorId,
      metadata: {
        artistId: input.artistId,
        expiresAt: expiresAt.toISOString()
      }
    });

    const username = this.config.get<string>("TELEGRAM_BOT_USERNAME")?.trim();
    const deepLink =
      username && username.length > 0
        ? `https://t.me/${username.replace(/^@/, "")}?start=${encodeURIComponent(raw)}`
        : null;

    return { startPayload: raw, deepLink, expiresAt };
  }

  /**
   * Process a Telegram Bot API Update JSON body; ignores non-registration messages.
   */
  async handleWebhookUpdate(body: unknown): Promise<void> {
    if (!body || typeof body !== "object") {
      return;
    }
    const update = body as Record<string, unknown>;
    const msg = update.message as Record<string, unknown> | undefined;
    if (!msg) {
      return;
    }
    const text = msg.text as string | undefined;
    const chat = msg.chat as Record<string, unknown> | undefined;
    const chatId = chat?.id;
    if (chatId === undefined || chatId === null) {
      return;
    }

    const payload = parseTelegramStartPayload(text);
    if (!payload) {
      return;
    }

    const tokenHash = hashTelegramRegistrationToken(payload);
    const row = await this.prisma.client.telegramRegistrationToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        artistId: true,
        expiresAt: true,
        consumedAt: true
      }
    });

    if (!row) {
      await this.audit.log({
        artistId: null,
        aggregateType: "TelegramRegistrationToken",
        aggregateId: tokenHash.slice(0, 16),
        action: "telegram.registration.failed",
        actorLabel: "telegram",
        metadata: {
          reason: "invalid_token",
          chatIdSuffix: String(chatId).slice(-6)
        }
      });
      return;
    }

    if (row.consumedAt) {
      await this.audit.log({
        artistId: row.artistId,
        aggregateType: "TelegramRegistrationToken",
        aggregateId: row.id,
        action: "telegram.registration.failed",
        actorLabel: "telegram",
        metadata: {
          reason: "replay",
          chatIdSuffix: String(chatId).slice(-6)
        }
      });
      return;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      await this.audit.log({
        artistId: row.artistId,
        aggregateType: "TelegramRegistrationToken",
        aggregateId: row.id,
        action: "telegram.registration.failed",
        actorLabel: "telegram",
        metadata: {
          reason: "expired",
          chatIdSuffix: String(chatId).slice(-6)
        }
      });
      return;
    }

    const chatIdStr = String(chatId);
    const now = new Date();

    const outcome = await this.prisma.client.$transaction(async (tx) => {
      const consumed = await tx.telegramRegistrationToken.updateMany({
        where: {
          id: row.id,
          consumedAt: null,
          expiresAt: { gt: now }
        },
        data: {
          consumedAt: now,
          boundChatId: chatIdStr
        }
      });
      if (consumed.count !== 1) {
        return { ok: false as const, reason: "race_or_expired" };
      }
      await tx.artist.update({
        where: { id: row.artistId },
        data: { telegramChatId: chatIdStr }
      });
      return { ok: true as const };
    });

    if (!outcome.ok) {
      await this.audit.log({
        artistId: row.artistId,
        aggregateType: "TelegramRegistrationToken",
        aggregateId: row.id,
        action: "telegram.registration.failed",
        actorLabel: "telegram",
        metadata: {
          reason: outcome.reason,
          chatIdSuffix: chatIdStr.slice(-6)
        }
      });
      return;
    }

    await this.audit.log({
      artistId: row.artistId,
      aggregateType: "TelegramRegistrationToken",
      aggregateId: row.id,
      action: "telegram.registration.bound",
      actorLabel: "telegram",
      metadata: {
        chatIdSuffix: chatIdStr.slice(-6),
        artistId: row.artistId
      }
    });

    await this.sendAckIfPossible(chatIdStr);
  }

  private async sendAckIfPossible(chatId: string): Promise<void> {
    const text =
      "StoryBoard: this chat is linked for urgent alerts. You can close this conversation.";
    const token = this.config.get<string>("TELEGRAM_BOT_TOKEN")?.trim();
    try {
      if (token) {
        await telegramSendMessage({ botToken: token, chatId, text });
      } else {
        telegramSendMessageMock({ chatId, text });
      }
    } catch {
      /* best-effort; binding already persisted */
    }
  }
}
