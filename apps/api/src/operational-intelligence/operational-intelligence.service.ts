import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApprovalStatus, BookingStage, TaskStatus } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { URGENT_TELEGRAM_RULES } from "../workflow-automation/urgent-channel.constants";
import { WorkflowTelegramService } from "../workflow-automation/workflow-telegram.service";

export type OpportunityRiskLevel = "low" | "med" | "high";

export type BookingHealthFactorCode =
  | "overdue_tasks"
  | "stale_followups"
  | "pending_approvals"
  | "early_stage_backlog";

export type DashboardInsights = {
  bookingHealth: {
    score: number;
    label: string;
    factors: {
      code: BookingHealthFactorCode;
      impact: number;
      detail: string;
    }[];
  };
  opportunityRisks: {
    opportunityId: string;
    level: OpportunityRiskLevel;
    reasons: string[];
  }[];
  signals: {
    overdueTaskCount: number;
    staleFollowUpCount: number;
    dueCampaignFollowUpCount: number;
    unreadBookingReplyCount: number;
    pendingApprovalAgingCount: number;
    approvalAgingThresholdDays: number;
    overdueClusterThreshold: number;
    staleClusterMin: number;
    meetsApprovalAgingUrgent: boolean;
    meetsOverdueClusterUrgent: boolean;
    meetsStaleClusterUrgent: boolean;
  };
  priorityActions: {
    id: string;
    title: string;
    reason: string;
    href: string;
    severity: "low" | "med" | "high";
  }[];
};

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pendingApprovalUrgentAgeDays(
  workflowPendingApprovalDays: number | null | undefined
): number {
  const base = workflowPendingApprovalDays ?? 0;
  if (base === 0) {
    return URGENT_TELEGRAM_RULES.APPROVAL_AGING_FLOOR_DAYS;
  }
  return Math.min(
    Math.max(base, 1) * URGENT_TELEGRAM_RULES.APPROVAL_AGING_MULTIPLIER,
    URGENT_TELEGRAM_RULES.APPROVAL_AGING_CAP_DAYS
  );
}

@Injectable()
export class OperationalIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly config: ConfigService
  ) {}

  async runUrgentTelegramScan(telegram: WorkflowTelegramService): Promise<{
    artists: number;
    sends: number;
  }> {
    const artists = await this.prisma.client.artist.findMany({
      where: {
        telegramUrgentEnabled: true,
        telegramChatId: { not: null }
      },
      select: {
        id: true,
        name: true,
        workflowOverdueGraceDays: true,
        workflowStaleFollowupDays: true,
        workflowPendingApprovalDays: true
      }
    });
    let sends = 0;
    const globalStale =
      this.config.get<number>("WORKFLOW_STALE_FOLLOWUP_DAYS") ?? 7;
    const dayKey = utcDayKey(new Date());

    for (const artist of artists) {
      const staleDays =
        artist.workflowStaleFollowupDays ?? globalStale;
      const grace = artist.workflowOverdueGraceDays ?? null;
      const [overdue, stale, openTaskCount, agedApprovals] = await Promise.all([
        this.tasks.overdueByDueDate(artist.id, grace),
        this.tasks.followUpsOlderThan(artist.id, staleDays),
        this.prisma.client.task.count({
          where: { artistId: artist.id, status: { not: TaskStatus.done } }
        }),
        this.agedPendingApprovals(
          artist.id,
          pendingApprovalUrgentAgeDays(artist.workflowPendingApprovalDays)
        )
      ]);

      const overdueTh =
        openTaskCount <= URGENT_TELEGRAM_RULES.SMALL_ROSTER_MAX_OPEN_TASKS
          ? URGENT_TELEGRAM_RULES.OVERDUE_CLUSTER_MIN_SMALL
          : URGENT_TELEGRAM_RULES.OVERDUE_CLUSTER_MIN;

      if (agedApprovals.length > 0) {
        const r = await telegram.sendUrgent({
          artistId: artist.id,
          category: "approvals",
          dedupeKey: `approval_aging:${dayKey}`,
          text: buildApprovalAgingText(agedApprovals.length, artist.name),
          metadata: { agedApprovalCount: agedApprovals.length }
        });
        if (r.ok && r.delivered) {
          sends += 1;
        }
      }

      if (overdue.length >= overdueTh) {
        const r = await telegram.sendUrgent({
          artistId: artist.id,
          category: "overdueTasks",
          dedupeKey: `overdue_cluster:${dayKey}`,
          text: buildOverdueClusterText(overdue.length, overdueTh, artist.name),
          metadata: { overdueCount: overdue.length, threshold: overdueTh }
        });
        if (r.ok && r.delivered) {
          sends += 1;
        }
      }

      if (stale.length >= URGENT_TELEGRAM_RULES.STALE_CLUSTER_MIN) {
        const r = await telegram.sendUrgent({
          artistId: artist.id,
          category: "staleFollowUps",
          dedupeKey: `stale_cluster:${dayKey}`,
          text: buildStaleClusterText(stale.length, staleDays, artist.name),
          metadata: { staleCount: stale.length, staleDays }
        });
        if (r.ok && r.delivered) {
          sends += 1;
        }
      }
    }

    return { artists: artists.length, sends };
  }

  private async agedPendingApprovals(artistId: string, minAgeDays: number) {
    const cutoff = new Date(Date.now() - minAgeDays * 86400000);
    return this.prisma.client.approvalRequest.findMany({
      where: {
        artistId,
        status: { in: [ApprovalStatus.proposed, ApprovalStatus.pending] },
        createdAt: { lt: cutoff }
      },
      select: { id: true, title: true }
    });
  }

  /**
   * Booking health score: start at 100, subtract weighted impact per factor (documented).
   */
  async getInsights(artistId: string): Promise<DashboardInsights> {
    const globalStale =
      this.config.get<number>("WORKFLOW_STALE_FOLLOWUP_DAYS") ?? 7;
    const artist = await this.prisma.client.artist.findUnique({
      where: { id: artistId },
      select: {
        workflowOverdueGraceDays: true,
        workflowStaleFollowupDays: true,
        workflowPendingApprovalDays: true
      }
    });
    const staleDays =
      artist?.workflowStaleFollowupDays ?? globalStale;
    const grace = artist?.workflowOverdueGraceDays ?? null;
    const urgentAgeDays = pendingApprovalUrgentAgeDays(
      artist?.workflowPendingApprovalDays
    );

    const [
      opportunities,
      overdue,
      stale,
      pendingApprovals,
      pendingAged,
      openTasks,
      dueCampaignFollowUps,
      unreadBookingReplies
    ] = await Promise.all([
      this.prisma.client.bookingOpportunity.findMany({
        where: { artistId },
        include: {
          tasks: {
            where: { status: { not: TaskStatus.done } }
          }
        }
      }),
      this.tasks.overdueByDueDate(artistId, grace),
      this.tasks.followUpsOlderThan(artistId, staleDays),
      this.prisma.client.approvalRequest.count({
        where: {
          artistId,
          status: { in: [ApprovalStatus.proposed, ApprovalStatus.pending] }
        }
      }),
      this.agedPendingApprovals(artistId, urgentAgeDays),
      this.prisma.client.task.findMany({
        where: { artistId, status: { not: TaskStatus.done } }
      }),
      this.prisma.client.bookingCampaignRecipient.count({
        where: {
          campaign: { artistId },
          status: "drafted",
          followUpDueAt: { lte: new Date() }
        }
      }),
      this.prisma.client.bookingReply.count({ where: { artistId, processingStatus: "unread" } })
    ]);

    const openTaskCount = openTasks.length;
    const overdueTh =
      openTaskCount <= URGENT_TELEGRAM_RULES.SMALL_ROSTER_MAX_OPEN_TASKS
        ? URGENT_TELEGRAM_RULES.OVERDUE_CLUSTER_MIN_SMALL
        : URGENT_TELEGRAM_RULES.OVERDUE_CLUSTER_MIN;

    const meetsApprovalAgingUrgent = pendingAged.length > 0;
    const meetsOverdueClusterUrgent = overdue.length >= overdueTh;
    const meetsStaleClusterUrgent =
      stale.length >= URGENT_TELEGRAM_RULES.STALE_CLUSTER_MIN;

    const factors: DashboardInsights["bookingHealth"]["factors"] = [];
    let score = 100;

    if (overdue.length > 0) {
      const impact = Math.min(15 + overdue.length * 2, 45);
      score -= impact;
      factors.push({
        code: "overdue_tasks",
        impact,
        detail: `${overdue.length} task(s) past due (after grace).`
      });
    }
    if (stale.length > 0) {
      const impact = Math.min(10 + stale.length, 35);
      score -= impact;
      factors.push({
        code: "stale_followups",
        impact,
        detail: `${stale.length} incomplete task(s) stale (${staleDays}+ days without update).`
      });
    }
    if (pendingApprovals > 0) {
      const impact = Math.min(8 + pendingApprovals * 3, 30);
      score -= impact;
      factors.push({
        code: "pending_approvals",
        impact,
        detail: `${pendingApprovals} approval(s) waiting.`
      });
    }
    const earlyStages: BookingStage[] = [
      BookingStage.target,
      BookingStage.outreach
    ];
    const earlyCount = opportunities.filter((o) =>
      earlyStages.includes(o.stage)
    ).length;
    if (earlyCount > 5) {
      const impact = Math.min(5 + (earlyCount - 5), 20);
      score -= impact;
      factors.push({
        code: "early_stage_backlog",
        impact,
        detail: `${earlyCount} opportunities still in target/outreach.`
      });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const label =
      score >= 80 ? "Healthy" : score >= 55 ? "Attention" : "At risk";

    const opportunityRisks = this.computeOpportunityRisks(
      opportunities.filter((o) => o.stage !== BookingStage.closed)
    );
    const priorityActions = this.buildPriorityActions({
      overdueCount: overdue.length,
      staleCount: stale.length,
      dueCampaignFollowUpCount: dueCampaignFollowUps,
      unreadBookingReplyCount: unreadBookingReplies,
      pendingApprovals,
      pendingAgedCount: pendingAged.length,
      meetsApprovalAgingUrgent,
      meetsOverdueClusterUrgent,
      meetsStaleClusterUrgent,
      opportunities
    });

    return {
      bookingHealth: { score, label, factors },
      opportunityRisks,
      signals: {
        overdueTaskCount: overdue.length,
        staleFollowUpCount: stale.length,
        dueCampaignFollowUpCount: dueCampaignFollowUps,
        unreadBookingReplyCount: unreadBookingReplies,
        pendingApprovalAgingCount: pendingAged.length,
        approvalAgingThresholdDays: urgentAgeDays,
        overdueClusterThreshold: overdueTh,
        staleClusterMin: URGENT_TELEGRAM_RULES.STALE_CLUSTER_MIN,
        meetsApprovalAgingUrgent,
        meetsOverdueClusterUrgent,
        meetsStaleClusterUrgent
      },
      priorityActions
    };
  }

  private computeOpportunityRisks(
    opportunities: {
      id: string;
      stage: BookingStage;
      targetDate: Date | null;
      tasks: { status: TaskStatus }[];
    }[]
  ): DashboardInsights["opportunityRisks"] {
    const now = new Date();
    return opportunities.map((o) => {
      const reasons: string[] = [];
      let weight = 0;
      const incomplete = o.tasks.filter((t) => t.status !== TaskStatus.done);
      const blocked = incomplete.filter((t) => t.status === TaskStatus.blocked);
      if (blocked.length >= 2) {
        reasons.push(`${blocked.length} blocked tasks`);
        weight += 2;
      }
      if (
        o.stage === BookingStage.target &&
        o.targetDate &&
        new Date(o.targetDate) < now
      ) {
        reasons.push("Target date passed while still in target");
        weight += 2;
      }
      if (
        (o.stage === BookingStage.target ||
          o.stage === BookingStage.outreach) &&
        incomplete.length >= 4
      ) {
        reasons.push("Many open tasks on an early-stage deal");
        weight += 1;
      }
      const level: OpportunityRiskLevel =
        weight >= 3 ? "high" : weight >= 1 ? "med" : "low";
      return { opportunityId: o.id, level, reasons };
    });
  }

  private buildPriorityActions(input: {
    overdueCount: number;
    staleCount: number;
    dueCampaignFollowUpCount: number;
    unreadBookingReplyCount: number;
    pendingApprovals: number;
    pendingAgedCount: number;
    meetsApprovalAgingUrgent: boolean;
    meetsOverdueClusterUrgent: boolean;
    meetsStaleClusterUrgent: boolean;
    opportunities: { id: string; title: string; stage: BookingStage }[];
  }): DashboardInsights["priorityActions"] {
    const actions: DashboardInsights["priorityActions"] = [];
    if (input.unreadBookingReplyCount > 0) actions.push({ id: "booking-replies-unread", title: "Review new booking replies", reason: `${input.unreadBookingReplyCount} tracked campaign repl${input.unreadBookingReplyCount === 1 ? "y is" : "ies are"} waiting for a response.`, href: "/booking-inbox", severity: "high" });
    if (input.pendingAgedCount > 0 || input.pendingApprovals > 0) {
      actions.push({
        id: "approvals-queue",
        title: "Review pending approvals",
        reason:
          input.pendingAgedCount > 0
            ? `${input.pendingAgedCount} approval(s) have aged past the urgent window — unblocks execution.`
            : `${input.pendingApprovals} approval(s) need a decision before outbound work ships.`,
        href: "/approvals",
        severity: input.meetsApprovalAgingUrgent ? "high" : "med"
      });
    }
    if (input.overdueCount > 0) {
      actions.push({
        id: "tasks-overdue",
        title: "Catch up on overdue tasks",
        reason: `${input.overdueCount} task(s) are past due — reduces booking health and follow-up risk.`,
        href: "/tasks",
        severity: input.meetsOverdueClusterUrgent ? "high" : "med"
      });
    }
    if (input.staleCount > 0) {
      actions.push({
        id: "tasks-stale",
        title: "Refresh stale follow-ups",
        reason: `${input.staleCount} task(s) haven't been updated in a while — momentum is slipping.`,
        href: "/tasks",
        severity: input.meetsStaleClusterUrgent ? "high" : "med"
      });
    }
    if (input.dueCampaignFollowUpCount > 0) {
      actions.push({
        id: "campaign-followups-due",
        title: "Work campaign follow-ups",
        reason: `${input.dueCampaignFollowUpCount} approved pitch follow-up(s) are due — record the reply or move the deal deliberately.`,
        href: "/booking-campaigns",
        severity: "med"
      });
    }
    const stuck = input.opportunities.filter(
      (o) =>
        o.stage === BookingStage.conversation ||
        o.stage === BookingStage.outreach
    );
    if (stuck.length > 0) {
      actions.push({
        id: "pipeline-move",
        title: "Move stalled pipeline deals",
        reason: `${stuck.length} active opportunity/opportunities in outreach/conversation — define the next step or close loop.`,
        href: "/booking",
        severity: "low"
      });
    }
    actions.sort((a, b) => {
      const order = { high: 0, med: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
    return actions.slice(0, 8);
  }
}

function buildApprovalAgingText(count: number, artistName: string): string {
  return [
    `Why: ${count} approval(s) pending past the critical aging threshold for ${artistName}.`,
    "",
    `Review and decide in StoryBoard to unblock execution.`
  ].join("\n");
}

function buildOverdueClusterText(
  count: number,
  threshold: number,
  artistName: string
): string {
  return [
    `Why: Severe overdue task cluster (${count} tasks, threshold ${threshold}) for ${artistName}.`,
    "",
    `Prioritize Tasks view — past-due work compounds.`
  ].join("\n");
}

function buildStaleClusterText(
  count: number,
  staleDays: number,
  artistName: string
): string {
  return [
    `Why: ${count} stale follow-up(s) (no update in ${staleDays}+ days) for ${artistName}.`,
    "",
    `Update or complete tasks to restore momentum.`
  ].join("\n");
}
