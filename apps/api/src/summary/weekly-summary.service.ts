import { Injectable } from "@nestjs/common";
import {
  APPROVAL_LIFECYCLE_POLICY_VERSION,
  partitionApprovalLifecycle
} from "../approvals/approval-lifecycle";
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
      this.prisma.client.approvalRequest.findMany({
        where: { artistId },
        include: {
          reconciliations: {
            select: { outcome: true, createdAt: true }
          }
        }
      }),
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

    const approvalWorkQueue = partitionApprovalLifecycle(approvals);
    const pendingApprovals: ApprovalRequest[] =
      approvalWorkQueue.pendingDecision;

    const recommendations: string[] = [];
    if (approvalWorkQueue.needsReconciliation.length > 0) {
      recommendations.push(
        `${approvalWorkQueue.needsReconciliation.length} approval outcome(s) need reconciliation. Check the provider before preparing a replacement; never retry an uncertain outside write blindly.`
      );
    }
    if (approvalWorkQueue.readyToExecute.length > 0) {
      recommendations.push(
        `${approvalWorkQueue.readyToExecute.length} approved request(s) are ready for the separate execution step.`
      );
    }
    if (pendingApprovals.length > 0) {
      recommendations.push(
        `You have ${pendingApprovals.length} approval decision(s) waiting. Review them before any outbound work is authorized.`
      );
    }
    if (approvalWorkQueue.approvedNotExecutable.length > 0) {
      recommendations.push(
        `${approvalWorkQueue.approvedNotExecutable.length} approved request(s) have no executable StoryBoard action. Review their status rather than assuming the work ran.`
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
      approvalWorkQueue: {
        policyVersion: APPROVAL_LIFECYCLE_POLICY_VERSION,
        counts: approvalWorkQueue.counts,
        pendingDecision: approvalWorkQueue.pendingDecision,
        readyToExecute: approvalWorkQueue.readyToExecute,
        executionInProgress: approvalWorkQueue.executionInProgress,
        needsReconciliation: approvalWorkQueue.needsReconciliation,
        reconciled: approvalWorkQueue.reconciled,
        approvedNotExecutable: approvalWorkQueue.approvedNotExecutable
      },
      recentAudit: projectAuditEventsForRead(audit),
      recentCommands: commands,
      recommendations
    };
  }
}
