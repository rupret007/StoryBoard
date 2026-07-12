"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { CheckCircle2, CircleAlert, ListTodo } from "lucide-react";
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
    const overdue: Task[] = [];
    const open: Task[] = [];
    const done: Task[] = [];
    for (const t of initialTasks) {
      if (t.status === "done") {
        done.push(t);
        continue;
      }
      if (t.dueAt && new Date(t.dueAt) < now) {
        overdue.push(t);
      } else {
        open.push(t);
      }
    }
    return { overdue, open, done };
  }, [initialTasks, now]);

  const [title, setTitle] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [ownerLabel, setOwnerLabel] = useState("");
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
          ownerLabel: ownerLabel || undefined
        }
      });
      setTitle("");
      setOpportunityId("");
      setDueAt("");
      setOwnerLabel("");
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
          Tie tasks to opportunities. Overdue uses the due date; stale follow-ups
          use last update (see weekly summary).
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
            <select className="sb-select mt-1.5" value={ownerLabel} onChange={(e) => setOwnerLabel(e.target.value)}>
              <option value="">Unassigned</option>
              {members.filter((member) => member.active).map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}
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
            title="Overdue"
            subtitle="Due date in the past, not done"
            tasks={grouped.overdue}
            tone="danger"
            onSaved={() => router.refresh()}
            ownerOptions={members.filter((member) => member.active).map((member) => member.name)}
          />
          <TaskSection
            title="Open"
            subtitle="Upcoming or no due date"
            tasks={grouped.open}
            tone="neutral"
            onSaved={() => router.refresh()}
            ownerOptions={members.filter((member) => member.active).map((member) => member.name)}
          />
          <TaskSection
            title="Done"
            subtitle="Completed"
            tasks={grouped.done}
            tone="success"
            onSaved={() => router.refresh()}
            ownerOptions={members.filter((member) => member.active).map((member) => member.name)}
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
  ownerOptions
}: {
  title: string;
  subtitle: string;
  tasks: Task[];
  tone: "danger" | "neutral" | "success";
  onSaved: () => void;
  ownerOptions: string[];
}) {
  if (tasks.length === 0) {
    return null;
  }
  const border =
    tone === "danger"
      ? "border-red-500/20"
      : tone === "success"
        ? "border-emerald-500/20"
        : "border-[var(--border)]";

  return (
    <SurfaceCard className={border}>
      <div className="mb-4 flex items-center gap-2">
        {tone === "danger" ? (
          <CircleAlert className="h-4 w-4 text-red-400" />
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
        <Badge variant={tone === "danger" ? "danger" : tone === "success" ? "success" : "neutral"} className="ml-auto">
          {tasks.length}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="pb-2 pr-4">Task</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Owner</th>
              <th className="pb-2 pr-4">Due</th>
              <th className="pb-2 pr-4">Opportunity</th>
              <th className="pb-2 w-24" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} onSaved={onSaved} ownerOptions={ownerOptions} />
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
  ownerOptions
}: {
  task: Task;
  onSaved: () => void;
  ownerOptions: string[];
}) {
  const [status, setStatus] = useState(t.status);
  const [ownerLabel, setOwnerLabel] = useState(t.ownerLabel ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(t.status);
    setOwnerLabel(t.ownerLabel ?? "");
  }, [t.status, t.ownerLabel]);

  async function save() {
    if (status === t.status && ownerLabel === (t.ownerLabel ?? "")) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/tasks/${t.id}`, {
        method: "PATCH",
        json: { status, ownerLabel: ownerLabel.trim() || null }
      });
      onSaved();
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
        <select className="sb-select py-1.5 text-xs" aria-label={`Owner for ${t.title}`} value={ownerLabel} onChange={(e) => setOwnerLabel(e.target.value)}>
          <option value="">Unassigned</option>
          {[...new Set([...(t.ownerLabel ? [t.ownerLabel] : []), ...ownerOptions])].map((owner) => <option key={owner} value={owner}>{owner}</option>)}
        </select>
      </td>
      <td className="py-3 pr-4 tabular-nums text-[var(--text-secondary)]">
        {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "—"}
      </td>
      <td className="py-3 pr-4 text-[var(--text-muted)]">
        {t.opportunity?.title ?? "—"}
      </td>
      <td className="py-3">
        <button
          type="button"
          disabled={busy || (status === t.status && ownerLabel === (t.ownerLabel ?? ""))}
          onClick={() => void save()}
          className="sb-btn-secondary py-1.5 text-xs disabled:opacity-40"
        >
          Save
        </button>
      </td>
    </tr>
  );
}
