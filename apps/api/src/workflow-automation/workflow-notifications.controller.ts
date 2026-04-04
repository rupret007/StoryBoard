import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { WorkflowNotificationService } from "./workflow-notification.service";

@Controller("workflow/notifications")
@UseGuards(SessionAuthGuard)
export class WorkflowNotificationsController {
  constructor(
    private readonly notifications: WorkflowNotificationService,
    private readonly membership: MembershipService
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

  @Get()
  async list(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string,
    @Query("limit") limitRaw?: string,
    @Query("unreadOnly") unreadOnly?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    const lim = limitRaw ? parseInt(limitRaw, 10) : 20;
    const limit = Number.isFinite(lim) ? Math.min(50, Math.max(1, lim)) : 20;
    const [items, unreadCount] = await Promise.all([
      this.notifications.listForRecipient({
        artistId,
        recipientOperatorId: operator.id,
        limit,
        unreadOnly: unreadOnly === "true" || unreadOnly === "1"
      }),
      this.notifications.unreadCount(artistId, operator.id)
    ]);
    return { items, unreadCount };
  }

  @Patch(":id/read")
  async markRead(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    const row = await this.notifications.markRead({
      id,
      artistId,
      recipientOperatorId: operator.id
    });
    if (!row) {
      throw new BadRequestException("Notification not found");
    }
    return row;
  }
}
