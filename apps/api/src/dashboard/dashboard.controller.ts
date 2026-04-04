import { Controller, Get, Headers, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import type { BookingOpportunity, Task } from "../generated/prisma/client";
import { ApprovalStatus, BookingStage, TaskStatus } from "../generated/prisma/enums";
import { OperationalIntelligenceService } from "../operational-intelligence/operational-intelligence.service";
import { PrismaService } from "../prisma/prisma.service";

@Controller("dashboard")
@UseGuards(SessionAuthGuard)
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly intelligence: OperationalIntelligenceService
  ) {}

  @Get("stats")
  async stats(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.membership.resolveArtistId(
      operator.id,
      req.storyboardSession ?? null,
      artistHeader
    );
    const now = new Date();
    const [venues, contacts, opportunities, tasks, pendingApprovals] =
      await Promise.all([
        this.prisma.client.venue.count({ where: { artistId } }),
        this.prisma.client.contact.count({ where: { artistId } }),
        this.prisma.client.bookingOpportunity.findMany({ where: { artistId } }),
        this.prisma.client.task.findMany({ where: { artistId } }),
        this.prisma.client.approvalRequest.count({
          where: {
            artistId,
            status: {
              in: [ApprovalStatus.proposed, ApprovalStatus.pending]
            }
          }
        })
      ]);
    const activeOpps = opportunities.filter(
      (o: BookingOpportunity) => o.stage !== BookingStage.closed
    ).length;
    const overdue = tasks.filter(
      (t: Task) =>
        t.status !== TaskStatus.done &&
        t.dueAt &&
        new Date(t.dueAt) < now
    ).length;
    return {
      artistId,
      venues,
      contacts,
      bookingOpportunities: opportunities.length,
      activeOpportunities: activeOpps,
      tasks: tasks.length,
      overdueTasks: overdue,
      pendingApprovals
    };
  }

  @Get("insights")
  async insights(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.membership.resolveArtistId(
      operator.id,
      req.storyboardSession ?? null,
      artistHeader
    );
    await this.membership.assertMembership(operator.id, artistId);
    return this.intelligence.getInsights(artistId);
  }
}
