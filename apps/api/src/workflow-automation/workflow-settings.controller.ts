import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyRequest } from "fastify";
import {
  artistTelegramSettingsPatchSchema,
  mergeTelegramNotifyCategories,
  workflowNotifyPrefsSchema
} from "@storyboard/shared";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ArtistMembershipRole } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramRegistrationService } from "./telegram-registration.service";
import { WorkflowNotifyPreferenceService } from "./workflow-notify-preference.service";

const escalationPatchSchema = z.object({
  workflowOverdueGraceDays: z.number().int().min(0).max(365).nullable().optional(),
  workflowStaleFollowupDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .nullable()
    .optional(),
  workflowPendingApprovalDays: z
    .number()
    .int()
    .min(0)
    .max(365)
    .nullable()
    .optional()
});

@Controller("workflow")
@UseGuards(SessionAuthGuard)
export class WorkflowSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly roles: RolePolicyService,
    private readonly prefs: WorkflowNotifyPreferenceService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly telegramRegistration: TelegramRegistrationService
  ) {}

  private async artistId(
    operatorId: string,
    req: FastifyRequest,
    headerArtistId?: string
  ) {
    return this.membership.resolveArtistId(
      operatorId,
      req.storyboardSession ?? null,
      headerArtistId
    );
  }

  @Get("preferences")
  async getPreferences(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanRead(operator.id, artistId);
    const preferences = await this.prefs.getPrefs(operator.id, artistId);
    return { preferences };
  }

  @Patch("preferences")
  async patchPreferences(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string,
    @Body() body?: unknown
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanRead(operator.id, artistId);
    const parsed = workflowNotifyPrefsSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.prisma.client.artistMembership.update({
      where: {
        operatorId_artistId: { operatorId: operator.id, artistId }
      },
      data: { workflowNotifyPrefs: parsed.data as object }
    });
    await this.audit.log({
      artistId,
      aggregateType: "ArtistMembership",
      aggregateId: `${operator.id}:${artistId}`,
      action: "workflow.notify_prefs.updated",
      actorLabel: operator.email,
      actorOperatorId: operator.id,
      metadata: { artistId }
    });
    const preferences = await this.prefs.getPrefs(operator.id, artistId);
    return { preferences };
  }

  @Get("escalation")
  async getEscalation(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanRead(operator.id, artistId);
    const artist = await this.prisma.client.artist.findUnique({
      where: { id: artistId },
      select: {
        workflowOverdueGraceDays: true,
        workflowStaleFollowupDays: true,
        workflowPendingApprovalDays: true
      }
    });
    return {
      workflowOverdueGraceDays: artist?.workflowOverdueGraceDays ?? null,
      workflowStaleFollowupDays: artist?.workflowStaleFollowupDays ?? null,
      workflowPendingApprovalDays: artist?.workflowPendingApprovalDays ?? null
    };
  }

  @Patch("escalation")
  async patchEscalation(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string,
    @Body() body?: unknown
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertOwner(operator.id, artistId);
    const parsed = escalationPatchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const before = await this.prisma.client.artist.findUnique({
      where: { id: artistId },
      select: {
        workflowOverdueGraceDays: true,
        workflowStaleFollowupDays: true,
        workflowPendingApprovalDays: true
      }
    });
    const data: {
      workflowOverdueGraceDays?: number | null;
      workflowStaleFollowupDays?: number | null;
      workflowPendingApprovalDays?: number | null;
    } = {};
    if (parsed.data.workflowOverdueGraceDays !== undefined) {
      data.workflowOverdueGraceDays = parsed.data.workflowOverdueGraceDays;
    }
    if (parsed.data.workflowStaleFollowupDays !== undefined) {
      data.workflowStaleFollowupDays = parsed.data.workflowStaleFollowupDays;
    }
    if (parsed.data.workflowPendingApprovalDays !== undefined) {
      data.workflowPendingApprovalDays = parsed.data.workflowPendingApprovalDays;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No escalation fields to update");
    }
    await this.prisma.client.artist.update({
      where: { id: artistId },
      data
    });
    await this.audit.log({
      artistId,
      aggregateType: "Artist",
      aggregateId: artistId,
      action: "workflow.escalation.updated",
      actorLabel: operator.email,
      actorOperatorId: operator.id,
      metadata: {
        before: before ?? {},
        after: data
      }
    });
    const artist = await this.prisma.client.artist.findUnique({
      where: { id: artistId },
      select: {
        workflowOverdueGraceDays: true,
        workflowStaleFollowupDays: true,
        workflowPendingApprovalDays: true
      }
    });
    return {
      workflowOverdueGraceDays: artist?.workflowOverdueGraceDays ?? null,
      workflowStaleFollowupDays: artist?.workflowStaleFollowupDays ?? null,
      workflowPendingApprovalDays: artist?.workflowPendingApprovalDays ?? null
    };
  }

  @Get("telegram")
  async getTelegram(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanRead(operator.id, artistId);
    const membership = await this.prisma.client.artistMembership.findUnique({
      where: {
        operatorId_artistId: { operatorId: operator.id, artistId }
      },
      select: { role: true }
    });
    const isOwner = membership?.role === ArtistMembershipRole.owner;
    const botConfigured = !!this.config
      .get<string>("TELEGRAM_BOT_TOKEN")
      ?.trim();
    const artist = await this.prisma.client.artist.findUnique({
      where: { id: artistId },
      select: {
        telegramUrgentEnabled: true,
        telegramChatId: true,
        telegramNotifyCategories: true
      }
    });
    const hasChatId = !!(artist?.telegramChatId?.trim().length ?? 0);
    const categories = mergeTelegramNotifyCategories(
      artist?.telegramNotifyCategories
    );
    if (!isOwner) {
      return {
        redacted: true,
        readiness: {
          botConfigured,
          urgentEnabled: artist?.telegramUrgentEnabled ?? false,
          hasChatId,
          canSend: Boolean(
            botConfigured &&
              (artist?.telegramUrgentEnabled ?? false) &&
              hasChatId
          )
        },
        note: "Telegram alert routing is owner-only."
      };
    }
    return {
      redacted: false,
      readiness: {
        botConfigured,
        urgentEnabled: artist?.telegramUrgentEnabled ?? false,
        hasChatId,
        canSend: Boolean(
          botConfigured && (artist?.telegramUrgentEnabled ?? false) && hasChatId
        )
      },
      telegramUrgentEnabled: artist?.telegramUrgentEnabled ?? false,
      telegramChatId: artist?.telegramChatId ?? null,
      telegramNotifyCategories: categories
    };
  }

  @Post("telegram/registration-token")
  async postTelegramRegistrationToken(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertOwner(operator.id, artistId);
    return this.telegramRegistration.createRegistrationToken({
      artistId,
      createdByOperatorId: operator.id,
      operatorLabel: operator.email
    });
  }

  @Patch("telegram")
  async patchTelegram(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string,
    @Body() body?: unknown
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertOwner(operator.id, artistId);
    const parsed = artistTelegramSettingsPatchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const before = await this.prisma.client.artist.findUnique({
      where: { id: artistId },
      select: {
        telegramUrgentEnabled: true,
        telegramChatId: true,
        telegramNotifyCategories: true
      }
    });
    const data: {
      telegramUrgentEnabled?: boolean;
      telegramChatId?: string | null;
      telegramNotifyCategories?: object;
    } = {};
    if (parsed.data.telegramUrgentEnabled !== undefined) {
      data.telegramUrgentEnabled = parsed.data.telegramUrgentEnabled;
    }
    if (parsed.data.telegramChatId !== undefined) {
      const v = parsed.data.telegramChatId;
      data.telegramChatId =
        v === null || v === undefined ? null : v.trim() || null;
    }
    if (parsed.data.telegramNotifyCategories !== undefined) {
      data.telegramNotifyCategories = {
        ...mergeTelegramNotifyCategories(before?.telegramNotifyCategories),
        ...parsed.data.telegramNotifyCategories
      };
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No Telegram fields to update");
    }
    await this.prisma.client.artist.update({
      where: { id: artistId },
      data
    });
    await this.audit.log({
      artistId,
      aggregateType: "Artist",
      aggregateId: artistId,
      action: "workflow.telegram.settings.updated",
      actorLabel: operator.email,
      actorOperatorId: operator.id,
      metadata: { before: before ?? {}, patch: data }
    });
    return this.getTelegram(operator, req, artistHeader);
  }
}
