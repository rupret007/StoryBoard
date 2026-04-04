import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  mergeTelegramNotifyCategories,
  type TelegramNotifyCategories
} from "@storyboard/shared";
import { AuditService } from "../audit/audit.service";
import { telegramSendMessageMock } from "../integrations/adapters/telegram/mock-telegram.adapter";
import { telegramSendMessage } from "../integrations/adapters/telegram/real-telegram.adapter";
import type { TelegramSendMessageResult } from "../integrations/adapters/telegram/telegram.types";
import { PrismaService } from "../prisma/prisma.service";
import type { TelegramNotifyCategoryKey } from "./urgent-channel.constants";

export type TelegramUrgentSendResult =
  | {
      ok: true;
      delivered: boolean;
      mode: "real" | "mock";
      skipped?: string;
    }
  | { ok: false; error: string };

@Injectable()
export class WorkflowTelegramService {
  private readonly log = new Logger(WorkflowTelegramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService
  ) {}

  private botToken(): string | undefined {
    const t = this.config.get<string>("TELEGRAM_BOT_TOKEN")?.trim();
    return t && t.length > 0 ? t : undefined;
  }

  async sendUrgent(input: {
    artistId: string;
    category: TelegramNotifyCategoryKey;
    dedupeKey: string;
    text: string;
    aggregateType?: string;
    aggregateId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TelegramUrgentSendResult> {
    const artist = await this.prisma.client.artist.findUnique({
      where: { id: input.artistId },
      select: {
        id: true,
        name: true,
        telegramUrgentEnabled: true,
        telegramChatId: true,
        telegramNotifyCategories: true
      }
    });
    if (!artist) {
      return { ok: false, error: "artist_not_found" };
    }
    if (!artist.telegramUrgentEnabled) {
      await this.audit.log({
        artistId: input.artistId,
        aggregateType: input.aggregateType ?? "Artist",
        aggregateId: input.aggregateId ?? artist.id,
        action: "telegram.urgent.skipped",
        actorLabel: "automation",
        metadata: {
          reason: "telegram_disabled",
          category: input.category,
          dedupeKey: input.dedupeKey,
          ...input.metadata
        }
      });
      return {
        ok: true,
        delivered: false,
        mode: "mock",
        skipped: "telegram_disabled"
      };
    }
    const chatId = artist.telegramChatId?.trim();
    if (!chatId) {
      await this.audit.log({
        artistId: input.artistId,
        aggregateType: input.aggregateType ?? "Artist",
        aggregateId: input.aggregateId ?? artist.id,
        action: "telegram.urgent.skipped",
        actorLabel: "automation",
        metadata: {
          reason: "missing_chat_id",
          category: input.category,
          dedupeKey: input.dedupeKey,
          ...input.metadata
        }
      });
      return {
        ok: true,
        delivered: false,
        mode: "mock",
        skipped: "missing_chat_id"
      };
    }

    const cats = mergeTelegramNotifyCategories(artist.telegramNotifyCategories);
    if (!categoryAllows(cats, input.category)) {
      await this.audit.log({
        artistId: input.artistId,
        aggregateType: input.aggregateType ?? "Artist",
        aggregateId: input.aggregateId ?? artist.id,
        action: "telegram.urgent.skipped",
        actorLabel: "automation",
        metadata: {
          reason: "category_disabled",
          category: input.category,
          dedupeKey: input.dedupeKey,
          ...input.metadata
        }
      });
      return {
        ok: true,
        delivered: false,
        mode: "mock",
        skipped: "category_disabled"
      };
    }

    const existing = await this.prisma.client.telegramUrgentDedupe.findUnique({
      where: {
        artistId_dedupeKey: { artistId: input.artistId, dedupeKey: input.dedupeKey }
      }
    });
    if (existing) {
      await this.audit.log({
        artistId: input.artistId,
        aggregateType: input.aggregateType ?? "Artist",
        aggregateId: input.aggregateId ?? artist.id,
        action: "telegram.urgent.skipped",
        actorLabel: "automation",
        metadata: {
          reason: "dedupe",
          category: input.category,
          dedupeKey: input.dedupeKey,
          ...input.metadata
        }
      });
      return {
        ok: true,
        delivered: false,
        mode: "mock",
        skipped: "dedupe"
      };
    }

    const token = this.botToken();
    const header = `[StoryBoard] ${artist.name}\n\n`;
    const fullText = `${header}${input.text}`.slice(0, 4000);

    let sendResult: TelegramSendMessageResult;
    try {
      if (token) {
        sendResult = await telegramSendMessage({
          botToken: token,
          chatId,
          text: fullText
        });
      } else {
        sendResult = telegramSendMessageMock({ chatId, text: fullText });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(`telegram send failed: ${message}`);
      await this.audit.log({
        artistId: input.artistId,
        aggregateType: input.aggregateType ?? "Artist",
        aggregateId: input.aggregateId ?? artist.id,
        action: "telegram.urgent.failed",
        actorLabel: "automation",
        metadata: {
          category: input.category,
          dedupeKey: input.dedupeKey,
          error: message.slice(0, 500),
          ...input.metadata
        }
      });
      return { ok: false, error: message };
    }

    await this.prisma.client.telegramUrgentDedupe.create({
      data: {
        artistId: input.artistId,
        dedupeKey: input.dedupeKey,
        lastError: null
      }
    });
    await this.audit.log({
      artistId: input.artistId,
      aggregateType: input.aggregateType ?? "Artist",
      aggregateId: input.aggregateId ?? artist.id,
      action: "telegram.urgent.sent",
      actorLabel: "automation",
      metadata: {
        category: input.category,
        dedupeKey: input.dedupeKey,
        mode: sendResult.mode,
        messageId: sendResult.messageId,
        ...input.metadata
      }
    });
    return { ok: true, delivered: true, mode: sendResult.mode };
  }

  async trySendApprovalFailed(input: {
    artistId: string;
    approvalId: string;
    title: string;
    actionType: string;
  }): Promise<void> {
    const text = [
      `Why: Approval execution failed — needs immediate attention.`,
      "",
      `Approval: ${input.title}`,
      `Action: ${input.actionType}`,
      `Open StoryBoard to retry or fix.`
    ].join("\n");
    await this.sendUrgent({
      artistId: input.artistId,
      category: "approvals",
      dedupeKey: `approval_failed:${input.approvalId}`,
      text,
      aggregateType: "ApprovalRequest",
      aggregateId: input.approvalId,
      metadata: { event: "failed", actionType: input.actionType }
    });
  }
}

function categoryAllows(
  cats: TelegramNotifyCategories,
  cat: TelegramNotifyCategoryKey
): boolean {
  switch (cat) {
    case "approvals":
      return cats.approvals;
    case "overdueTasks":
      return cats.overdueTasks;
    case "staleFollowUps":
      return cats.staleFollowUps;
    default:
      return false;
  }
}
