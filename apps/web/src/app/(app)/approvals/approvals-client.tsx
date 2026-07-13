"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import {
  CircleAlert,
  CircleCheck,
  Info,
  Play,
  Shield,
  ShieldCheck,
  TriangleAlert
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type {
  ApprovalLifecycleItem,
  ApprovalReconciliation,
  ApprovalReconciliationOutcome,
  ApprovalWorkQueue
} from "@/lib/types";

type ReconciliationSubmission = {
  outcome: ApprovalReconciliationOutcome;
  checkedLocation: string;
  providerReference: string | null;
  note: string;
  observedAt: string;
  idempotencyKey: string;
};

export function ApprovalsClient({
  initialQueue,
  loadError
}: {
  initialQueue: ApprovalWorkQueue | null;
  loadError: string | null;
}) {
  const router = useRouter();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function runAction(
    id: string,
    successMessage: string,
    action: () => Promise<unknown>
  ): Promise<boolean> {
    setBusyId(id);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      router.refresh();
      return true;
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The approval action failed."
      );
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function approve(id: string) {
    await runAction(id, "Approval recorded. It is now ready for its separate execution step when supported.", () =>
      apiFetch(`/approvals/${id}/approve`, { method: "POST" })
    );
  }

  async function reject(id: string) {
    const succeeded = await runAction(id, "Rejection recorded. No provider work was authorized.", () =>
      apiFetch(`/approvals/${id}/reject`, {
        method: "POST",
        json: { reason: reason.trim() || undefined }
      })
    );
    if (succeeded) {
      setRejectId(null);
      setReason("");
    }
  }

  async function executeApproval(id: string, dryRun: boolean) {
    await runAction(
      id,
      dryRun
        ? "Dry-run preview recorded. No provider was called and the approval remains ready."
        : "Execution attempt finished. Review the recorded result before treating outside work as complete.",
      () =>
        apiFetch(`/approvals/${id}/execute`, {
          method: "POST",
          json: dryRun ? { dryRun: true } : {}
        })
    );
  }

  async function recordReconciliation(
    id: string,
    submission: ReconciliationSubmission
  ) {
    const successMessage =
      submission.outcome === "still_unknown"
        ? "The provider check was recorded. The request remains quarantined because its outcome is still unknown."
        : submission.outcome === "external_effect_observed"
          ? "The observed external effect was recorded. This closes the quarantine without claiming the provider action succeeded."
          : "The provider check found no external effect. A separate, newly reviewed request may now be prepared when the workflow supports it.";
    return runAction(id, successMessage, () =>
      apiFetch(`/approvals/${id}/reconciliations`, {
        method: "POST",
        json: submission
      })
    );
  }

  if (!initialQueue) {
    return (
      <SurfaceCard
        elevated
        className="border-red-500/30 bg-red-500/5"
      >
        <div className="flex gap-3" role="alert">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
          <div>
            <h2 className="font-semibold text-red-100">
              Approval status unavailable
            </h2>
            <p className="mt-1 text-sm text-red-200/85">
              {loadError ?? "The approval queue could not be loaded."}
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Do not assume that provider work is clear or safe to repeat while this status is unavailable.
            </p>
          </div>
        </div>
      </SurfaceCard>
    );
  }

  const queue = initialQueue;
  const hasActiveWork = queue.counts.attentionTotal > 0;

  return (
    <div className="space-y-10">
      <ApprovalQueueSummary queue={queue} />

      <div className="space-y-2" aria-live="polite" aria-atomic="true">
        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {actionError}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </p>
        ) : null}
      </div>

      {!hasActiveWork ? (
        <EmptyState
          title="No approval work needs attention"
          description="There are no decisions waiting, no approved provider actions ready to run, and no uncertain or failed attempts requiring review."
          icon={<ShieldCheck className="h-6 w-6" />}
        />
      ) : null}

      {queue.executionInProgress.length > 0 ? (
        <section id="execution-in-progress" className="scroll-mt-6 space-y-4" aria-labelledby="execution-in-progress-heading">
          <div>
            <h2 id="execution-in-progress-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-blue-200">
              <CircleAlert className="h-4 w-4" aria-hidden />
              Execution in progress
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
              These one-shot provider calls are still inside their execution lease. Wait for a final result; StoryBoard will not offer reconciliation or a replacement while the original request may still be running.
            </p>
          </div>
          {queue.executionInProgress.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              icon={<CircleAlert className="h-4 w-4 shrink-0 text-blue-300" aria-hidden />}
              className="border-blue-500/20 bg-[var(--surface-2)]/90"
              statusOverride="Execution in progress"
            />
          ))}
        </section>
      ) : null}

      {queue.needsReconciliation.length > 0 ? (
        <section id="needs-reconciliation" className="scroll-mt-6 space-y-4" aria-labelledby="needs-reconciliation-heading">
          <div>
            <h2 id="needs-reconciliation-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-red-200">
              <TriangleAlert className="h-4 w-4" aria-hidden />
              Needs reconciliation
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
              These requests are quarantined. Inspect the saved evidence and the provider before preparing replacement work. StoryBoard will not retry them.
            </p>
          </div>
          {queue.needsReconciliation.map((approval) => (
            <ReconciliationCard
              key={approval.id}
              approval={approval}
              canReconcile={
                queue.capabilities.canReconcile &&
                approval.capabilities.canReconcile
              }
              busy={busyId === approval.id}
              onRecord={recordReconciliation}
            />
          ))}
        </section>
      ) : null}

      {queue.pendingDecision.length > 0 ? (
        <section id="pending-decisions" className="scroll-mt-6 space-y-4" aria-labelledby="pending-decisions-heading">
          <div>
            <h2 id="pending-decisions-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-violet-200">
              <Shield className="h-4 w-4" aria-hidden />
              Pending decisions
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Review the exact request before deciding. Approval authorizes a later execution step; it does not call a provider by itself.
            </p>
          </div>
          {queue.pendingDecision.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              icon={<Shield className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />}
              className="border-violet-500/20 bg-[var(--surface-2)]/90"
            >
              {queue.capabilities.canDecide &&
              (approval.capabilities.canApprove || approval.capabilities.canReject) ? (
                <div className="flex shrink-0 flex-col gap-2 lg:w-48 lg:items-stretch">
                  {rejectId === approval.id ? (
                    <>
                      <label className="text-xs text-[var(--text-muted)]">
                        Rejection reason (optional)
                        <input
                          className="sb-input mt-1 text-xs"
                          aria-label={`Reason for rejecting ${approval.title}`}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busyId === approval.id || !approval.capabilities.canReject}
                        onClick={() => void reject(approval.id)}
                        className="min-h-11 rounded-lg bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-200 ring-1 ring-red-500/25 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        disabled={busyId === approval.id}
                        onClick={() => {
                          setRejectId(null);
                          setReason("");
                        }}
                        className="sb-btn-ghost min-h-11 text-xs"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {approval.capabilities.canApprove ? (
                        <button
                          type="button"
                          disabled={busyId === approval.id}
                          onClick={() => void approve(approval.id)}
                          className="min-h-11 rounded-lg bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      ) : null}
                      {approval.capabilities.canReject ? (
                        <button
                          type="button"
                          disabled={busyId === approval.id}
                          onClick={() => setRejectId(approval.id)}
                          className="sb-btn-secondary min-h-11"
                        >
                          Reject
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <ReadOnlyNote />
              )}
            </ApprovalCard>
          ))}
        </section>
      ) : null}

      {queue.readyToExecute.length > 0 ? (
        <section id="ready-to-execute" className="scroll-mt-6 space-y-4" aria-labelledby="ready-to-execute-heading">
          <div>
            <h2 id="ready-to-execute-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cyan-100">
              <Play className="h-4 w-4" aria-hidden />
              Approved — ready to execute
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
              Execution is a separate human action. Dry run previews without calling providers; Execute may create Gmail drafts, send explicitly approved email, create Calendar holds, or create Drive folders.
            </p>
          </div>
          {queue.readyToExecute.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              icon={<Play className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />}
              className="border-cyan-500/20 bg-[var(--surface-2)]/90"
            >
              {queue.capabilities.canExecute && approval.capabilities.canExecute ? (
                <div className="flex shrink-0 flex-col gap-2 lg:w-48 lg:items-stretch">
                  <button
                    type="button"
                    disabled={busyId === approval.id}
                    onClick={() => void executeApproval(approval.id, false)}
                    className="min-h-11 rounded-lg bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-500/35 hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    Execute
                  </button>
                  <button
                    type="button"
                    disabled={busyId === approval.id}
                    onClick={() => void executeApproval(approval.id, true)}
                    className="sb-btn-secondary min-h-11 text-xs"
                  >
                    Dry run (preview)
                  </button>
                </div>
              ) : (
                <ReadOnlyNote />
              )}
            </ApprovalCard>
          ))}
        </section>
      ) : null}

      {queue.approvedNotExecutable.length > 0 ? (
        <section id="approved-decisions" className="scroll-mt-6 space-y-4" aria-labelledby="approved-decisions-heading">
          <div>
            <h2 id="approved-decisions-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <Info className="h-4 w-4" aria-hidden />
              Approved decisions — no execution step
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              These records capture a reviewed decision, but their action type does not run through a provider. There is nothing to execute here.
            </p>
          </div>
          {queue.approvedNotExecutable.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              icon={<CircleCheck className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />}
              className="border-[var(--border)] bg-[var(--surface-1)]"
            />
          ))}
        </section>
      ) : null}

      {queue.reconciled.length > 0 ? (
        <section id="reconciled" className="scroll-mt-6 space-y-4" aria-labelledby="reconciled-heading">
          <div>
            <h2 id="reconciled-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-cyan-100">
              <CircleCheck className="h-4 w-4" aria-hidden />
              Reconciled provider checks
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
              These immutable receipts record what a person observed. They do not rewrite the original approval or turn a manual observation into proof of provider success.
            </p>
          </div>
          {queue.reconciled.map((approval) => (
            <ResolvedReconciliationCard key={approval.id} approval={approval} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ApprovalQueueSummary({ queue }: { queue: ApprovalWorkQueue }) {
  const cards = [
    { href: "#needs-reconciliation", label: "Needs reconciliation", value: queue.counts.needsReconciliation, tone: "text-red-200" },
    { href: "#pending-decisions", label: "Decisions waiting", value: queue.counts.pendingDecision, tone: "text-amber-200" },
    { href: "#ready-to-execute", label: "Ready to execute", value: queue.counts.readyToExecute, tone: "text-cyan-100" },
    { href: "#execution-in-progress", label: "In progress", value: queue.counts.executionInProgress, tone: "text-blue-200" },
    { href: "#reconciled", label: "Reconciled checks", value: queue.counts.reconciled, tone: "text-emerald-200" }
  ];
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Approval work summary">
        {cards.map((card) => (
          <a key={card.label} href={card.href} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold tabular-nums ${card.tone}`}>{card.value}</p>
          </a>
        ))}
      </div>
      <p className="mt-2 text-right text-[11px] text-[var(--text-muted)]">
        Status observed {formatDateTime(queue.observedAt)}
      </p>
    </div>
  );
}

function ReconciliationCard({
  approval,
  canReconcile,
  busy,
  onRecord
}: {
  approval: ApprovalLifecycleItem;
  canReconcile: boolean;
  busy: boolean;
  onRecord: (
    id: string,
    submission: ReconciliationSubmission
  ) => Promise<boolean>;
}) {
  const unknown = approval.lifecycleStage === "execution_unknown";
  const [outcome, setOutcome] =
    useState<ApprovalReconciliationOutcome>("still_unknown");
  const [checkedLocation, setCheckedLocation] = useState("");
  const [providerReference, setProviderReference] = useState("");
  const [note, setNote] = useState("");
  const submissionRef = useRef<{
    fingerprint: string;
    submission: ReconciliationSubmission;
  } | null>(null);

  function changeDraft(change: () => void) {
    submissionRef.current = null;
    change();
  }

  async function submit() {
    const normalized = {
      outcome,
      checkedLocation: checkedLocation.trim(),
      providerReference:
        outcome === "external_effect_observed"
          ? providerReference.trim()
          : null,
      note: note.trim()
    };
    const fingerprint = JSON.stringify(normalized);
    let prepared = submissionRef.current;
    if (!prepared || prepared.fingerprint !== fingerprint) {
      prepared = {
        fingerprint,
        submission: {
          ...normalized,
          observedAt: new Date().toISOString(),
          idempotencyKey: globalThis.crypto.randomUUID()
        }
      };
      submissionRef.current = prepared;
    }
    const succeeded = await onRecord(approval.id, prepared.submission);
    if (succeeded) {
      submissionRef.current = null;
      setOutcome("still_unknown");
      setCheckedLocation("");
      setProviderReference("");
      setNote("");
    }
  }

  const formValid =
    checkedLocation.trim().length >= 2 &&
    note.trim().length >= 10 &&
    (outcome !== "external_effect_observed" ||
      providerReference.trim().length > 0);

  return (
    <ApprovalCard
      approval={approval}
      icon={<TriangleAlert className={`h-4 w-4 shrink-0 ${unknown ? "text-amber-300" : "text-red-300"}`} aria-hidden />}
      className={unknown ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}
      statusOverride={unknown ? "Outcome unknown" : "Execution failed"}
    >
      <div className="w-full max-w-md space-y-3 lg:w-[25rem]">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">
            {unknown ? "Do not execute this request again" : "This request cannot run again"}
          </p>
          <p className="mt-1 leading-relaxed">
            {unknown
              ? "A one-shot execution claim was recorded without a final result. Verify the provider and Activity history before anyone prepares replacement work."
              : "Review the saved failure and provider evidence. Record what was checked before deciding whether separate replacement work is safe."}
          </p>
        </div>
        {canReconcile ? (
          <form
            className="space-y-3 rounded-lg border border-cyan-500/20 bg-[var(--surface-0)] p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (formValid) void submit();
            }}
          >
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Record a provider check
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                This adds an immutable receipt. It never edits the original approval or claims more than you observed.
              </p>
            </div>
            <label className="block">
              <span className="sb-label">What did you find?</span>
              <select
                className="sb-select mt-1.5"
                value={outcome}
                disabled={busy}
                onChange={(event) =>
                  changeDraft(() =>
                    setOutcome(event.target.value as ApprovalReconciliationOutcome)
                  )
                }
              >
                <option value="still_unknown">Still unknown — keep quarantined</option>
                <option value="external_effect_observed">External effect observed</option>
                <option value="no_external_effect_observed">No external effect found</option>
              </select>
            </label>
            <label className="block">
              <span className="sb-label">Where did you check?</span>
              <input
                required
                minLength={2}
                maxLength={300}
                className="sb-input mt-1.5"
                value={checkedLocation}
                disabled={busy}
                onChange={(event) =>
                  changeDraft(() => setCheckedLocation(event.target.value))
                }
                placeholder="Google Calendar, Drive search, Gmail, or another provider view"
              />
            </label>
            {outcome === "external_effect_observed" ? (
              <label className="block">
                <span className="sb-label">Provider reference</span>
                <input
                  required
                  maxLength={500}
                  className="sb-input mt-1.5"
                  value={providerReference}
                  disabled={busy}
                  onChange={(event) =>
                    changeDraft(() => setProviderReference(event.target.value))
                  }
                  placeholder="Calendar event ID, Drive URL, Gmail draft ID, or another stable reference"
                />
                <span className="mt-1 block text-xs text-[var(--text-muted)]">
                  A reference records what exists; it does not establish that the requested work succeeded.
                </span>
              </label>
            ) : null}
            <label className="block">
              <span className="sb-label">Review note</span>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                className="sb-input mt-1.5 min-h-24"
                value={note}
                disabled={busy}
                onChange={(event) =>
                  changeDraft(() => setNote(event.target.value))
                }
                placeholder="Describe the search, result, and what another band member should know."
              />
            </label>
            <button
              type="submit"
              className="sb-btn-primary min-h-11 w-full"
              disabled={busy || !formValid}
            >
              {busy ? "Recording check…" : "Record provider check"}
            </button>
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
              If the connection drops after submission, submitting the unchanged form again reuses the same receipt key.
            </p>
          </form>
        ) : (
          <ReadOnlyNote />
        )}
      </div>
    </ApprovalCard>
  );
}

function ResolvedReconciliationCard({
  approval
}: {
  approval: ApprovalLifecycleItem;
}) {
  const externalEffect =
    approval.lifecycleStage === "reconciled_external_effect";
  return (
    <ApprovalCard
      approval={approval}
      icon={
        externalEffect ? (
          <Info className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
        ) : (
          <CircleCheck className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
        )
      }
      className={
        externalEffect
          ? "border-amber-500/20 bg-amber-500/5"
          : "border-cyan-500/20 bg-cyan-500/5"
      }
      statusOverride={
        externalEffect
          ? "External effect observed"
          : "No external effect found"
      }
    >
      <div className="max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3 text-xs text-[var(--text-secondary)]">
        <p className="font-semibold text-[var(--text-primary)]">
          {externalEffect
            ? "Verify and link or repair manually"
            : "Separate new work may be prepared"}
        </p>
        <p className="mt-1 leading-relaxed">
          {externalEffect
            ? "Someone observed an outside object. The receipt does not prove the original request succeeded or link that object to StoryBoard, so no duplicate will be prepared automatically."
            : "Someone checked the provider and found no outside effect. The original request remains immutable and non-executable; a separate newly reviewed approval may now be prepared."}
        </p>
      </div>
    </ApprovalCard>
  );
}

function ApprovalCard({
  approval,
  icon,
  className,
  statusOverride,
  children
}: {
  approval: ApprovalLifecycleItem;
  icon: ReactNode;
  className: string;
  statusOverride?: string;
  children?: ReactNode;
}) {
  return (
    <SurfaceCard
      elevated
      className={className}
    >
      <article id={`approval-${approval.id}`} className="scroll-mt-6" aria-labelledby={`approval-title-${approval.id}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {icon}
              <h3 id={`approval-title-${approval.id}`} className="font-semibold text-[var(--text-primary)]">
                {approval.title}
              </h3>
              <Badge variant={approval.lifecycleStage === "failed_needs_reconciliation" ? "danger" : approval.lifecycleStage === "execution_unknown" ? "warning" : "neutral"}>
                {statusOverride ?? friendlyLabel(approval.status)}
              </Badge>
              <Badge variant="violet">{friendlyLabel(approval.actionType)}</Badge>
            </div>
            <ApprovalMetadata approval={approval} />
            <DeliverySummary approval={approval} />
            <ApprovalLinks approval={approval} />
            <ReconciliationHistory receipts={approval.reconciliations} />
            <PayloadPreview payload={approval.payload} title={approval.title} />
          </div>
          {children}
        </div>
      </article>
    </SurfaceCard>
  );
}

function ApprovalMetadata({ approval }: { approval: ApprovalLifecycleItem }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
      <div className="flex gap-1"><dt>Proposed</dt><dd>{formatDateTime(approval.createdAt)}{approval.proposedBy ? ` by ${approval.proposedBy}` : ""}</dd></div>
      {approval.approvedAt ? <div className="flex gap-1"><dt>Approved</dt><dd>{formatDateTime(approval.approvedAt)}{approval.approvedBy ? ` by ${approval.approvedBy}` : ""}</dd></div> : null}
      {approval.executionAttemptedAt ? <div className="flex gap-1"><dt>Attempted</dt><dd>{formatDateTime(approval.executionAttemptedAt)}</dd></div> : null}
    </dl>
  );
}

function DeliverySummary({ approval }: { approval: ApprovalLifecycleItem }) {
  const summary = approval.deliverySummary;
  const payload = isRecord(approval.payload) ? approval.payload : null;
  const chips: string[] = [];
  if (payload?.dryRunPreview != null) chips.push("dry-run preview saved");
  if (payload?.executionResult != null) chips.push("provider result saved");
  if (payload?.executionError != null) chips.push(`error: ${shortText(payload.executionError)}`);
  if (summary?.total) {
    for (const key of ["sent", "drafted", "failed", "unknown", "sending", "pending"] as const) {
      if (summary[key] > 0) chips.push(`${summary[key]} ${key}`);
    }
  }
  if (!chips.length) return null;
  return <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((chip) => <span key={chip} className="rounded-md bg-[var(--surface-0)] px-2 py-1 font-mono text-[10px] text-[var(--text-secondary)]">{chip}</span>)}</div>;
}

function ApprovalLinks({ approval }: { approval: ApprovalLifecycleItem }) {
  const links = [
    approval.eventId ? { href: `/operations/events/${approval.eventId}`, label: "Open event" } : null,
    approval.campaignId ? { href: "/booking-campaigns", label: "Open campaign" } : null,
    approval.opportunityId ? { href: "/booking", label: "Open booking" } : null,
    approval.managerRecommendationId ? { href: "/manager", label: "Open Manager" } : null
  ].filter((link): link is { href: string; label: string } => link !== null);
  if (!links.length) return null;
  return <div className="mt-3 flex flex-wrap gap-2">{links.map((link) => <a key={`${link.href}-${link.label}`} className="sb-btn-secondary min-h-11" href={link.href}>{link.label}</a>)}</div>;
}

function ReconciliationHistory({
  receipts
}: {
  receipts: ApprovalReconciliation[];
}) {
  if (!receipts.length) return null;
  return (
    <section className="mt-4 rounded-[var(--radius-lg)] border border-cyan-500/20 bg-cyan-500/5 p-4" aria-label="Append-only reconciliation history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-cyan-100">
          Provider-check history
        </h4>
        <Badge variant="accent">append-only · {receipts.length}</Badge>
      </div>
      <ol className="mt-3 space-y-3">
        {receipts.map((receipt) => {
          const evidence = reconciliationEvidence(receipt.evidence);
          return (
            <li key={receipt.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={reconciliationOutcomeVariant(receipt.outcome)}>
                  {reconciliationOutcomeLabel(receipt.outcome)}
                </Badge>
                <span className="text-[11px] text-[var(--text-muted)]">
                  Observed {formatDateTime(receipt.observedAt)}
                  {receipt.actorLabel ? ` by ${receipt.actorLabel}` : ""}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-secondary)]">
                {receipt.note}
              </p>
              {evidence.checkedLocation ? (
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  Checked: <span className="text-[var(--text-secondary)]">{evidence.checkedLocation}</span>
                </p>
              ) : null}
              {evidence.providerReference ? (
                <p className="mt-1 break-all text-[11px] text-[var(--text-muted)]">
                  Provider reference: <code className="text-[var(--text-secondary)]">{evidence.providerReference}</code>
                </p>
              ) : null}
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                Receipt recorded {formatDateTime(receipt.createdAt)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PayloadPreview({ payload, title }: { payload: unknown; title: string }) {
  return (
    <details className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)]">
      <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-[var(--text-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
        Review exact request payload for {title}
      </summary>
      <pre className="max-h-64 overflow-auto border-t border-[var(--border)] p-4 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

function ReadOnlyNote() {
  return <p className="max-w-48 text-xs leading-relaxed text-[var(--text-muted)]">Read-only access. An owner or member must make this transition.</p>;
}

function reconciliationEvidence(value: unknown) {
  if (!isRecord(value)) {
    return { checkedLocation: null, providerReference: null };
  }
  return {
    checkedLocation:
      typeof value.checkedLocation === "string" ? value.checkedLocation : null,
    providerReference:
      typeof value.providerReference === "string"
        ? value.providerReference
        : null
  };
}

function reconciliationOutcomeLabel(outcome: ApprovalReconciliationOutcome) {
  if (outcome === "still_unknown") return "Still unknown";
  if (outcome === "external_effect_observed") return "External effect observed";
  return "No external effect found";
}

function reconciliationOutcomeVariant(
  outcome: ApprovalReconciliationOutcome
): "warning" | "accent" | "neutral" {
  if (outcome === "still_unknown") return "warning";
  if (outcome === "external_effect_observed") return "accent";
  return "neutral";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function shortText(value: unknown) {
  const text = String(value);
  return text.length > 96 ? `${text.slice(0, 96)}…` : text;
}

function friendlyLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "time unavailable" : date.toLocaleString();
}
