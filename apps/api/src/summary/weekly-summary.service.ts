import { Injectable } from "@nestjs/common";
import type {
  ApprovalRequest,
  BookingOpportunity,
  Task
} from "../generated/prisma/client";
import { BookingStage, TaskStatus } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { projectAuditEventsForRead } from "../audit-events/audit-event-projection";

@Injectable()
export class WeeklySummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async build(artistId: string) {
    const [opportunities, tasks, approvals, audit, commands] = await Promise.all([
      this.prisma.client.bookingOpportunity.findMany({ where: { artistId } }),
      this.prisma.client.task.findMany({
        where: { artistId },
        include: { opportunity: true }
      }),
      this.prisma.client.approvalRequest.findMany({ where: { artistId } }),
      this.prisma.client.auditEvent.findMany({
        where: { artistId },
        orderBy: { createdAt: "desc" },
        take: 15
      }),
      this.prisma.client.commandRun.findMany({
        where: { artistId },
        orderBy: { createdAt: "desc" },
        take: 10
      })
    ]);

    const byStage = Object.values(BookingStage).reduce(
      (acc, stage) => {
        acc[stage] = opportunities.filter(
          (o: BookingOpportunity) => o.stage === stage
        ).length;
        return acc;
      },
      {} as Record<string, number>
    );

    const now = new Date();
    const overdueTasks = tasks.filter(
      (t: Task) =>
        t.status !== TaskStatus.done &&
        t.dueAt &&
        new Date(t.dueAt) < now
    );

    const staleFollowUps = tasks.filter((t: Task) => {
      if (t.status === TaskStatus.done) {
        return false;
      }
      const d = new Date(t.updatedAt);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      return d < cutoff;
    });

    const pendingApprovals = approvals.filter((a: ApprovalRequest) =>
      ["proposed", "pending"].includes(a.status)
    );

    const recommendations: string[] = [];
    if (pendingApprovals.length > 0) {
      recommendations.push(
        `You have ${pendingApprovals.length} approval(s) waiting. Review them before any outbound sends.`
      );
    }
    if (overdueTasks.length > 0) {
      recommendations.push(
        `${overdueTasks.length} task(s) are past due — prioritize follow-ups.`
      );
    }
    const activePipe = opportunities.filter(
      (o: BookingOpportunity) => !["closed", "confirmed"].includes(o.stage)
    ).length;
    if (activePipe < 3) {
      recommendations.push(
        "Active pipeline is thin — add targets or outreach for new opportunities."
      );
    }

    return {
      generatedAt: now.toISOString(),
      bookingPipelineByStage: byStage,
      activeOpportunities: activePipe,
      overdueTasks,
      staleFollowUpsOlderThan7d: staleFollowUps,
      pendingApprovals,
      recentAudit: projectAuditEventsForRead(audit),
      recentCommands: commands,
      recommendations
    };
  }
}
