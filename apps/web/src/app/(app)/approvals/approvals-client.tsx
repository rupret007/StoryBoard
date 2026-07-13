"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { Play, Shield, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ApprovalRequest } from "@/lib/types";

export function ApprovalsClient({
  initialPending,
  initialReadyToExecute
}: {
  initialPending: ApprovalRequest[];
  initialReadyToExecute: ApprovalRequest[];
}) {
  const router = useRouter();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/approvals/${id}/approve`, { method: "POST" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/approvals/${id}/reject`, {
        method: "POST",
        json: { reason: reason || undefined }
      });
      setRejectId(null);
      setReason("");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function executeApproval(id: string, dryRun: boolean) {
    setBusyId(id);
    try {
      await apiFetch(`/approvals/${id}/execute`, {
        method: "POST",
        json: dryRun ? { dryRun: true } : {}
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (
    initialPending.length === 0 &&
    initialReadyToExecute.length === 0
  ) {
    return (
      <EmptyState
        title="No approvals to act on"
        description="When commands draft outreach or checklists, StoryBoard stops here — nothing risky runs until you decide. Approved email batches appear below when ready to execute."
        icon={<ShieldCheck className="h-6 w-6" />}
      />
    );
  }

  return (
    <div className="space-y-10">
      {initialPending.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Pending review
          </h2>
          {initialPending.map((a) => (
            <SurfaceCard
              key={a.id}
              elevated
              className="border-violet-500/20 bg-[var(--surface-2)]/90"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Shield className="h-4 w-4 shrink-0 text-violet-300" />
                    <h3 className="font-semibold text-[var(--text-primary)]">
                      {a.title}
                    </h3>
                    <Badge variant="violet">{a.status}</Badge>
                    <Badge variant="neutral">{a.actionType}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Proposed by {a.proposedBy ?? "—"}
                  </p>
                  <ApprovalEventLink eventId={a.eventId} />
                  <PayloadPreview payload={a.payload} />
                </div>
                <div className="flex shrink-0 flex-col gap-2 lg:items-stretch lg:w-48">
                  {rejectId === a.id ? (
                    <>
                      <input
                        className="sb-input text-xs"
                        placeholder="Reason (optional)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => void reject(a.id)}
                        className="rounded-lg bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-200 ring-1 ring-red-500/25 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectId(null);
                          setReason("");
                        }}
                        className="sb-btn-ghost text-xs"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => void approve(a.id)}
                        className="rounded-lg bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={() => setRejectId(a.id)}
                        className="sb-btn-secondary"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </SurfaceCard>
          ))}
        </section>
      ) : null}

      {initialReadyToExecute.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Approved — ready to run
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Execution runs approved provider actions (Gmail drafts, explicitly
            approved email sends, calendar holds, or Drive folders — mock or
            real per integration). Use dry run to preview without calling
            providers.
          </p>
          {initialReadyToExecute.map((a) => (
            <SurfaceCard
              key={a.id}
              elevated
              className="border-cyan-500/20 bg-[var(--surface-2)]/90"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Play className="h-4 w-4 shrink-0 text-cyan-300" />
                    <h3 className="font-semibold text-[var(--text-primary)]">
                      {a.title}
                    </h3>
                    <Badge variant="neutral">{a.status}</Badge>
                    <Badge variant="violet">{a.actionType}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    Approved by {a.approvedBy ?? "—"}
                  </p>
                  <ApprovalEventLink eventId={a.eventId} />
                  <ExecutionStatusChips payload={a.payload} />
                  <PayloadPreview payload={a.payload} />
                </div>
                <div className="flex shrink-0 flex-col gap-2 lg:items-stretch lg:w-48">
                  <button
                    type="button"
                    disabled={busyId === a.id}
                    onClick={() => void executeApproval(a.id, false)}
                    className="rounded-lg bg-cyan-500/15 px-4 py-2.5 text-sm font-semibold text-cyan-100 ring-1 ring-cyan-500/35 hover:bg-cyan-500/25 disabled:opacity-50"
                  >
                    Execute
                  </button>
                  <button
                    type="button"
                    disabled={busyId === a.id}
                    onClick={() => void executeApproval(a.id, true)}
                    className="sb-btn-secondary text-xs"
                  >
                    Dry run (preview)
                  </button>
                </div>
              </div>
            </SurfaceCard>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function ApprovalEventLink({ eventId }: { eventId: string | null | undefined }) {
  if (!eventId) {
    return null;
  }
  return (
    <a
      className="sb-btn-secondary mt-3 w-fit"
      href={`/operations/events/${eventId}`}
    >
      Open event
    </a>
  );
}

function ExecutionStatusChips({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (p.dryRunPreview != null) {
    parts.push("dry-run preview");
  }
  if (p.executionAttemptedAt != null) {
    parts.push(`attempted`);
  }
  if (p.executionResult != null) {
    parts.push("succeeded");
  }
  if (p.executionError != null) {
    parts.push(
      `failed: ${String(p.executionError).slice(0, 72)}${String(p.executionError).length > 72 ? "…" : ""}`
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {parts.map((t, i) => (
        <span
          key={`${i}-${t.slice(0, 24)}`}
          className="rounded-md bg-[var(--surface-0)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent)]"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function PayloadPreview({ payload }: { payload: unknown }) {
  return (
    <pre className="mt-4 max-h-48 overflow-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] p-4 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap break-words">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
