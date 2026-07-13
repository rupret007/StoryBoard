import { Controller, Get, Headers, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { projectAuditEventsForRead } from "./audit-event-projection";

@Controller("audit-events")
@UseGuards(SessionAuthGuard)
export class AuditEventsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService
  ) {}

  @Get()
  async list(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string,
    @Query("take") take?: string
  ) {
    const artistId = await this.membership.resolveArtistId(
      operator.id,
      req.storyboardSession ?? null,
      artistHeader
    );
    const n = take ? Math.min(parseInt(take, 10) || 50, 200) : 50;
    const events = await this.prisma.client.auditEvent.findMany({
      where: { artistId },
      orderBy: { createdAt: "desc" },
      take: n
    });
    return projectAuditEventsForRead(events);
  }
}
