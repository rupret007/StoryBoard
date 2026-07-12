import { Injectable, Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { AuditService } from "../audit/audit.service";
import type { Prisma } from "../generated/prisma/client";
import {
  ApprovalStatus,
  InviteDeliveryChannel,
  MembershipInviteStatus,
  TaskStatus,
  WorkflowNotificationKind
} from "../generated/prisma/enums";
import { AdapterRegistryResolver } from "../integrations/adapter-registry.resolver";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import { OperationalIntelligenceService } from "../operational-intelligence/operational-intelligence.service";
import { ManagerService } from "../manager/manager.service";
import { BOOKING_REPLIES_SYNC, type BookingRepliesSyncPort } from "../booking/booking-replies.tokens";
import { MembershipNotifyTargetsService } from "./membership-notify-targets.service";
import { WorkflowEmailService } from "./workflow-email.service";
import { WorkflowNotificationService } from "./workflow-notification.service";
import { WorkflowNotifyPreferenceService } from "./workflow-notify-preference.service";
import { WorkflowTelegramService } from "./workflow-telegram.service";

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
}

/** Monday 00:00 UTC for the ISO week containing `d`. */
function startOfUtcIsoWeek(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - diff,
      0,
      0,
      0,
      0
    )
  );
}

@Injectable()
export class WorkflowJobProcessorService {
  private readonly log = new Logger(WorkflowJobProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly registry: AdapterRegistryResolver,
    private readonly tasks: TasksService,
    private readonly targets: MembershipNotifyTargetsService,
    private readonly notifications: WorkflowNotificationService,
    private readonly email: WorkflowEmailService,
    private readonly prefs: WorkflowNotifyPreferenceService,
    private readonly telegram: WorkflowTelegramService,
    private readonly operationalIntelligence: OperationalIntelligenceService
    , private readonly moduleRef: ModuleRef
  ) {}

  async process(job: Job): Promise<Record<string, unknown>> {
    switch (job.name) {
      case "venue.enrich":
        return this.venueEnrich(job);
      case "research.refresh":
        return this.researchRefresh(job);
      case "invite.send":
        return this.inviteSend(job);
      case "approval.notify":
        return this.approvalNotify(job);
      case "membership.invite_accepted":
        return this.membershipInviteAccepted(job);
      case "integration.connection_changed":
        return this.integrationConnectionChanged(job);
      case "task.check-overdue":
        return this.taskCheckOverdue(job);
      case "followup.check-stale":
        return this.followupCheckStale(job);
      case "digest.generate.daily":
        return this.digestGenerate(job, "daily");
      case "digest.generate.weekly":
        return this.digestGenerate(job, "weekly");
      case "urgent.telegram.scan":
        return this.urgentTelegramScan(job);
      case "booking-replies.sync":
        return this.bookingRepliesSync();
      case "manager.schedule.scan":
        return this.managerScheduleScan();
      default:
        this.log.warn(`unknown job: ${job.name}`);
        return { ok: false, unknown: job.name };
    }
  }

  private managerScheduleScan() {
    const service = this.moduleRef.get(ManagerService, { strict: false });
    return service.runScheduledBriefScan();
  }

  private async bookingRepliesSync() {
    const service = this.moduleRef.get<BookingRepliesSyncPort>(BOOKING_REPLIES_SYNC, { strict: false });
    const settings = await this.prisma.client.artistBookingReplySettings.findMany({ where: { syncEnabled: true }, select: { artistId: true }, take: 100 });
    let created = 0; let failed = 0;
    for (const row of settings) { try { created += (await service.sync(row.artistId)).created; } catch { failed += 1; } }
    return { ok: failed === 0, artists: settings.length, created, failed };
  }

  private async venueEnrich(job: Job) {
    const venueId = job.data?.venueId as string | undefined;
    await this.audit.log({
      aggregateType: "Venue",
      aggregateId: venueId ?? "unknown",
      action: "job.venue_enrich.completed",
      actorLabel: "bullmq",
      metadata: { jobId: job.id, venueId: venueId ?? null }
    });
    return { ok: true };
  }

  private async researchRefresh(job: Job) {
    const artistId = job.data?.artistId as string | undefined;
    const city = job.data?.city as string | undefined;
    await this.audit.log({
      artistId: artistId ?? null,
      aggregateType: "Artist",
      aggregateId: artistId ?? "unknown",
      action: "job.research_refresh.completed",
      actorLabel: "bullmq",
      metadata: { jobId: job.id, city: city ?? null }
    });
    return { ok: true };
  }

  private async inviteSend(job: Job) {
    const inviteId = job.data?.inviteId as string | undefined;
    const artistId = job.data?.artistId as string | undefined;
    const acceptUrl = job.data?.acceptUrl as string | undefined;
    const inviteeEmail = job.data?.inviteeEmail as string | undefined;
    const artistName = job.data?.artistName as string | undefined;
    const role = job.data?.role as string | undefined;
    if (!inviteId || !artistId || !acceptUrl || !inviteeEmail) {
      await this.audit.log({
        artistId: artistId ?? null,
        aggregateType: "membership_invite",
        aggregateId: inviteId ?? "unknown",
        action: "invite.delivery.skipped",
        actorLabel: "bullmq",
        metadata: { reason: "missing_payload" }
      });
      return { ok: false, reason: "missing_payload" };
    }

    const invite = await this.prisma.client.artistMembershipInvite.findFirst({
      where: { id: inviteId, artistId }
    });
    if (!invite || invite.status !== MembershipInviteStatus.pending) {
      await this.audit.log({
        artistId,
        aggregateType: "membership_invite",
        aggregateId: inviteId,
        action: "invite.delivery.skipped",
        actorLabel: "bullmq",
        metadata: { status: invite?.status ?? "not_found" }
      });
      return { ok: true, skipped: true };
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.prisma.client.artistMembershipInvite.update({
        where: { id: inviteId },
        data: { status: MembershipInviteStatus.expired }
      });
      await this.audit.log({
        artistId,
        aggregateType: "membership_invite",
        aggregateId: inviteId,
        action: "invite.delivery.skipped",
        actorLabel: "bullmq",
        metadata: { reason: "expired" }
      });
      return { ok: true, skipped: true };
    }

    const subject = `You're invited to join ${artistName ?? "StoryBoard"}`;
    const body = [
      `You've been invited to collaborate on ${artistName ?? "an artist workspace"} as ${role ?? "member"}.`,
      "",
      `Accept your invitation here (link expires as shown in StoryBoard):`,
      acceptUrl,
      "",
      "If you did not expect this, you can ignore this message."
    ].join("\n");

    try {
      const adapters = await this.registry.resolveForArtist(artistId);
      const r = await adapters.gmail.draftMessage({
        to: inviteeEmail,
        subject,
        body
      });
      const channel =
        adapters.gmail.mode === "real"
          ? InviteDeliveryChannel.gmail_draft
          : InviteDeliveryChannel.mock;
      await this.prisma.client.artistMembershipInvite.update({
        where: { id: inviteId },
        data: {
          deliveredAt: new Date(),
          deliveryChannel: channel,
          deliveryLastError: null
        }
      });
      await this.audit.log({
        artistId,
        aggregateType: "membership_invite",
        aggregateId: inviteId,
        action: "invite.delivery.completed",
        actorLabel: "bullmq",
        metadata: {
          gmailMode: adapters.gmail.mode,
          draftId: r.draftId,
          channel
        }
      });
      return { ok: true, channel };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.client.artistMembershipInvite.update({
        where: { id: inviteId },
        data: {
          deliveryChannel: InviteDeliveryChannel.failed,
          deliveryLastError: message.slice(0, 500)
        }
      });
      await this.audit.log({
        artistId,
        aggregateType: "membership_invite",
        aggregateId: inviteId,
        action: "invite.delivery.failed",
        actorLabel: "bullmq",
        metadata: { error: message.slice(0, 500) }
      });
      return { ok: false, error: message };
    }
  }

  private async approvalNotify(job: Job) {
    const artistId = job.data?.artistId as string | undefined;
    const approvalId = job.data?.approvalId as string | undefined;
    const event = (job.data?.event as string | undefined) ?? "created";
    if (!artistId || !approvalId) {
      return { ok: false, reason: "missing_payload" };
    }
    const row = await this.prisma.client.approvalRequest.findFirst({
      where: { id: approvalId, artistId }
    });
    if (!row) {
      return { ok: false, reason: "approval_not_found" };
    }

    const { kind, title, body } = this.approvalCopy(row.title, row.actionType, event);
    const recipients = await this.targets.listOwnerAndMembers(artistId);
    if (recipients.length === 0) {
      return { ok: true, skipped: true };
    }
    const prefsMap = await this.prefs.prefsForOperators(
      artistId,
      recipients.map((x) => x.operatorId)
    );
    const inAppRecipients = recipients.filter((r) =>
      this.prefs.channelAllows(kind, "inApp", prefsMap.get(r.operatorId)!)
    );
    if (inAppRecipients.length > 0) {
      await this.notifications.createForRecipients({
        artistId,
        recipients: inAppRecipients,
        kind,
        title,
        body,
        metadata: { approvalId, event, status: row.status, actionType: row.actionType }
      });
    }
    for (const r of recipients) {
      if (!this.prefs.channelAllows(kind, "email", prefsMap.get(r.operatorId)!)) {
        continue;
      }
      try {
        await this.email.draftForOperatorIfEnabled({
          artistId,
          recipient: r,
          subject: title,
          body,
          auditAction: "workflow.email.approval_notify",
          auditMetadata: { approvalId, event, actionType: row.actionType }
        });
      } catch {
        /* logged in email service */
      }
    }
    await this.audit.log({
      artistId,
      aggregateType: "ApprovalRequest",
      aggregateId: approvalId,
      action: "workflow.approval_notified",
      actorLabel: "bullmq",
      metadata: { event, recipientCount: recipients.length }
    });
    if (event === "failed") {
      await this.telegram.trySendApprovalFailed({
        artistId,
        approvalId,
        title: row.title,
        actionType: row.actionType
      });
    }
    return { ok: true, event };
  }

  private async urgentTelegramScan(job: Job) {
    void job;
    const r = await this.operationalIntelligence.runUrgentTelegramScan(
      this.telegram
    );
    await this.audit.log({
      artistId: null,
      aggregateType: "Artist",
      aggregateId: "urgent_telegram_scan",
      action: "automation.telegram.scan",
      actorLabel: "bullmq",
      metadata: { artists: r.artists, sends: r.sends }
    });
    return { ok: true, ...r };
  }

  private approvalCopy(
    title: string,
    actionType: string,
    event: string
  ): { kind: WorkflowNotificationKind; title: string; body: string } {
    switch (event) {
      case "approved":
        return {
          kind: WorkflowNotificationKind.approval_approved,
          title: `Approval approved: ${title}`,
          body: `"${title}" (${actionType}) was approved. Review in StoryBoard when ready to execute.`
        };
      case "rejected":
        return {
          kind: WorkflowNotificationKind.approval_rejected,
          title: `Approval rejected: ${title}`,
          body: `"${title}" (${actionType}) was rejected.`
        };
      case "executed":
        return {
          kind: WorkflowNotificationKind.approval_executed,
          title: `Approval executed: ${title}`,
          body: `"${title}" (${actionType}) finished execution successfully.`
        };
      case "failed":
        return {
          kind: WorkflowNotificationKind.approval_failed,
          title: `Approval execution failed: ${title}`,
          body: `Execution failed for "${title}" (${actionType}). Open the approval in StoryBoard for details.`
        };
      default:
        return {
          kind: WorkflowNotificationKind.approval_created,
          title: `New approval: ${title}`,
          body: `An approval was created: "${title}" (${actionType}). Please review in StoryBoard.`
        };
    }
  }

  private async membershipInviteAccepted(job: Job) {
    const artistId = job.data?.artistId as string | undefined;
    const inviteeEmail = job.data?.inviteeEmail as string | undefined;
    const role = job.data?.role as string | undefined;
    if (!artistId || !inviteeEmail) {
      return { ok: false, reason: "missing_payload" };
    }
    const recipients = await this.targets.listOwners(artistId);
    const title = "Invitation accepted";
    const body = `${inviteeEmail} accepted an invitation and joined as ${role ?? "member"}.`;
    const kind = WorkflowNotificationKind.membership_invite_accepted;
    const prefsMap = await this.prefs.prefsForOperators(
      artistId,
      recipients.map((x) => x.operatorId)
    );
    const inAppRecipients = recipients.filter((r) =>
      this.prefs.channelAllows(kind, "inApp", prefsMap.get(r.operatorId)!)
    );
    if (inAppRecipients.length > 0) {
      await this.notifications.createForRecipients({
        artistId,
        recipients: inAppRecipients,
        kind,
        title,
        body,
        metadata: { inviteeEmail, role }
      });
    }
    for (const r of recipients) {
      if (!this.prefs.channelAllows(kind, "email", prefsMap.get(r.operatorId)!)) {
        continue;
      }
      try {
        await this.email.draftForOperatorIfEnabled({
          artistId,
          recipient: r,
          subject: title,
          body,
          auditAction: "workflow.email.invite_accepted",
          auditMetadata: { inviteeEmail, role }
        });
      } catch {
        /* logged in email service */
      }
    }
    await this.audit.log({
      artistId,
      aggregateType: "membership_invite",
      aggregateId: inviteeEmail,
      action: "workflow.invite_accepted_notified",
      actorLabel: "bullmq",
      metadata: { role, ownerCount: recipients.length }
    });
    return { ok: true };
  }

  private async integrationConnectionChanged(job: Job) {
    const artistId = job.data?.artistId as string | undefined;
    const provider = (job.data?.provider as string | undefined) ?? "unknown";
    if (!artistId) {
      return { ok: false, reason: "missing_payload" };
    }
    const recipients = await this.targets.listOwnerAndMembers(artistId);
    const title = "Integration connection updated";
    const body = `The ${provider} connection for this artist was updated. Verify integrations in StoryBoard.`;
    const kind = WorkflowNotificationKind.integration_connection_changed;
    const prefsMap = await this.prefs.prefsForOperators(
      artistId,
      recipients.map((x) => x.operatorId)
    );
    const inAppRecipients = recipients.filter((r) =>
      this.prefs.channelAllows(kind, "inApp", prefsMap.get(r.operatorId)!)
    );
    if (inAppRecipients.length > 0) {
      await this.notifications.createForRecipients({
        artistId,
        recipients: inAppRecipients,
        kind,
        title,
        body,
        metadata: { provider }
      });
    }
    for (const r of recipients) {
      if (!this.prefs.channelAllows(kind, "email", prefsMap.get(r.operatorId)!)) {
        continue;
      }
      try {
        await this.email.draftForOperatorIfEnabled({
          artistId,
          recipient: r,
          subject: title,
          body,
          auditAction: "workflow.email.integration_changed",
          auditMetadata: { provider }
        });
      } catch {
        /* logged in email service */
      }
    }
    await this.audit.log({
      artistId,
      aggregateType: "IntegrationConnection",
      aggregateId: provider,
      action: "workflow.integration_notified",
      actorLabel: "bullmq",
      metadata: { provider, recipientCount: recipients.length }
    });
    return { ok: true };
  }

  private async taskCheckOverdue(job: Job) {
    void job;
    const groups = await this.prisma.client.task.groupBy({
      by: ["artistId"],
      where: {
        status: { not: TaskStatus.done },
        dueAt: { lt: new Date() }
      }
    });
    const dayStart = startOfUtcDay(new Date());
    let notified = 0;
    const digestKind = WorkflowNotificationKind.task_overdue_digest;
    for (const g of groups) {
      const artist = await this.prisma.client.artist.findUnique({
        where: { id: g.artistId },
        select: { workflowOverdueGraceDays: true }
      });
      const overdue = await this.tasks.overdueByDueDate(
        g.artistId,
        artist?.workflowOverdueGraceDays ?? null
      );
      if (overdue.length === 0) {
        continue;
      }
      const recipients = await this.targets.listOwnerAndMembers(g.artistId);
      const prefsMap = await this.prefs.prefsForOperators(
        g.artistId,
        recipients.map((x) => x.operatorId)
      );
      const lines = overdue
        .slice(0, 12)
        .map((t) => `- ${t.title}${t.dueAt ? ` (due ${t.dueAt.toISOString().slice(0, 10)})` : ""}`);
      const title = `${overdue.length} overdue task(s)`;
      const body = [
        `StoryBoard automation: you have ${overdue.length} overdue task(s).`,
        "",
        ...lines,
        overdue.length > 12 ? `\n… and ${overdue.length - 12} more` : ""
      ].join("\n");
      for (const r of recipients) {
        const pref = prefsMap.get(r.operatorId)!;
        const allowInApp = this.prefs.channelAllows(digestKind, "inApp", pref);
        const allowEmail = this.prefs.channelAllows(digestKind, "email", pref);
        if (!allowInApp && !allowEmail) {
          continue;
        }
        const already = await this.notifications.hasDigestToday(
          g.artistId,
          r.operatorId,
          digestKind,
          dayStart
        );
        if (already) {
          continue;
        }
        if (allowInApp) {
          await this.notifications.createForRecipients({
            artistId: g.artistId,
            recipients: [r],
            kind: digestKind,
            title,
            body,
            metadata: { taskCount: overdue.length }
          });
        }
        if (allowEmail) {
          try {
            await this.email.draftForOperatorIfEnabled({
              artistId: g.artistId,
              recipient: r,
              subject: title,
              body,
              auditAction: "workflow.email.task_overdue_digest",
              auditMetadata: { taskCount: overdue.length }
            });
          } catch {
            /* logged */
          }
        }
        notified += 1;
      }
      await this.audit.log({
        artistId: g.artistId,
        aggregateType: "Task",
        aggregateId: "overdue_scan",
        action: "automation.task_overdue.scan",
        actorLabel: "bullmq",
        metadata: { taskCount: overdue.length, artistsProcessed: 1 }
      });
    }
    return { ok: true, artists: groups.length, notifiedOperators: notified };
  }

  private async followupCheckStale(job: Job) {
    void job;
    const globalStale =
      this.config.get<number>("WORKFLOW_STALE_FOLLOWUP_DAYS") ?? 7;
    const groups = await this.prisma.client.task.groupBy({
      by: ["artistId"],
      where: {
        status: { not: TaskStatus.done },
        updatedAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });
    const dayStart = startOfUtcDay(new Date());
    let notified = 0;
    const digestKind = WorkflowNotificationKind.followup_stale_digest;
    for (const g of groups) {
      const artist = await this.prisma.client.artist.findUnique({
        where: { id: g.artistId },
        select: { workflowStaleFollowupDays: true }
      });
      const staleDays =
        artist?.workflowStaleFollowupDays ?? globalStale;
      const stale = await this.tasks.followUpsOlderThan(g.artistId, staleDays);
      if (stale.length === 0) {
        continue;
      }
      const recipients = await this.targets.listOwnerAndMembers(g.artistId);
      const prefsMap = await this.prefs.prefsForOperators(
        g.artistId,
        recipients.map((x) => x.operatorId)
      );
      const lines = stale.slice(0, 12).map((t) => `- ${t.title}`);
      const title = `${stale.length} stale follow-up(s)`;
      const body = [
        `StoryBoard automation: ${stale.length} incomplete task(s) have not been updated in ${staleDays}+ days.`,
        "",
        ...lines,
        stale.length > 12 ? `\n… and ${stale.length - 12} more` : ""
      ].join("\n");
      for (const r of recipients) {
        const pref = prefsMap.get(r.operatorId)!;
        const allowInApp = this.prefs.channelAllows(digestKind, "inApp", pref);
        const allowEmail = this.prefs.channelAllows(digestKind, "email", pref);
        if (!allowInApp && !allowEmail) {
          continue;
        }
        const already = await this.notifications.hasDigestToday(
          g.artistId,
          r.operatorId,
          digestKind,
          dayStart
        );
        if (already) {
          continue;
        }
        if (allowInApp) {
          await this.notifications.createForRecipients({
            artistId: g.artistId,
            recipients: [r],
            kind: digestKind,
            title,
            body,
            metadata: { taskCount: stale.length, staleDays }
          });
        }
        if (allowEmail) {
          try {
            await this.email.draftForOperatorIfEnabled({
              artistId: g.artistId,
              recipient: r,
              subject: title,
              body,
              auditAction: "workflow.email.followup_stale_digest",
              auditMetadata: { taskCount: stale.length, staleDays }
            });
          } catch {
            /* logged */
          }
        }
        notified += 1;
      }
      await this.audit.log({
        artistId: g.artistId,
        aggregateType: "Task",
        aggregateId: "stale_scan",
        action: "automation.followup_stale.scan",
        actorLabel: "bullmq",
        metadata: { taskCount: stale.length, staleDays }
      });
    }
    return { ok: true, artists: groups.length, notifiedOperators: notified };
  }

  private async digestGenerate(
    job: Job,
    cadence: "daily" | "weekly"
  ): Promise<Record<string, unknown>> {
    void job;
    const now = new Date();
    const windowStart =
      cadence === "daily" ? startOfUtcDay(now) : startOfUtcIsoWeek(now);
    const kind =
      cadence === "daily"
        ? WorkflowNotificationKind.digest_daily
        : WorkflowNotificationKind.digest_weekly;
    const globalStale =
      this.config.get<number>("WORKFLOW_STALE_FOLLOWUP_DAYS") ?? 7;
    const artists = await this.prisma.client.artist.findMany({
      select: {
        id: true,
        name: true,
        workflowOverdueGraceDays: true,
        workflowStaleFollowupDays: true,
        workflowPendingApprovalDays: true
      }
    });
    let digestSent = 0;

    for (const artist of artists) {
      const staleDays =
        artist.workflowStaleFollowupDays ?? globalStale;
      const overdue = await this.tasks.overdueByDueDate(
        artist.id,
        artist.workflowOverdueGraceDays ?? null
      );
      const stale = await this.tasks.followUpsOlderThan(artist.id, staleDays);

      const pendingCutoffDays = artist.workflowPendingApprovalDays ?? 0;
      const pendingWhere: Prisma.ApprovalRequestWhereInput = {
        artistId: artist.id,
        status: { in: [ApprovalStatus.proposed, ApprovalStatus.pending] }
      };
      if (pendingCutoffDays > 0) {
        pendingWhere.createdAt = {
          lt: new Date(Date.now() - pendingCutoffDays * 86400000)
        };
      }
      const pendingApprovals = await this.prisma.client.approvalRequest.findMany(
        {
          where: pendingWhere,
          take: 20,
          orderBy: { createdAt: "asc" }
        }
      );

      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const recentInvites =
        await this.prisma.client.artistMembershipInvite.findMany({
          where: { artistId: artist.id, createdAt: { gte: weekAgo } },
          orderBy: { createdAt: "desc" },
          take: 5
        });
      const recentAudit = await this.prisma.client.auditEvent.findMany({
        where: { artistId: artist.id, createdAt: { gte: weekAgo } },
        orderBy: { createdAt: "desc" },
        take: 6
      });

      const recipients = await this.targets.listOwnerAndMembers(artist.id);
      const prefsMap = await this.prefs.prefsForOperators(
        artist.id,
        recipients.map((x) => x.operatorId)
      );

      let artistDigestCount = 0;
      for (const r of recipients) {
        const p = prefsMap.get(r.operatorId)!;
        if (!this.prefs.digestEnabled(p, cadence)) {
          continue;
        }
        const dup = await this.notifications.hasNotificationSince(
          artist.id,
          r.operatorId,
          kind,
          windowStart
        );
        if (dup) {
          continue;
        }

        const sections: string[] = [];
        if (
          this.prefs.includeDigestSection(p, "overdueTasks") &&
          overdue.length > 0
        ) {
          const lines = overdue
            .slice(0, 8)
            .map(
              (t) =>
                `- ${t.title}${t.dueAt ? ` (due ${t.dueAt.toISOString().slice(0, 10)})` : ""}`
            );
          sections.push(
            `Overdue tasks (${overdue.length})`,
            ...lines,
            ...(overdue.length > 8 ? [`… and ${overdue.length - 8} more`] : [])
          );
        }
        if (
          this.prefs.includeDigestSection(p, "staleFollowUps") &&
          stale.length > 0
        ) {
          const lines = stale.slice(0, 8).map((t) => `- ${t.title}`);
          sections.push(
            `Stale follow-ups (${stale.length}, ${staleDays}+ days without update)`,
            ...lines,
            ...(stale.length > 8 ? [`… and ${stale.length - 8} more`] : [])
          );
        }
        if (
          this.prefs.includeDigestSection(p, "approvals") &&
          pendingApprovals.length > 0
        ) {
          const lines = pendingApprovals
            .slice(0, 8)
            .map((a) => `- ${a.title} (${a.status})`);
          sections.push(
            `Pending approvals (${pendingApprovals.length})`,
            ...lines
          );
        }
        if (
          this.prefs.includeDigestSection(p, "invites") &&
          recentInvites.length > 0
        ) {
          sections.push(
            `Recent invites`,
            ...recentInvites.map((i) => `- ${i.email} (${i.status})`)
          );
        }
        const wantActivity =
          this.prefs.includeDigestSection(p, "invites") ||
          this.prefs.includeDigestSection(p, "approvals");
        if (wantActivity && recentAudit.length > 0) {
          sections.push(
            `Recent activity`,
            ...recentAudit.map(
              (e) => `- ${e.action} · ${e.aggregateType} (${e.createdAt.toISOString().slice(0, 10)})`
            )
          );
        }

        if (sections.length === 0) {
          continue;
        }

        const title = `StoryBoard ${cadence} digest — ${artist.name}`;
        const body = sections.join("\n\n");
        await this.notifications.createForRecipients({
          artistId: artist.id,
          recipients: [r],
          kind,
          title,
          body,
          metadata: { cadence, sectionBlocks: sections.length }
        });
        try {
          await this.email.draftForOperatorIfEnabled({
            artistId: artist.id,
            recipient: r,
            subject: title,
            body,
            auditAction:
              cadence === "daily"
                ? "workflow.email.digest_daily"
                : "workflow.email.digest_weekly",
            auditMetadata: { cadence }
          });
        } catch {
          /* logged */
        }
        digestSent += 1;
        artistDigestCount += 1;
      }

      if (artistDigestCount > 0) {
        await this.audit.log({
          artistId: artist.id,
          aggregateType: "Artist",
          aggregateId: artist.id,
          action:
            cadence === "daily"
              ? "automation.digest.daily"
              : "automation.digest.weekly",
          actorLabel: "bullmq",
          metadata: { digestCount: artistDigestCount, cadence }
        });
      }
    }

    return { ok: true, cadence, artists: artists.length, digestSent };
  }
}
