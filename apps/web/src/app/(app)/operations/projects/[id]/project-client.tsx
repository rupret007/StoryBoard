"use client";

import { Badge, SurfaceCard } from "@storyboard/ui";
import { ArrowLeft, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BandMember, ProjectReadinessResponse } from "@/lib/types";
import { describeTaskDueDate } from "@storyboard/shared";

function dateInput(value?: string | null) { return value ? new Date(value).toISOString().slice(0, 10) : ""; }
function dollars(value?: number | null) { return value == null ? "" : (value / 100).toFixed(2); }
function money(value: number | null | undefined, currency: string) { return value == null ? "Not recorded" : `${currency} ${(value / 100).toFixed(2)}`; }

export function ProjectClient({ artistId, initialData, members, accessState }: { artistId: string; initialData: ProjectReadinessResponse; members: BandMember[]; accessState: "manage" | "read_only" | "unavailable" }) {
  const { project, readiness } = initialData;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(project.status);
  const [dueAt, setDueAt] = useState(dateInput(project.dueAt));
  const [description, setDescription] = useState(project.description ?? "");
  const [budget, setBudget] = useState(dollars(project.budgetMinor));
  const [metrics, setMetrics] = useState((project.successMetrics ?? []).join("\n"));
  const [assetLabel, setAssetLabel] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneOwner, setMilestoneOwner] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("");
  const router = useRouter();
  const canManage = accessState === "manage";
  async function mutate(key: string, path: string, json: unknown, method = "POST") {
    if (!canManage) { setError("Project changes are disabled until StoryBoard can verify member or owner access."); return false; }
    setBusy(key); setError("");
    try { await apiFetch(path, { method, artistId, json }); router.refresh(); return true; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The update failed"); return false; }
    finally { setBusy(null); }
  }
  async function addMilestone() {
    if (!milestoneTitle.trim()) return;
    const saved = await mutate("milestone", "/tasks", { projectId: project.id, title: milestoneTitle.trim(), bandMemberId: milestoneOwner || null, dueAt: milestoneDue || null });
    if (saved) { setMilestoneTitle(""); setMilestoneOwner(""); setMilestoneDue(""); }
  }
  async function addAsset() {
    if (!assetLabel.trim() || !assetUrl.trim()) return;
    const saved = await mutate("asset", `/projects/${project.id}`, { assets: [...(project.assets ?? []), { label: assetLabel.trim(), url: assetUrl.trim() }] }, "PATCH");
    if (saved) { setAssetLabel(""); setAssetUrl(""); }
  }
  const completion = readiness.totalMilestones ? Math.round(readiness.completedMilestones / readiness.totalMilestones * 100) : 0;
  return <div className="space-y-5 pb-12">
    <div className="flex flex-wrap items-center justify-between gap-3"><a className="sb-btn-ghost" href="/operations"><ArrowLeft className="h-4 w-4" /> Band operations</a><button className="sb-btn-secondary" type="button" onClick={() => router.refresh()}><RefreshCw className="h-4 w-4" /> Refresh</button></div>
    {accessState === "read_only" ? <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm text-[var(--text-muted)]">You have read-only access to this project. An owner or member can change milestones, facts, budgets, and assets.</p> : accessState === "unavailable" ? <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">Your project permissions could not be verified. Changes are disabled until you refresh.</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p> : null}
    <fieldset className="m-0 min-w-0 space-y-5 border-0 p-0" disabled={!canManage} aria-disabled={!canManage}>
    <SurfaceCard><div className="flex flex-wrap items-center gap-2"><Badge variant={readiness.status === "on_track" || readiness.status === "complete" ? "success" : readiness.status === "closed" ? "neutral" : readiness.status === "blocked" || readiness.status === "off_track" ? "danger" : "warning"}>{readiness.status.replaceAll("_", " ")}</Badge><span className="text-xl font-semibold">{readiness.score}/100</span><span className="text-xs text-[var(--text-muted)]">{Math.round(readiness.confidence * 100)}% record confidence</span></div><h2 className="mt-4 text-xl font-semibold">{readiness.headline}</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">{readiness.nextAction}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${completion}%` }} /></div><p className="mt-1 text-xs text-[var(--text-muted)]">{readiness.completedMilestones}/{readiness.totalMilestones} milestones complete · {readiness.overdueMilestones} overdue · {readiness.blockedMilestones} blocked</p>{readiness.gaps[0] ? <p className="mt-3 text-xs text-[var(--text-muted)]">First gap: {readiness.gaps[0].detail}</p> : null}</SurfaceCard>

    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]"><SurfaceCard><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Milestone plan</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Add known steps now. A target date lets StoryBoard suggest a sequence.</p><a href="/tasks" className="mt-1 inline-block text-xs text-[var(--accent)] underline">Set or resolve blockers in Tasks</a></div><button className="sb-btn-secondary" disabled={busy !== null || !project.dueAt} onClick={() => void mutate("generate", `/projects/${project.id}/generate-plan`, {})}>Generate missing milestones</button></div>
      <form aria-label="Add project milestone" className="mt-4 space-y-3 rounded-lg border border-[var(--border)] p-3" onSubmit={(submit) => { submit.preventDefault(); void addMilestone(); }}>
        <label className="block"><span className="sb-label">Milestone title</span><input required className="sb-input mt-1.5 w-full" value={milestoneTitle} disabled={busy !== null} onChange={(change) => setMilestoneTitle(change.target.value)} placeholder="Finish the video or review the draft" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label><span className="sb-label">Milestone owner (optional)</span><select className="sb-select mt-1.5 w-full" value={milestoneOwner} disabled={busy !== null} onChange={(change) => setMilestoneOwner(change.target.value)}><option value="">Unassigned</option>{members.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label><span className="sb-label">Milestone due date (optional)</span><input className="sb-input mt-1.5 w-full" type="date" value={milestoneDue} disabled={busy !== null} onChange={(change) => setMilestoneDue(change.target.value)} /></label></div>
        <button className="sb-btn-secondary" disabled={busy !== null || !milestoneTitle.trim()}><Plus className="h-4 w-4" /> Add milestone</button>
      </form><div className="mt-4 space-y-2">{project.tasks?.map((task) => <div key={task.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className={task.status === "done" ? "text-sm text-[var(--text-muted)] line-through" : "text-sm font-medium"}>{task.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{(() => { const due = describeTaskDueDate(task.dueAt); if (!due) return "No date"; const flag = due.timing === "past" && task.status !== "done" ? " (overdue)" : due.timing === "today" ? " (today)" : ""; return `Due ${due.label}${flag}`; })()}</p></div>{task.status === "done" ? <Badge variant="success">done</Badge> : null}</div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px]"><select aria-label={`Owner for project milestone ${task.title}`} className="sb-select" value={task.bandMemberId ?? (task.ownerLabel ? `legacy:${task.ownerLabel}` : "")} disabled={busy !== null} onChange={(change) => void mutate(`owner-${task.id}`, `/tasks/${task.id}`, { bandMemberId: change.target.value && !change.target.value.startsWith("legacy:") ? change.target.value : null }, "PATCH")}><option value="">Unassigned</option>{task.ownerLabel && !task.bandMemberId ? <option value={`legacy:${task.ownerLabel}`}>{task.ownerLabel} (legacy label)</option> : null}{members.map((member) => <option key={member.id} value={member.id} disabled={!member.active}>{member.name}{member.active ? "" : " (inactive)"}</option>)}</select><select aria-label={`Status for project milestone ${task.title}`} className="sb-select" value={task.status} disabled={busy !== null || task.status === "blocked"} onChange={(change) => void mutate(`status-${task.id}`, `/tasks/${task.id}`, { status: change.target.value }, "PATCH")}>{["todo", "in_progress", "done"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}{task.status === "blocked" ? <option value="blocked" disabled>blocked</option> : null}</select></div>{task.status === "blocked" ? <p className="mt-2 text-sm text-[var(--text-muted)]">Blocked: {task.blockedReason || "No reason recorded"}. <a href="/tasks" className="text-[var(--accent)] underline">Resolve the blocker in Tasks</a>.</p> : null}</div>)}{!project.tasks?.length ? <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No milestones yet. Add the next step now; a target date is optional. Generate a suggested sequence when the date is known.</p> : null}</div></SurfaceCard>
      <div className="space-y-5"><SurfaceCard><h2 className="font-semibold">Project facts</h2><form className="mt-4 space-y-3" onSubmit={(submit) => { submit.preventDefault(); void mutate("project", `/projects/${project.id}`, { status, description: description || null, dueAt: dueAt ? new Date(`${dueAt}T12:00:00`).toISOString() : null, budgetMinor: budget === "" ? null : Math.round(Number(budget) * 100), successMetrics: metrics.split("\n").map((item) => item.trim()).filter(Boolean) }, "PATCH"); }}><label><span className="sb-label">Status</span><select aria-label="Project status" className="sb-select mt-1.5" value={status} onChange={(change) => setStatus(change.target.value)}>{["draft", "active", "paused", "completed", "cancelled"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span className="sb-label">Target date</span><input aria-label="Project target date" className="sb-input mt-1.5" type="date" value={dueAt} onChange={(change) => setDueAt(change.target.value)} /></label><label><span className="sb-label">Working budget (USD)</span><input aria-label="Project budget" className="sb-input mt-1.5" type="number" min="0" step="0.01" value={budget} onChange={(change) => setBudget(change.target.value)} /></label><label><span className="sb-label">Description</span><textarea aria-label="Project description" className="sb-input mt-1.5 min-h-20" value={description} onChange={(change) => setDescription(change.target.value)} /></label><label><span className="sb-label">Success metrics (one per line)</span><textarea aria-label="Project success metrics" className="sb-input mt-1.5 min-h-24" value={metrics} onChange={(change) => setMetrics(change.target.value)} /></label><button className="sb-btn-primary" disabled={busy !== null}><CheckCircle2 className="h-4 w-4" /> Save project facts</button></form></SurfaceCard>
      <SurfaceCard><h2 className="font-semibold">Budget snapshot</h2><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[var(--text-muted)]">Budget</dt><dd>{money(project.budgetMinor, project.currency)}</dd></div><div><dt className="text-[var(--text-muted)]">Recorded spend</dt><dd>{money(readiness.spendMinor, project.currency)}</dd></div><div><dt className="text-[var(--text-muted)]">Remaining</dt><dd>{money(readiness.budgetRemainingMinor, project.currency)}</dd></div><div><dt className="text-[var(--text-muted)]">Linked events</dt><dd>{project.events?.length ?? 0}</dd></div></dl></SurfaceCard></div></div>

    <SurfaceCard><h2 className="font-semibold">Working assets</h2><div className="mt-4 flex flex-wrap gap-2">{project.assets?.map((asset) => <a key={`${asset.label}-${asset.url}`} className="sb-btn-secondary" href={asset.url} target="_blank" rel="noreferrer">{asset.label}</a>)}{!project.assets?.length ? <p className="text-sm text-[var(--text-muted)]">No assets attached.</p> : null}</div><form className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]" onSubmit={(submit) => { submit.preventDefault(); void addAsset(); }}><input aria-label="Asset label" disabled={busy !== null} maxLength={200} className="sb-input" value={assetLabel} onChange={(change) => setAssetLabel(change.target.value)} placeholder="Master, artwork, brief…" /><input aria-label="Asset URL" disabled={busy !== null} className="sb-input" type="url" value={assetUrl} onChange={(change) => setAssetUrl(change.target.value)} placeholder="https://" /><button className="sb-btn-secondary" disabled={busy !== null || !assetLabel || !assetUrl}><Plus className="h-4 w-4" /> Add asset</button></form></SurfaceCard>
    </fieldset>
  </div>;
}
