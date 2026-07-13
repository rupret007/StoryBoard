import {
  approvalReconciliationIsConclusive,
  latestApprovalReconciliation,
  terminalApprovalReconciliation,
  type ApprovalReconciliationSource
} from "./approval-reconciliation";

export const APPROVAL_LIFECYCLE_POLICY_VERSION =
  "approval_lifecycle_v2" as const;

// Provider calls are bounded well below this window. A fresh one-shot claim is
// execution in progress, not evidence that the provider outcome is unknown.
export const APPROVAL_EXECUTION_LEASE_MS = 60 * 60 * 1000;

export const APPROVAL_EXECUTABLE_ACTION_TYPES = [
  "outbound_email_batch",
  "outbound_email_send_batch",
  "calendar_hold_batch",
  "drive_ensure_folder",
  "booking_reply_confirm"
] as const;

export const APPROVAL_LIFECYCLE_RELEVANT_STATUSES = [
  "proposed",
  "pending",
  "approved",
  "failed"
] as const;

const EXECUTABLE_ACTIONS = new Set<string>(APPROVAL_EXECUTABLE_ACTION_TYPES);

export type ApprovalLifecycleStage =
  | "pending_decision"
  | "approved_ready"
  | "execution_in_progress"
  | "execution_unknown"
  | "failed_needs_reconciliation"
  | "reconciled_external_effect"
  | "reconciled_no_external_effect"
  | "approved_not_executable";

export type ApprovalLifecycleCapabilities = {
  canDecide: boolean;
  canExecute: boolean;
  canReconcile: boolean;
};

export type ApprovalDeliverySummary = {
  total: number;
  pending: number;
  drafted: number;
  sending: number;
  sent: number;
  failed: number;
  unknown: number;
};

export type ApprovalLifecycleSource = {
  id: string;
  artistId: string;
  title: string;
  status: string;
  actionType: string;
  payload: unknown;
  sourceKey: string | null;
  opportunityId: string | null;
  eventId: string | null;
  managerRecommendationId: string | null;
  proposedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  executionAttemptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  bookingCampaign?: { id: string; artistId: string } | null;
  campaignDeliveries?: { status: string }[];
  reconciliations?: ApprovalReconciliationSource[];
};

export type ApprovalReconciliationItem = Omit<
  ApprovalReconciliationSource,
  "idempotencyKey" | "actorOperatorId" | "resolutionKey"
>;

export type ApprovalLifecycleItem = {
  id: string;
  title: string;
  status: string;
  lifecycleStage: ApprovalLifecycleStage;
  actionType: string;
  payload: unknown;
  sourceKey: string | null;
  opportunityId: string | null;
  eventId: string | null;
  managerRecommendationId: string | null;
  campaignId: string | null;
  proposedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  executionAttemptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deliverySummary: ApprovalDeliverySummary | null;
  reconciliations: ApprovalReconciliationItem[];
  latestReconciliation: ApprovalReconciliationItem | null;
  terminalReconciliation: ApprovalReconciliationItem | null;
  capabilities: {
    canApprove: boolean;
    canReject: boolean;
    canExecute: boolean;
    canReconcile: boolean;
    canRetry: false;
  };
};

export type ApprovalLifecyclePartition<T> = {
  pendingDecision: T[];
  readyToExecute: T[];
  executionInProgress: T[];
  needsReconciliation: T[];
  reconciled: T[];
  approvedNotExecutable: T[];
  counts: {
    pendingDecision: number;
    readyToExecute: number;
    executionInProgress: number;
    needsReconciliation: number;
    reconciled: number;
    approvedNotExecutable: number;
    attentionTotal: number;
  };
};

export function approvalActionIsExecutable(actionType: string): boolean {
  return EXECUTABLE_ACTIONS.has(actionType);
}

export function approvalExecutionLeaseIsActive(
  approval: {
    status: string;
    executionAttemptedAt?: Date | null;
  },
  observedAt = new Date()
): boolean {
  if (
    approval.status !== "approved" ||
    !approval.executionAttemptedAt
  ) {
    return false;
  }
  const age = observedAt.getTime() - approval.executionAttemptedAt.getTime();
  return age < APPROVAL_EXECUTION_LEASE_MS;
}

/**
 * Projects the persisted status plus the one-shot execution claim into a
 * mutually exclusive operator-facing state. An unresolved execution claim
 * wins because it may represent an outside write whose response was lost and
 * must never be presented as executable again. A later terminal human receipt
 * closes attention without changing the original approval or making it
 * executable.
 */
export function approvalLifecycleStage(
  approval: Pick<
    ApprovalLifecycleSource,
    "status" | "actionType" | "executionAttemptedAt"
  > & {
    reconciliations?: readonly Pick<ApprovalReconciliationSource, "outcome" | "createdAt">[];
  },
  observedAt = new Date()
): ApprovalLifecycleStage | null {
  const terminalReconciliation = terminalApprovalReconciliation(
    approval.reconciliations
  );
  const needsReconciliation =
    approval.status === "failed" ||
    (approval.status === "approved" && Boolean(approval.executionAttemptedAt));
  if (
    needsReconciliation &&
    approvalReconciliationIsConclusive(terminalReconciliation?.outcome)
  ) {
    return terminalReconciliation.outcome === "external_effect_observed"
      ? "reconciled_external_effect"
      : "reconciled_no_external_effect";
  }
  if (approvalExecutionLeaseIsActive(approval, observedAt)) {
    return "execution_in_progress";
  }
  if (approval.status === "approved" && approval.executionAttemptedAt) {
    return "execution_unknown";
  }
  if (approval.status === "failed") {
    return "failed_needs_reconciliation";
  }
  if (approval.status === "proposed" || approval.status === "pending") {
    return "pending_decision";
  }
  if (
    approval.status === "approved" &&
    approvalActionIsExecutable(approval.actionType)
  ) {
    return "approved_ready";
  }
  if (approval.status === "approved") {
    return "approved_not_executable";
  }
  return null;
}

export function partitionApprovalLifecycle<
  T extends Pick<
    ApprovalLifecycleSource,
    "status" | "actionType" | "executionAttemptedAt"
  > & {
    reconciliations?: readonly Pick<ApprovalReconciliationSource, "outcome" | "createdAt">[];
  }
>(approvals: readonly T[], observedAt = new Date()): ApprovalLifecyclePartition<T> {
  const pendingDecision: T[] = [];
  const readyToExecute: T[] = [];
  const executionInProgress: T[] = [];
  const needsReconciliation: T[] = [];
  const reconciled: T[] = [];
  const approvedNotExecutable: T[] = [];
  for (const approval of approvals) {
    const stage = approvalLifecycleStage(approval, observedAt);
    if (stage === "pending_decision") pendingDecision.push(approval);
    else if (stage === "approved_ready") readyToExecute.push(approval);
    else if (stage === "execution_in_progress") {
      executionInProgress.push(approval);
    } else if (
      stage === "execution_unknown" ||
      stage === "failed_needs_reconciliation"
    ) {
      needsReconciliation.push(approval);
    } else if (stage === "approved_not_executable") {
      approvedNotExecutable.push(approval);
    } else if (
      stage === "reconciled_external_effect" ||
      stage === "reconciled_no_external_effect"
    ) {
      reconciled.push(approval);
    }
  }
  return {
    pendingDecision,
    readyToExecute,
    executionInProgress,
    needsReconciliation,
    reconciled,
    approvedNotExecutable,
    counts: {
      pendingDecision: pendingDecision.length,
      readyToExecute: readyToExecute.length,
      executionInProgress: executionInProgress.length,
      needsReconciliation: needsReconciliation.length,
      reconciled: reconciled.length,
      approvedNotExecutable: approvedNotExecutable.length,
      attentionTotal:
        pendingDecision.length +
        readyToExecute.length +
        needsReconciliation.length
    }
  };
}

export function summarizeApprovalDeliveries(
  deliveries: readonly { status: string }[]
): ApprovalDeliverySummary | null {
  if (deliveries.length === 0) return null;
  const summary: ApprovalDeliverySummary = {
    total: deliveries.length,
    pending: 0,
    drafted: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    unknown: 0
  };
  for (const delivery of deliveries) {
    switch (delivery.status) {
      case "pending":
      case "drafted":
      case "sending":
      case "sent":
      case "failed":
      case "unknown":
        summary[delivery.status] += 1;
        break;
      default:
        break;
    }
  }
  return summary;
}

export function projectApprovalLifecycleItem(
  approval: ApprovalLifecycleSource,
  capabilities: ApprovalLifecycleCapabilities,
  observedAt = new Date()
): ApprovalLifecycleItem | null {
  const lifecycleStage = approvalLifecycleStage(approval, observedAt);
  if (!lifecycleStage) return null;
  const pendingDecision = lifecycleStage === "pending_decision";
  const approvedReady = lifecycleStage === "approved_ready";
  const reconciliationPending =
    lifecycleStage === "execution_unknown" ||
    lifecycleStage === "failed_needs_reconciliation";
  const sameArtistCampaign =
    approval.bookingCampaign?.artistId === approval.artistId
      ? approval.bookingCampaign
      : null;
  const reconciliations = (approval.reconciliations ?? []).map(
    ({
      id,
      outcome,
      note,
      evidence,
      policyVersion,
      observedAt,
      actorLabel,
      createdAt
    }) => ({
      id,
      outcome,
      note,
      evidence,
      policyVersion,
      observedAt,
      actorLabel,
      createdAt
    })
  );
  return {
    id: approval.id,
    title: approval.title,
    status: approval.status,
    lifecycleStage,
    actionType: approval.actionType,
    payload: approval.payload,
    sourceKey: approval.sourceKey,
    opportunityId: approval.opportunityId,
    eventId: approval.eventId,
    managerRecommendationId: approval.managerRecommendationId,
    campaignId: sameArtistCampaign?.id ?? null,
    proposedBy: approval.proposedBy,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    executionAttemptedAt: approval.executionAttemptedAt,
    createdAt: approval.createdAt,
    updatedAt: approval.updatedAt,
    deliverySummary: summarizeApprovalDeliveries(
      approval.campaignDeliveries ?? []
    ),
    reconciliations,
    latestReconciliation: latestApprovalReconciliation(reconciliations),
    terminalReconciliation: terminalApprovalReconciliation(reconciliations),
    capabilities: {
      canApprove: capabilities.canDecide && pendingDecision,
      canReject: capabilities.canDecide && pendingDecision,
      canExecute: capabilities.canExecute && approvedReady,
      canReconcile:
        capabilities.canReconcile && reconciliationPending,
      canRetry: false
    }
  };
}
