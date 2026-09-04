"use client";

import {
  afterShowWriteAllowed,
  catalogSourceLabel,
  dateTimeLocalToIso,
  instantToDateTimeLocal,
  sanitizeMailtoHref,
  sanitizeOperatorHref,
  sanitizeTelHref,
  summarizeSetlist,
  type OpsLivePhase,
  type OpsLiveRun
} from "@storyboard/shared";
import { Badge, SurfaceCard } from "@storyboard/ui";
import { ArrowLeft, Check, ClipboardCheck, Clock3, ListMusic, Mail, MapPin, Pencil, Phone, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { EventDayOfResponse } from "@/lib/types";

function money(value: number | null | undefined, currency: string) { return value == null ? "Not recorded" : `${currency} ${(value / 100).toFixed(2)}`; }
function dollars(value?: number | null) { return value == null ? "" : (value / 100).toFixed(2); }
function relative(minutes: number) { if (minutes === 0) return "now"; if (minutes > 0) return minutes < 60 ? `in ${minutes}m` : `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`; const elapsed = Math.abs(minutes); return elapsed < 60 ? `${elapsed}m ago` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m ago`; }
function zonedLocalDateTime(value?: string | null, timezone?: string | null) {
  if (!value) return "";
  const result = instantToDateTimeLocal(value, timezone);
  return result.ok ? result.value : "";
}
function formatShowTime(value: string, timezone?: string | null, options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" }) {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return "Recorded time is invalid";
  if (timezone) {
    try {
      return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).format(instant);
    } catch {
      return `${new Intl.DateTimeFormat("en-US", options).format(instant)} · recorded timezone is invalid`;
    }
  }
  return `${new Intl.DateTimeFormat("en-US", options).format(instant)} · timezone not recorded`;
}
function phaseLabel(phase: OpsLivePhase) {
  if (phase === "live") return "live now";
  if (phase === "upcoming") return "upcoming";
  if (phase === "overdue") return "still open";
  if (phase === "closed") return "closed";
  return "not a live gig";
}
function phaseVariant(phase: OpsLivePhase): "success" | "accent" | "danger" | "neutral" {
  if (phase === "live") return "success";
  if (phase === "upcoming") return "accent";
  if (phase === "overdue") return "danger";
  return "neutral";
}
function isDayOfResponse(value: unknown): value is EventDayOfResponse {
  return Boolean(value && typeof value === "object" && "liveRun" in value && "dayOf" in value && "event" in value);
}

const productionLinks: { label: string; key: "stagePlotUrl" | "inputListUrl" | "techRiderUrl" | "hospitalityRiderUrl" | "driveFolderUrl" }[] = [
  { label: "Stage plot", key: "stagePlotUrl" },
  { label: "Input list", key: "inputListUrl" },
  { label: "Tech rider", key: "techRiderUrl" },
  { label: "Hospitality rider", key: "hospitalityRiderUrl" },
  { label: "Drive folder", key: "driveFolderUrl" }
];

export function DayOfClient({ initialData, accessState }: { initialData: EventDayOfResponse; accessState: "manage" | "read_only" | "unavailable" }) {
  const [data, setData] = useState(initialData);
  useEffect(() => { setData(initialData); }, [initialData]);
  const { event, activeMembers, readiness, dayOf, liveRun } = data;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  const canManage = accessState === "manage";
  async function mutate(key: string, path: string, json?: unknown, method = "POST") {
    if (!canManage) {
      setError("Show changes are disabled until StoryBoard can verify member or owner access.");
      return;
    }
    setBusy(key); setError("");
    try {
      const result = await apiFetch<unknown>(path, { method, ...(json === undefined ? {} : { json }) });
      if (isDayOfResponse(result)) setData(result);
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The update failed"); }
    finally { setBusy(null); }
  }
  const setlistSummary = summarizeSetlist(event.setlist?.items ?? []);
  const location = event.address ?? event.venue?.addressLine ?? event.locationName ?? event.venue?.name;
  const mapsHref = location ? sanitizeOperatorHref(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`) : null;
  const phoneHref = sanitizeTelHref(event.contact?.phone);
  const emailHref = sanitizeMailtoHref(event.contact?.email);
  return <div className="space-y-5 pb-16">
    <div className="flex flex-wrap items-center justify-between gap-3"><a href="/operations" className="sb-btn-ghost"><ArrowLeft className="h-4 w-4" /> Band operations</a><button type="button" className="sb-btn-secondary" onClick={() => router.refresh()}><RefreshCw className="h-4 w-4" /> Refresh now</button></div>
    {accessState === "read_only" ? <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm text-[var(--text-muted)]">You have read-only access to this show. An owner or member can change availability, tasks, and the run of show.</p> : accessState === "unavailable" ? <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">Your show permissions could not be verified. Changes are disabled until you refresh.</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p> : null}
    <fieldset className="m-0 min-w-0 space-y-5 border-0 p-0" disabled={!canManage} aria-disabled={!canManage}>
    <LiveRunHeader liveRun={liveRun} />
    <LiveSetPanel liveRun={liveRun} eventId={event.id} busy={busy !== null} onMutate={mutate} />
    {liveRun.wrapUp.available ? <LiveWrapPanel data={data} busy={busy !== null} onMutate={mutate} onError={setError} /> : null}

    <SurfaceCard className="border-[var(--accent)]/30"><div className="flex flex-wrap items-center gap-2"><Badge variant={readiness.status === "ready" ? "success" : readiness.status === "attention" ? "warning" : "danger"}>{readiness.status.replaceAll("_", " ")}</Badge><span className="text-lg font-semibold">{readiness.score}/100</span><span className="text-xs text-[var(--text-muted)]">{readiness.confidenceLabel} confidence · updated {formatShowTime(dayOf.observedAt, event.timezone)}</span></div><h2 className="mt-4 text-xl font-semibold">{dayOf.headline}</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">{dayOf.nextAction}</p>{readiness.gaps[0] ? <p className="mt-3 text-xs text-[var(--text-muted)]">Highest gap: {readiness.gaps[0].title} — {readiness.gaps[0].detail}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{readiness.gaps.some((gap) => gap.code === "setlist_missing" || gap.code === "setlist_duration_incomplete") ? <a className="sb-btn-secondary" href={readiness.gaps.some((gap) => gap.code === "setlist_duration_incomplete") ? "/operations?tab=music" : `/operations?tab=events&event=${event.id}&focus=setlist`}>{readiness.gaps.some((gap) => gap.code === "setlist_duration_incomplete") ? "Fix song durations" : "Attach a setlist"}</a> : null}{dayOf.depositRemainingMinor > 0 || dayOf.openInvoiceBalanceMinor > 0 ? <a className="sb-btn-secondary" href={`/operations?tab=deals&event=${event.id}&focus=money`}>Open invoices</a> : null}</div></SurfaceCard>

    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      <SurfaceCard><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Run of show</h2></div><div className="mt-4 space-y-2">{dayOf.timeline.map((item) => <div key={item.id} className={`flex gap-3 rounded-lg border p-3 ${item.state === "next" ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)]"}`}><div className="w-24 shrink-0"><p className="font-semibold">{formatShowTime(item.at, event.timezone)}</p><p className="text-[11px] text-[var(--text-muted)]">{relative(item.minutesUntil)}</p></div><div><div className="flex items-center gap-2"><p className={item.state === "passed" ? "text-[var(--text-muted)] line-through" : "font-medium"}>{item.label}</p>{item.state === "next" ? <Badge variant="accent">next</Badge> : null}</div>{item.location ? <p className="mt-1 text-xs text-[var(--text-muted)]">{item.location}</p> : null}{item.notes ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.notes}</p> : null}</div></div>)}{!dayOf.timeline.length ? <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No load-in, soundcheck, doors, set, curfew, or custom schedule items are recorded.</p> : null}</div><ScheduleEditor eventId={event.id} timezone={event.timezone ?? null} schedule={event.schedule ?? []} busy={busy !== null} onMutate={mutate} onTimeError={setError} /></SurfaceCard>

      <div className="space-y-5"><SurfaceCard><h2 className="font-semibold">Place and day-of contact</h2><div className="mt-4 space-y-3 text-sm">{event.venue?.name || event.locationName ? <div><p className="font-medium">{event.venue?.name ?? event.locationName}</p>{event.address || event.venue?.addressLine ? <p className="text-[var(--text-muted)]">{event.address ?? event.venue?.addressLine}</p> : null}</div> : <p className="text-[var(--text-muted)]">No location is recorded.</p>}{mapsHref ? <a className="sb-btn-secondary w-fit" target="_blank" rel="noreferrer" href={mapsHref}><MapPin className="h-4 w-4" /> Open map</a> : null}{event.contact ? <div className="border-t border-[var(--border)] pt-3"><p className="font-medium">{event.contact.fullName}</p><p className="text-xs text-[var(--text-muted)]">{event.contact.role ?? event.contact.contactKind}</p><div className="mt-2 flex flex-wrap gap-2">{phoneHref ? <a className="sb-btn-secondary" href={phoneHref}><Phone className="h-4 w-4" /> Call</a> : null}{emailHref ? <a className="sb-btn-secondary" href={emailHref}><Mail className="h-4 w-4" /> Email</a> : null}</div></div> : <p className="border-t border-[var(--border)] pt-3 text-[var(--text-muted)]">No day-of contact is attached.</p>}</div></SurfaceCard>
      <SurfaceCard><h2 className="font-semibold">Money checkpoint</h2><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[var(--text-muted)]">Expected fee</dt><dd className="font-medium">{money(dayOf.expectedFeeMinor, dayOf.currency)}</dd></div><div><dt className="text-[var(--text-muted)]">Expected deposit</dt><dd className="font-medium">{money(dayOf.expectedDepositMinor, dayOf.currency)}</dd></div><div><dt className="text-[var(--text-muted)]">Recorded paid</dt><dd className="font-medium">{money(dayOf.recordedPaidMinor, dayOf.currency)}</dd></div><div><dt className="text-[var(--text-muted)]">Invoice balance</dt><dd className="font-medium">{money(dayOf.openInvoiceBalanceMinor, dayOf.currency)}</dd></div></dl>{dayOf.depositRemainingMinor > 0 ? <p className="mt-3 text-xs text-amber-200">Deposit still unrecorded: {money(dayOf.depositRemainingMinor, dayOf.currency)}</p> : null}<a className="sb-btn-secondary mt-3 w-fit" href={`/operations?tab=deals&event=${event.id}&focus=money`}>Record payment or issue invoice</a></SurfaceCard></div>
    </div>

    <div className="grid gap-5 lg:grid-cols-2"><SurfaceCard><h2 className="font-semibold">Lineup and assignments</h2><div className="mt-4 space-y-2">{activeMembers.map((member) => { const participant = event.participants.find((item) => item.bandMember.id === member.id); const response = participant?.response ?? "unknown"; const assignment = participant?.assignment ?? (member.instruments?.join(", ") || "No assignment recorded"); return <div key={member.id} className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{member.name}</p><p className="text-xs text-[var(--text-muted)]">{assignment}</p></div><select aria-label={`Day-of availability for ${member.name}`} className="sb-select w-auto" value={response} disabled={busy !== null} onChange={(change) => void mutate(`member-${member.id}`, `/events/${event.id}/participants`, { bandMemberId: member.id, response: change.target.value, assignment: participant?.assignment ?? null, notes: participant?.notes ?? null })}>{["unknown", "available", "tentative", "unavailable"].map((value) => <option key={value}>{value}</option>)}</select></div></div>; })}</div></SurfaceCard>
      <SurfaceCard><h2 className="font-semibold">Advance work</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{dayOf.openTaskCount} open · {dayOf.overdueTaskCount} overdue</p><div className="mt-4 space-y-2">{event.tasks?.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3"><div className="min-w-0 flex-1"><p className={task.status === "done" ? "text-sm text-[var(--text-muted)] line-through" : "text-sm font-medium"}>{task.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{task.bandMember?.name ?? task.ownerLabel ?? "Unassigned"}{task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleDateString()}` : ""}</p></div>{task.status === "done" ? <Badge variant="success">done</Badge> : <button type="button" className="sb-btn-secondary shrink-0" disabled={busy !== null} onClick={() => void mutate(`task-${task.id}`, `/tasks/${task.id}`, { status: "done" }, "PATCH")}><Check className="h-4 w-4" /> Done</button>}</div>)}{!event.tasks?.length ? <p className="text-sm text-[var(--text-muted)]">No event tasks are recorded.</p> : null}</div></SurfaceCard></div>

    <div className="grid gap-5 lg:grid-cols-2"><SurfaceCard><h2 className="font-semibold">Setlist</h2>{event.setlist ? <><div className="mt-2 flex items-center justify-between"><p className="text-sm text-[var(--text-muted)]">{event.setlist.name} · {catalogSourceLabel(event.setlist.sourceKey)}</p><p className="text-xs text-[var(--text-muted)]">{setlistSummary.durationLabel}</p></div>{setlistSummary.timingStatus === "incomplete" ? <p className="mt-2 text-xs font-medium text-[var(--text-primary)]">Next: record every song duration in Music & setlists before relying on this set length.</p> : null}<ol className="mt-4 space-y-2">{event.setlist.items.map((item, index) => <li key={item.id} className="flex gap-3 rounded-lg border border-[var(--border)] p-3"><span className="text-xs text-[var(--text-muted)]">{index + 1}</span><div><p className="text-sm font-medium">{item.song?.title ?? item.label ?? item.itemType}</p>{item.transitionNotes ? <p className="mt-1 text-xs text-[var(--text-muted)]">{item.transitionNotes}</p> : null}</div></li>)}</ol><a className="sb-btn-secondary mt-3 w-fit" href={setlistSummary.timingStatus === "incomplete" ? "/operations?tab=music" : `/operations?tab=events&event=${event.id}&focus=setlist`}>{setlistSummary.timingStatus === "incomplete" ? "Fix song durations" : "Edit set assignment"}</a></> : <><p className="mt-3 text-sm text-[var(--text-muted)]">No setlist is attached.</p><a className="sb-btn-secondary mt-3 w-fit" href={`/operations?tab=events&event=${event.id}&focus=setlist`}>Attach a setlist</a></>}</SurfaceCard>
      <SurfaceCard><h2 className="font-semibold">Production and logistics</h2><div className="mt-4 space-y-3 text-sm">{event.productionNotes ? <p>{event.productionNotes}</p> : <p className="text-[var(--text-muted)]">No production notes are recorded.</p>}{event.parkingNotes ? <p><span className="font-medium">Parking:</span> {event.parkingNotes}</p> : null}{event.hospitalityNotes ? <p><span className="font-medium">Hospitality:</span> {event.hospitalityNotes}</p> : null}{event.travelNotes ? <p><span className="font-medium">Travel:</span> {event.travelNotes}</p> : null}<div className="flex flex-wrap gap-2">{productionLinks.flatMap(({ label, key }) => { const href = sanitizeOperatorHref(event[key]); return href ? [<a key={label} className="sb-btn-secondary" target="_blank" rel="noreferrer" href={href}>{label}</a>] : []; })}</div></div></SurfaceCard></div>
    </fieldset>
  </div>;
}

function LiveRunHeader({ liveRun }: { liveRun: OpsLiveRun }) {
  return <section data-testid="ops-live-run" aria-labelledby="ops-live-run-heading">
    <SurfaceCard className="border-[var(--accent)]/40">
      <p className="sb-kicker">Live run</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={phaseVariant(liveRun.phase)}>{phaseLabel(liveRun.phase)}</Badge>
        <p id="ops-live-run-heading" data-testid="ops-live-run-title" className="font-medium">{liveRun.title}</p>
      </div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        {liveRun.startsAt ? formatShowTime(liveRun.startsAt, liveRun.timezone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "Start time not recorded"}
      </p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{liveRun.location ?? "Location not recorded"}{liveRun.timezone ? ` · ${liveRun.timezone}` : " · timezone not recorded"}</p>
      {liveRun.phase === "overdue" ? <p className="mt-3 text-xs text-amber-200">This gig started without a recorded end, so it is still open rather than assumed live.</p> : null}
      {liveRun.phase === "none" ? <p className="mt-3 text-xs text-[var(--text-muted)]">This record is not a live gig. StoryBoard will not invent a show from a rehearsal or closed date.</p> : null}
    </SurfaceCard>
  </section>;
}

function LiveSetPanel({ liveRun, eventId, busy, onMutate }: { liveRun: OpsLiveRun; eventId: string; busy: boolean; onMutate: (key: string, path: string, json?: unknown, method?: string) => Promise<void> }) {
  const set = liveRun.set;
  function position(setlistItemId: string | null, key: string) {
    return onMutate(key, `/events/${eventId}/live-set-position`, { setlistItemId });
  }
  return <section data-testid="ops-live-set" aria-labelledby="ops-live-set-heading">
    <SurfaceCard>
      <div className="flex items-center gap-2"><ListMusic className="h-4 w-4 text-[var(--accent)]" /><h2 id="ops-live-set-heading" className="font-semibold">Running order</h2></div>
      {set.availability === "unassigned" ? <p className="mt-3 text-sm text-[var(--text-secondary)]">No setlist is assigned to this show. Attach the set in Band operations. StoryBoard will not substitute another set or invent a song.</p>
        : set.availability === "missing_record" ? <p className="mt-3 text-sm text-[var(--text-secondary)]">This show points to a setlist that was not returned. Review the assignment instead of substituting another set.</p>
        : set.availability === "empty" ? <p className="mt-3 text-sm text-[var(--text-secondary)]">The assigned set has no recorded items. StoryBoard will not invent a running order.</p>
        : <>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{set.name} · {catalogSourceLabel(set.sourceKey)}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Current and next song come only from the recorded cursor. Time does not decide what is playing.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!set.currentItemId && set.nextTitle ? <button type="button" className="sb-btn-primary" disabled={busy} onClick={() => void position(set.nextItemId, "live-set-start")}>Start {set.nextTitle}</button> : null}
            {set.currentItemId && set.nextTitle ? <button type="button" className="sb-btn-primary" disabled={busy} onClick={() => void position(set.nextItemId, "live-set-advance")}>Advance to {set.nextTitle}</button> : null}
            {set.currentItemId && !set.nextTitle ? <p className="text-sm text-[var(--text-secondary)]">Assigned set is complete. StoryBoard will not invent an encore.</p> : null}
            {set.currentItemId ? <button type="button" className="sb-btn-ghost" disabled={busy} onClick={() => void position(null, "live-set-clear")}>Clear live position</button> : null}
          </div>
          <ol className="mt-4 space-y-2">{set.items.map((item, index) => <li key={item.id} data-state={item.state} className={`flex gap-3 rounded-lg border p-3 ${item.state === "current" ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)]"}`}><span className="w-6 shrink-0 text-xs text-[var(--text-muted)]">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={item.state === "played" ? "text-sm text-[var(--text-muted)] line-through" : "text-sm font-medium"}>{item.title}</p>{item.state === "current" ? <Badge variant="success">now</Badge> : item.state === "played" ? <Badge>played</Badge> : null}</div><p className="mt-1 text-xs text-[var(--text-muted)]">{[item.musicalKey ? `Key ${item.musicalKey}` : null, item.leadVocalist ? `Vocal ${item.leadVocalist}` : null, item.durationLabel ?? "Duration missing"].filter(Boolean).join(" · ")}</p>{item.transitionNotes ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.transitionNotes}</p> : null}</div></li>)}</ol>
        </>}
      {(set.availability === "unassigned" || set.availability === "missing_record") ? <a className="sb-btn-secondary mt-3 w-fit" href={`/operations?tab=events&event=${eventId}&focus=setlist`}>Attach a setlist</a> : null}
    </SurfaceCard>
  </section>;
}

function LiveWrapPanel({ data, busy, onMutate, onError }: { data: EventDayOfResponse; busy: boolean; onMutate: (key: string, path: string, json?: unknown, method?: string) => Promise<void>; onError: (message: string) => void }) {
  const event = data.event;
  const write = afterShowWriteAllowed(event);
  const [attendance, setAttendance] = useState(event.attendance?.toString() ?? "");
  const [grossRevenue, setGrossRevenue] = useState(dollars(event.grossRevenueMinor));
  const [postShowNotes, setPostShowNotes] = useState(event.postShowNotes ?? "");
  const [relationshipOutcome, setRelationshipOutcome] = useState(event.relationshipOutcome ?? "");
  useEffect(() => {
    setAttendance(event.attendance?.toString() ?? "");
    setGrossRevenue(dollars(event.grossRevenueMinor));
    setPostShowNotes(event.postShowNotes ?? "");
    setRelationshipOutcome(event.relationshipOutcome ?? "");
  }, [event.attendance, event.grossRevenueMinor, event.postShowNotes, event.relationshipOutcome]);
  async function save() {
    if (!event.updatedAt) {
      onError("Refresh before saving. StoryBoard could not verify which after-show version you opened.");
      return;
    }
    if (!write.allowed) {
      onError(write.reason);
      return;
    }
    const attendanceValue = attendance.trim() === "" ? null : Number(attendance);
    if (attendanceValue != null && (!Number.isInteger(attendanceValue) || attendanceValue < 0)) {
      onError("Attendance must be a whole number. StoryBoard will not invent a count.");
      return;
    }
    const revenueValue = grossRevenue.trim() === "" ? null : Math.round(Number(grossRevenue) * 100);
    if (revenueValue != null && (!Number.isFinite(revenueValue) || revenueValue < 0)) {
      onError("Gross revenue must be a non-negative amount. StoryBoard will not invent a result.");
      return;
    }
    await onMutate("live-wrap", `/events/${event.id}/after-show`, {
      expectedUpdatedAt: event.updatedAt,
      attendance: attendanceValue,
      grossRevenueMinor: revenueValue,
      postShowNotes: postShowNotes.trim() || null,
      relationshipOutcome: relationshipOutcome.trim() || null
    });
  }
  const next = data.liveRun.wrapUp.nextAction;
  return <section data-testid="ops-live-wrap" aria-labelledby="ops-live-wrap-heading">
    <SurfaceCard>
      <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-[var(--accent)]" /><h2 id="ops-live-wrap-heading" className="font-semibold">After the show</h2></div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{data.liveRun.wrapUp.reason}</p>
      {data.liveRun.wrapUp.recorded ? <p className="mt-2 text-xs text-[var(--text-muted)]" data-testid="ops-live-wrap-recorded">Facts are recorded. StoryBoard will not invent a result or close the gig.</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label><span className="sb-label">Attendance</span><input aria-label="Attendance" className="sb-input mt-1.5" type="number" min="0" step="1" value={attendance} onChange={(change) => setAttendance(change.target.value)} /></label>
        <label><span className="sb-label">Gross revenue ({event.currency})</span><input aria-label={`Gross revenue (${event.currency})`} className="sb-input mt-1.5" type="number" min="0" step="0.01" value={grossRevenue} onChange={(change) => setGrossRevenue(change.target.value)} /></label>
      </div>
      <label className="mt-3 block"><span className="sb-label">What happened and what should change?</span><textarea aria-label="What happened and what should change?" className="sb-input mt-1.5 min-h-24" maxLength={5000} value={postShowNotes} onChange={(change) => setPostShowNotes(change.target.value)} placeholder="Draw, audience response, production issues, merch, promotion, and lessons for next time" /></label>
      <label className="mt-3 block"><span className="sb-label">Buyer / venue relationship outcome</span><textarea aria-label="Buyer / venue relationship outcome" className="sb-input mt-1.5 min-h-20" maxLength={1000} value={relationshipOutcome} onChange={(change) => setRelationshipOutcome(change.target.value)} placeholder="Invited back, requested follow-up, neutral, or relationship issue" /></label>
      {!event.updatedAt ? <p role="alert" className="mt-3 text-sm text-amber-200">Refresh before saving. StoryBoard could not verify which after-show version you opened.</p> : null}
      <button type="button" className="sb-btn-primary mt-4" disabled={busy || !event.updatedAt || !write.allowed} onClick={() => void save()}><Save className="h-4 w-4" /> Save after-show facts</button>
      {next ? <a className="sb-btn-secondary mt-3 w-fit" data-testid="ops-live-wrap-next" href={next.href}>{next.code === "finalize_settlement" ? "Open draft settlement" : next.code === "after_show_recorded" ? "Review recorded wrap-up" : "Open draft settlement"}</a> : null}
    </SurfaceCard>
  </section>;
}

type ScheduleItem = NonNullable<EventDayOfResponse["event"]["schedule"]>[number];

function ScheduleEditor({ eventId, timezone, schedule, busy, onMutate, onTimeError }: { eventId: string; timezone?: string | null; schedule: ScheduleItem[]; busy: boolean; onMutate: (key: string, path: string, json?: unknown, method?: string) => Promise<void>; onTimeError: (message: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const zone = timezone?.trim() || null;
  async function create() {
    if (!zone) return;
    const start = dateTimeLocalToIso(startsAt, zone);
    if (!start.ok) { onTimeError(start.message); return; }
    const end = endsAt ? dateTimeLocalToIso(endsAt, zone) : { ok: true as const, value: null };
    if (!end.ok) { onTimeError(end.message); return; }
    onTimeError("");
    await onMutate("schedule-new", `/events/${eventId}/schedule`, { title, startsAt: start.value, endsAt: end.value, location: location.trim() || null, notes: notes.trim() || null, sortOrder: schedule.length * 10 });
    setTitle(""); setStartsAt(""); setEndsAt(""); setLocation(""); setNotes(""); setCreating(false);
  }
  return <div className="mt-5 border-t border-[var(--border)] pt-4" data-testid="run-of-show-editor"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium">Custom checkpoints</p><p className="mt-1 text-xs text-[var(--text-muted)]">Add travel calls, meals, support slots, changeovers, meet-and-greets, or anything else the band needs. Use the main event editor for load-in, soundcheck, doors, set, and curfew.</p>{!zone ? <p className="mt-2 text-xs text-amber-200">Record an IANA timezone on this event before adding checkpoints. StoryBoard will not guess the phone clock.</p> : <p className="mt-2 text-xs text-[var(--text-muted)]">Times use {zone}.</p>}</div><button type="button" className="sb-btn-secondary" disabled={busy || !zone} onClick={() => setCreating((value) => !value)}>{creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {creating ? "Cancel" : "Add checkpoint"}</button></div>
    {creating ? <div className="mt-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3"><div className="grid gap-3 sm:grid-cols-2"><label><span className="sb-label">Checkpoint title</span><input className="sb-input mt-1" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label><label><span className="sb-label">Location (optional)</span><input className="sb-input mt-1" value={location} maxLength={240} onChange={(event) => setLocation(event.target.value)} /></label><label><span className="sb-label">Checkpoint starts</span><input required type="datetime-local" className="sb-input mt-1" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label><span className="sb-label">Checkpoint ends (optional)</span><input type="datetime-local" className="sb-input mt-1" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label><label className="sm:col-span-2"><span className="sb-label">Checkpoint notes (optional)</span><textarea className="sb-input mt-1 min-h-20" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} /></label></div><button type="button" className="sb-btn-primary mt-3" disabled={busy || !title.trim() || !startsAt || !zone} onClick={() => void create()}><Save className="h-4 w-4" /> Save checkpoint</button></div> : null}
    <div className="mt-4 space-y-2">{schedule.map((item) => <ScheduleEditorRow key={item.id} eventId={eventId} timezone={zone} item={item} busy={busy} onMutate={onMutate} onTimeError={onTimeError} />)}{!schedule.length ? <p className="text-xs text-[var(--text-muted)]">No custom checkpoints yet.</p> : null}</div>
  </div>;
}

function ScheduleEditorRow({ eventId, timezone, item, busy, onMutate, onTimeError }: { eventId: string; timezone: string | null; item: ScheduleItem; busy: boolean; onMutate: (key: string, path: string, json?: unknown, method?: string) => Promise<void>; onTimeError: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [startsAt, setStartsAt] = useState(zonedLocalDateTime(item.startsAt, timezone));
  const [endsAt, setEndsAt] = useState(zonedLocalDateTime(item.endsAt, timezone));
  const [location, setLocation] = useState(item.location ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [sortOrder, setSortOrder] = useState(item.sortOrder);
  async function save() {
    if (!timezone) {
      onTimeError("Record an IANA timezone on this event before editing checkpoints. StoryBoard will not guess the phone clock.");
      return;
    }
    const start = dateTimeLocalToIso(startsAt, timezone);
    if (!start.ok) { onTimeError(start.message); return; }
    const end = endsAt ? dateTimeLocalToIso(endsAt, timezone) : { ok: true as const, value: null };
    if (!end.ok) { onTimeError(end.message); return; }
    onTimeError("");
    await onMutate(`schedule-${item.id}`, `/events/${eventId}/schedule/${item.id}`, { title, startsAt: start.value, endsAt: end.value, location: location.trim() || null, notes: notes.trim() || null, sortOrder }, "PATCH");
    setEditing(false);
  }
  if (!editing) return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{formatShowTime(item.startsAt, timezone, { dateStyle: "medium", timeStyle: "short" })}{item.endsAt ? ` – ${formatShowTime(item.endsAt, timezone)}` : ""}{item.location ? ` · ${item.location}` : ""}</p></div><button type="button" className="sb-btn-ghost" disabled={busy} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit {item.title}</button></div>;
  return <div className="rounded-lg border border-[var(--accent)]/30 p-3"><div className="grid gap-3 sm:grid-cols-2"><label><span className="sb-label">Title for {item.title}</span><input className="sb-input mt-1" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label><label><span className="sb-label">Location for {item.title}</span><input className="sb-input mt-1" value={location} maxLength={240} onChange={(event) => setLocation(event.target.value)} /></label><label><span className="sb-label">Starts for {item.title}</span><input type="datetime-local" className="sb-input mt-1" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label><span className="sb-label">Ends for {item.title}</span><input type="datetime-local" className="sb-input mt-1" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label><label><span className="sb-label">Order for {item.title}</span><input type="number" min={0} max={999} className="sb-input mt-1" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></label><label className="sm:col-span-2"><span className="sb-label">Notes for {item.title}</span><textarea className="sb-input mt-1 min-h-20" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} /></label></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="sb-btn-primary" disabled={busy || !title.trim() || !startsAt || !timezone} onClick={() => void save()}><Save className="h-4 w-4" /> Save changes</button><button type="button" className="sb-btn-ghost" disabled={busy} onClick={() => setEditing(false)}><X className="h-4 w-4" /> Cancel</button><button type="button" className="sb-btn-ghost text-red-300" disabled={busy} onClick={() => void onMutate(`schedule-${item.id}`, `/events/${eventId}/schedule/${item.id}`, undefined, "DELETE")}><Trash2 className="h-4 w-4" /> Remove checkpoint</button></div></div>;
}
