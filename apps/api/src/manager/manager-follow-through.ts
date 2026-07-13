import {
  approvalActionIsExecutable,
  approvalExecutionLeaseIsActive
} from "../approvals/approval-lifecycle";
import { terminalApprovalReconciliation } from "../approvals/approval-reconciliation";
import { managerRunUsesOwnerOnlyContext } from "./manager-provider-context";

export const MANAGER_FOLLOW_THROUGH_POLICY_VERSION = "manager_follow_through_v1" as const;

export type ManagerFollowThroughState = "needs_action" | "in_motion" | "blocked" | "completed";

export type ManagerFollowThroughStage =
  | "ready_for_review"
  | "needs_tracking"
  | "task_ready"
  | "task_in_progress"
  | "task_blocked"
  | "waiting_external"
  | "decision_needed"
  | "awaiting_approval"
  | "awaiting_execution"
  | "execution_in_progress"
  | "execution_unknown"
  | "approval_failed"
  | "approval_rejected"
  | "approval_simulated"
  | "reconciled"
  | "project_active"
  | "event_active"
  | "internal_change_complete";

type FollowThroughTask = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  updatedAt: Date;
  blockedReason: string | null;
  waitingOn: string | null;
};

type FollowThroughDecision = {
  id: string;
  title: string;
  status: string;
  needsFraming: boolean;
  reviewAt: Date | null;
  updatedAt: Date;
};

type FollowThroughProject = {
  id: string;
  name: string;
  status: string;
  dueAt: Date | null;
  updatedAt: Date;
};

type FollowThroughEvent = {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  updatedAt: Date;
};

type FollowThroughApproval = {
  id: string;
  title: string;
  status: string;
  actionType: string;
  executionAttemptedAt: Date | null;
  approvedAt: Date | null;
  updatedAt: Date;
  reconciliations?: { outcome: string; createdAt: Date }[];
};

export type ManagerFollowThroughSource = {
  id: string;
  title: string;
  workstream: string;
  priority: string;
  outcome: string;
  outcomeReason: string | null;
  nextAction: string;
  proposedAction: unknown;
  createdAt: Date;
  updatedAt: Date;
  outcomeAt: Date | null;
  task: FollowThroughTask | null;
  decision: FollowThroughDecision | null;
  project: FollowThroughProject | null;
  event: FollowThroughEvent | null;
  memoryFact?: {
    id: string;
    key: string;
    sensitivity: string;
    archivedAt: Date | null;
    updatedAt: Date;
  } | null;
  approvals: FollowThroughApproval[];
  managerRun?: { trace?: unknown; message?: { visibility?: string | null } | null } | null;
  /** False on a role-redacted receipt whose source recommendation is owner-only. */
  mutationAllowed?: boolean;
};

export type ManagerFollowThroughTarget = {
  kind: "task" | "decision" | "project" | "event" | "approval" | "memory" | "recommendation";
  id: string;
  label: string;
  title: string;
  status: string;
};

export type ManagerFollowThroughItem = {
  recommendationId: string;
  title: string;
  workstream: string;
  priority: string;
  outcome: string;
  outcomeReason: string | null;
  actionType: string | null;
  canMutate: boolean;
  canAccept: boolean;
  canReconcile: boolean;
  state: ManagerFollowThroughState;
  stage: ManagerFollowThroughStage;
  status: string;
  statusLabel: string;
  detail: string;
  nextAction: string;
  destination: { href: string; label: string } | null;
  target: ManagerFollowThroughTarget;
  outcomeAt: string | null;
  updatedAt: string;
  dates: {
    createdAt: string;
    updatedAt: string;
    outcomeAt: string | null;
    dueAt: string | null;
    targetUpdatedAt: string | null;
  };
};

export type ManagerFollowThrough = {
  policyVersion: typeof MANAGER_FOLLOW_THROUGH_POLICY_VERSION;
  observedAt: string;
  counts: {
    total: number;
    needsAction: number;
    inMotion: number;
    blocked: number;
    completed: number;
  };
  items: ManagerFollowThroughItem[];
};

export type ManagerFollowThroughVisibility = "normal" | "owner" | "provider_full";

export type ManagerMemoryRecommendationVisibilitySource = {
  outcome: string;
  proposedAction: unknown;
  memoryFact?: {
    id: string;
    sensitivity: string;
    archivedAt: Date | null;
  } | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function managerRecommendationActionType(value: unknown): string | null {
  const action = record(value);
  return action && typeof action.type === "string" ? action.type : null;
}

/**
 * A resolved memory recommendation inherits the current memory record's access
 * boundary. This deliberately fails closed when that record was archived or
 * removed so stale recommendation text and previews cannot revive it.
 */
export function managerMemoryRecommendationIsVisible(
  source: ManagerMemoryRecommendationVisibilitySource,
  visibility: ManagerFollowThroughVisibility = "normal"
) {
  if (managerRecommendationActionType(source.proposedAction) !== "remember_fact" || source.outcome === "suggested") return true;
  const fact = source.memoryFact;
  if (!fact || fact.archivedAt) return false;
  if (fact.sensitivity === "normal") return true;
  if (visibility === "owner") return true;
  return visibility === "provider_full" && fact.sensitivity === "sensitive";
}

export function managerRecommendationMetadataIsVisible(
  source: ManagerMemoryRecommendationVisibilitySource & { managerRun?: { trace?: unknown; message?: { visibility?: string | null } | null } | null },
  visibility: ManagerFollowThroughVisibility = "normal"
) {
  if (!managerMemoryRecommendationIsVisible(source, visibility)) return false;
  if (!managerRunUsesOwnerOnlyContext(source.managerRun)) return true;
  return visibility === "owner" || visibility === "provider_full";
}

function authoritativeTitle(source: ManagerFollowThroughSource) {
  if (source.task) return source.task.title;
  if (source.decision) return source.decision.title;
  if (source.project) return source.project.name;
  if (source.event) return source.event.title;
  if (source.memoryFact) return source.memoryFact.key;
  return source.approvals[0]?.title ?? null;
}

export function projectManagerFollowThroughSource(
  source: ManagerFollowThroughSource,
  visibility: ManagerFollowThroughVisibility = "normal"
): ManagerFollowThroughSource | null {
  if (!managerMemoryRecommendationIsVisible(source, visibility)) return null;
  if (!managerRunUsesOwnerOnlyContext(source.managerRun) || visibility === "owner" || visibility === "provider_full") return source;
  if (source.outcome === "suggested") return null;
  const title = authoritativeTitle(source);
  if (!title) return null;
  // The linked record is now the shared source of truth. Do not replay any
  // model-authored recommendation prose or classification from the owner's
  // private full-context run into a member-visible receipt.
  return {
    ...source,
    title,
    workstream: "band_operations",
    priority: "med",
    outcomeReason: null,
    nextAction: "Open the linked record and continue from its current shared state.",
    proposedAction: null,
    mutationAllowed: false
  };
}

export function managerFollowThroughSourceIsVisible(
  source: ManagerFollowThroughSource,
  visibility: ManagerFollowThroughVisibility = "normal"
) {
  return Boolean(projectManagerFollowThroughSource(source, visibility));
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function recommendationTarget(source: ManagerFollowThroughSource): ManagerFollowThroughTarget {
  return { kind: "recommendation", id: source.id, label: source.title, title: source.title, status: source.outcome };
}

function base(
  source: ManagerFollowThroughSource,
  state: ManagerFollowThroughState,
  stage: ManagerFollowThroughStage,
  status: string,
  detail: string,
  nextAction: string,
  destination: ManagerFollowThroughItem["destination"],
  target: ManagerFollowThroughTarget,
  dueAt?: Date | null,
  targetUpdatedAt?: Date | null
): ManagerFollowThroughItem {
  const actionType = managerRecommendationActionType(source.proposedAction);
  const canMutate = source.mutationAllowed !== false;
  const canReconcile = canMutate && (
    source.outcome === "blocked" && stage === "approval_simulated" ||
    source.outcome === "accepted" && stage === "needs_tracking" && Boolean(actionType)
  );
  return {
    recommendationId: source.id,
    title: source.title,
    workstream: source.workstream,
    priority: source.priority,
    outcome: source.outcome,
    outcomeReason: source.outcomeReason,
    actionType,
    canMutate,
    canAccept: canMutate && source.outcome === "suggested" && Boolean(actionType),
    canReconcile,
    state,
    stage,
    status,
    statusLabel: status,
    detail,
    nextAction,
    destination,
    target,
    outcomeAt: iso(source.outcomeAt),
    updatedAt: source.updatedAt.toISOString(),
    dates: {
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
      outcomeAt: iso(source.outcomeAt),
      dueAt: iso(dueAt),
      targetUpdatedAt: iso(targetUpdatedAt)
    }
  };
}

/**
 * Projects one recommendation from relational state only. Provider payloads and
 * message JSON are deliberately absent from this code-owned read model.
 */
export function projectManagerFollowThrough(source: ManagerFollowThroughSource, observedAt = new Date()): ManagerFollowThroughItem {
  const actionType = managerRecommendationActionType(source.proposedAction);
  const approvals = [...source.approvals].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  if (source.outcome === "completed" && source.outcomeReason === "reconciled") {
    return base(source, "completed", "reconciled", "Closed after human reconciliation", "A band member reviewed and closed this receipt. This records reconciliation only; it is not evidence that a provider action ran or succeeded.", "No automatic retry or execution will occur. Use the authoritative linked record if new work is needed.", null, recommendationTarget(source));
  }
  const externalEffect = approvals.find(
    (approval) =>
      terminalApprovalReconciliation(approval.reconciliations)?.outcome ===
      "external_effect_observed"
  );
  const remainingUnresolved = approvals.find(
    (approval) =>
      (approval.status === "failed" ||
        (approval.status === "approved" && approval.executionAttemptedAt)) &&
      !terminalApprovalReconciliation(approval.reconciliations)
  );
  if (externalEffect) {
    const receipt = terminalApprovalReconciliation(
      externalEffect.reconciliations
    )!;
    return base(
      source,
      "blocked",
      "reconciled",
      "External effect observed — repair required",
      `A band member found an outside effect for “${externalEffect.title}”. This closes duplicate-risk review for that request, but it does not prove the full batch succeeded or repair StoryBoard's linked records.${remainingUnresolved ? ` “${remainingUnresolved.title}” still has an unresolved provider outcome.` : ""}`,
      remainingUnresolved
        ? "Open Approvals and reconcile every remaining provider outcome. Then record a task for any verified follow-up or CRM correction StoryBoard cannot link here. Do not run the original requests again."
        : "Open the provider result and linked workflow. Record a task for any verified follow-up or CRM correction that StoryBoard cannot link here, and do not run the original request again.",
      remainingUnresolved
        ? {
            href: "/approvals#needs-reconciliation",
            label: "Reconcile remaining approvals"
          }
        : { href: "/approvals#reconciled", label: "View reconciliation" },
      {
        kind: "approval",
        id: externalEffect.id,
        label: externalEffect.title,
        title: externalEffect.title,
        status: "reconciled_external_effect"
      },
      null,
      receipt.createdAt
    );
  }
  const activeExecution = approvals.find((approval) =>
    approvalExecutionLeaseIsActive(approval, observedAt)
  );
  if (activeExecution) {
    return base(
      source,
      "in_motion",
      "execution_in_progress",
      "Provider execution in progress",
      `StoryBoard claimed the one-shot execution for “${activeExecution.title}”. Its bounded provider call may still be running.`,
      "Wait for the final result. StoryBoard will not offer reconciliation or a replacement while the execution lease is active.",
      { href: "/approvals#execution-in-progress", label: "View execution" },
      {
        kind: "approval",
        id: activeExecution.id,
        label: activeExecution.title,
        title: activeExecution.title,
        status: "execution_in_progress"
      },
      null,
      activeExecution.updatedAt
    );
  }
  // An attempted provider write with no final result quarantines the whole
  // batch. A clean failure/rejection on a sibling request cannot make the
  // ambiguous write safe to reconcile or retry.
  const unknownExecution = approvals.find(
    (approval) =>
      approval.status === "approved" &&
      approval.executionAttemptedAt &&
      !terminalApprovalReconciliation(approval.reconciliations)
  );
  if (unknownExecution) {
    return base(source, "blocked", "execution_unknown", "Execution outcome unknown", `StoryBoard recorded an execution attempt for “${unknownExecution.title}” but no final result. It is not safe to call this executable or retry it automatically.`, "Open Approvals and reconcile the provider result before taking another action.", { href: "/approvals", label: "Reconcile approval" }, { kind: "approval", id: unknownExecution.id, label: unknownExecution.title, title: unknownExecution.title, status: "execution_unknown" }, null, unknownExecution.updatedAt);
  }

  const approvalFailure = approvals.find(
    (approval) =>
      approval.status === "failed" &&
      !terminalApprovalReconciliation(approval.reconciliations)
  );
  if (approvalFailure) {
    return base(source, "blocked", "approval_failed", "Approval failed", `“${approvalFailure.title}” failed. This outside action is stopped; review the saved approval history before preparing any replacement.`, "Open Approvals and reconcile the failed request. Do not retry an uncertain provider action.", { href: "/approvals", label: "Open approvals" }, { kind: "approval", id: approvalFailure.id, label: approvalFailure.title, title: approvalFailure.title, status: approvalFailure.status }, null, approvalFailure.updatedAt);
  }

  const noExternalEffect = approvals.find(
    (approval) =>
      terminalApprovalReconciliation(approval.reconciliations)?.outcome ===
      "no_external_effect_observed"
  );
  if (noExternalEffect) {
    const receipt = terminalApprovalReconciliation(
      noExternalEffect.reconciliations
    )!;
    return base(
      source,
      "blocked",
      "reconciled",
      "No external effect found",
      `A band member checked “${noExternalEffect.title}” and recorded that no outside effect was found. The original request remains closed and was not retried.`,
      "Prepare a separate, newly reviewed request if this work is still needed.",
      { href: "/approvals#reconciled", label: "View reconciliation" },
      {
        kind: "approval",
        id: noExternalEffect.id,
        label: noExternalEffect.title,
        title: noExternalEffect.title,
        status: "reconciled_no_external_effect"
      },
      null,
      receipt.createdAt
    );
  }

  const stoppedApproval = approvals.find((approval) => approval.status === "rejected" || approval.status === "expired");
  if (stoppedApproval) {
    const stopped = stoppedApproval.status === "expired" ? "expired" : "rejected";
    return base(source, "blocked", "approval_rejected", `Approval ${stopped}`, `“${stoppedApproval.title}” was ${stopped}. That reviewed request is closed and no provider action is authorized.`, "Open Approvals to review the final decision. Prepare any replacement as a separate reviewed request; do not retry this one.", { href: "/approvals", label: "View approval decision" }, { kind: "approval", id: stoppedApproval.id, label: stoppedApproval.title, title: stoppedApproval.title, status: stoppedApproval.status }, null, stoppedApproval.updatedAt);
  }

  if (source.outcome === "blocked" && source.outcomeReason === "approval_simulated") {
    const simulated = approvals[0];
    return base(source, "blocked", "approval_simulated", "Provider action was simulated", "The linked approval ran through a mock adapter. StoryBoard recorded the workflow test, not a real Calendar or Drive result.", "Connect and verify the real provider before treating this outside work as complete.", { href: "/approvals", label: "View simulated approval" }, simulated ? { kind: "approval", id: simulated.id, label: simulated.title, title: simulated.title, status: "simulated" } : recommendationTarget(source), null, simulated?.updatedAt ?? null);
  }

  if (approvals.length && approvals.every((approval) => approval.status === "executed")) {
    const latest = approvals[0]!;
    return base(
      source,
      "completed",
      "internal_change_complete",
      "Approved work executed",
      `All ${approvals.length} linked approval${approvals.length === 1 ? " has" : "s have"} a recorded executed result.`,
      "No execution step remains. Review the real-world outcome when it is available.",
      { href: "/approvals", label: "View approval history" },
      {
        kind: "approval",
        id: latest.id,
        label: latest.title,
        title: latest.title,
        status: "executed"
      },
      null,
      latest.updatedAt
    );
  }

  const awaitingApproval = approvals.find((approval) => approval.status === "pending" || approval.status === "proposed");
  if (awaitingApproval) {
    return base(source, "needs_action", "awaiting_approval", "Waiting for human approval", `“${awaitingApproval.title}” is prepared but has not been approved. No provider write has been authorized.`, "Open Approvals, inspect the exact request, and approve or reject it.", { href: "/approvals", label: "Review approval" }, { kind: "approval", id: awaitingApproval.id, label: awaitingApproval.title, title: awaitingApproval.title, status: awaitingApproval.status }, null, awaitingApproval.updatedAt);
  }

  const awaitingExecution = approvals.find((approval) => approval.status === "approved" && !approval.executionAttemptedAt && approvalActionIsExecutable(approval.actionType));
  if (awaitingExecution) {
    return base(source, "needs_action", "awaiting_execution", "Approved and awaiting execution", `“${awaitingExecution.title}” is approved and has no recorded execution attempt. Execution remains a separate human action.`, "Open Approvals, recheck the request, and explicitly execute it when ready.", { href: "/approvals", label: "Open approved request" }, { kind: "approval", id: awaitingExecution.id, label: awaitingExecution.title, title: awaitingExecution.title, status: awaitingExecution.status }, null, awaitingExecution.updatedAt);
  }

  const approvedRecord = approvals.find((approval) => approval.status === "approved" && !approval.executionAttemptedAt);
  if (approvedRecord) {
    return base(source, "completed", "internal_change_complete", "Approval recorded — no execution step", `“${approvedRecord.title}” was approved, and its action type does not call a provider. StoryBoard will not present it as executable.`, "No provider action remains for this approval. Review the linked internal record if more work is needed.", { href: "/approvals", label: "View approval record" }, { kind: "approval", id: approvedRecord.id, label: approvedRecord.title, title: approvedRecord.title, status: approvedRecord.status }, null, approvedRecord.updatedAt);
  }

  if (source.outcome === "blocked") {
    return base(source, "blocked", "needs_tracking", "Recommendation is blocked", source.outcomeReason ? `The recommendation is blocked: ${source.outcomeReason.replaceAll("_", " ")}. The current linked records do not prove that the safety block was resolved.` : "The recommendation is blocked, but no linked work record identifies the blocker.", "Review the recommendation and record the real task, decision, project, event, or approval that should carry it forward.", { href: "/manager", label: "Review recommendation" }, recommendationTarget(source));
  }

  const task = source.task;
  if (task?.status === "done") {
    return base(source, "completed", "internal_change_complete", "Linked task completed", `“${task.title}” is marked done.`, "No task step remains; review the result if it should change the plan.", { href: "/tasks", label: "View task" }, { kind: "task", id: task.id, label: task.title, title: task.title, status: task.status }, task.dueAt, task.updatedAt);
  }
  if (task?.waitingOn) {
    return base(source, "blocked", "waiting_external", `Waiting on ${task.waitingOn}`, `“${task.title}” cannot move until ${task.waitingOn} responds or supplies the recorded dependency.`, "Open the task, confirm the waiting party and follow-up date, then close or update the wait when the response arrives.", { href: "/tasks", label: "Open task" }, { kind: "task", id: task.id, label: task.title, title: task.title, status: task.status }, task.dueAt, task.updatedAt);
  }
  if (task?.status === "blocked" || source.outcome === "blocked" && task) {
    return base(source, "blocked", "task_blocked", "Linked task is blocked", task.blockedReason ? `“${task.title}” is blocked: ${task.blockedReason}` : `“${task.title}” is blocked, but no safe resolution is recorded.`, "Open the task and record the real blocker, waiting party, or revised next step.", { href: "/tasks", label: "Open blocked task" }, { kind: "task", id: task.id, label: task.title, title: task.title, status: task.status }, task.dueAt, task.updatedAt);
  }
  if (task) {
    const inProgress = task.status === "in_progress";
    return base(source, "in_motion", inProgress ? "task_in_progress" : "task_ready", inProgress ? "Linked task in progress" : "Linked task ready", `“${task.title}” is the authoritative tracked work for this recommendation.`, inProgress ? "Continue the linked task and update its blocker or completion status there." : "Open the linked task, confirm its owner and date, and start it when ready.", { href: "/tasks", label: "Open task" }, { kind: "task", id: task.id, label: task.title, title: task.title, status: task.status }, task.dueAt, task.updatedAt);
  }

  const decision = source.decision;
  if (decision && ["reviewed", "superseded"].includes(decision.status)) {
    return base(source, "completed", "internal_change_complete", decision.status === "reviewed" ? "Decision reviewed" : "Decision superseded", `“${decision.title}” is ${decision.status}; no open decision step remains.`, "Use the recorded result when the next plan is reviewed.", { href: "/manager#decisions", label: "View decision" }, { kind: "decision", id: decision.id, label: decision.title, title: decision.title, status: decision.status }, decision.reviewAt, decision.updatedAt);
  }
  if (decision) {
    const waitingForReview = decision.status === "decided" && decision.reviewAt && decision.reviewAt > observedAt;
    return base(source, waitingForReview ? "in_motion" : "needs_action", "decision_needed", decision.needsFraming ? "Decision needs framing" : waitingForReview ? "Decision waiting for review checkpoint" : decision.status === "decided" ? "Decision outcome is due for review" : "Decision needs a choice", decision.needsFraming ? `“${decision.title}” is still a draft. The band must replace placeholder tradeoffs before choosing.` : waitingForReview ? `“${decision.title}” has a recorded choice and will be reviewed at the saved checkpoint.` : decision.status === "decided" ? `“${decision.title}” has a choice but its review checkpoint is due or missing.` : `“${decision.title}” is open and still requires a human choice.`, decision.needsFraming ? "Open the decision, write the real options and tradeoffs, and save the framing before choosing." : waitingForReview ? "Keep the decision in motion and review the observed result on the recorded date." : decision.status === "decided" ? "Review the decision now and save the observed result." : "Open the decision, compare the recorded options, and save the band's choice.", { href: "/manager#decisions", label: "Open decision" }, { kind: "decision", id: decision.id, label: decision.title, title: decision.title, status: decision.status }, decision.reviewAt, decision.updatedAt);
  }

  const project = source.project;
  if (project && project.status === "completed") {
    return base(source, "completed", "internal_change_complete", "Linked project completed", `“${project.name}” is marked completed.`, "Review its saved metrics and lessons before changing the next plan.", { href: `/operations/projects/${project.id}`, label: "View project" }, { kind: "project", id: project.id, label: project.name, title: project.name, status: project.status }, project.dueAt, project.updatedAt);
  }
  if (project) {
    const blocked = project.status === "paused" || project.status === "cancelled" || source.outcome === "blocked";
    return base(source, blocked ? "blocked" : "in_motion", "project_active", project.status === "paused" ? "Linked project paused" : project.status === "cancelled" ? "Linked project cancelled" : "Linked project active", `“${project.name}” is the authoritative project created or advanced by this recommendation.`, blocked ? "Open the project and decide whether to resume, replace, or close the work." : "Open the project and advance its next incomplete milestone.", { href: `/operations/projects/${project.id}`, label: "Open project" }, { kind: "project", id: project.id, label: project.name, title: project.name, status: project.status }, project.dueAt, project.updatedAt);
  }

  const event = source.event;
  if (event?.status === "completed") {
    return base(source, "completed", "internal_change_complete", "Linked event completed", `“${event.title}” is marked completed.`, "Record any missing outcome and follow-up facts in the event.", { href: `/operations/events/${event.id}`, label: "View event" }, { kind: "event", id: event.id, label: event.title, title: event.title, status: event.status }, event.startsAt, event.updatedAt);
  }
  if (event) {
    const blocked = event.status === "cancelled" || source.outcome === "blocked";
    return base(source, blocked ? "blocked" : "in_motion", "event_active", event.status === "cancelled" ? "Linked event cancelled" : "Linked event active", `“${event.title}” is the authoritative event created or advanced by this recommendation.`, blocked ? "Open the event and record any cancellation follow-up that remains." : "Open the event and advance its readiness, availability, or day-of work.", { href: `/operations/events/${event.id}`, label: "Open event" }, { kind: "event", id: event.id, label: event.title, title: event.title, status: event.status }, event.startsAt, event.updatedAt);
  }

  if (source.memoryFact) {
    return base(source, "completed", "internal_change_complete", "Manager memory updated", `The reviewed “${source.memoryFact.key}” fact is saved as the authoritative result of this recommendation.`, "No execution step remains; correct or archive the fact from Manager if it changes.", { href: "/manager", label: "View manager memory" }, { kind: "memory", id: source.memoryFact.id, label: source.memoryFact.key, title: source.memoryFact.key, status: "saved" }, null, source.memoryFact.updatedAt);
  }

  if (source.outcome === "completed" || source.outcome === "dismissed") {
    const dismissed = source.outcome === "dismissed";
    return base(source, "completed", "internal_change_complete", dismissed ? "Recommendation dismissed" : "Internal change completed", dismissed ? "The band dismissed this recommendation; it has no remaining execution step." : "The accepted internal change is recorded as complete and has no ongoing linked work.", dismissed ? "No action remains unless new evidence changes the recommendation." : "Review the observed result when deciding what should happen next.", null, recommendationTarget(source));
  }

  if (source.outcome === "suggested" && actionType) {
    return base(source, "needs_action", "ready_for_review", "Ready for review", "This proposed internal action has not been accepted. Nothing has been changed yet.", source.nextAction, null, recommendationTarget(source));
  }

  return base(source, "needs_action", "needs_tracking", source.outcome === "accepted" ? "Accepted advice needs tracking" : "Advice has no trackable action", source.outcome === "accepted" ? "This legacy recommendation was accepted without a linked task, decision, project, event, or approval. Acceptance alone is not evidence that work happened." : "This advice explains a next step but does not contain a safe typed action to accept.", source.outcome === "accepted" ? "Create or link the real work record, or mark the recommendation complete if the band already handled it." : source.nextAction, { href: "/manager", label: "Review recommendation" }, recommendationTarget(source));
}

const stateRank: Record<ManagerFollowThroughState, number> = { blocked: 0, needs_action: 1, in_motion: 2, completed: 3 };
const priorityRank: Record<string, number> = { high: 0, med: 1, low: 2 };

function withItems(projection: ManagerFollowThrough, items: ManagerFollowThroughItem[]): ManagerFollowThrough {
  return {
    ...projection,
    counts: {
      total: items.length,
      needsAction: items.filter((item) => item.state === "needs_action").length,
      inMotion: items.filter((item) => item.state === "in_motion").length,
      blocked: items.filter((item) => item.state === "blocked").length,
      completed: items.filter((item) => item.state === "completed").length
    },
    items
  };
}

export function projectManagerFollowThroughForProvider(
  projection: ManagerFollowThrough,
  visibleMemoryFactIds: ReadonlySet<string>
) {
  return withItems(projection, projection.items.filter((item) =>
    item.target.kind !== "memory" || visibleMemoryFactIds.has(item.target.id)
  ));
}

export function summarizeManagerFollowThrough(
  sources: ManagerFollowThroughSource[],
  observedAt = new Date(),
  visibility: ManagerFollowThroughVisibility = "normal"
): ManagerFollowThrough {
  const items = sources.flatMap((source) => {
    const projected = projectManagerFollowThroughSource(source, visibility);
    return projected ? [projectManagerFollowThrough(projected, observedAt)] : [];
  }).sort((left, right) =>
    stateRank[left.state] - stateRank[right.state] ||
    (priorityRank[left.priority] ?? 3) - (priorityRank[right.priority] ?? 3) ||
    right.dates.updatedAt.localeCompare(left.dates.updatedAt) ||
    left.recommendationId.localeCompare(right.recommendationId)
  );
  return withItems({
    policyVersion: MANAGER_FOLLOW_THROUGH_POLICY_VERSION,
    observedAt: observedAt.toISOString(),
    counts: { total: 0, needsAction: 0, inMotion: 0, blocked: 0, completed: 0 },
    items: []
  }, items);
}

export function hydrateManagerMessageActions(
  stored: unknown,
  sources: ManagerFollowThroughSource[],
  visibility: ManagerFollowThroughVisibility = "normal"
) {
  const previews = new Map(
    (Array.isArray(stored) ? stored : []).flatMap((value) => {
      const item = record(value);
      return item && typeof item.recommendationId === "string" ? [[item.recommendationId, item]] as const : [];
    })
  );
  return sources.flatMap((source) => {
    const projected = projectManagerFollowThroughSource(source, visibility);
    if (!projected) return [];
    const preview = previews.get(projected.id);
    const receipt = projectManagerFollowThrough(projected);
    const actionType = managerRecommendationActionType(projected.proposedAction);
    const previewIsCurrent = actionType !== "remember_fact" || source.outcome === "suggested";
    const privateMetadataRedacted = projected !== source;
    return [{
      recommendationId: projected.id,
      title: receipt.title,
      nextAction: receipt.nextAction,
      outcome: projected.outcome,
      actionType,
      canAccept: receipt.canAccept,
      ...(!privateMetadataRedacted && previewIsCurrent && preview && typeof preview.preview === "string" ? { preview: preview.preview } : {}),
      followThrough: receipt
    }];
  });
}
