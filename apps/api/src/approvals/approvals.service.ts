import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  calendarHoldBatchPayloadSchema,
  driveEnsureFolderPayloadSchema,
  outboundEmailBatchPayloadSchema
} from "@storyboard/shared";
import {
  ApprovalStatus,
  AuditSeverity,
  BookingCampaignRecipientStatus
} from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { AdapterRegistryResolver } from "../integrations/adapter-registry.resolver";
import type { CalendarHoldRequest } from "../integrations/adapters/adapter.types";
import type { GmailDraft } from "../integrations/adapters/adapter.types";
import { PrismaService } from "../prisma/prisma.service";
import { StoryboardQueueService } from "../queue/storyboard-queue.service";

const EXECUTABLE_ACTIONS = new Set([
  "outbound_email_batch",
  "calendar_hold_batch",
  "drive_ensure_folder"
]);

type OutboundDraftPayload = {
  venueId?: string;
  message: GmailDraft;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseOutboundPayload(payload: unknown) {
  const p = outboundEmailBatchPayloadSchema.safeParse(payload);
  if (!p.success) {
    throw new BadRequestException(p.error.flatten());
  }
  const drafts: OutboundDraftPayload[] = p.data.drafts.map((d) => {
    const row: OutboundDraftPayload = { message: d.message };
    if (d.venueId !== undefined) {
      row.venueId = d.venueId;
    }
    return row;
  });
  return { drafts, campaign: p.data.campaign };
}

function parseCalendarHolds(payload: unknown): CalendarHoldRequest[] {
  const p = calendarHoldBatchPayloadSchema.safeParse(payload);
  if (!p.success) {
    throw new BadRequestException(p.error.flatten());
  }
  return p.data.holds.map((h) => {
    const req: CalendarHoldRequest = {
      title: h.title,
      start: h.start,
      end: h.end
    };
    if (h.timeZone !== undefined) {
      req.timeZone = h.timeZone;
    }
    return req;
  });
}

function parseDriveFolder(payload: unknown): string {
  const p = driveEnsureFolderPayloadSchema.safeParse(payload);
  if (!p.success) {
    throw new BadRequestException(p.error.flatten());
  }
  return p.data.folderName;
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registryResolver: AdapterRegistryResolver,
    private readonly storyboardQueue: StoryboardQueueService
  ) {}

  private notifyApproval(
    artistId: string,
    approvalId: string,
    event: "created" | "approved" | "rejected" | "executed" | "failed"
  ) {
    void this.storyboardQueue
      .enqueueApprovalNotify({ artistId, approvalId, event })
      .catch(() => undefined);
  }

  private async finalizeCampaignDrafts(
    artistId: string,
    approvalId: string,
    nextPayload: object,
    actorLabel: string,
    actorOperatorId: string | null,
    campaign: {
      campaignId: string;
      recipients: { recipientId: string; followUpDueAt: string }[];
    } | undefined
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      if (campaign) {
        const bookingCampaign = await tx.bookingCampaign.findFirst({
          where: {
            id: campaign.campaignId,
            artistId,
            approvalRequestId: approvalId
          }
        });
        if (!bookingCampaign) {
          throw new BadRequestException("Campaign approval context not found");
        }
        const ids = campaign.recipients.map((recipient) => recipient.recipientId);
        if (new Set(ids).size !== ids.length) {
          throw new BadRequestException("Campaign approval contains duplicate recipients");
        }
        const recipients = await tx.bookingCampaignRecipient.findMany({
          where: {
            id: { in: ids },
            campaignId: campaign.campaignId,
            status: BookingCampaignRecipientStatus.approval_requested
          },
          include: { prospect: true }
        });
        if (recipients.length !== ids.length) {
          throw new BadRequestException("Campaign recipients are not ready for draft execution");
        }
        const byId = new Map(recipients.map((recipient) => [recipient.id, recipient]));
        for (const spec of campaign.recipients) {
          const recipient = byId.get(spec.recipientId)!;
          const dueAt = new Date(spec.followUpDueAt);
          if (Number.isNaN(dueAt.getTime())) {
            throw new BadRequestException("Campaign follow-up date is invalid");
          }
          const task = await tx.task.create({
            data: {
              artistId,
              opportunityId: recipient.opportunityId,
              title: `Follow up with ${recipient.prospect.name}`,
              ownerLabel: "Booking campaign",
              dueAt
            }
          });
          await tx.auditEvent.create({
            data: {
              artistId,
              aggregateType: "Task",
              aggregateId: task.id,
              action: "task.created",
              actorLabel,
              actorOperatorId,
              metadata: {
                title: task.title,
                campaignId: campaign.campaignId,
                campaignRecipientId: recipient.id
              }
            }
          });
          await tx.bookingCampaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: BookingCampaignRecipientStatus.drafted,
              followUpDueAt: dueAt,
              followUpTaskId: task.id
            }
          });
        }
        await tx.auditEvent.create({
          data: {
            artistId,
            aggregateType: "BookingCampaign",
            aggregateId: campaign.campaignId,
            action: "booking_campaign.drafts_created",
            metadata: { approvalId, recipientCount: recipients.length }
          }
        });
      }
      return tx.approvalRequest.update({
        where: { id: approvalId },
        data: {
          status: ApprovalStatus.executed,
          payload: nextPayload
        }
      });
    });
  }

  list(artistId: string, status?: ApprovalStatus) {
    return this.prisma.client.approvalRequest.findMany({
      where: {
        artistId,
        ...(status ? { status } : {})
      },
      orderBy: { createdAt: "desc" }
    });
  }

  pending(artistId: string) {
    return this.prisma.client.approvalRequest.findMany({
      where: {
        artistId,
        status: { in: [ApprovalStatus.proposed, ApprovalStatus.pending] }
      },
      orderBy: { createdAt: "asc" }
    });
  }

  /** Approved items that can still be executed */
  readyToExecute(artistId: string) {
    return this.prisma.client.approvalRequest.findMany({
      where: {
        artistId,
        status: ApprovalStatus.approved,
        actionType: { in: [...EXECUTABLE_ACTIONS] }
      },
      orderBy: { approvedAt: "asc" }
    });
  }

  async get(artistId: string, id: string) {
    const row = await this.prisma.client.approvalRequest.findFirst({
      where: { id, artistId }
    });
    if (!row) {
      throw new NotFoundException("Approval not found");
    }
    return row;
  }

  async create(
    artistId: string,
    data: {
      title: string;
      actionType: string;
      payload: Record<string, unknown>;
      opportunityId?: string | null;
      proposedBy?: string | null;
      status?: ApprovalStatus;
      actorOperatorId?: string | null;
    }
  ) {
    const row = await this.prisma.client.approvalRequest.create({
      data: {
        artistId,
        title: data.title,
        actionType: data.actionType,
        payload: data.payload as object,
        opportunityId: data.opportunityId ?? null,
        proposedBy: data.proposedBy ?? null,
        status: data.status ?? ApprovalStatus.pending
      }
    });
    await this.audit.log({
      artistId,
      severity: AuditSeverity.warning,
      aggregateType: "ApprovalRequest",
      aggregateId: row.id,
      action: "approval.created",
      actorLabel: data.proposedBy ?? "system",
      actorOperatorId: data.actorOperatorId ?? null,
      metadata: { title: row.title, actionType: row.actionType }
    });
    this.notifyApproval(artistId, row.id, "created");
    return row;
  }

  async approve(
    artistId: string,
    id: string,
    actorLabel: string,
    actorOperatorId?: string | null
  ) {
    const approvalRow = await this.get(artistId, id);
    if (
      approvalRow.status !== ApprovalStatus.pending &&
      approvalRow.status !== ApprovalStatus.proposed
    ) {
      throw new BadRequestException("Approval is not pending");
    }
    const updated = await this.prisma.client.approvalRequest.update({
      where: { id },
      data: {
        status: ApprovalStatus.approved,
        approvedBy: actorLabel,
        approvedAt: new Date()
      }
    });
    await this.audit.log({
      artistId,
      severity: AuditSeverity.info,
      aggregateType: "ApprovalRequest",
      aggregateId: id,
      action: "approval.approved",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { actionType: approvalRow.actionType }
    });
    this.notifyApproval(artistId, id, "approved");
    return updated;
  }

  async reject(
    artistId: string,
    id: string,
    actorLabel: string,
    reason?: string,
    actorOperatorId?: string | null
  ) {
    const approvalRow = await this.get(artistId, id);
    if (
      approvalRow.status !== ApprovalStatus.pending &&
      approvalRow.status !== ApprovalStatus.proposed
    ) {
      throw new BadRequestException("Approval is not pending");
    }
    const updated = await this.prisma.client.approvalRequest.update({
      where: { id },
      data: {
        status: ApprovalStatus.rejected,
        approvedBy: actorLabel,
        approvedAt: new Date(),
        payload: {
          ...(approvalRow.payload as object),
          rejectionReason: reason ?? null
        } as object
      }
    });
    await this.audit.log({
      artistId,
      severity: AuditSeverity.warning,
      aggregateType: "ApprovalRequest",
      aggregateId: id,
      action: "approval.rejected",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { reason: reason ?? null }
    });
    this.notifyApproval(artistId, id, "rejected");
    return updated;
  }

  /**
   * Run side effects for an approved request. Only action types in EXECUTABLE_ACTIONS.
   * dryRun: preview only — no provider calls, status stays approved.
   */
  async executeApproved(
    artistId: string,
    id: string,
    actorLabel: string,
    options?: { dryRun?: boolean; actorOperatorId?: string | null }
  ) {
    const approvalRow = await this.get(artistId, id);

    if (approvalRow.status === ApprovalStatus.executed) {
      throw new BadRequestException("Approval already executed");
    }
    if (approvalRow.status === ApprovalStatus.failed) {
      throw new BadRequestException(
        "Approval previously failed; create a new approval"
      );
    }
    if (approvalRow.status !== ApprovalStatus.approved) {
      throw new BadRequestException("Only approved requests can be executed");
    }
    if (!EXECUTABLE_ACTIONS.has(approvalRow.actionType)) {
      throw new BadRequestException(
        `Execution not enabled for action type: ${approvalRow.actionType}`
      );
    }

    const adapters = await this.registryResolver.resolveForArtist(artistId);
    const dryRun = options?.dryRun === true;
    const actorOperatorId = options?.actorOperatorId ?? null;
    const now = new Date();

    await this.prisma.client.approvalRequest.update({
      where: { id },
      data: { executionAttemptedAt: now }
    });

    await this.audit.log({
      artistId,
      severity: AuditSeverity.warning,
      aggregateType: "ApprovalRequest",
      aggregateId: id,
      action: "approval.execution.started",
      actorLabel,
      actorOperatorId,
      metadata: { actionType: approvalRow.actionType, dryRun }
    });

    const basePayload = isRecord(approvalRow.payload)
      ? { ...approvalRow.payload }
      : {};

    if (dryRun) {
      let preview: Record<string, unknown> = {};
      if (approvalRow.actionType === "outbound_email_batch") {
        const outbound = parseOutboundPayload(approvalRow.payload);
        const drafts = outbound.drafts;
        preview = {
          wouldCreateDrafts: drafts.length,
          gmailMode: adapters.gmail.mode,
          samples: drafts.map((d) => ({
            venueId: d.venueId,
            to: d.message.to,
            subject: d.message.subject
          }))
        };
      } else if (approvalRow.actionType === "calendar_hold_batch") {
        const holds = parseCalendarHolds(approvalRow.payload);
        preview = {
          wouldCreateHolds: holds.length,
          calendarMode: adapters.calendar.mode,
          samples: holds.map((h) => ({ title: h.title, start: h.start }))
        };
      } else if (approvalRow.actionType === "drive_ensure_folder") {
        const folderName = parseDriveFolder(approvalRow.payload);
        preview = {
          folderName,
          driveMode: adapters.drive.mode
        };
      }
      const nextPayload = {
        ...basePayload,
        dryRunPreview: { at: now.toISOString(), ...preview }
      };
      const updated = await this.prisma.client.approvalRequest.update({
        where: { id },
        data: { payload: nextPayload as object }
      });
      await this.audit.log({
        artistId,
        severity: AuditSeverity.info,
        aggregateType: "ApprovalRequest",
        aggregateId: id,
        action: "approval.execution.dry_run",
        actorLabel,
        actorOperatorId,
        metadata: { actionType: approvalRow.actionType }
      });
      return updated;
    }

    try {
      if (approvalRow.actionType === "outbound_email_batch") {
        const outbound = parseOutboundPayload(approvalRow.payload);
        const draftsSpec = outbound.drafts;
        type CreatedDraft = {
          venueId?: string;
          draftId: string;
          preview: string;
          providerMode: string;
        };
        const created: CreatedDraft[] = [];
        for (const d of draftsSpec) {
          const r = await adapters.gmail.draftMessage(d.message);
          const entry: CreatedDraft = {
            draftId: r.draftId,
            preview: r.preview,
            providerMode: adapters.gmail.mode
          };
          if (d.venueId !== undefined) {
            entry.venueId = d.venueId;
          }
          created.push(entry);
        }
        const executionResult = {
          at: now.toISOString(),
          drafts: created,
          gmailMode: adapters.gmail.mode
        };
        const nextPayload = {
          ...basePayload,
          executionResult
        };
        const updated = await this.finalizeCampaignDrafts(
          artistId,
          id,
          nextPayload as object,
          actorLabel,
          actorOperatorId,
          outbound.campaign
        );
        await this.audit.log({
          artistId,
          severity: AuditSeverity.info,
          aggregateType: "ApprovalRequest",
          aggregateId: id,
          action: "approval.execution.succeeded",
          actorLabel,
          actorOperatorId,
          metadata: {
            actionType: approvalRow.actionType,
            draftCount: created.length,
            gmailMode: adapters.gmail.mode
          }
        });
        this.notifyApproval(artistId, id, "executed");
        return updated;
      }

      if (approvalRow.actionType === "calendar_hold_batch") {
        const holds = parseCalendarHolds(approvalRow.payload);
        const created: {
          title: string;
          start: string;
          end: string;
          eventId: string;
          htmlLink: string | null;
          providerMode: string;
        }[] = [];
        for (const h of holds) {
          const r = await adapters.calendar.proposeHold(h);
          created.push({
            title: h.title,
            start: h.start,
            end: h.end,
            eventId: r.eventId,
            htmlLink: r.htmlLink,
            providerMode: adapters.calendar.mode
          });
        }
        const executionResult = {
          at: now.toISOString(),
          holds: created,
          calendarMode: adapters.calendar.mode
        };
        const nextPayload = { ...basePayload, executionResult };
        const updated = await this.prisma.client.approvalRequest.update({
          where: { id },
          data: {
            status: ApprovalStatus.executed,
            payload: nextPayload as object
          }
        });
        await this.audit.log({
          artistId,
          severity: AuditSeverity.info,
          aggregateType: "ApprovalRequest",
          aggregateId: id,
          action: "approval.execution.succeeded",
          actorLabel,
          actorOperatorId,
          metadata: {
            actionType: approvalRow.actionType,
            holdCount: created.length,
            calendarMode: adapters.calendar.mode
          }
        });
        this.notifyApproval(artistId, id, "executed");
        return updated;
      }

      if (approvalRow.actionType === "drive_ensure_folder") {
        const folderName = parseDriveFolder(approvalRow.payload);
        const r = await adapters.drive.ensureStoryboardFolder(folderName);
        const executionResult = {
          at: now.toISOString(),
          folderName,
          folderId: r.folderId,
          webViewLink: r.webViewLink,
          driveMode: adapters.drive.mode
        };
        const nextPayload = { ...basePayload, executionResult };
        const updated = await this.prisma.client.approvalRequest.update({
          where: { id },
          data: {
            status: ApprovalStatus.executed,
            payload: nextPayload as object
          }
        });
        await this.audit.log({
          artistId,
          severity: AuditSeverity.info,
          aggregateType: "ApprovalRequest",
          aggregateId: id,
          action: "approval.execution.succeeded",
          actorLabel,
          actorOperatorId,
          metadata: {
            actionType: approvalRow.actionType,
            driveMode: adapters.drive.mode
          }
        });
        this.notifyApproval(artistId, id, "executed");
        return updated;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextPayload = {
        ...basePayload,
        executionError: message,
        executionFailedAt: now.toISOString()
      };
      const updated = await this.prisma.client.approvalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.failed,
          payload: nextPayload as object
        }
      });
      await this.audit.log({
        artistId,
        severity: AuditSeverity.critical,
        aggregateType: "ApprovalRequest",
        aggregateId: id,
        action: "approval.execution.failed",
        actorLabel,
        actorOperatorId,
        metadata: { actionType: approvalRow.actionType, error: message }
      });
      this.notifyApproval(artistId, id, "failed");
      return updated;
    }

    throw new BadRequestException("Unhandled action type");
  }
}
