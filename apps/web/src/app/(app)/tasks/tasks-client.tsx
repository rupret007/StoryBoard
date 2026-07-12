"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { CheckCircle2, CircleAlert, Link2, ListTodo, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BandMember, BookingOpportunity, Task } from "@/lib/types";

const STATUSES = ["todo", "in_progress", "blocked", "done"] as const;

export function TasksClient({
  initialTasks,
  opportunities,
  members
}: {
  initialTasks: Task[];
  opportunities: BookingOpportunity[];
  members: BandMember[];
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const grouped = useMemo(() => {
    const blocked: Task[] = [];
    const overdue: Task[] = [];
    const open: Task[] = [];
    const done: Task[] = [];
    for (const t of initialTasks) {
      if (t.status === "done") {
        done.push(t);
        continue;
      }
      if (t.status === "blocked") {
        blocked.push(t);
        continue;
      }
      if (t.dueAt && new Date(t.dueAt) < now) {
        overdue.push(t);
      } else {
        open.push(t);
      }
    }
    return { blocked, overdue, open, done };
  }, [initialTasks, now]);

  const [title, setTitle] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [bandMemberId, setBandMemberId] = useState("");
  const [busy, setBusy] = useState(false);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/tasks", {
        method: "POST",
        json: {
          title: title.trim(),
          opportunityId: opportunityId || undefined,
          dueAt: dueAt || undefined,
          bandMemberId: bandMemberId || null
        }
      });
      setTitle("");
      setOpportunityId("");
      setDueAt("");
      setBandMemberId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <SurfaceCard>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          New follow-up
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Every real commitment needs an owner and a credible date. If work is
          blocked, record why and who the band is waiting on.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-4"
          onSubmit={(ev) => void createTask(ev)}
        >
          <label className="sm:col-span-4">
            <span className="sb-label">Title</span>
            <input
              required
              className="sb-input mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            <span className="sb-label">Owner</span>
            <select className="sb-select mt-1.5" value={bandMemberId} onChange={(e) => setBandMemberId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          <label>
            <span className="sb-label">Opportunity</span>
            <select
              className="sb-select mt-1.5"
              value={opportunityId}
              onChange={(e) => setOpportunityId(e.target.value)}
            >
              <option value="">None</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sb-label">Due date</span>
            <input
              type="date"
              className="sb-input mt-1.5"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={busy} className="sb-btn-primary">
              Create task
            </button>
          </div>
        </form>
      </SurfaceCard>

      {initialTasks.length === 0 ? (
        <EmptyState
          title="No tasks"
          description="Create follow-ups so dashboard and summaries can surface what needs attention."
          icon={<ListTodo className="h-6 w-6" />}
        />
      ) : (
        <div className="space-y-6">
          <TaskSection
            title="Blocked"
            subtitle="Cannot move until a recorded blocker is resolved"
            tasks={grouped.blocked}
            tone="danger"
            onSaved={() => router.refresh()}
            members={members}
            allTasks={initialTasks}
          />
          <TaskSection
            title="Overdue"
            subtitle="Due date in the past, not done"
            tasks={grouped.overdue}
            tone="warning"
            onSaved={() => router.refresh()}
            members={members}
            allTasks={initialTasks}
          />
          <TaskSection
            title="Open"
            subtitle="Upcoming or no due date"
            tasks={grouped.open}
            tone="neutral"
            onSaved={() => router.refresh()}
            members={members}
            allTasks={initialTasks}
          />
          <TaskSection
            title="Done"
            subtitle="Completed"
            tasks={grouped.done}
            tone="success"
            onSaved={() => router.refresh()}
            members={members}
            allTasks={initialTasks}
          />
        </div>
      )}
    </div>
  );
}

function TaskSection({
  title,
  subtitle,
  tasks,
  tone,
  onSaved,
  members,
  allTasks
}: {
  title: string;
  subtitle: string;
  tasks: Task[];
  tone: "danger" | "warning" | "neutral" | "success";
  onSaved: () => void;
  members: BandMember[];
  allTasks: Task[];
}) {
  if (tasks.length === 0) {
    return null;
  }
  const border =
    tone === "danger"
      ? "border-red-500/20"
      : tone === "warning"
        ? "border-amber-500/20"
      : tone === "success"
        ? "border-emerald-500/20"
        : "border-[var(--border)]";

  return (
    <SurfaceCard className={border}>
      <div className="mb-4 flex items-center gap-2">
        {tone === "danger" ? (
          <CircleAlert className="h-4 w-4 text-red-400" />
        ) : tone === "warning" ? (
          <CircleAlert className="h-4 w-4 text-amber-400" />
        ) : tone === "success" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <ListTodo className="h-4 w-4 text-[var(--accent)]" />
        )}
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <Badge variant={tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "success" ? "success" : "neutral"} className="ml-auto">
          {tasks.length}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1420px] text-left text-sm">
          <thead className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="pb-2 pr-4">Task</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Owner</th>
              <th className="pb-2 pr-4">Due</th>
              <th className="pb-2 pr-4">Waiting on</th>
              <th className="pb-2 pr-4">Blocker</th>
              <th className="pb-2 pr-4">Prerequisites</th>
              <th className="pb-2 pr-4">Opportunity</th>
              <th className="pb-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onSaved={onSaved} members={members} allTasks={allTasks} />
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}

function TaskRow({
  task: t,
  onSaved,
  members,
  allTasks
}: {
  task: Task;
  onSaved: () => void;
  members: BandMember[];
  allTasks: Task[];
}) {
  const savedOwnerValue = t.bandMemberId ?? (t.ownerLabel ? `legacy:${t.ownerLabel}` : "");
  const [status, setStatus] = useState(t.status);
  const [ownerValue, setOwnerValue] = useState(savedOwnerValue);
  const [dueAt, setDueAt] = useState(t.dueAt?.slice(0, 10) ?? "");
  const [waitingOn, setWaitingOn] = useState(t.waitingOn ?? "");
  const [blockedReason, setBlockedReason] = useState(t.blockedReason ?? "");
  const [prerequisiteTaskId, setPrerequisiteTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(t.status);
    setOwnerValue(savedOwnerValue);
    setDueAt(t.dueAt?.slice(0, 10) ?? "");
    setWaitingOn(t.waitingOn ?? "");
    setBlockedReason(t.blockedReason ?? "");
  }, [t.status, t.bandMemberId, t.ownerLabel, t.dueAt, t.waitingOn, t.blockedReason, savedOwnerValue]);

  const changed = status !== t.status || ownerValue !== savedOwnerValue || dueAt !== (t.dueAt?.slice(0, 10) ?? "") || waitingOn !== (t.waitingOn ?? "") || (status === "blocked" ? blockedReason !== (t.blockedReason ?? "") : Boolean(t.blockedReason));

  async function save() {
    if (!changed || (status === "blocked" && !blockedReason.trim())) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/tasks/${t.id}`, {
        method: "PATCH",
        json: { status, ...(ownerValue !== savedOwnerValue ? { bandMemberId: ownerValue && !ownerValue.startsWith("legacy:") ? ownerValue : null } : {}), dueAt: dueAt || null, waitingOn: status === "done" ? null : waitingOn.trim() || null, blockedReason: status === "blocked" ? blockedReason.trim() : null }
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task update failed");
    } finally {
      setBusy(false);
    }
  }

  async function addPrerequisite() {
    if (!prerequisiteTaskId) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/tasks/${t.id}/prerequisites`, { method: "POST", json: { prerequisiteTaskId } });
      setPrerequisiteTaskId("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add prerequisite");
    } finally {
      setBusy(false);
    }
  }

  async function removePrerequisite(id: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/tasks/${t.id}/prerequisites/${id}`, { method: "DELETE" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove prerequisite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-3 pr-4 text-[var(--text-primary)]">{t.title}</td>
      <td className="py-3 pr-4">
        <select
          className="sb-select py-1.5 text-xs"
          aria-label={`Status for ${t.title}`}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </td>
      <td className="py-3 pr-4">
        <select className="sb-select py-1.5 text-xs" aria-label={`Owner for ${t.title}`} value={ownerValue} onChange={(e) => setOwnerValue(e.target.value)}>
          <option value="">Unassigned</option>
          {t.ownerLabel && !t.bandMemberId ? <option value={`legacy:${t.ownerLabel}`}>{t.ownerLabel} (legacy label)</option> : null}
          {members.map((member) => <option key={member.id} value={member.id} disabled={!member.active}>{member.name}{member.active ? "" : " (inactive)"}</option>)}
        </select>
      </td>
      <td className="py-3 pr-4 tabular-nums text-[var(--text-secondary)]">
        <input className="sb-input min-w-36 py-1.5 text-xs" type="date" aria-label={`Due date for ${t.title}`} value={dueAt} disabled={status === "done"} onChange={(event) => setDueAt(event.target.value)} />
        {t.deferralCount ? <span className="mt-1 block text-[10px] text-amber-300">Deferred {t.deferralCount}×</span> : null}
      </td>
      <td className="py-3 pr-4">
        <input className="sb-input min-w-40 py-1.5 text-xs" aria-label={`Waiting on for ${t.title}`} value={waitingOn} disabled={status === "done"} maxLength={240} onChange={(event) => setWaitingOn(event.target.value)} placeholder="Person or organization" />
      </td>
      <td className="py-3 pr-4">
        {status === "blocked" ? <input className="sb-input min-w-56 py-1.5 text-xs" aria-label={`Blocker for ${t.title}`} value={blockedReason} required maxLength={1000} onChange={(event) => setBlockedReason(event.target.value)} placeholder="What prevents the next step?" /> : <span className="text-[var(--text-muted)]">—</span>}
      </td>
      <td className="py-3 pr-4">
        <div className="min-w-64 space-y-2">
          {(t.prerequisites ?? []).map((dependency) => <div key={dependency.id} className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs"><Link2 className="h-3 w-3 shrink-0 text-[var(--accent)]" /><span className="min-w-0 flex-1 truncate">{dependency.prerequisiteTask.title}</span><Badge variant={dependency.prerequisiteTask.status === "done" ? "success" : "warning"}>{dependency.prerequisiteTask.status.replace("_", " ")}</Badge><button type="button" className="rounded p-0.5 hover:bg-[var(--surface-1)]" aria-label={`Remove prerequisite ${dependency.prerequisiteTask.title} from ${t.title}`} disabled={busy} onClick={() => void removePrerequisite(dependency.prerequisiteTaskId)}><X className="h-3.5 w-3.5" /></button></div>)}
          {status !== "done" ? <div className="flex gap-1"><select className="sb-select min-w-0 flex-1 py-1.5 text-xs" aria-label={`Prerequisite for ${t.title}`} value={prerequisiteTaskId} onChange={(event) => setPrerequisiteTaskId(event.target.value)}><option value="">Add prerequisite…</option>{allTasks.filter((candidate) => candidate.id !== t.id && !(t.prerequisites ?? []).some((dependency) => dependency.prerequisiteTaskId === candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}{candidate.status === "done" ? " (done)" : ""}</option>)}</select><button type="button" className="sb-btn-ghost px-2 py-1.5 text-xs" disabled={busy || !prerequisiteTaskId} onClick={() => void addPrerequisite()}>Add</button></div> : null}
        </div>
      </td>
      <td className="py-3 pr-4 text-[var(--text-muted)]">
        {t.opportunity?.title ?? "—"}
      </td>
      <td className="py-3">
        <button
          type="button"
          disabled={busy || !changed || (status === "blocked" && !blockedReason.trim())}
          onClick={() => void save()}
          className="sb-btn-secondary py-1.5 text-xs disabled:opacity-40"
        >
          Save
        </button>
        {error ? <p className="mt-1 max-w-40 text-[10px] text-red-300" role="alert">{error}</p> : null}
      </td>
    </tr>
  );
}
