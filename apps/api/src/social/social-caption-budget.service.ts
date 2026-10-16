import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { socialCaptionDailyCallLimitSchema } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";

export const SOCIAL_CAPTION_BUDGET_UNAVAILABLE =
  "Caption generation is unavailable because its daily call budget could not be verified. No draft was created.";
export const SOCIAL_CAPTION_BUDGET_EXHAUSTED =
  "The daily caption generation call limit has been reached or calls are disabled. No draft was created.";

@Injectable()
export class SocialCaptionBudgetService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService
  ) {}

  /** Reserve once before each provider attempt. Failed/uncertain calls are never refunded. */
  async reserve(): Promise<void> {
    let limit: number;
    try {
      limit = socialCaptionDailyCallLimitSchema.parse(
        this.config.get<unknown>("SOCIAL_CAPTION_DAILY_CALL_LIMIT")
      );
    } catch {
      throw new ServiceUnavailableException(SOCIAL_CAPTION_BUDGET_UNAVAILABLE);
    }
    if (limit === 0) {
      throw new ServiceUnavailableException(SOCIAL_CAPTION_BUDGET_EXHAUSTED);
    }

    let rows: Array<{ calls: number }>;
    try {
      // The database clock and unique UTC-day row coordinate all API processes.
      // The conditional upsert claims the last slot atomically under concurrency.
      rows = await this.prisma.client.$queryRaw<Array<{ calls: number }>>`
        INSERT INTO "SocialCaptionDailyUsage" ("day", "calls")
        VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date, 1)
        ON CONFLICT ("day") DO UPDATE
        SET "calls" = "SocialCaptionDailyUsage"."calls" + 1
        WHERE "SocialCaptionDailyUsage"."calls" < ${limit}
        RETURNING "calls"
      `;
      const reservation = rows?.[0];
      if (!Array.isArray(rows) || rows.length > 1 ||
          (rows.length === 1 && (!reservation || !Number.isInteger(reservation.calls) ||
            reservation.calls < 1 || reservation.calls > limit))) {
        throw new Error("Invalid daily caption budget reservation.");
      }
    } catch {
      // A missing migration, unavailable store, or uncertain write cannot permit
      // a provider call; never substitute a per-process counter or expose errors.
      throw new ServiceUnavailableException(SOCIAL_CAPTION_BUDGET_UNAVAILABLE);
    }
    if (rows.length === 0) {
      throw new ServiceUnavailableException(SOCIAL_CAPTION_BUDGET_EXHAUSTED);
    }
  }
}
