import { randomUUID } from "node:crypto";
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
  BookingCampaignDeliveryStatus,
  BookingCampaignRecipientStatus,
  ManagerRecommendationOutcome
} from "../generated/prisma/enums";
import type { ApprovalRequest, Prisma } from "../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { AdapterRegistryResolver } from "../integrations/adapter-registry.resolver";
import type { CalendarHoldRequest } from "../integrations/adapters/adapter.types";
import type { GmailDraft } from "../integrations/adapters/adapter.types";
import {
  EVENT_LOGISTICS_POLICY_VERSION,
  eventLogisticsApprovalIsSimulated,
  eventLogisticsFingerprint,
  eventLogisticsSimulatedLinkedValue,
  parseEventLogisticsApprovalSourceKey
} from "../operations/event-logistics";
import { PrismaService } from "../prisma/prisma.service";
import { StoryboardQueueService } from "../queue/storyboard-queue.service";

const EXECUTABLE_ACTIONS = new Set([
  "outbound_email_batch",
  "outbound_email_send_batch",
  "calendar_hold_batch",
  "drive_ensure_folder"
]);

type OutboundDraftPayload = {
  venueId?: string;
  message: GmailDraft;
};

export type ApprovalCreateSpec = {
  title: string;
  actionType: string;
  payload: Record<string, unknown>;
  opportunityId?: string | null;
  eventId?: string | null;
  sourceKey?: string | null;
  managerRecommendationId?: string | null;
  proposedBy?: string | null;
  status?: ApprovalStatus;
  actorOperatorId?: string | null;
};

type ApprovalTransactionClient = Pick<
  Prisma.TransactionClient,
  | "approvalRequest"
  | "auditEvent"
  | "bandEvent"
  | "bookingOpportunity"
  | "managerRecommendation"
>;

type EventLogisticsSource = NonNullable<
  ReturnType<typeof parseEventLogisticsApprovalSourceKey>
>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stableJson(value: unknown): string {
  const normalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(normalize);
    if (!isRecord(current)) return current;
    return Object.fromEntries(
      Object.entries(current)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)])
    );
  };
  return JSON.stringify(normalize(value));
}

function approvalIntentPayload(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const executionFields = new Set([
    "dryRunPreview",
    "executionResult",
    "executionError",
    "executionFailedAt",
    "rejectionReason"
  ]);
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !executionFields.has(key))
  );
}

function approvalIntentMatches(
  row: {
    title: string;
    actionType: string;
    payload: unknown;
    opportunityId: string | null;
    eventId: string | null;
  },
  spec: ApprovalCreateSpec
) {
  return (
    row.title === spec.title &&
    row.actionType === spec.actionType &&
    row.opportunityId === (spec.opportunityId ?? null) &&
    row.eventId === (spec.eventId ?? null) &&
    stableJson(approvalIntentPayload(row.payload)) ===
      stableJson(approvalIntentPayload(spec.payload))
  );
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
    if (h.kind !== undefined) {
      req.kind = h.kind;
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

  private async reconcileManagerRecommendation(
    tx: ApprovalTransactionClient,
    artistId: string,
    managerRecommendationId: string,
    actorLabel: string,
    actorOperatorId: string | null
  ) {
    const recommendation = await tx.managerRecommendation.findFirst({
      where: {
        id: managerRecommendationId,
        managerRun: { artistId }
      },
      select: { id: true, outcome: true, outcomeReason: true }
    });
    if (!recommendation) {
      throw new NotFoundException("Related record not found");
    }
    const approvals = await tx.approvalRequest.findMany({
      where: { artistId, managerRecommendationId },
      select: { id: true, eventId: true, sourceKey: true, actionType: true, status: true, payload: true }
    });
    if (approvals.length === 0) return;

    let outcome: ManagerRecommendationOutcome =
      ManagerRecommendationOutcome.accepted;
    let outcomeReason = "approval_prepared";
    if (approvals.some((row) => row.status === ApprovalStatus.failed)) {
      outcome = ManagerRecommendationOutcome.blocked;
      outcomeReason = "approval_failed";
    } else if (
      approvals.some(
        (row) =>
          row.status === ApprovalStatus.rejected ||
          row.status === ApprovalStatus.expired
      )
    ) {
      outcome = ManagerRecommendationOutcome.dismissed;
      outcomeReason = "approval_rejected";
    } else if (approvals.every((row) => row.status === ApprovalStatus.executed)) {
      if (approvals.some((row) => eventLogisticsApprovalIsSimulated(row))) {
        outcome = ManagerRecommendationOutcome.blocked;
        outcomeReason = "approval_simulated";
      } else {
        outcome = ManagerRecommendationOutcome.completed;
        outcomeReason = "action_executed";
      }
    }

    if (
      recommendation.outcome === outcome &&
      recommendation.outcomeReason === outcomeReason
    ) {
      return;
    }

    await tx.managerRecommendation.update({
      where: { id: managerRecommendationId },
      data: { outcome, outcomeReason, outcomeAt: new Date() }
    });
    await tx.auditEvent.create({
      data: {
        artistId,
        aggregateType: "ManagerRecommendation",
        aggregateId: managerRecommendationId,
        action: "manager.recommendation_approval_reconciled",
        actorLabel,
        actorOperatorId,
        severity:
          outcome === ManagerRecommendationOutcome.blocked ||
          outcome === ManagerRecommendationOutcome.dismissed
            ? AuditSeverity.warning
            : AuditSeverity.info,
        metadata: {
          previousOutcome: recommendation.outcome,
          outcome,
          outcomeReason,
          approvalIds: approvals.map((row) => row.id),
          approvalStatuses: approvals.map((row) => row.status)
        }
      }
    });
  }

  private async reconcileApprovalRecommendation(
    tx: ApprovalTransactionClient,
    artistId: string,
    approvalId: string,
    actorLabel: string,
    actorOperatorId: string | null
  ) {
    const approval = await tx.approvalRequest.findFirst({
      where: { id: approvalId, artistId },
      select: { managerRecommendationId: true }
    });
    if (approval?.managerRecommendationId) {
      await this.reconcileManagerRecommendation(
        tx,
        artistId,
        approval.managerRecommendationId,
        actorLabel,
        actorOperatorId
      );
    }
  }

  private async validateCreateRelations(
    tx: ApprovalTransactionClient,
    artistId: string,
    specs: ApprovalCreateSpec[]
  ) {
    const opportunityIds = [
      ...new Set(
        specs
          .map((spec) => spec.opportunityId)
          .filter((id): id is string => Boolean(id))
      )
    ];
    const eventIds = [
      ...new Set(
        specs
          .map((spec) => spec.eventId)
          .filter((id): id is string => Boolean(id))
      )
    ];
    const recommendationIds = [
      ...new Set(
        specs
          .map((spec) => spec.managerRecommendationId)
          .filter((id): id is string => Boolean(id))
      )
    ];
    const [opportunityCount, eventCount, recommendationCount] =
      await Promise.all([
        opportunityIds.length
          ? tx.bookingOpportunity.count({
              where: { artistId, id: { in: opportunityIds } }
            })
          : 0,
        eventIds.length
          ? tx.bandEvent.count({ where: { artistId, id: { in: eventIds } } })
          : 0,
        recommendationIds.length
          ? tx.managerRecommendation.count({
              where: {
                id: { in: recommendationIds },
                managerRun: { artistId }
              }
            })
          : 0
      ]);
    if (
      opportunityCount !== opportunityIds.length ||
      eventCount !== eventIds.length ||
      recommendationCount !== recommendationIds.length
    ) {
      throw new NotFoundException("Related record not found");
    }
  }

  private async createManyWithClient(
    tx: ApprovalTransactionClient,
    artistId: string,
    specs: ApprovalCreateSpec[]
  ) {
    await this.validateCreateRelations(tx, artistId, specs);
    const rows: ApprovalRequest[] = [];
    const createdIds: string[] = [];
    const recommendationIds = new Set<string>();

    for (const spec of specs) {
      const data = {
        artistId,
        title: spec.title,
        actionType: spec.actionType,
        payload: spec.payload as object,
        opportunityId: spec.opportunityId ?? null,
        eventId: spec.eventId ?? null,
        sourceKey: spec.sourceKey ?? null,
        managerRecommendationId: spec.managerRecommendationId ?? null,
        proposedBy: spec.proposedBy ?? null,
        status: spec.status ?? ApprovalStatus.pending
      };
      let row;
      let created = true;
      if (spec.sourceKey) {
        const candidateId = randomUUID();
        row = await tx.approvalRequest.upsert({
          where: {
            artistId_sourceKey: { artistId, sourceKey: spec.sourceKey }
          },
          create: { id: candidateId, ...data },
          update: {}
        });
        created = row.id === candidateId;
        if (!approvalIntentMatches(row, spec)) {
          throw new BadRequestException(
            "Approval source key is already used for different work"
          );
        }
        if (
          row.managerRecommendationId &&
          spec.managerRecommendationId &&
          row.managerRecommendationId !== spec.managerRecommendationId
        ) {
          throw new BadRequestException(
            "Approval is already linked to another recommendation"
          );
        }
        if (!row.managerRecommendationId && spec.managerRecommendationId) {
          const linked = await tx.approvalRequest.updateMany({
            where: {
              id: row.id,
              artistId,
              managerRecommendationId: null
            },
            data: { managerRecommendationId: spec.managerRecommendationId }
          });
          row = await tx.approvalRequest.findUniqueOrThrow({
            where: { id: row.id }
          });
          if (
            linked.count === 0 &&
            row.managerRecommendationId !== spec.managerRecommendationId
          ) {
            throw new BadRequestException(
              "Approval is already linked to another recommendation"
            );
          }
        }
      } else {
        row = await tx.approvalRequest.create({ data });
      }

      if (created) {
        createdIds.push(row.id);
        await tx.auditEvent.create({
          data: {
            artistId,
            severity: AuditSeverity.warning,
            aggregateType: "ApprovalRequest",
            aggregateId: row.id,
            action: "approval.created",
            actorLabel: spec.proposedBy ?? "system",
            actorOperatorId: spec.actorOperatorId ?? null,
            metadata: { title: row.title, actionType: row.actionType }
          }
        });
      }
      if (row.managerRecommendationId) {
        recommendationIds.add(row.managerRecommendationId);
      }
      rows.push(row);
    }

    for (const managerRecommendationId of recommendationIds) {
      const spec = specs.find(
        (candidate) =>
          candidate.managerRecommendationId === managerRecommendationId
      );
      await this.reconcileManagerRecommendation(
        tx,
        artistId,
        managerRecommendationId,
        spec?.proposedBy ?? "system",
        spec?.actorOperatorId ?? null
      );
    }
    return { rows, createdIds };
  }

  async createMany(
    artistId: string,
    specs: ApprovalCreateSpec[],
    options?: {
      tx?: Prisma.TransactionClient;
      collectCreatedIds?: string[];
    }
  ) {
    if (specs.length === 0) return [];
    const result = options?.tx
      ? await this.createManyWithClient(options.tx, artistId, specs)
      : await this.prisma.client.$transaction((tx) =>
          this.createManyWithClient(tx, artistId, specs)
        );
    options?.collectCreatedIds?.push(...result.createdIds);
    if (!options?.tx) {
      this.notifyCreatedApprovals(artistId, result.createdIds);
    }
    return result.rows;
  }

  /** Call only after a caller-owned transaction commits, with collected new IDs. */
  notifyCreatedApprovals(artistId: string, approvalIds: string[]) {
    for (const approvalId of new Set(approvalIds)) {
      this.notifyApproval(artistId, approvalId, "created");
    }
  }

  private eventLogisticsSourceFor(
    approval: {
      sourceKey: string | null;
      eventId: string | null;
      actionType: string;
    }
  ): EventLogisticsSource | null {
    if (!approval.sourceKey) return null;
    const parsed = parseEventLogisticsApprovalSourceKey(approval.sourceKey);
    if (!parsed) {
      if (approval.sourceKey.startsWith(`${EVENT_LOGISTICS_POLICY_VERSION}:`)) {
        throw new BadRequestException("Event logistics approval is invalid");
      }
      return null;
    }
    const expectedAction =
      parsed.channel === "calendar"
        ? "calendar_hold_batch"
        : "drive_ensure_folder";
    if (
      approval.eventId !== parsed.eventId ||
      approval.actionType !== expectedAction
    ) {
      throw new BadRequestException("Event logistics approval context changed");
    }
    return parsed;
  }

  private async assertCurrentEventLogistics(
    artistId: string,
    source: EventLogisticsSource
  ) {
    const event = await this.prisma.client.bandEvent.findFirst({
      where: { id: source.eventId, artistId }
    });
    if (
      !event ||
      event.type !== "gig" ||
      event.status !== "confirmed" ||
      eventLogisticsFingerprint(event) !== source.eventFingerprint
    ) {
      throw new BadRequestException(
        "Event logistics changed; prepare a new approval"
      );
    }
    const linkedValue = source.channel === "calendar" ? event.calendarEventId : event.driveFolderUrl;
    if (linkedValue && !await this.isReplaceableEventLogisticsSimulation(this.prisma.client, artistId, source, linkedValue)) {
      throw new BadRequestException("Event logistics are already linked");
    }
    return event;
  }

  private async isReplaceableEventLogisticsSimulation(
    client: Pick<ApprovalTransactionClient, "approvalRequest">,
    artistId: string,
    source: EventLogisticsSource,
    linkedValue: string
  ) {
    const approvals = await client.approvalRequest.findMany({
      where: { artistId, eventId: source.eventId, status: ApprovalStatus.executed },
      select: { id: true, eventId: true, sourceKey: true, actionType: true, status: true, payload: true }
    });
    return approvals.some((approval) => {
      const priorSource = parseEventLogisticsApprovalSourceKey(approval.sourceKey);
      return priorSource?.channel === source.channel && eventLogisticsSimulatedLinkedValue(approval) === linkedValue;
    });
  }

  private async finalizeSimpleExecution(
    artistId: string,
    approvalId: string,
    status: "executed" | "failed",
    payload: object,
    actorLabel: string,
    actorOperatorId: string | null
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const approval = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: { status, payload }
      });
      await this.reconcileApprovalRecommendation(
        tx,
        artistId,
        approvalId,
        actorLabel,
        actorOperatorId
      );
      return approval;
    });
  }

  private async finalizeEventLogisticsExecution(
    artistId: string,
    approvalId: string,
    source: EventLogisticsSource,
    linkedValue: string,
    payload: object,
    actorLabel: string,
    actorOperatorId: string | null
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const event = await tx.bandEvent.findFirst({
        where: { id: source.eventId, artistId }
      });
      if (
        !event ||
        event.type !== "gig" ||
        event.status !== "confirmed" ||
        eventLogisticsFingerprint(event) !== source.eventFingerprint
      ) {
        throw new BadRequestException(
          "Event logistics changed during execution; review the provider result"
        );
      }
      const priorLinkedValue = source.channel === "calendar" ? event.calendarEventId : event.driveFolderUrl;
      if (priorLinkedValue && !await this.isReplaceableEventLogisticsSimulation(tx, artistId, source, priorLinkedValue)) {
        throw new BadRequestException(
          "Event logistics were linked during execution; review the provider result"
        );
      }
      const changed = await tx.bandEvent.updateMany({
        where: {
          id: event.id,
          artistId,
          type: "gig",
          status: "confirmed",
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          timezone: event.timezone,
          ...(source.channel === "calendar"
            ? { calendarEventId: priorLinkedValue }
            : { driveFolderUrl: priorLinkedValue })
        },
        data:
          source.channel === "calendar"
            ? { calendarEventId: linkedValue }
            : { driveFolderUrl: linkedValue }
      });
      if (changed.count !== 1) {
        throw new BadRequestException(
          "Event logistics changed during execution; review the provider result"
        );
      }
      const approval = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: { status: ApprovalStatus.executed, payload }
      });
      await tx.auditEvent.create({
        data: {
          artistId,
          aggregateType: "BandEvent",
          aggregateId: event.id,
          action:
            source.channel === "calendar"
              ? "event.calendar_linked"
              : "event.drive_folder_linked",
          actorLabel,
          actorOperatorId,
          metadata: {
            approvalId,
            policyVersion: source.policyVersion,
            sourceKey: approval.sourceKey,
            providerReference: linkedValue
          }
        }
      });
      await this.reconcileApprovalRecommendation(
        tx,
        artistId,
        approvalId,
        actorLabel,
        actorOperatorId
      );
      return approval;
    });
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
    } | undefined,
    createdDrafts: { draftId: string; messageId?: string; threadId?: string }[] = []
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
        for (const [index, spec] of campaign.recipients.entries()) {
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
          const created = createdDrafts[index];
          if (created) await tx.bookingCampaignDelivery.update({
            where: { approvalId_recipientId: { approvalId, recipientId: recipient.id } },
            data: { status: BookingCampaignDeliveryStatus.drafted, providerDraftId: created.draftId, providerMessageId: created.messageId ?? null, providerThreadId: created.threadId ?? null }
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
      const approval = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: {
          status: ApprovalStatus.executed,
          payload: nextPayload
        }
      });
      await this.reconcileApprovalRecommendation(
        tx,
        artistId,
        approvalId,
        actorLabel,
        actorOperatorId
      );
      return approval;
    });
  }

  private async finalizeCampaignSends(
    artistId: string,
    approvalId: string,
    nextPayload: object,
    actorLabel: string,
    actorOperatorId: string | null,
    campaign: { campaignId: string; recipients: { recipientId: string; followUpDueAt: string }[] } | undefined,
    results: { recipientId: string; status: "sent" | "failed" | "unknown"; messageId?: string; threadId?: string; error?: string }[]
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      if (!campaign) throw new BadRequestException("Campaign send approval context not found");
      const ids = campaign.recipients.map((row) => row.recipientId);
      const recipients = await tx.bookingCampaignRecipient.findMany({
        where: { id: { in: ids }, campaignId: campaign.campaignId, status: BookingCampaignRecipientStatus.approval_requested },
        include: { prospect: true }
      });
      if (recipients.length !== ids.length) throw new BadRequestException("Campaign recipients are not ready for sending");
      const byId = new Map(recipients.map((recipient) => [recipient.id, recipient]));
      const dueById = new Map(campaign.recipients.map((row) => [row.recipientId, new Date(row.followUpDueAt)]));
      for (const result of results) {
        await tx.bookingCampaignDelivery.update({ where: { approvalId_recipientId: { approvalId, recipientId: result.recipientId } }, data: {
          status: result.status === "sent" ? BookingCampaignDeliveryStatus.sent : result.status === "unknown" ? BookingCampaignDeliveryStatus.unknown : BookingCampaignDeliveryStatus.failed,
          providerMessageId: result.messageId ?? null, providerThreadId: result.threadId ?? null, error: result.error ?? null, sentAt: result.status === "sent" ? new Date() : null
        }});
        if (result.status !== "sent") continue;
        const recipient = byId.get(result.recipientId)!;
        const dueAt = dueById.get(result.recipientId)!;
        const task = await tx.task.create({ data: { artistId, opportunityId: recipient.opportunityId, title: `Follow up with ${recipient.prospect.name}`, ownerLabel: "Booking campaign", dueAt } });
        await tx.bookingCampaignRecipient.update({ where: { id: recipient.id }, data: { status: BookingCampaignRecipientStatus.sent, followUpDueAt: dueAt, followUpTaskId: task.id } });
        await tx.auditEvent.create({ data: { artistId, aggregateType: "Task", aggregateId: task.id, action: "task.created", actorLabel, actorOperatorId, metadata: { title: task.title, campaignId: campaign.campaignId, campaignRecipientId: recipient.id } } });
      }
      const failed = results.some((result) => result.status !== "sent");
      await tx.auditEvent.create({ data: { artistId, aggregateType: "BookingCampaign", aggregateId: campaign.campaignId, action: failed ? "booking_campaign.send_partially_failed" : "booking_campaign.sent", actorLabel, actorOperatorId, metadata: { approvalId, sentCount: results.filter((result) => result.status === "sent").length, failedCount: results.filter((result) => result.status !== "sent").length } } });
      const approval = await tx.approvalRequest.update({ where: { id: approvalId }, data: { status: failed ? ApprovalStatus.failed : ApprovalStatus.executed, payload: nextPayload } });
      await this.reconcileApprovalRecommendation(tx, artistId, approvalId, actorLabel, actorOperatorId);
      return approval;
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
        executionAttemptedAt: null,
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
    data: ApprovalCreateSpec
  ) {
    return (await this.createMany(artistId, [data]))[0]!;
  }

  async approve(
    artistId: string,
    id: string,
    actorLabel: string,
    actorOperatorId?: string | null
  ) {
    const approvalRow = await this.get(artistId, id);
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.approvalRequest.updateMany({
        where: {
          id,
          artistId,
          status: { in: [ApprovalStatus.pending, ApprovalStatus.proposed] }
        },
        data: {
          status: ApprovalStatus.approved,
          approvedBy: actorLabel,
          approvedAt: new Date()
        }
      });
      if (changed.count !== 1) {
        throw new BadRequestException("Approval is not pending");
      }
      const row = await tx.approvalRequest.findUniqueOrThrow({ where: { id } });
      await tx.auditEvent.create({
        data: {
          artistId,
          severity: AuditSeverity.info,
          aggregateType: "ApprovalRequest",
          aggregateId: id,
          action: "approval.approved",
          actorLabel,
          actorOperatorId: actorOperatorId ?? null,
          metadata: { actionType: approvalRow.actionType }
        }
      });
      await this.reconcileApprovalRecommendation(
        tx,
        artistId,
        id,
        actorLabel,
        actorOperatorId ?? null
      );
      return row;
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
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.approvalRequest.updateMany({
        where: {
          id,
          artistId,
          status: { in: [ApprovalStatus.pending, ApprovalStatus.proposed] }
        },
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
      if (changed.count !== 1) {
        throw new BadRequestException("Approval is not pending");
      }
      const row = await tx.approvalRequest.findUniqueOrThrow({ where: { id } });
      await tx.auditEvent.create({
        data: {
          artistId,
          severity: AuditSeverity.warning,
          aggregateType: "ApprovalRequest",
          aggregateId: id,
          action: "approval.rejected",
          actorLabel,
          actorOperatorId: actorOperatorId ?? null,
          metadata: { reason: reason ?? null }
        }
      });
      await this.reconcileApprovalRecommendation(
        tx,
        artistId,
        id,
        actorLabel,
        actorOperatorId ?? null
      );
      return row;
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
    const dryRun = options?.dryRun === true;
    const actorOperatorId = options?.actorOperatorId ?? null;
    const now = new Date();
    const basePayload = isRecord(approvalRow.payload)
      ? { ...approvalRow.payload }
      : {};

    if (dryRun) {
      const adapters = await this.registryResolver.resolveForArtist(artistId);
      let preview: Record<string, unknown> = {};
      if (approvalRow.actionType === "outbound_email_batch" || approvalRow.actionType === "outbound_email_send_batch") {
        const outbound = parseOutboundPayload(approvalRow.payload);
        const drafts = outbound.drafts;
        preview = {
          ...(approvalRow.actionType === "outbound_email_send_batch" ? { wouldSendEmails: drafts.length } : { wouldCreateDrafts: drafts.length }),
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
      return this.prisma.client.$transaction(async (tx) => {
        const changed = await tx.approvalRequest.updateMany({
          where: {
            id,
            artistId,
            status: ApprovalStatus.approved,
            executionAttemptedAt: null
          },
          data: { payload: nextPayload as object }
        });
        if (changed.count !== 1) {
          throw new BadRequestException(
            "Approval execution has already been attempted"
          );
        }
        const updated = await tx.approvalRequest.findUniqueOrThrow({
          where: { id }
        });
        await tx.auditEvent.create({
          data: {
            artistId,
            severity: AuditSeverity.info,
            aggregateType: "ApprovalRequest",
            aggregateId: id,
            action: "approval.execution.dry_run",
            actorLabel,
            actorOperatorId,
            metadata: { actionType: approvalRow.actionType }
          }
        });
        return updated;
      });
    }

    const claimed = await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.approvalRequest.updateMany({
        where: {
          id,
          artistId,
          status: ApprovalStatus.approved,
          executionAttemptedAt: null
        },
        data: { executionAttemptedAt: now }
      });
      if (changed.count === 1) {
        await tx.auditEvent.create({
          data: {
            artistId,
            severity: AuditSeverity.warning,
            aggregateType: "ApprovalRequest",
            aggregateId: id,
            action: "approval.execution.started",
            actorLabel,
            actorOperatorId,
            metadata: { actionType: approvalRow.actionType, dryRun: false }
          }
        });
      }
      return changed.count === 1;
    });
    if (!claimed) {
      const current = await this.get(artistId, id);
      if (current.status === ApprovalStatus.executed) {
        throw new BadRequestException("Approval already executed");
      }
      if (current.status === ApprovalStatus.failed) {
        throw new BadRequestException(
          "Approval previously failed; create a new approval"
        );
      }
      if (current.executionAttemptedAt) {
        throw new BadRequestException(
          "Approval execution has already been attempted"
        );
      }
      throw new BadRequestException("Only approved requests can be executed");
    }

    let providerExecutionResult: Record<string, unknown> | null = null;
    try {
      const logisticsSource = this.eventLogisticsSourceFor(approvalRow);
      const adapters = await this.registryResolver.resolveForArtist(artistId);
      if (approvalRow.actionType === "outbound_email_send_batch") {
        const outbound = parseOutboundPayload(approvalRow.payload);
        if (outbound.drafts.length > 25) throw new BadRequestException("A send batch may contain at most 25 recipients");
        if (!outbound.campaign) throw new BadRequestException("Campaign send approval context not found");
        const deliveryRows = await this.prisma.client.bookingCampaignDelivery.findMany({ where: { approvalId: id }, select: { recipientId: true, status: true } });
        if (deliveryRows.length !== outbound.campaign.recipients.length) throw new BadRequestException("Campaign delivery context not found");
        const results: { recipientId: string; status: "sent" | "failed" | "unknown"; messageId?: string; threadId?: string; error?: string }[] = [];
        providerExecutionResult = {
          at: now.toISOString(),
          sent: results,
          gmailMode: adapters.gmail.mode
        };
        for (let index = 0; index < outbound.drafts.length; index += 1) {
          const recipientId = outbound.campaign.recipients[index]!.recipientId;
          const delivery = deliveryRows.find((row) => row.recipientId === recipientId);
          if (!delivery || delivery.status !== BookingCampaignDeliveryStatus.pending) throw new BadRequestException("Campaign delivery was already attempted; create a new approval to resend");
          await this.prisma.client.bookingCampaignDelivery.update({ where: { approvalId_recipientId: { approvalId: id, recipientId } }, data: { status: BookingCampaignDeliveryStatus.sending, attemptedAt: new Date() } });
          try {
            const sent = await adapters.gmail.sendMessage(outbound.drafts[index]!.message);
            results.push({ recipientId, status: "sent", messageId: sent.messageId, ...(sent.threadId ? { threadId: sent.threadId } : {}) });
          } catch (error) {
            results.push({ recipientId, status: "unknown", error: error instanceof Error ? error.message : String(error) });
          }
        }
        const executionResult = { at: now.toISOString(), sent: results, gmailMode: adapters.gmail.mode };
        providerExecutionResult = executionResult;
        const updated = await this.finalizeCampaignSends(artistId, id, { ...basePayload, executionResult } as object, actorLabel, actorOperatorId, outbound.campaign, results);
        await this.audit.log({ artistId, severity: results.some((result) => result.status !== "sent") ? AuditSeverity.warning : AuditSeverity.info, aggregateType: "ApprovalRequest", aggregateId: id, action: results.some((result) => result.status !== "sent") ? "approval.execution.failed" : "approval.execution.succeeded", actorLabel, actorOperatorId, metadata: { actionType: approvalRow.actionType, sentCount: results.filter((result) => result.status === "sent").length, failedCount: results.filter((result) => result.status !== "sent").length, gmailMode: adapters.gmail.mode } });
        this.notifyApproval(artistId, id, updated.status === ApprovalStatus.executed ? "executed" : "failed");
        return updated;
      }
      if (approvalRow.actionType === "outbound_email_batch") {
        const outbound = parseOutboundPayload(approvalRow.payload);
        const draftsSpec = outbound.drafts;
        type CreatedDraft = {
          venueId?: string;
          draftId: string;
          preview: string;
          providerMode: string;
          messageId?: string;
          threadId?: string;
        };
        const created: CreatedDraft[] = [];
        providerExecutionResult = {
          at: now.toISOString(),
          drafts: created,
          gmailMode: adapters.gmail.mode
        };
        for (const d of draftsSpec) {
          const r = await adapters.gmail.draftMessage(d.message);
          const entry: CreatedDraft = {
            draftId: r.draftId,
            preview: r.preview,
            providerMode: adapters.gmail.mode
          };
          if (r.messageId) entry.messageId = r.messageId;
          if (r.threadId) entry.threadId = r.threadId;
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
        providerExecutionResult = executionResult;
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
          outbound.campaign,
          created
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
        if (logisticsSource) {
          if (logisticsSource.channel !== "calendar" || holds.length !== 1) {
            throw new BadRequestException(
              "Event calendar approval context is invalid"
            );
          }
          await this.assertCurrentEventLogistics(artistId, logisticsSource);
        }
        const created: {
          title: string;
          start: string;
          end: string;
          eventId: string;
          htmlLink: string | null;
          providerMode: string;
        }[] = [];
        providerExecutionResult = {
          at: now.toISOString(),
          holds: created,
          calendarMode: adapters.calendar.mode
        };
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
        providerExecutionResult = executionResult;
        const nextPayload = { ...basePayload, executionResult };
        const updated = logisticsSource
          ? await this.finalizeEventLogisticsExecution(
              artistId,
              id,
              logisticsSource,
              created[0]!.eventId,
              nextPayload as object,
              actorLabel,
              actorOperatorId
            )
          : await this.finalizeSimpleExecution(
              artistId,
              id,
              ApprovalStatus.executed,
              nextPayload as object,
              actorLabel,
              actorOperatorId
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
            holdCount: created.length,
            calendarMode: adapters.calendar.mode
          }
        });
        this.notifyApproval(artistId, id, "executed");
        return updated;
      }

      if (approvalRow.actionType === "drive_ensure_folder") {
        const folderName = parseDriveFolder(approvalRow.payload);
        if (logisticsSource) {
          if (logisticsSource.channel !== "drive") {
            throw new BadRequestException(
              "Event Drive approval context is invalid"
            );
          }
          await this.assertCurrentEventLogistics(artistId, logisticsSource);
        }
        const r = await adapters.drive.ensureStoryboardFolder(folderName);
        const executionResult = {
          at: now.toISOString(),
          folderName,
          folderId: r.folderId,
          webViewLink: r.webViewLink,
          driveMode: adapters.drive.mode
        };
        providerExecutionResult = executionResult;
        const nextPayload = { ...basePayload, executionResult };
        const updated = logisticsSource
          ? await this.finalizeEventLogisticsExecution(
              artistId,
              id,
              logisticsSource,
              r.webViewLink ??
                `https://drive.google.com/drive/folders/${encodeURIComponent(r.folderId)}`,
              nextPayload as object,
              actorLabel,
              actorOperatorId
            )
          : await this.finalizeSimpleExecution(
              artistId,
              id,
              ApprovalStatus.executed,
              nextPayload as object,
              actorLabel,
              actorOperatorId
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
            driveMode: adapters.drive.mode
          }
        });
        this.notifyApproval(artistId, id, "executed");
        return updated;
      }

      throw new BadRequestException("Unhandled action type");
    } catch (err) {
      // Provider work and its authoritative local link may already have committed.
      // A later audit failure must not reverse that terminal success into a retryable
      // failure, which could create a duplicate external resource.
      const finalized = await this.get(artistId, id).catch(() => null);
      if (finalized?.status === ApprovalStatus.executed) {
        this.notifyApproval(artistId, id, "executed");
        return finalized;
      }
      const message = err instanceof Error ? err.message : String(err);
      const nextPayload = {
        ...basePayload,
        ...(providerExecutionResult
          ? { executionResult: providerExecutionResult }
          : {}),
        executionError: message,
        executionFailedAt: now.toISOString()
      };
      const updated = await this.finalizeSimpleExecution(
        artistId,
        id,
        ApprovalStatus.failed,
        nextPayload as object,
        actorLabel,
        actorOperatorId
      );
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
  }
}
