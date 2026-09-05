"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { afterShowWriteAllowed, CATALOG_NON_VAULT_EMPTY_SETLIST_HINT, CATALOG_NON_VAULT_LIBRARY_INTRO, catalogSourceLabel, catalogWorkspaceUsesVaultFraming, dateTimeLocalToIso, describeSongCatalogStatus, eventReadinessNextAction, instantToDateTimeLocal, invoicePaymentNextAction, isValidIanaTimeZone, type OpsWorkspaceFocus, type OpsWorkspaceTab, sanitizeOperatorHref, settlementWorkspaceNextAction } from "@storyboard/shared";
import { CatalogImportForm } from "./catalog-import-form";
import { OperationsShowControl } from "./operations-show-control";
import { SetlistBuilder } from "./setlist-builder";
import { BriefcaseBusiness, CalendarDays, ListMusic, Pencil, Plus, Rocket, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { apiFetch } from "@/lib/api";
import type { ArtistProject, BandEvent, BandMember, BookingOpportunity, Contact, DealOffer, DocumentTemplate, Expense, Invoice, Setlist, Settlement, ShowReadiness, Song, Venue } from "@/lib/types";

type Tab = OpsWorkspaceTab;
type Mutate = (path: string, json: unknown, method?: string, signal?: AbortSignal) => Promise<unknown>;

function eventVersionFromWrite(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  if ("updatedAt" in result && typeof result.updatedAt === "string") return result.updatedAt;
  if ("event" in result && result.event && typeof result.event === "object" && "updatedAt" in result.event && typeof result.event.updatedAt === "string") {
    return result.event.updatedAt;
  }
  return null;
}
type OpenWorkspace = (tab: Tab, eventId?: string, focus?: OpsWorkspaceFocus) => void;
type OperationsAccessState = "manage" | "read_only" | "unavailable";
const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [{ id: "events", label: "Events", icon: CalendarDays }, { id: "music", label: "Music & setlists", icon: ListMusic }, { id: "projects", label: "Projects", icon: Rocket }, { id: "deals", label: "Deals", icon: BriefcaseBusiness }];

function replaceOpsWorkspaceUrl(tab: Tab, eventId?: string, focus?: OpsWorkspaceFocus) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  if (eventId) url.searchParams.set("event", eventId);
  else url.searchParams.delete("event");
  if (focus) url.searchParams.set("focus", focus);
  else url.searchParams.delete("focus");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

export function OperationsClient({ artistId, initialTab = "events", focusEventId = null, focusField = null, eventsAvailable, readinessAvailable, setlistsAvailable, songsAvailable, bookingsAvailable, initialEvents, initialReadiness, initialSongs, initialSetlists, initialBookings, initialProjects, initialDeals, initialInvoices, initialExpenses, initialSettlements, initialTemplates, members, contacts, venues, accessState, isOwner, loadError }: { artistId: string | null; initialTab?: Tab; focusEventId?: string | null; focusField?: OpsWorkspaceFocus | null; eventsAvailable: boolean; readinessAvailable: boolean; setlistsAvailable: boolean; songsAvailable: boolean; bookingsAvailable: boolean; initialEvents: BandEvent[]; initialReadiness: ShowReadiness[]; initialSongs: Song[]; initialSetlists: Setlist[]; initialBookings: BookingOpportunity[]; initialProjects: ArtistProject[]; initialDeals: DealOffer[]; initialInvoices: Invoice[]; initialExpenses: Expense[]; initialSettlements: Settlement[]; initialTemplates: DocumentTemplate[]; members: BandMember[]; contacts: Contact[]; venues: Venue[]; accessState: OperationsAccessState; isOwner: boolean; loadError: string | null }) {
  const [tab, setTab] = useState<Tab>(initialTab); const [focusEvent, setFocusEvent] = useState<string | null>(focusEventId); const [focus, setFocus] = useState<OpsWorkspaceFocus | null>(focusField); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const router = useRouter();
  const [musicVisited, setMusicVisited] = useState(initialTab === "music");
  const [refreshingWorkspace, startWorkspaceRefresh] = useTransition();
  const [lastConfirmedArtistId, setLastConfirmedArtistId] = useState(artistId);
  if (artistId && artistId !== lastConfirmedArtistId) setLastConfirmedArtistId(artistId);
  const musicArtistId = artistId ?? lastConfirmedArtistId;
  const canManage = accessState === "manage" && Boolean(artistId);
  function openWorkspace(nextTab: Tab, eventId?: string, nextFocus?: OpsWorkspaceFocus) {
    setTab(nextTab);
    if (nextTab === "music") setMusicVisited(true);
    setFocusEvent(eventId ?? null);
    setFocus(nextFocus ?? null);
    replaceOpsWorkspaceUrl(nextTab, eventId, nextFocus);
  }
  async function create(path: string, json: unknown, method = "POST", signal?: AbortSignal) {
    if (!canManage) {
      const message = "Operations changes are disabled until StoryBoard can verify member or owner access.";
      setError(message);
      throw new Error(message);
    }
    setBusy(true); setError("");
    try {
      const result = await apiFetch(path, { method, json, artistId: artistId!, ...(signal ? { signal } : {}) });
      router.refresh();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    {loadError ? <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">{loadError}</div> : null}
    {!loadError && accessState === "read_only" ? <div role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm text-[var(--text-muted)]">You have read-only access. You can review operations, but an owner or member must make changes.</div> : null}
    {!loadError && accessState === "unavailable" ? <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">Your operations permissions could not be verified. Changes are disabled until you refresh.</div> : null}
    {loadError || accessState === "unavailable" ? <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="sb-btn-secondary" disabled={refreshingWorkspace || busy} onClick={() => startWorkspaceRefresh(() => router.refresh())}>{refreshingWorkspace ? "Retrying workspace…" : "Retry workspace"}</button>
      <p className="text-xs text-[var(--text-muted)]" role="status">{refreshingWorkspace ? "Loading a fresh view; your unfinished running orders stay in this page." : "Retry here to keep unfinished running orders. A browser reload discards unsaved drafts."}</p>
    </div> : null}
    {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
    <OperationsShowControl
      eventsAvailable={eventsAvailable}
      readinessAvailable={readinessAvailable}
      setlistsAvailable={setlistsAvailable}
      bookingsAvailable={bookingsAvailable}
      events={initialEvents}
      readiness={initialReadiness}
      setlists={initialSetlists}
      bookings={initialBookings}
      invoices={initialInvoices}
      settlements={initialSettlements}
      canManage={canManage}
      onOpenWorkspace={openWorkspace}
    />
    <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] pb-3" role="tablist">{tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "sb-btn-primary shrink-0" : "sb-btn-secondary shrink-0"} onClick={() => openWorkspace(id)}><Icon className="h-4 w-4" />{label}</button>)}</div>
    <fieldset className="m-0 min-w-0 border-0 p-0" disabled={!canManage} aria-disabled={!canManage}>
      {tab === "events" ? <Events events={initialEvents} readiness={initialReadiness} members={members} contacts={contacts} venues={venues} setlists={initialSetlists} focusEventId={focusEvent} focusField={focus} busy={busy} create={create} openWorkspace={openWorkspace} /> : tab === "projects" ? <Projects projects={initialProjects} busy={busy} create={create} /> : tab === "deals" ? <Deals deals={initialDeals} invoices={initialInvoices} expenses={initialExpenses} settlements={initialSettlements} templates={initialTemplates} events={initialEvents} readiness={initialReadiness} projects={initialProjects} members={members} isOwner={isOwner} busy={busy} create={create} focusEventId={focusEvent} focusField={focus} /> : null}
      {musicVisited ? <div hidden={tab !== "music"}>
        <MusicWorkspace key={musicArtistId ?? "unverified-band"} artistId={musicArtistId}
          available={Boolean(artistId) && eventsAvailable && readinessAvailable && songsAvailable && setlistsAvailable}
          songs={initialSongs} setlists={initialSetlists} events={initialEvents} readiness={initialReadiness}
          canManage={canManage} busy={busy} create={create} openWorkspace={openWorkspace} />
      </div> : null}
    </fieldset>
  </div>;
}

function Events({ events, readiness, members, contacts, venues, setlists, focusEventId, focusField, busy, create, openWorkspace }: { events: BandEvent[]; readiness: ShowReadiness[]; members: BandMember[]; contacts: Contact[]; venues: Venue[]; setlists: Setlist[]; focusEventId: string | null; focusField: OpsWorkspaceFocus | null; busy: boolean; create: Mutate; openWorkspace: OpenWorkspace }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("gig");
  const [startsAt, setStartsAt] = useState("");
  const byEvent = new Map(readiness.map((item) => [item.eventId, item]));
  const activeMembers = members.filter((member) => member.active);
  useEffect(() => {
    if (!focusEventId) return;
    const node = document.getElementById(focusField === "setlist" ? `event-setlist-${focusEventId}` : `event-${focusEventId}`);
    node?.scrollIntoView({ block: "center" });
  }, [focusEventId, focusField]);
  return <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
    <SurfaceCard><h2 className="font-semibold">Add an event</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Use events as the hub for people, timing, advance work, and settlement.</p><form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void create("/events", { type, title, startsAt: startsAt ? new Date(startsAt).toISOString() : null, status: "draft", currency: "USD" }); setTitle(""); }}><label><span className="sb-label">Event type</span><select className="sb-select mt-1.5" value={type} onChange={(event) => setType(event.target.value)}>{["gig","rehearsal","studio","release","promotion","travel","meeting"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span className="sb-label">Title</span><input required className="sb-input mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span className="sb-label">Starts</span><input type="datetime-local" className="sb-input mt-1.5" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><button disabled={busy} className="sb-btn-primary"><Plus className="h-4 w-4" /> Add event</button></form></SurfaceCard>
    <SurfaceCard><h2 className="font-semibold">Upcoming and active</h2><div className="mt-4 space-y-4">{events.map((event) => <EventCard key={event.id} event={event} readiness={byEvent.get(event.id) ?? null} members={activeMembers} contacts={contacts} venues={venues} setlists={setlists} focusOpen={focusEventId === event.id && (focusField === "setlist" || focusField === "details")} busy={busy} create={create} openWorkspace={openWorkspace} />)}{!events.length ? <EmptyState title="No events yet" description="Add a rehearsal or show, or confirm a booking opportunity." icon={<CalendarDays className="h-6 w-6" />} /> : null}</div></SurfaceCard>
  </div>;
}

function EventCard({ event, readiness, members, contacts, venues, setlists, focusOpen, busy, create, openWorkspace }: { event: BandEvent; readiness: ShowReadiness | null; members: BandMember[]; contacts: Contact[]; venues: Venue[]; setlists: Setlist[]; focusOpen: boolean; busy: boolean; create: Mutate; openWorkspace: OpenWorkspace }) {
  const [detailsOpen, setDetailsOpen] = useState(focusOpen);
  useEffect(() => { if (focusOpen) setDetailsOpen(true); }, [focusOpen]);
  const available = members.filter((member) => event.participants.find((participant) => participant.bandMember.id === member.id)?.response === "available").length;
  const next = readiness ? eventReadinessNextAction(event.id, readiness.gaps) : null;
  return <article id={`event-${event.id}`} className="rounded-xl border border-[var(--border)] p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{event.title}</p><p className="mt-1 text-xs capitalize text-[var(--text-muted)]">{event.type} · {event.startsAt ? new Date(event.startsAt).toLocaleString() : "date not set"}{event.venue?.name ? ` · ${event.venue.name}` : event.locationName ? ` · ${event.locationName}` : ""}</p></div><Badge variant={event.status === "confirmed" ? "success" : "neutral"}>{event.status}</Badge></div>
    <p className="mt-3 text-xs text-[var(--text-muted)]">Availability: {available}/{members.length} active members available</p>
    {readiness ? <div className="mt-4 rounded-lg bg-[var(--surface-subtle)] p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant={readiness.status === "ready" ? "success" : readiness.status === "attention" ? "warning" : "danger"}>{readiness.status.replaceAll("_", " ")}</Badge><span className="text-sm font-semibold">{readiness.score}/100</span><span className="text-xs text-[var(--text-muted)]">{readiness.confidenceLabel} confidence</span></div><p className="mt-2 text-sm">{readiness.headline}</p>{next ? <p className="mt-2 text-sm font-medium text-[var(--text-primary)]" data-testid={`event-next-action-${event.id}`}>Next: {next.nextAction}</p> : null}<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{readiness.categories.map((category) => <div key={category.category} className="rounded-md border border-[var(--border)] px-2 py-1.5"><p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{category.category}</p><p className="text-xs font-medium">{category.score}/{category.maxScore}</p></div>)}</div>{readiness.gaps.length ? <ul className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">{readiness.gaps.slice(0, 4).map((gap) => <li key={gap.code}><span className={gap.severity === "high" ? "text-red-300" : "text-[var(--text-secondary)]"}>{gap.title}:</span> {gap.nextAction}</li>)}</ul> : null}<div className="mt-3 flex flex-wrap gap-2">{readiness.gaps.some((gap) => gap.code === "advance_missing") && event.startsAt ? <button type="button" className="sb-btn-secondary" disabled={busy} onClick={() => void create(`/events/${event.id}/generate-advance`, {})}>Generate advance checklist</button> : null}{next?.code === "setlist_missing" ? <button type="button" className="sb-btn-secondary" onClick={() => openWorkspace("events", event.id, "setlist")}>Attach a setlist</button> : null}{next?.code === "setlist_duration_incomplete" ? <button type="button" className="sb-btn-secondary" onClick={() => openWorkspace("music")}>Fix song durations</button> : null}{next?.code === "deposit_unpaid" ? <button type="button" className="sb-btn-secondary" onClick={() => openWorkspace("deals", event.id, "money")}>Open invoices</button> : null}</div></div> : null}
    {event.type === "gig" ? <a className="sb-btn-secondary mt-4 w-fit" href={`/operations/events/${event.id}`}>Open day-of view</a> : null}
    <details className="mt-4 border-t border-[var(--border)] pt-3" open={detailsOpen} onToggle={(toggle) => setDetailsOpen(toggle.currentTarget.open)}><summary className="cursor-pointer text-sm font-medium text-[var(--accent)]">Manage readiness details</summary><EventDetailsEditor event={event} members={members} contacts={contacts} venues={venues} setlists={setlists} busy={busy} create={create} /></details>
  </article>;
}

function localDateTime(value?: string | null, timezone?: string | null) { if (!value) return ""; const result = instantToDateTimeLocal(value, timezone); return result.ok ? result.value : ""; }
function dollars(value?: number | null) { return value == null ? "" : (value / 100).toFixed(2); }

const eventDateTimeLabels = {
  startsAt: "Event start",
  endsAt: "Event end",
  loadInAt: "Load-in",
  soundcheckAt: "Soundcheck",
  doorsAt: "Doors",
  setAt: "Set time",
  curfewAt: "Curfew"
} as const;

type EventDateTimeName = keyof typeof eventDateTimeLabels;
type EventDateTimeValues = Record<EventDateTimeName, string>;

function initialEventTimeError(event: BandEvent) {
  if (event.timezone && !isValidIanaTimeZone(event.timezone)) return "Use a valid IANA timezone such as America/Chicago.";
  for (const [name, label] of Object.entries(eventDateTimeLabels) as [EventDateTimeName, string][]) {
    const value = event[name];
    if (!value) continue;
    const result = instantToDateTimeLocal(value, event.timezone);
    if (!result.ok) return `${label}: ${result.message}`;
  }
  return "";
}

function convertEventTimes(values: EventDateTimeValues, timezone: string) {
  const zone = timezone.trim() || null;
  if (zone && !isValidIanaTimeZone(zone)) return { ok: false as const, message: "Use a valid IANA timezone such as America/Chicago." };
  const converted = {} as Record<EventDateTimeName, string | null>;
  for (const [name, label] of Object.entries(eventDateTimeLabels) as [EventDateTimeName, string][]) {
    const value = values[name];
    if (!value) { converted[name] = null; continue; }
    const result = dateTimeLocalToIso(value, zone);
    if (!result.ok) return { ok: false as const, message: `${label}: ${result.message}` };
    converted[name] = result.value;
  }
  if (converted.startsAt && converted.endsAt && new Date(converted.endsAt) <= new Date(converted.startsAt)) {
    return { ok: false as const, message: "Event end must be after the event start." };
  }
  return { ok: true as const, value: converted };
}

function EventDetailsEditor({ event, members, contacts, venues, setlists, busy, create }: { event: BandEvent; members: BandMember[]; contacts: Contact[]; venues: Venue[]; setlists: Setlist[]; busy: boolean; create: Mutate }) {
  const [status, setStatus] = useState(event.status);
  const [venueId, setVenueId] = useState(event.venueId ?? "");
  const [locationName, setLocationName] = useState(event.locationName ?? "");
  const [address, setAddress] = useState(event.address ?? "");
  const [contactId, setContactId] = useState(event.contactId ?? "");
  const [setlistId, setSetlistId] = useState(event.setlistId ?? "");
  const [startsAt, setStartsAt] = useState(localDateTime(event.startsAt, event.timezone));
  const [endsAt, setEndsAt] = useState(localDateTime(event.endsAt, event.timezone));
  const [timezone, setTimezone] = useState(event.timezone ?? "");
  const [loadInAt, setLoadInAt] = useState(localDateTime(event.loadInAt, event.timezone));
  const [soundcheckAt, setSoundcheckAt] = useState(localDateTime(event.soundcheckAt, event.timezone));
  const [doorsAt, setDoorsAt] = useState(localDateTime(event.doorsAt, event.timezone));
  const [setAt, setSetAt] = useState(localDateTime(event.setAt, event.timezone));
  const [curfewAt, setCurfewAt] = useState(localDateTime(event.curfewAt, event.timezone));
  const [timeError, setTimeError] = useState(() => initialEventTimeError(event));
  const [guarantee, setGuarantee] = useState(dollars(event.guaranteeMinor));
  const [deposit, setDeposit] = useState(dollars(event.depositMinor));
  const [productionNotes, setProductionNotes] = useState(event.productionNotes ?? "");
  const [stagePlotUrl, setStagePlotUrl] = useState(event.stagePlotUrl ?? "");
  const [inputListUrl, setInputListUrl] = useState(event.inputListUrl ?? "");
  const [techRiderUrl, setTechRiderUrl] = useState(event.techRiderUrl ?? "");
  const [afterShowReceipt, setAfterShowReceipt] = useState(event.updatedAt);
  useEffect(() => { setAfterShowReceipt(event.updatedAt); }, [event.updatedAt]);
  const field = (label: string, value: string, setValue: (value: string) => void) => <label><span className="sb-label">{label}</span><input aria-label={`${label} for ${event.title}`} aria-invalid={Boolean(timeError)} type="datetime-local" className="sb-input mt-1.5" value={value} onChange={(change) => { setValue(change.target.value); setTimeError(""); }} /></label>;
  return <div className="mt-4 space-y-5">
    <div><p className="sb-label">Lineup availability</p>{members.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{members.map((member) => { const response = event.participants.find((participant) => participant.bandMember.id === member.id)?.response ?? "unknown"; return <label key={member.id} className="rounded-lg border border-[var(--border)] p-2"><span className="text-sm">{member.name}</span><select aria-label={`Availability for ${member.name} at ${event.title}`} className="sb-select mt-1.5" value={response} disabled={busy} onChange={(change) => void create(`/events/${event.id}/participants`, { bandMemberId: member.id, response: change.target.value })}>{["unknown","available","tentative","unavailable"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>; })}</div> : <p className="mt-2 text-sm text-[var(--text-muted)]">Add the performing lineup in Manager before collecting availability.</p>}</div>
    <form className="space-y-4" onSubmit={(submit) => { submit.preventDefault(); const times = convertEventTimes({ startsAt, endsAt, loadInAt, soundcheckAt, doorsAt, setAt, curfewAt }, timezone); if (!times.ok) { setTimeError(times.message); return; } setTimeError(""); void create(`/events/${event.id}`, { status, venueId: venueId || null, locationName: locationName || null, address: address || null, contactId: contactId || null, setlistId: setlistId || null, ...times.value, timezone: timezone.trim() || null, guaranteeMinor: guarantee === "" ? null : Math.round(Number(guarantee) * 100), depositMinor: deposit === "" ? null : Math.round(Number(deposit) * 100), productionNotes: productionNotes || null, stagePlotUrl: stagePlotUrl || null, inputListUrl: inputListUrl || null, techRiderUrl: techRiderUrl || null }, "PATCH").then((saved) => { const next = eventVersionFromWrite(saved); if (next) setAfterShowReceipt(next); }).catch(() => undefined); }}>
      <div className="grid gap-3 sm:grid-cols-2"><label><span className="sb-label">Status</span><select aria-label={`Status for ${event.title}`} className="sb-select mt-1.5" value={status} onChange={(change) => setStatus(change.target.value)}>{["draft","hold","confirmed","completed","cancelled"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span className="sb-label">Venue</span><select aria-label={`Venue for ${event.title}`} className="sb-select mt-1.5" value={venueId} onChange={(change) => setVenueId(change.target.value)}><option value="">No saved venue</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.city}</option>)}</select></label><label><span className="sb-label">Location name</span><input aria-label={`Location name for ${event.title}`} className="sb-input mt-1.5" value={locationName} onChange={(change) => setLocationName(change.target.value)} placeholder="Client site, festival stage, or room" /></label><label><span className="sb-label">Address</span><input aria-label={`Address for ${event.title}`} className="sb-input mt-1.5" value={address} onChange={(change) => setAddress(change.target.value)} /></label><label><span className="sb-label">Day-of contact</span><select aria-label={`Day-of contact for ${event.title}`} className="sb-select mt-1.5" value={contactId} onChange={(change) => setContactId(change.target.value)}><option value="">No contact attached</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.fullName}{contact.role ? ` · ${contact.role}` : ""}</option>)}</select></label><label><span className="sb-label">Setlist</span><select id={`event-setlist-${event.id}`} aria-label={`Setlist for ${event.title}`} className="sb-select mt-1.5" value={setlistId} onChange={(change) => setSetlistId(change.target.value)}><option value="">No setlist attached</option>{setlists.map((setlist) => <option key={setlist.id} value={setlist.id}>{setlist.name} · {setlist.items.length} items · {catalogSourceLabel(setlist.sourceKey)}</option>)}</select></label></div>
      {timeError ? <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{timeError} No event changes were saved.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{field("Event start", startsAt, setStartsAt)}{field("Event end", endsAt, setEndsAt)}<label><span className="sb-label">Event timezone</span><input aria-label={`Event timezone for ${event.title}`} aria-invalid={Boolean(timeError)} className="sb-input mt-1.5" value={timezone} maxLength={80} onChange={(change) => { setTimezone(change.target.value); setTimeError(""); }} placeholder="America/Chicago" /><span className="mt-1 block text-xs text-[var(--text-muted)]">Use an IANA timezone for Calendar, such as America/Chicago. When set, every time here is interpreted in that location even if your device is elsewhere.</span></label>{field("Load-in", loadInAt, setLoadInAt)}{field("Soundcheck", soundcheckAt, setSoundcheckAt)}{field("Doors", doorsAt, setDoorsAt)}{field("Set time", setAt, setSetAt)}{field("Curfew", curfewAt, setCurfewAt)}</div>
      <div className="grid gap-3 sm:grid-cols-2"><label><span className="sb-label">Guarantee (USD)</span><input aria-label={`Guarantee for ${event.title}`} className="sb-input mt-1.5" type="number" min="0" step="0.01" value={guarantee} onChange={(change) => setGuarantee(change.target.value)} /></label><label><span className="sb-label">Deposit (USD)</span><input aria-label={`Deposit for ${event.title}`} className="sb-input mt-1.5" type="number" min="0" step="0.01" value={deposit} onChange={(change) => setDeposit(change.target.value)} /></label></div>
      <label><span className="sb-label">Production notes</span><textarea aria-label={`Production notes for ${event.title}`} className="sb-input mt-1.5 min-h-24" value={productionNotes} onChange={(change) => setProductionNotes(change.target.value)} placeholder="Backline, power, PA, stage dimensions, changeover, or known constraints" /></label>
      <div className="grid gap-3 sm:grid-cols-3"><label><span className="sb-label">Stage plot URL</span><input aria-label={`Stage plot URL for ${event.title}`} className="sb-input mt-1.5" type="url" value={stagePlotUrl} onChange={(change) => setStagePlotUrl(change.target.value)} placeholder="https://" /></label><label><span className="sb-label">Input list URL</span><input aria-label={`Input list URL for ${event.title}`} className="sb-input mt-1.5" type="url" value={inputListUrl} onChange={(change) => setInputListUrl(change.target.value)} placeholder="https://" /></label><label><span className="sb-label">Tech rider URL</span><input aria-label={`Tech rider URL for ${event.title}`} className="sb-input mt-1.5" type="url" value={techRiderUrl} onChange={(change) => setTechRiderUrl(change.target.value)} placeholder="https://" /></label></div>
      <button className="sb-btn-primary" disabled={busy}>Save event details</button>
    </form>
    {event.type === "gig" ? <EventAfterShowEditor event={event} expectedUpdatedAt={afterShowReceipt} onReceipt={setAfterShowReceipt} busy={busy} create={create} /> : null}
    {event.type === "gig" ? <EventLogistics event={event} busy={busy} create={create} /> : null}
  </div>;
}

function EventAfterShowEditor({ event, expectedUpdatedAt, onReceipt, busy, create }: { event: BandEvent; expectedUpdatedAt: string | undefined; onReceipt: (value: string) => void; busy: boolean; create: Mutate }) {
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
  return <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4" data-testid={`event-after-show-${event.id}`}>
    <h3 className="font-medium">After the show</h3>
    <p className="mt-1 text-xs text-[var(--text-muted)]">{write.reason} Leave an unknown blank. Saving event details will not overwrite these facts.</p>
    <form className="mt-4 space-y-3" onSubmit={(submit) => {
      submit.preventDefault();
      if (!expectedUpdatedAt || !write.allowed) return;
      void create(`/events/${event.id}/after-show`, {
        expectedUpdatedAt,
        attendance: attendance === "" ? null : Number(attendance),
        grossRevenueMinor: grossRevenue === "" ? null : Math.round(Number(grossRevenue) * 100),
        postShowNotes: postShowNotes.trim() || null,
        relationshipOutcome: relationshipOutcome.trim() || null
      }).then((saved) => {
        const next = eventVersionFromWrite(saved);
        if (next) onReceipt(next);
      }).catch(() => undefined);
    }}>
      <div className="grid gap-3 sm:grid-cols-2"><label><span className="sb-label">Attendance</span><input aria-label={`Attendance for ${event.title}`} className="sb-input mt-1.5" type="number" min="0" step="1" value={attendance} onChange={(change) => setAttendance(change.target.value)} /></label><label><span className="sb-label">Gross revenue ({event.currency})</span><input aria-label={`Gross revenue for ${event.title}`} className="sb-input mt-1.5" type="number" min="0" step="0.01" value={grossRevenue} onChange={(change) => setGrossRevenue(change.target.value)} /></label></div>
      <label className="block"><span className="sb-label">What happened and what should change?</span><textarea aria-label={`Post-show notes for ${event.title}`} className="sb-input mt-1.5 min-h-24" maxLength={5000} value={postShowNotes} onChange={(change) => setPostShowNotes(change.target.value)} placeholder="Draw, audience response, production issues, merch, promotion, and lessons for next time" /></label>
      <label className="block"><span className="sb-label">Buyer / venue relationship outcome</span><textarea aria-label={`Relationship outcome for ${event.title}`} className="sb-input mt-1.5 min-h-20" maxLength={1000} value={relationshipOutcome} onChange={(change) => setRelationshipOutcome(change.target.value)} placeholder="Invited back, requested follow-up, neutral, or relationship issue" /></label>
      {!expectedUpdatedAt ? <p role="alert" className="text-sm text-amber-200">Refresh before saving. StoryBoard could not verify which after-show version you opened.</p> : null}
      <button type="submit" className="sb-btn-primary" disabled={busy || !expectedUpdatedAt || !write.allowed}>Save after-show facts</button>
    </form>
  </section>;
}

function logisticsStateLabel(state: NonNullable<BandEvent["logisticsAssessment"]>["channels"]["calendar"]["state"]) {
  if (state === "reconciled_external_effect") return "external effect observed";
  if (state === "reconciled_no_external_effect") return "no external effect found";
  if (state === "execution_in_progress") return "execution in progress";
  return state.replaceAll("_", " ");
}

function EventLogistics({ event, busy, create }: { event: BandEvent; busy: boolean; create: Mutate }) {
  const assessment = event.logisticsAssessment;
  const eligible = event.status === "confirmed" && Boolean(event.startsAt && event.endsAt && event.timezone) && Boolean(assessment?.eligible);
  const actionable = assessment ? [...assessment.preparableChannels, ...assessment.retryableChannels] : [];
  const canPrepare = eligible && actionable.length > 0;
  const calendarState = assessment?.channels.calendar.state ?? (event.calendarEventId ? "complete" : "not_prepared");
  const driveState = assessment?.channels.drive.state ?? (event.driveFolderUrl ? "complete" : "not_prepared");
  const manualReconciliation = [calendarState, driveState].some((state) => state === "execution_unknown" || state === "failed" || state === "executed_unlinked");
  const executionInProgress = [calendarState, driveState].some((state) => state === "execution_in_progress");
  const reconciledExternalEffect = [calendarState, driveState].some((state) => state === "reconciled_external_effect");
  const reconciledNoExternalEffect = [calendarState, driveState].some((state) => state === "reconciled_no_external_effect");
  const linkedDetailsChanged = (calendarState === "stale" && Boolean(event.calendarEventId)) || (driveState === "stale" && Boolean(event.driveFolderUrl));
  const simulatedExecution = [calendarState, driveState].some((state) => state === "simulated");
  const hasApprovalHistory = [calendarState, driveState].some((state) => ["pending", "approved", "execution_in_progress", "execution_unknown", "failed", "executed_unlinked", "reconciled_external_effect", "reconciled_no_external_effect"].includes(state));
  const badgeVariant = (state: typeof calendarState) => state === "complete" ? "success" : state === "reconciled_no_external_effect" ? "accent" : ["simulated", "pending", "approved", "execution_in_progress", "reconciled_external_effect"].includes(state) ? "warning" : ["execution_unknown", "failed", "rejected", "expired", "stale", "executed_unlinked"].includes(state) ? "danger" : "neutral";
  const channelNames = actionable.length ? [...new Set(actionable)].map((channel) => channel === "calendar" ? "Calendar" : "Drive") : ["Calendar", "Drive"];
  return <section data-testid={`event-logistics-${event.id}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4" aria-labelledby={`event-logistics-${event.id}`}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 id={`event-logistics-${event.id}`} className="font-medium">Calendar and Drive</h3><p className="mt-1 text-xs text-[var(--text-muted)]">Preparation creates reviewable approvals only. StoryBoard will not call Google until someone approves and executes them in Approvals.</p></div>{assessment?.complete ? <Badge variant="success">connected</Badge> : null}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Google Calendar</p><Badge variant={badgeVariant(calendarState)}>{logisticsStateLabel(calendarState)}</Badge></div>{event.calendarEventId ? <p className="mt-2 break-all text-xs text-[var(--text-muted)]">Event ID: <code className="text-[var(--text-secondary)]">{event.calendarEventId}</code></p> : <p className="mt-2 text-xs text-[var(--text-muted)]">No external Calendar event is linked yet.</p>}</div>
      <div className="rounded-lg border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Google Drive</p><Badge variant={badgeVariant(driveState)}>{logisticsStateLabel(driveState)}</Badge></div>{sanitizeOperatorHref(event.driveFolderUrl) ? <a className="sb-btn-secondary mt-2 w-fit" href={sanitizeOperatorHref(event.driveFolderUrl)!} target="_blank" rel="noreferrer">Open Drive folder</a> : <p className="mt-2 text-xs text-[var(--text-muted)]">No Drive folder is linked yet.</p>}</div>
    </div>
    {!eligible ? <p className="mt-3 text-xs text-[var(--text-muted)]">Confirm the event and save its start, end, and IANA timezone before preparing logistics approvals.</p> : null}
    {simulatedExecution ? <p role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">This was a mock execution for local testing; no Google account was changed. Connect Google before preparing and executing the replacement approval.</p> : null}
    {executionInProgress ? <p role="status" className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">The provider request is still inside its execution lease. Wait for the final result; StoryBoard will not reconcile or replace it while the original call may still be running.</p> : null}
    {manualReconciliation ? <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">A provider attempt failed or could not be linked, so the outside action may still exist. Check Google and reconcile it manually; StoryBoard will not retry automatically and risk a duplicate.</p> : null}
    {reconciledNoExternalEffect ? <p role="status" className="mt-3 rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3 text-xs text-cyan-100">A band member checked the provider and recorded that no external effect was found. A separate new approval can be prepared safely; the original request remains unchanged and cannot execute again.</p> : null}
    {reconciledExternalEffect ? <div role="status" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100"><p>A band member observed an external object. That receipt does not claim the requested work succeeded or link the object to this event. Verify it in Google, then record a task for any follow-up or correction StoryBoard cannot link here; StoryBoard will not prepare a duplicate.</p><a className="sb-btn-secondary mt-2 w-fit" href="/tasks">Track manual follow-up</a></div> : null}
    {linkedDetailsChanged ? <p role="alert" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">The event changed after its Google record was linked. Update that existing Calendar event or Drive folder manually; StoryBoard will not create a duplicate.</p> : null}
    {assessment && !assessment.complete && hasApprovalHistory ? <a className="sb-btn-secondary mt-3 w-fit" href="/approvals">Review approval history</a> : null}
    {canPrepare ? <button type="button" className="sb-btn-secondary mt-3" disabled={busy} onClick={() => void create(`/events/${event.id}/prepare-logistics-approvals`, {})}>Prepare {channelNames.join(" and ")} approval{channelNames.length === 1 ? "" : "s"}</button> : null}
  </section>;
}

function parseSongDuration(value: string) {
  if (!value.trim()) return null;
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds > 0 && seconds <= 7200 ? seconds : undefined;
}

function formatSongDuration(seconds: number | null | undefined) {
  if (!seconds) return "";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type MusicSnapshot = { songs: Song[]; setlists: Setlist[]; events: BandEvent[]; readiness: ShowReadiness[] };

function MusicWorkspace({ available, ...props }: MusicSnapshot & { available: boolean; artistId: string | null; canManage: boolean; busy: boolean; create: Mutate; openWorkspace: OpenWorkspace }) {
  // Only a complete, band-bound read can replace the last usable snapshot.
  // Keep mounted editor state on a failed refresh; never present it as live.
  const { songs, setlists, events, readiness } = props;
  const [lastGood, setLastGood] = useState<MusicSnapshot | null>(() => available ? { songs, setlists, events, readiness } : null);
  if (available && (!lastGood || songs !== lastGood.songs || setlists !== lastGood.setlists || events !== lastGood.events || readiness !== lastGood.readiness)) {
    setLastGood({ songs, setlists, events, readiness });
  }
  const snapshot = available ? { songs, setlists, events, readiness } : lastGood;
  return <div className="space-y-4">
    {!available ? <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">{snapshot
      ? "The latest music workspace could not be confirmed. Your unfinished running orders are still here, but this is the last loaded view. Changes are paused until a successful refresh."
      : "Music and setlists could not be loaded for this band. Refresh to try again; an unavailable list does not mean the band has no songs or sets."}</p> : null}
    {snapshot ? <Music {...props} {...snapshot} canManage={props.canManage && available} /> : null}
  </div>;
}

function Music({ artistId, canManage, songs, setlists, events, readiness, busy, create, openWorkspace }: { artistId: string | null; canManage: boolean; songs: Song[]; setlists: Setlist[]; events: BandEvent[]; readiness: ShowReadiness[]; busy: boolean; create: Mutate; openWorkspace: OpenWorkspace }) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [setName, setSetName] = useState("");
  const parsedDuration = parseSongDuration(duration);
  const catalogStatus = describeSongCatalogStatus({
    songs: songs.map((song) => ({ sourceKey: song.sourceKey ?? null })),
    setlists: setlists.map((setlist) => ({ sourceKey: setlist.sourceKey ?? null }))
  });
  const vaultFraming = catalogWorkspaceUsesVaultFraming(catalogStatus);
  return <div className="space-y-5">
    <CatalogImportForm artistId={artistId} canManage={canManage} />
    <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(300px,0.8fr)_minmax(520px,1.2fr)]">
    <SurfaceCard><h2 className="font-semibold">Song library</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{vaultFraming ? <>Populate songs from the import card above or <code>pnpm catalog:import</code> (dry-run by default). Default is Vault's published default-live slice on this artist — not a second catalog and not a fourth live band. A Stalemate or hybrid row in that slice stays here. Add here only for a one-off correction. Durations stay unknown until someone records them.</> : CATALOG_NON_VAULT_LIBRARY_INTRO}</p>{!catalogStatus.empty ? <p className="mt-2 text-sm text-[var(--text-secondary)]" role="status">{catalogStatus.message}</p> : null}<form className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto]" onSubmit={(event) => { event.preventDefault(); if (parsedDuration === undefined) return; void create("/songs", { title, durationSeconds: parsedDuration, active: true }); setTitle(""); setDuration(""); }}><label><span className="sb-label">Song title</span><input required className="sb-input mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Song title" /></label><label><span className="sb-label">Duration</span><input aria-label="New song duration in minutes and seconds" className="sb-input mt-1.5" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="3:45" inputMode="numeric" /></label><button disabled={busy || parsedDuration === undefined} className="sb-btn-primary self-end">Add</button></form>{parsedDuration === undefined ? <p className="mt-2 text-xs text-red-300">Use minutes and seconds, such as 3:45.</p> : null}<div className="mt-5 divide-y divide-[var(--border)]">{songs.map((song) => <SongEditor key={`${song.id}:${song.updatedAt ?? "current"}`} song={song} busy={busy} create={create} />)}{!songs.length ? <div className="py-4" role="status"><EmptyState title="Vault catalog not imported" description="This empty table is not a second catalog. Preview a local app_api.json above or use `pnpm catalog:import`, then --apply. Parked catalogs stay out unless you opt in. StoryBoard never fetches a remote catalog and will not invent titles, a fourth live band, or a set." icon={<ListMusic className="h-6 w-6" />} /></div> : null}</div></SurfaceCard>
    <SurfaceCard><h2 className="font-semibold">Setlists</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Build the exact running order, transitions, breaks, and technician notes used at a show. Imported Vault and Show Night setlists keep their provenance; attach one to a gig from Events.</p>{readiness.some((item) => item.gaps.some((gap) => gap.code === "setlist_missing" || gap.code === "setlist_duration_incomplete")) ? <p className="mt-2 text-sm text-[var(--text-secondary)]" role="status">Next: record missing song durations here, then attach the set from Events. StoryBoard will not invent a running order.</p> : null}<form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void create("/setlists", { name: setName, status: "draft", items: [] }); setSetName(""); }}><label className="flex-1"><span className="sb-label">Setlist name</span><input required className="sb-input mt-1.5" value={setName} onChange={(event) => setSetName(event.target.value)} placeholder="Friday headline set" /></label><button disabled={busy} className="sb-btn-primary self-end">Create setlist</button></form><div className="mt-5 space-y-4">{setlists.map((setlist) => <SetlistBuilder key={setlist.id} artistId={artistId} canManage={canManage} setlist={setlist} songs={songs} attachedEvents={events.filter((event) => event.setlistId === setlist.id)} busy={busy} create={create} openWorkspace={openWorkspace} />)}{!setlists.length ? <p className="text-sm text-[var(--text-muted)]">{vaultFraming ? <>Default Vault import seeds <code>setlist_ready_default_import</code> (the published default-live slice). An empty published slice stays empty. Preview a local file above, or create a setlist here and add recorded songs, breaks, and notes in performance order.</> : CATALOG_NON_VAULT_EMPTY_SETLIST_HINT}</p> : null}</div></SurfaceCard>
    </div>
  </div>;
}

function SongEditor({ song, busy, create }: { song: Song; busy: boolean; create: Mutate }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(song.title);
  const [duration, setDuration] = useState(formatSongDuration(song.durationSeconds));
  const [musicalKey, setMusicalKey] = useState(song.musicalKey ?? "");
  const [bpm, setBpm] = useState(song.bpm?.toString() ?? "");
  const [leadVocalist, setLeadVocalist] = useState(song.leadVocalist ?? "");
  const [active, setActive] = useState(song.active);
  const parsedDuration = parseSongDuration(duration);
  if (!editing) return <div className="flex items-center gap-3 py-3" data-testid={`song-${song.id}`}><div className="min-w-0 flex-1"><p className="truncate font-medium">{song.title}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">{song.durationSeconds ? formatSongDuration(song.durationSeconds) : "duration unknown"}{song.musicalKey ? ` · ${song.musicalKey}` : ""}{song.bpm ? ` · ${song.bpm} BPM` : ""}{song.leadVocalist ? ` · lead ${song.leadVocalist}` : ""}{!song.active ? " · inactive" : ""} · {catalogSourceLabel(song.sourceKey)}</p></div><button type="button" className="sb-btn-ghost" aria-label={`Edit song ${song.title}`} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</button></div>;
  return <div className="py-4" data-testid={`song-${song.id}`}><div className="grid gap-3 sm:grid-cols-2"><label><span className="sb-label">Title for {song.title}</span><input className="sb-input mt-1.5" value={title} maxLength={240} onChange={(event) => setTitle(event.target.value)} /></label><label><span className="sb-label">Duration (m:ss)</span><input aria-label={`Duration for ${song.title}`} className="sb-input mt-1.5" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="3:45" inputMode="numeric" /></label><label><span className="sb-label">Key</span><input aria-label={`Key for ${song.title}`} className="sb-input mt-1.5" value={musicalKey} maxLength={30} onChange={(event) => setMusicalKey(event.target.value)} placeholder="Am" /></label><label><span className="sb-label">BPM</span><input aria-label={`BPM for ${song.title}`} className="sb-input mt-1.5" type="number" min="20" max="400" value={bpm} onChange={(event) => setBpm(event.target.value)} /></label><label><span className="sb-label">Lead vocalist</span><input aria-label={`Lead vocalist for ${song.title}`} className="sb-input mt-1.5" value={leadVocalist} maxLength={160} onChange={(event) => setLeadVocalist(event.target.value)} /></label><label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Available for new setlists</label></div>{parsedDuration === undefined ? <p className="mt-2 text-xs text-red-300">Use minutes and seconds, such as 3:45.</p> : null}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className="sb-btn-primary" disabled={busy || !title.trim() || parsedDuration === undefined || (bpm !== "" && (Number(bpm) < 20 || Number(bpm) > 400))} onClick={() => { void create(`/songs/${song.id}`, { title, durationSeconds: parsedDuration, musicalKey: musicalKey.trim() || null, bpm: bpm ? Number(bpm) : null, leadVocalist: leadVocalist.trim() || null, active }, "PATCH"); }}><Save className="h-4 w-4" /> Save song</button><button type="button" className="sb-btn-ghost" onClick={() => setEditing(false)}><X className="h-4 w-4" /> Cancel</button></div></div>;
}

function Projects({ projects, busy, create }: { projects: ArtistProject[]; busy: boolean; create: Mutate }) {
  const [name, setName] = useState(""); const [type, setType] = useState("release"); const [dueAt, setDueAt] = useState("");
  return <div className="grid gap-5 lg:grid-cols-[340px_1fr]"><SurfaceCard><h2 className="font-semibold">Start a project</h2><p className="mt-1 text-sm text-[var(--text-muted)]">A real target date lets StoryBoard build the milestone sequence backward.</p><form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void create("/projects", { type, name, status: "active", dueAt: dueAt ? new Date(`${dueAt}T12:00:00`).toISOString() : null, currency: "USD", successMetrics: [], assets: [] }); setName(""); }}><select aria-label="Project type" className="sb-select" value={type} onChange={(event) => setType(event.target.value)}>{["release","content_campaign","tour","business"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select><input required className="sb-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" /><input aria-label="Project due date" className="sb-input" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /><button disabled={busy} className="sb-btn-primary">Create project</button></form></SurfaceCard><SurfaceCard><h2 className="font-semibold">Active projects</h2><div className="mt-4 space-y-3">{projects.map((project) => <div key={project.id} className="rounded-xl border border-[var(--border)] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{project.name}</p><p className="mt-1 text-xs capitalize text-[var(--text-muted)]">{project.type.replace("_", " ")}{project.dueAt ? ` · due ${new Date(project.dueAt).toLocaleDateString()}` : " · date not set"}</p></div><Badge variant={project.readiness?.status === "on_track" || project.readiness?.status === "complete" ? "success" : project.readiness?.status === "closed" ? "neutral" : project.readiness?.status === "blocked" || project.readiness?.status === "off_track" ? "danger" : "warning"}>{project.readiness ? `${project.readiness.score}/100` : project.status}</Badge></div>{project.readiness ? <><p className="mt-3 text-sm text-[var(--text-secondary)]">{project.readiness.headline}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Next: {project.readiness.nextAction}</p></> : null}<a className="sb-btn-secondary mt-3 w-fit" href={`/operations/projects/${project.id}`}>Open project</a></div>)}{!projects.length ? <EmptyState title="No projects" description="Use a project for a release, tour, campaign, or business initiative." icon={<Rocket className="h-6 w-6" />} /> : null}</div></SurfaceCard></div>;
}

function Deals({ deals, invoices, expenses, settlements, templates, events, readiness, projects, members, isOwner, busy, create, focusEventId, focusField }: { deals: DealOffer[]; invoices: Invoice[]; expenses: Expense[]; settlements: Settlement[]; templates: DocumentTemplate[]; events: BandEvent[]; readiness: ShowReadiness[]; projects: ArtistProject[]; members: BandMember[]; isOwner: boolean; busy: boolean; create: Mutate; focusEventId: string | null; focusField: OpsWorkspaceFocus | null }) {
  const focusedEvent = events.find((event) => event.id === focusEventId) ?? null;
  const settleableIds = new Set(events.filter((event) => event.type === "gig" && !event.settlement && !settlements.some((row) => row.event.id === event.id)).map((event) => event.id));
  const [title, setTitle] = useState(""); const [buyer, setBuyer] = useState(""); const [email, setEmail] = useState(""); const [amount, setAmount] = useState("");
  const [invoiceDeal, setInvoiceDeal] = useState(""); const [invoiceEvent, setInvoiceEvent] = useState(focusedEvent && focusField === "money" ? focusedEvent.id : ""); const [invoiceNumber, setInvoiceNumber] = useState(""); const [invoiceRecipient, setInvoiceRecipient] = useState(""); const [invoiceAmount, setInvoiceAmount] = useState("");
  const [expenseScope, setExpenseScope] = useState(""); const [expenseDescription, setExpenseDescription] = useState(""); const [expenseAmount, setExpenseAmount] = useState("");
  const [settlementEvent, setSettlementEvent] = useState(focusedEvent && settleableIds.has(focusedEvent.id) ? focusedEvent.id : "");
  const [settlementGross, setSettlementGross] = useState(focusedEvent?.grossRevenueMinor != null ? (focusedEvent.grossRevenueMinor / 100).toFixed(2) : "");
  const [templateName, setTemplateName] = useState("");
  useEffect(() => {
    if (focusField !== "money") return;
    document.getElementById("ops-settlement")?.scrollIntoView({ block: "center" });
  }, [focusEventId, focusField]);
  const activeTemplate = templates.find((template) => template.kind === "agreement" && template.active);
  const equalSplits = () => members.map((member, index) => { const base = Math.floor(10000 / members.length); return { bandMemberId: member.id, basisPoints: index === members.length - 1 ? 10000 - base * (members.length - 1) : base }; });
  const moneyNext = invoices.map((invoice) => invoicePaymentNextAction(invoice)).find((item) => item.canRecordPayment) ?? invoices.map((invoice) => invoicePaymentNextAction(invoice)).find((item) => item.code === "voided") ?? null;
  const settlementNext = settlementWorkspaceNextAction({ events, settlements });
  const depositGaps = readiness.filter((item) => item.gaps.some((gap) => gap.code === "deposit_unpaid"));
  const settleableEvents = events.filter((event) => event.type === "gig" && !event.settlement && !settlements.some((row) => row.event.id === event.id));
  return <div className="space-y-5">
    {moneyNext || settlementNext || depositGaps.length ? <SurfaceCard><h2 className="font-semibold">Money next</h2><div className="mt-3 space-y-2 text-sm" data-testid="deals-next-action">{moneyNext ? <p>Next: {moneyNext.nextAction}</p> : null}{depositGaps[0] ? <p>Deposit still unrecorded on {depositGaps[0].title}. Link the invoice to that show so readiness can see the payment.</p> : null}{settlementNext ? <p>{settlementNext.nextAction}</p> : null}</div></SurfaceCard> : null}
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]"><SurfaceCard><h2 className="font-semibold">Record an offer</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Amounts use cents internally. Documents require an owner-reviewed template.</p><form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void create("/deals", { title, buyerName: buyer || null, buyerEmail: email || null, offerAmountMinor: amount ? Math.round(Number(amount) * 100) : null, currency: "USD", status: "draft" }); setTitle(""); }}><input required className="sb-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Show or deal" /><input className="sb-input" value={buyer} onChange={(event) => setBuyer(event.target.value)} placeholder="Buyer name" /><input className="sb-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Buyer email" /><input className="sb-input" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Offer amount (USD)" /><button disabled={busy} className="sb-btn-primary">Record offer</button></form></SurfaceCard><SurfaceCard><h2 className="font-semibold">Deal pipeline</h2><div className="mt-4 space-y-3">{deals.map((deal) => <div key={deal.id} className="rounded-xl border border-[var(--border)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium">{deal.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{deal.buyerName ?? "Buyer unknown"} · {deal.offerAmountMinor == null ? "amount TBD" : `${deal.currency} ${(deal.offerAmountMinor / 100).toFixed(2)}`} · {deal.agreements.length ? `agreement v${deal.agreements[0]?.version}` : "no agreement"}</p></div><Badge variant={deal.status === "accepted" ? "success" : "neutral"}>{deal.status}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="sb-btn-secondary" disabled={busy || !activeTemplate} onClick={() => void create(`/deals/${deal.id}/generate-document`, {})}>Generate agreement PDF</button>{deal.agreements.length && deal.buyerEmail ? <button type="button" className="sb-btn-secondary" disabled={busy} onClick={() => void create(`/deals/${deal.id}/prepare-delivery`, {})}>Prepare delivery approval</button> : null}</div></div>)}{!deals.length ? <EmptyState title="No offers yet" description="Record quotes, guarantees, and event buyer terms here." icon={<BriefcaseBusiness className="h-6 w-6" />} /> : null}</div></SurfaceCard></div>
    <div className="grid gap-5 xl:grid-cols-3"><SurfaceCard><h2 className="font-semibold">Agreement template</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Owner activation required. Template only—not legal advice.</p>{isOwner ? <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void create("/document-templates", { kind: "agreement", name: templateName, bodyTemplate: "Agreement between {{artistName}} and {{buyerName}} for {{performanceDate}}. Fee: {{currency}} {{amount}}.\n\nTerms: {{terms}}\n\nCancellation: {{cancellationTerms}}" }); setTemplateName(""); }}><input required className="sb-input" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" /><button disabled={busy} className="sb-btn-secondary">Create reviewed version</button></form> : <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--text-muted)]">Only an owner can create or activate agreement templates. Members can use an active owner-reviewed template for deal documents.</p>}<div className="mt-3 space-y-2">{templates.filter((template) => template.kind === "agreement").map((template) => <div key={template.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] p-2 text-sm"><span>{template.name} v{template.version}</span>{template.active ? <Badge variant="success">active</Badge> : isOwner ? <button className="sb-btn-ghost" onClick={() => void create(`/document-templates/${template.id}/activate`, {}, "PUT")}>Activate</button> : <Badge variant="neutral">owner review</Badge>}</div>)}</div></SurfaceCard>
      <SurfaceCard><h2 className="font-semibold">Issue an invoice</h2><p className="mt-1 text-xs text-[var(--text-muted)]">A deal is optional. Link a show so deposit readiness can see this invoice. You can invoice a buyer directly when no offer is recorded yet.</p><form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); const deal = deals.find((row) => row.id === invoiceDeal); void create("/invoices", { dealOfferId: invoiceDeal || null, eventId: invoiceEvent || null, number: invoiceNumber, recipientName: invoiceRecipient, recipientEmail: deal?.buyerEmail ?? null, currency: "USD", subtotalMinor: Math.round(Number(invoiceAmount) * 100), taxMinor: 0 }); setInvoiceNumber(""); }}><select aria-label="Invoice deal" className="sb-select" value={invoiceDeal} onChange={(event) => setInvoiceDeal(event.target.value)}><option value="">No linked deal</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}</select><select aria-label="Invoice event" className="sb-select" value={invoiceEvent} onChange={(event) => setInvoiceEvent(event.target.value)}><option value="">No linked show</option>{events.filter((row) => row.type === "gig").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}</select><input required className="sb-input" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="Invoice number" /><input required className="sb-input" value={invoiceRecipient} onChange={(event) => setInvoiceRecipient(event.target.value)} placeholder="Recipient" /><input required className="sb-input" min="0" step="0.01" type="number" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} placeholder="Amount (USD)" /><button disabled={busy} className="sb-btn-primary">Create invoice</button></form></SurfaceCard>
      <SurfaceCard><h2 className="font-semibold">Record an expense</h2><form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); const [kind, id] = expenseScope.split(":"); void create("/expenses", { eventId: kind === "event" ? id : null, projectId: kind === "project" ? id : null, category: "other", description: expenseDescription, amountMinor: Math.round(Number(expenseAmount) * 100), currency: "USD", incurredAt: new Date().toISOString() }); setExpenseDescription(""); }}><select aria-label="Expense event or project" required className="sb-select" value={expenseScope} onChange={(event) => setExpenseScope(event.target.value)}><option value="">Event or project</option>{events.map((row) => <option key={row.id} value={`event:${row.id}`}>{row.title}</option>)}{projects.map((row) => <option key={row.id} value={`project:${row.id}`}>{row.name}</option>)}</select><input required className="sb-input" value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} placeholder="Expense description" /><input required className="sb-input" min="0.01" step="0.01" type="number" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} placeholder="Amount (USD)" /><button disabled={busy} className="sb-btn-secondary">Record expense</button></form></SurfaceCard></div>
    <div className="grid gap-5 lg:grid-cols-2"><SurfaceCard><h2 className="font-semibold">Invoices and payments</h2><div className="mt-4 space-y-3">{invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} busy={busy} create={create} />)}{!invoices.length ? <p className="text-sm text-[var(--text-muted)]">No invoices yet.</p> : null}</div></SurfaceCard><div id="ops-settlement"><SurfaceCard><h2 className="font-semibold">Settle a recorded gig</h2><p className="mt-1 text-xs text-[var(--text-muted)]">This creates a draft settlement. It does not finalize or close the gig. Current event expenses are deducted; net is split equally across the active lineup. One event can have only one settlement.</p><form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void create("/settlements", { eventId: settlementEvent, currency: "USD", grossMinor: Math.round(Number(settlementGross) * 100), splits: equalSplits() }); }}><select aria-label="Settlement event" required className="sb-select" value={settlementEvent} onChange={(event) => setSettlementEvent(event.target.value)}><option value="">Select event</option>{settleableEvents.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select><input required className="sb-input" min="0" step="0.01" type="number" value={settlementGross} onChange={(event) => setSettlementGross(event.target.value)} placeholder="Gross USD" /><button disabled={busy || members.length === 0 || settleableEvents.length === 0} className="sb-btn-primary">Create draft settlement</button></form>{!settleableEvents.length ? <p className="mt-3 text-xs text-[var(--text-muted)]">Every recorded gig already has a settlement, or no gig is available to settle.</p> : null}<div className="mt-4 space-y-2">{settlements.map((settlement) => <div key={settlement.id} className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-3 sm:flex-row sm:items-center"><div className="flex-1"><p className="font-medium">{settlement.event.title}</p><p className="text-xs text-[var(--text-muted)]">Net {settlement.currency} {(settlement.netMinor / 100).toFixed(2)}</p></div>{settlement.status === "draft" ? <button className="sb-btn-secondary" disabled={busy} onClick={() => void create(`/settlements/${settlement.id}/finalize`, {})}>Finalize PDF</button> : <Badge variant="success">finalized</Badge>}</div>)}</div></SurfaceCard></div></div>
    {expenses.length ? <SurfaceCard><h2 className="font-semibold">Recent expenses</h2><div className="mt-3 divide-y divide-[var(--border)]">{expenses.slice(0, 10).map((expense) => <div key={expense.id} className="flex justify-between gap-4 py-3 text-sm"><span>{expense.description}<span className="ml-2 text-[var(--text-muted)]">{expense.event?.title ?? expense.project?.name}</span></span><span>{expense.currency} {(expense.amountMinor / 100).toFixed(2)}</span></div>)}</div></SurfaceCard> : null}
  </div>;
}

function InvoiceRow({ invoice, busy, create }: { invoice: Invoice; busy: boolean; create: Mutate }) {
  const [amount, setAmount] = useState("");
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const next = invoicePaymentNextAction(invoice);
  const badgeVariant = invoice.status === "voided" ? "danger" : next.balanceMinor === 0 ? "success" : "warning";
  return <div className="rounded-lg border border-[var(--border)] p-3"><div className="flex items-center justify-between"><div><p className="font-medium">{invoice.number} · {invoice.recipientName}</p><p className="text-xs text-[var(--text-muted)]">Balance {invoice.currency} {(next.balanceMinor / 100).toFixed(2)}{invoice.event?.title ? ` · ${invoice.event.title}` : ""}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Next: {next.nextAction}</p></div><Badge variant={badgeVariant}>{invoice.status}</Badge></div>{next.canRecordPayment ? <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); void create(`/invoices/${invoice.id}/record-payment`, { idempotencyKey: paymentKey, amountMinor: Math.round(Number(amount) * 100), currency: invoice.currency, method: "manual", receivedAt: new Date().toISOString() }).then(() => { setAmount(""); setPaymentKey(crypto.randomUUID()); }); }}><input required className="sb-input" type="number" min="0.01" max={(next.balanceMinor / 100).toFixed(2)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Payment" /><button disabled={busy} className="sb-btn-secondary">Record</button></form> : null}</div>;
}
