import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  calendarHoldBatchPayloadSchema,
  bookingReplyConfirmPayloadSchema,
  driveEnsureFolderPayloadSchema,
  outboundEmailBatchPayloadSchema
} from "@storyboard/shared";
import {
  ApprovalReconciliationOutcome,
  ApprovalStatus,
  AuditSeverity,
  BookingCampaignDeliveryStatus,
  BookingCampaignRecipientStatus,
  BookingStage,
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
import {
  APPROVAL_EXECUTION_LEASE_MS,
  APPROVAL_LIFECYCLE_POLICY_VERSION,
  APPROVAL_LIFECYCLE_RELEVANT_STATUSES,
  APPROVAL_EXECUTABLE_ACTION_TYPES,
  approvalActionIsExecutable,
  approvalExecutionLeaseIsActive,
  partitionApprovalLifecycle,
  projectApprovalLifecycleItem
} from "./approval-lifecycle";
import {
  APPROVAL_RECONCILIATION_POLICY_VERSION,
  approvalReconciliationEvidence,
  approvalReconciliationHasKnownExternalEffect,
  approvalReconciliationIntentMatches,
  approvalReconciliationIsConclusive,
  type ApprovalReconciliationInput
} from "./approval-reconciliation";

type OutboundDraftPayload = {
  venueId?: string;
  message: GmailDraft;
};

type ApprovalListPagination = {
  limit?: number;
  offset?: number;
};

const APPROVAL_LIST_DEFAULT_LIMIT = 100;
const APPROVAL_LIST_MAX_LIMIT = 200;
const APPROVAL_RECONCILIATION_FINAL_OUTCOMES = [
  ApprovalReconciliationOutcome.external_effect_observed,
  ApprovalReconciliationOutcome.no_external_effect_observed
] as const;

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
  | "approvalReconciliation"
  | "auditEvent"
  | "bandEvent"
  | "bookingReply"
  | "bookingOpportunity"
  | "managerRecommendation"
>;

type EventLogisticsSource = NonNullable<
  ReturnType<typeof parseEventLogisticsApprovalSourceKey>
>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function prismaErrorCode(error: unknown) {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : null;
}

function projectReconciliationReceipt(row: {
  id: string;
  outcome: ApprovalReconciliationOutcome;
  note: string;
  evidence: unknown;
  policyVersion: string;
  observedAt: Date;
  actorLabel: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    outcome: row.outcome,
    note: row.note,
    evidence: row.evidence,
    policyVersion: row.policyVersion,
    observedAt: row.observedAt,
    actorLabel: row.actorLabel,
    createdAt: row.createdAt
  };
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

function parseBookingReplyConfirmation(payload: unknown) {
  const p = bookingReplyConfirmPayloadSchema.safeParse(payload);
  if (!p.success) {
    throw new BadRequestException(p.error.flatten());
  }
  return p.data;
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
      select: {
        id: true,
        eventId: true,
        sourceKey: true,
        actionType: true,
        status: true,
        executionAttemptedAt: true,
        payload: true,
        reconciliations: {
          where: {
            outcome: {
              in: [
                ApprovalReconciliationOutcome.external_effect_observed,
                ApprovalReconciliationOutcome.no_external_effect_observed
              ]
            }
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { outcome: true, createdAt: true }
        }
      }
    });
    if (approvals.length === 0) return;

    let outcome: ManagerRecommendationOutcome =
      ManagerRecommendationOutcome.accepted;
    let outcomeReason = "approval_prepared";
    const unresolvedApproval = approvals.find((row) => {
      const needsReconciliation =
        row.status === ApprovalStatus.failed ||
        (row.status === ApprovalStatus.approved &&
          Boolean(row.executionAttemptedAt));
      return (
        needsReconciliation &&
        !approvalReconciliationIsConclusive(row.reconciliations[0]?.outcome)
      );
    });
    const noExternalEffect = approvals.find(
      (row) =>
        row.reconciliations[0]?.outcome ===
        ApprovalReconciliationOutcome.no_external_effect_observed
    );
    const externalEffect = approvals.find(
      (row) =>
        row.reconciliations[0]?.outcome ===
        ApprovalReconciliationOutcome.external_effect_observed
    );
    if (externalEffect) {
      outcome = ManagerRecommendationOutcome.blocked;
      outcomeReason = "approval_reconciled_external_effect_needs_repair";
    } else if (unresolvedApproval) {
      outcome = ManagerRecommendationOutcome.blocked;
      outcomeReason =
        unresolvedApproval.status === ApprovalStatus.failed
          ? "approval_failed"
          : "approval_execution_unknown";
    } else if (noExternalEffect) {
      outcome = ManagerRecommendationOutcome.blocked;
      outcomeReason = "approval_reconciled_no_external_effect";
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
          approvalStatuses: approvals.map((row) => row.status),
          reconciliationOutcomes: approvals.map(
            (row) => row.reconciliations[0]?.outcome ?? null
          )
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

  private async finalizeBookingReplyConfirmation(
    artistId: string,
    approvalId: string,
    replyId: string,
    opportunityId: string,
    basePayload: Record<string, unknown>,
    actorLabel: string,
    actorOperatorId: string | null
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const reply = await tx.bookingReply.findFirst({
        where: { id: replyId, artistId },
        select: { id: true, termsAppliedAt: true, opportunityId: true }
      });
      if (!reply) {
        throw new NotFoundException("Reply not found");
      }
      if (reply.opportunityId !== opportunityId) {
        throw new BadRequestException("Reply is no longer linked to that opportunity");
      }
      if (!reply.termsAppliedAt) {
        throw new BadRequestException("Apply terms before confirming the booking");
      }

      const opportunity = await tx.bookingOpportunity.findFirst({
        where: { id: opportunityId, artistId },
        include: { venue: true }
      });
      if (!opportunity) {
        throw new NotFoundException("Booking opportunity not found");
      }

      const previouslyConfirmed = opportunity.stage === BookingStage.confirmed;
      const updatedOpportunity = previouslyConfirmed
        ? opportunity
        : await tx.bookingOpportunity.update({
            where: { id: opportunity.id },
            data: { stage: BookingStage.confirmed },
            include: { venue: true }
          });

      const event = await tx.bandEvent.upsert({
        where: { opportunityId: updatedOpportunity.id },
        create: {
          artistId,
          opportunityId: updatedOpportunity.id,
          venueId: updatedOpportunity.venueId,
          type: "gig",
          status: "confirmed",
          title: updatedOpportunity.title,
          startsAt: updatedOpportunity.targetDate,
          locationName: updatedOpportunity.venue?.name ?? null
        },
        update: {
          status: "confirmed",
          venueId: updatedOpportunity.venueId,
          title: updatedOpportunity.title,
          startsAt: updatedOpportunity.targetDate,
          locationName: updatedOpportunity.venue?.name ?? null
        }
      });

      const executionResult = {
        at: new Date().toISOString(),
        opportunityId: updatedOpportunity.id,
        eventId: event.id,
        replyId,
        wasAlreadyConfirmed: previouslyConfirmed
      };

      if (!previouslyConfirmed) {
        await tx.auditEvent.create({
          data: {
            artistId,
            severity: AuditSeverity.info,
            aggregateType: "BookingOpportunity",
            aggregateId: updatedOpportunity.id,
            action: "booking.stage_changed",
            actorLabel,
            actorOperatorId,
            metadata: { from: opportunity.stage, to: BookingStage.confirmed }
          }
        });
      }

      const approval = await tx.approvalRequest.update({
        where: { id: approvalId },
        data: {
          status: ApprovalStatus.executed,
          payload: {
            ...basePayload,
            executionResult
          } as object
        }
      });

      await tx.auditEvent.create({
        data: {
          artistId,
          severity: AuditSeverity.info,
          aggregateType: "BookingReply",
          aggregateId: reply.id,
          action: "booking_reply.confirmed",
          actorLabel,
          actorOperatorId,
          metadata: executionResult
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

  private approvalPagination(input: ApprovalListPagination = {}) {
    const limit = Number.isInteger(input.limit as number)
      ? (input.limit as number)
      : APPROVAL_LIST_DEFAULT_LIMIT;
    const offset = Number.isInteger(input.offset as number)
      ? (input.offset as number)
      : 0;
    return {
      take: Math.min(APPROVAL_LIST_MAX_LIMIT, Math.max(1, limit)),
      skip: Math.max(0, offset)
    };
  }

  private async workQueueCounts(artistId: string, observedAt: Date) {
    const leaseWindowStart = new Date(
      observedAt.getTime() - APPROVAL_EXECUTION_LEASE_MS
    );
    const finalOutcomes = APPROVAL_RECONCILIATION_FINAL_OUTCOMES;
    const terminalReconciliation = {
      reconciliations: {
        some: {
          outcome: { in: [...finalOutcomes] },
          artistId
        }
      }
    };
    const nonTerminalReconciliation = {
      reconciliations: {
        none: {
          outcome: { in: [...finalOutcomes] },
          artistId
        }
      }
    };

    const [
      pendingDecisionCount,
      readyToExecuteCount,
      executionInProgressCount,
      needsReconciliationCount,
      reconciledCount,
      approvedNotExecutableCount
    ] = await Promise.all([
      this.prisma.client.approvalRequest.count({
        where: {
          artistId,
          status: { in: [ApprovalStatus.proposed, ApprovalStatus.pending] }
        }
      }),
      this.prisma.client.approvalRequest.count({
        where: {
          artistId,
          status: ApprovalStatus.approved,
          actionType: { in: [...APPROVAL_EXECUTABLE_ACTION_TYPES] },
          executionAttemptedAt: null
        }
      }),
      this.prisma.client.approvalRequest.count({
        where: {
          artistId,
          status: ApprovalStatus.approved,
          executionAttemptedAt: { gte: leaseWindowStart }
        }
      }),
      this.prisma.client.approvalRequest.count({
        where: {
          artistId,
          OR: [
            {
              status: ApprovalStatus.failed,
              ...nonTerminalReconciliation
            },
            {
              status: ApprovalStatus.approved,
              executionAttemptedAt: { lte: leaseWindowStart },
              ...nonTerminalReconciliation
            }
          ]
        }
      }),
      this.prisma.client.approvalRequest.count({
        where: {
          artistId,
          status: { in: [ApprovalStatus.approved, ApprovalStatus.failed] },
          ...terminalReconciliation
        }
      }),
      this.prisma.client.approvalRequest.count({
        where: {
          artistId,
          status: ApprovalStatus.approved,
          executionAttemptedAt: null,
          actionType: { notIn: [...APPROVAL_EXECUTABLE_ACTION_TYPES] }
        }
      })
    ]);

    return {
      pendingDecision: pendingDecisionCount,
      readyToExecute: readyToExecuteCount,
      executionInProgress: executionInProgressCount,
      needsReconciliation: needsReconciliationCount,
      reconciled: reconciledCount,
      approvedNotExecutable: approvedNotExecutableCount,
      attentionTotal:
        pendingDecisionCount +
        readyToExecuteCount +
        needsReconciliationCount
    };
  }

  list(artistId: string, status?: ApprovalStatus, pagination: ApprovalListPagination = {}) {
    const queryWindow = this.approvalPagination(pagination);
    return this.prisma.client.approvalRequest.findMany({
      where: {
        artistId,
        ...(status ? { status } : {})
      },
      orderBy: { createdAt: "desc" },
      ...queryWindow
    });
  }

  async workQueue(
    artistId: string,
    canMutate: boolean,
    pagination: ApprovalListPagination = {}
  ) {
    const observedAt = new Date();
    const capabilities = {
      canDecide: canMutate,
      canExecute: canMutate,
      canReconcile: canMutate
    };
    const queryWindow = this.approvalPagination(pagination);
    const completeCounts = await this.workQueueCounts(artistId, observedAt);
    const rows = await this.prisma.client.approvalRequest.findMany({
      where: {
        artistId,
        status: { in: [...APPROVAL_LIFECYCLE_RELEVANT_STATUSES] }
      },
      include: {
        bookingCampaign: {
          select: { id: true, artistId: true }
        },
        campaignDeliveries: {
          where: { artistId },
          select: { status: true }
        },
        reconciliations: {
          where: { artistId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            outcome: true,
            resolutionKey: true,
            note: true,
            evidence: true,
            idempotencyKey: true,
            policyVersion: true,
            observedAt: true,
            actorLabel: true,
            actorOperatorId: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: "asc" },
      skip: queryWindow.skip,
      take: queryWindow.take
    });
    const items = rows.flatMap((row) => {
      const item = projectApprovalLifecycleItem(row, capabilities, observedAt);
      return item ? [item] : [];
    });
    const {
      pendingDecision,
      readyToExecute,
      executionInProgress,
      needsReconciliation,
      reconciled,
      approvedNotExecutable
    } = partitionApprovalLifecycle(items, observedAt);
    return {
      policyVersion: APPROVAL_LIFECYCLE_POLICY_VERSION,
      observedAt: observedAt.toISOString(),
      capabilities,
      counts: completeCounts,
      pendingDecision,
      readyToExecute,
      executionInProgress,
      needsReconciliation,
      reconciled,
      approvedNotExecutable
    };
  }

  pending(artistId: string, pagination: ApprovalListPagination = {}) {
    const queryWindow = this.approvalPagination(pagination);
    return this.prisma.client.approvalRequest.findMany({
      where: {
        artistId,
        status: { in: [ApprovalStatus.proposed, ApprovalStatus.pending] }
      },
      orderBy: { createdAt: "asc" },
      ...queryWindow
    });
  }

  /** Approved items that can still be executed */
  async readyToExecute(
    artistId: string,
    pagination: ApprovalListPagination = {}
  ) {
    const queryWindow = this.approvalPagination(pagination);
    const rows = await this.prisma.client.approvalRequest.findMany({
      where: {
        artistId,
        status: ApprovalStatus.approved,
        actionType: { in: [...APPROVAL_EXECUTABLE_ACTION_TYPES] },
        executionAttemptedAt: null
      },
      orderBy: { approvedAt: "asc" },
      ...queryWindow
    });
    return rows;
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

  async reconciliations(
    artistId: string,
    approvalId: string,
    canMutate: boolean
  ) {
    const approval = await this.prisma.client.approvalRequest.findFirst({
      where: { id: approvalId, artistId },
      select: { id: true, status: true, executionAttemptedAt: true }
    });
    if (!approval) throw new NotFoundException("Approval not found");
    const [rows, terminal] = await Promise.all([
      this.prisma.client.approvalReconciliation.findMany({
        where: { artistId, approvalId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50
      }),
      this.prisma.client.approvalReconciliation.findFirst({
        where: {
          artistId,
          approvalId,
          outcome: {
            in: [
              ApprovalReconciliationOutcome.external_effect_observed,
              ApprovalReconciliationOutcome.no_external_effect_observed
            ]
          }
        },
        orderBy: { createdAt: "desc" }
      })
    ]);
    const executionLeaseActive = approvalExecutionLeaseIsActive(approval);
    const needsReconciliation =
      approval.status === ApprovalStatus.failed ||
      (approval.status === ApprovalStatus.approved &&
        Boolean(approval.executionAttemptedAt));
    return {
      policyVersion: APPROVAL_RECONCILIATION_POLICY_VERSION,
      approvalId,
      resolved: Boolean(terminal),
      resolutionOutcome: terminal?.outcome ?? null,
      capabilities: {
        canReconcile:
          canMutate &&
          needsReconciliation &&
          !executionLeaseActive &&
          !terminal,
        canRetry: false as const
      },
      receipts: rows.map(projectReconciliationReceipt)
    };
  }

  private async recordReconciliationOnce(
    artistId: string,
    approvalId: string,
    input: ApprovalReconciliationInput,
    actorLabel: string,
    actorOperatorId: string
  ) {
    return this.prisma.client.$transaction(
      async (tx) => {
        const approval = await tx.approvalRequest.findFirst({
          where: { id: approvalId, artistId },
          select: {
            id: true,
            status: true,
            actionType: true,
            payload: true,
            executionAttemptedAt: true,
            managerRecommendationId: true,
            campaignDeliveries: {
              where: { artistId },
              select: {
                status: true,
                providerDraftId: true,
                providerMessageId: true,
                providerThreadId: true
              }
            },
            reconciliations: {
              where: {
                outcome: {
                  in: [
                    ApprovalReconciliationOutcome.external_effect_observed,
                    ApprovalReconciliationOutcome.no_external_effect_observed
                  ]
                }
              },
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        });
        if (!approval) throw new NotFoundException("Approval not found");

        const existing = await tx.approvalReconciliation.findUnique({
          where: {
            artistId_idempotencyKey: {
              artistId,
              idempotencyKey: input.idempotencyKey
            }
          }
        });
        if (existing) {
          if (
            existing.approvalId !== approvalId ||
            !approvalReconciliationIntentMatches(existing, input)
          ) {
            throw new ConflictException(
              "Reconciliation idempotency key is already used for different evidence"
            );
          }
          return { created: false, receipt: existing };
        }

        const needsReconciliation =
          approval.status === ApprovalStatus.failed ||
          (approval.status === ApprovalStatus.approved &&
            Boolean(approval.executionAttemptedAt));
        if (!needsReconciliation) {
          throw new BadRequestException(
            "Approval does not have an uncertain or failed execution to reconcile"
          );
        }
        if (approvalExecutionLeaseIsActive(approval)) {
          throw new ConflictException(
            "Approval execution is still in progress; wait for it to finish before reconciling"
          );
        }
        if (
          approvalReconciliationIsConclusive(
            approval.reconciliations[0]?.outcome
          )
        ) {
          throw new ConflictException("Approval reconciliation is already final");
        }

        const observedAt = new Date(input.observedAt);
        if (observedAt.getTime() > Date.now() + 5 * 60 * 1000) {
          throw new BadRequestException(
            "Reconciliation observation time cannot be in the future"
          );
        }
        if (
          approval.executionAttemptedAt &&
          observedAt.getTime() < approval.executionAttemptedAt.getTime()
        ) {
          throw new BadRequestException(
            "Reconciliation evidence must be observed after the execution attempt"
          );
        }
        if (
          approval.status === ApprovalStatus.approved &&
          approval.executionAttemptedAt &&
          observedAt.getTime() <
            approval.executionAttemptedAt.getTime() +
              APPROVAL_EXECUTION_LEASE_MS
        ) {
          throw new BadRequestException(
            "Reconciliation evidence must be collected after the execution lease ends"
          );
        }
        if (
          input.outcome === "no_external_effect_observed" &&
          approvalReconciliationHasKnownExternalEffect(approval)
        ) {
          throw new ConflictException(
            "StoryBoard already has a recorded external effect; review and repair the saved provider result"
          );
        }
        const conclusive = approvalReconciliationIsConclusive(input.outcome);
        const receipt = await tx.approvalReconciliation.create({
          data: {
            artistId,
            approvalId,
            outcome: ApprovalReconciliationOutcome[input.outcome],
            resolutionKey: conclusive ? "terminal" : null,
            note: input.note,
            evidence: approvalReconciliationEvidence(input),
            idempotencyKey: input.idempotencyKey,
            policyVersion: APPROVAL_RECONCILIATION_POLICY_VERSION,
            observedAt,
            actorLabel,
            actorOperatorId
          }
        });
        await tx.auditEvent.create({
          data: {
            artistId,
            severity: conclusive ? AuditSeverity.warning : AuditSeverity.info,
            aggregateType: "ApprovalReconciliation",
            aggregateId: receipt.id,
            action: "approval.reconciliation_recorded",
            actorLabel,
            actorOperatorId,
            metadata: {
              approvalId,
              outcome: receipt.outcome,
              observedAt: receipt.observedAt.toISOString(),
              evidenceCount:
                input.providerReference == null ? 1 : 2,
              policyVersion: APPROVAL_RECONCILIATION_POLICY_VERSION
            }
          }
        });
        if (approval.managerRecommendationId) {
          await this.reconcileManagerRecommendation(
            tx,
            artistId,
            approval.managerRecommendationId,
            actorLabel,
            actorOperatorId
          );
        }
        return { created: true, receipt };
      },
      { isolationLevel: "Serializable" }
    );
  }

  async recordReconciliation(
    artistId: string,
    approvalId: string,
    input: ApprovalReconciliationInput,
    actorLabel: string,
    actorOperatorId: string
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await this.recordReconciliationOnce(
          artistId,
          approvalId,
          input,
          actorLabel,
          actorOperatorId
        );
        return {
          policyVersion: APPROVAL_RECONCILIATION_POLICY_VERSION,
          approvalId,
          created: result.created,
          receipt: projectReconciliationReceipt(result.receipt)
        };
      } catch (error) {
        if (prismaErrorCode(error) === "P2034") {
          if (attempt < 2) continue;
          throw new ConflictException(
            "Approval reconciliation changed; try again"
          );
        }
        if (prismaErrorCode(error) === "P2002") {
          const replay =
            await this.prisma.client.approvalReconciliation.findUnique({
              where: {
                artistId_idempotencyKey: {
                  artistId,
                  idempotencyKey: input.idempotencyKey
                }
              }
            });
          if (
            replay?.approvalId === approvalId &&
            approvalReconciliationIntentMatches(replay, input)
          ) {
            return {
              policyVersion: APPROVAL_RECONCILIATION_POLICY_VERSION,
              approvalId,
              created: false,
              receipt: projectReconciliationReceipt(replay)
            };
          }
          throw new ConflictException(
            "Approval reconciliation is already final"
          );
        }
        throw error;
      }
    }
    throw new ConflictException("Approval reconciliation changed; try again");
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
    if (!approvalActionIsExecutable(approvalRow.actionType)) {
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
    const bookingReplyConfirmationPayload =
      approvalRow.actionType === "booking_reply_confirm"
        ? parseBookingReplyConfirmation(approvalRow.payload)
        : null;

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
      } else if (approvalRow.actionType === "booking_reply_confirm") {
        preview = {
          opportunityId: bookingReplyConfirmationPayload!.opportunityId,
          replyId: bookingReplyConfirmationPayload!.replyId
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
      if (approvalRow.actionType === "booking_reply_confirm") {
        const payload = parseBookingReplyConfirmation(approvalRow.payload);
        const updated = await this.finalizeBookingReplyConfirmation(
          artistId,
          id,
          payload.replyId,
          payload.opportunityId,
          basePayload,
          actorLabel,
          actorOperatorId
        );
        await this.audit.log({
          artistId,
          aggregateType: "ApprovalRequest",
          aggregateId: id,
          severity: AuditSeverity.info,
          action: "approval.execution.succeeded",
          actorLabel,
          actorOperatorId,
          metadata: {
            actionType: approvalRow.actionType,
            opportunityId: payload.opportunityId,
            replyId: payload.replyId
          }
        });
        this.notifyApproval(artistId, id, "executed");
        return updated;
      }
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
        if (draftsSpec.length > 25) {
          throw new BadRequestException(
            "A Gmail draft batch may contain at most 25 recipients"
          );
        }
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
