"use client";

import { Badge, SurfaceCard } from "@storyboard/ui";
import { describeTaskDueDate } from "@storyboard/shared";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Task } from "@/lib/types";

export function MyTasks({ artistId, tasks, canManage, onSaved }: { artistId: string; tasks: Task[]; canManage: boolean; onSaved: () => void }) {
  const open = tasks.filter((task) => task.status !== "done");
  return <section className="space-y-3" aria-label="My tasks">
    {!open.length ? <p className="text-sm text-[var(--text-muted)]">No open tasks are assigned to you. All band tasks remain available.</p> : null}
    {open.map((task) => <MyTask key={task.id} artistId={artistId} task={task} canManage={canManage} onSaved={onSaved} />)}
  </section>;
}

function MyTask({ artistId, task, canManage, onSaved }: { artistId: string; task: Task; canManage: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const due = describeTaskDueDate(task.dueAt);
  const waiting = (task.prerequisites ?? []).filter((item) => item.prerequisiteTask.status !== "done");
  async function setStatus(status: "in_progress" | "done") {
    setBusy(true); setError("");
    try { await apiFetch(`/tasks/${task.id}`, { method: "PATCH", artistId, json: { status } }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Task update failed"); }
    finally { setBusy(false); }
  }
  return <SurfaceCard>
    <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{task.title}</h2><Badge variant={task.status === "blocked" ? "danger" : "neutral"}>{task.status.replaceAll("_", " ")}</Badge></div>
    <p className="mt-2 text-sm text-[var(--text-muted)]">{due ? `${due.label}${due.timing === "past" ? " (overdue)" : due.timing === "today" ? " (today)" : ""}` : "No due date recorded"}</p>
    {task.blockedReason ? <p className="mt-2 text-sm">Blocked: {task.blockedReason}</p> : null}
    {task.waitingOn ? <p className="mt-2 text-sm">Waiting on: {task.waitingOn}</p> : null}
    {waiting.length ? <p className="mt-2 text-sm">First finish: {waiting.map((item) => item.prerequisiteTask.title).join(", ")}</p> : null}
    {canManage ? <div className="mt-4 flex flex-wrap gap-2">
      {task.status === "todo" ? <button type="button" className="sb-btn-secondary" disabled={busy || waiting.length > 0} onClick={() => void setStatus("in_progress")}>Start task</button> : null}
      <button type="button" className="sb-btn-primary" disabled={busy || waiting.length > 0 || task.status === "blocked"} onClick={() => void setStatus("done")}>Mark done</button>
      {task.status === "blocked" ? <p className="text-sm text-[var(--text-muted)]">Resolve the blocker in All band tasks before marking this done.</p> : null}
    </div> : null}
    {error ? <p className="mt-2 text-sm text-red-300" role="alert">{error}</p> : null}
  </SurfaceCard>;
}
