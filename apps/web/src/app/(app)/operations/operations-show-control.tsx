"use client";

import { Badge, SurfaceCard } from "@storyboard/ui";
import {
  catalogSourceLabel,
  projectOpsShowControl,
  type OpsShowControl,
  type OpsShowControlBooking,
  type OpsShowControlEvent,
  type OpsShowControlInvoice,
  type OpsShowControlReadiness,
  type OpsShowControlSetlist,
  type OpsShowControlSettlement,
  type OpsWorkspaceFocus,
  type OpsWorkspaceTab
} from "@storyboard/shared";
import { ArrowRight, CalendarDays, ListMusic, Ticket } from "lucide-react";

type BadgeVariant = "neutral" | "warning" | "success" | "danger" | "accent";

function eventStatusVariant(status: string | null): BadgeVariant {
  if (status === "confirmed") return "success";
  if (status === "hold") return "warning";
  return "neutral";
}

function phaseVariant(phase: OpsShowControl["show"]["phase"]): BadgeVariant {
  if (phase === "live") return "success";
  if (phase === "upcoming") return "accent";
  if (phase === "overdue") return "danger";
  return "neutral";
}

function readinessVariant(status: string | null): BadgeVariant {
  if (status === "ready") return "success";
  if (status === "attention") return "warning";
  if (status === "not_ready" || status === "blocked") return "danger";
  return "neutral";
}

function formatRecordedShowTime(startsAt: string | null, timezone?: string | null) {
  if (!startsAt) return "Date not recorded";
  const instant = new Date(startsAt);
  if (!Number.isFinite(instant.getTime())) return "Recorded date is invalid";
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  };
  if (timezone) {
    try {
      return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).format(instant);
    } catch {
      return `${new Intl.DateTimeFormat("en-US", options).format(instant)} · recorded timezone is invalid`;
    }
  }
  return `${new Intl.DateTimeFormat("en-US", options).format(instant)} · timezone not recorded`;
}

function phaseLabel(phase: OpsShowControl["show"]["phase"]) {
  if (phase === "live") return "live now";
  if (phase === "upcoming") return "upcoming";
  if (phase === "overdue") return "still open";
  return "none recorded";
}

export function OperationsShowControl({
  eventsAvailable,
  readinessAvailable,
  setlistsAvailable,
  bookingsAvailable,
  events,
  readiness,
  setlists,
  bookings,
  invoices,
  settlements,
  canManage,
  onOpenWorkspace
}: {
  eventsAvailable: boolean;
  readinessAvailable: boolean;
  setlistsAvailable: boolean;
  bookingsAvailable: boolean;
  events: OpsShowControlEvent[];
  readiness: OpsShowControlReadiness[];
  setlists: OpsShowControlSetlist[];
  bookings: OpsShowControlBooking[];
  invoices: OpsShowControlInvoice[];
  settlements: OpsShowControlSettlement[];
  canManage: boolean;
  onOpenWorkspace: (tab: OpsWorkspaceTab, eventId?: string, focus?: OpsWorkspaceFocus) => void;
}) {
  const control = projectOpsShowControl({
    eventsAvailable,
    readinessAvailable,
    setlistsAvailable,
    bookingsAvailable,
    events,
    readiness,
    setlists,
    bookings,
    invoices,
    settlements
  });
  const next = control.nextAction;
  const workspaceTarget = next?.tab
    ? (() => {
        const params = new URL(next.href, "https://storyboard.local").searchParams;
        return {
          tab: next.tab,
          eventId: params.get("event") ?? undefined,
          focus: next.focus
        };
      })()
    : null;

  return (
    <section
      data-testid="ops-show-control"
      aria-labelledby="ops-show-control-heading"
      className="rounded-[var(--radius-xl)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-5 shadow-[var(--shadow-sm)]"
    >
      <header className="mb-5">
        <p className="sb-kicker">Show control</p>
        <h2 id="ops-show-control-heading" className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
          Live show, set, and booking posture
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
          Recorded facts only. Travis books and owns connections. StoryBoard will not pitch, post, or invent a schedule.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <SurfaceCard padding="sm" className="flex min-h-52 flex-col">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Show</p>
            <CalendarDays className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          </div>
          {control.show.availability === "unavailable" ? (
            <>
              <h3 className="mt-3 text-lg font-semibold">{control.show.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                StoryBoard could not verify the event list. It will not guess which gig is live.
              </p>
            </>
          ) : control.show.availability === "empty" ? (
            <>
              <h3 className="mt-3 text-lg font-semibold">{control.show.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Add a dated draft, hold, or confirmed gig when the date is known.
              </p>
            </>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={phaseVariant(control.show.phase)}>{phaseLabel(control.show.phase)}</Badge>
                {control.show.status ? <Badge variant={eventStatusVariant(control.show.status)}>{control.show.status}</Badge> : null}
              </div>
              <h3 className="mt-3 text-lg font-semibold">{control.show.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {formatRecordedShowTime(control.show.startsAt, control.show.timezone)}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{control.show.location ?? "Location not recorded"}</p>
              {control.show.readinessAvailability === "ok" ? (
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={readinessVariant(control.show.readinessStatus)}>
                      {(control.show.readinessStatus ?? "unknown").replaceAll("_", " ")}
                    </Badge>
                    <span className="text-sm font-semibold">{control.show.readinessScore}/100</span>
                    <span className="text-xs text-[var(--text-muted)]">{control.show.confidenceLabel} record confidence</span>
                  </div>
                  {control.show.readinessHeadline ? (
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">{control.show.readinessHeadline}</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  {control.show.readinessAvailability === "unavailable"
                    ? "Readiness data unavailable."
                    : "No readiness assessment is recorded in the current window."}
                </p>
              )}
            </>
          )}
        </SurfaceCard>

        <SurfaceCard padding="sm" className="flex min-h-52 flex-col">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Set</p>
            <ListMusic className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          </div>
          {control.set.availability === "unavailable" ? (
            <>
              <h3 className="mt-3 text-lg font-semibold">Set data unavailable</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {control.set.setlistId
                  ? "This show has a setlist ID, but StoryBoard could not verify the running order. It will not substitute another set."
                  : "StoryBoard cannot verify a show or its set while event or setlist data is unavailable."}
              </p>
            </>
          ) : control.set.availability === "empty" ? (
            <>
              <h3 className="mt-3 text-lg font-semibold">Waiting for a show</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Record the next gig first. Its exact assigned set will appear here.</p>
            </>
          ) : control.set.availability === "unassigned" ? (
            <>
              <h3 className="mt-3 text-lg font-semibold">No setlist assigned</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {control.show.title} has no recorded set. Attach an existing Vault-fed or manually maintained set below. StoryBoard will not invent a running order.
              </p>
            </>
          ) : control.set.availability === "missing_record" ? (
            <>
              <h3 className="mt-3 text-lg font-semibold">Assigned set not found</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                The show points to a setlist that was not returned. Review the assignment instead of substituting another set.
              </p>
            </>
          ) : (
            <>
              <h3 className="mt-3 text-lg font-semibold">{control.set.name}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="accent">{catalogSourceLabel(control.set.sourceKey)}</Badge>
                <Badge variant={control.set.timingStatus === "timed" ? "success" : control.set.timingStatus === "incomplete" ? "warning" : "neutral"}>
                  {control.set.timingStatus === "timed" ? "timed" : control.set.timingStatus === "incomplete" ? "timing incomplete" : "no songs"}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{control.set.durationLabel}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {control.set.songCount} recorded song{control.set.songCount === 1 ? "" : "s"}
              </p>
            </>
          )}
        </SurfaceCard>

        <SurfaceCard padding="sm" className="flex min-h-52 flex-col">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Booking</p>
            <Ticket className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          </div>
          <div className="mt-3"><Badge>Travis books</Badge></div>
          {control.booking.availability === "unavailable" ? (
            <>
              <h3 className="mt-3 text-lg font-semibold">Booking posture unavailable</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{control.booking.nextAction}</p>
            </>
          ) : control.booking.availability === "empty" ? (
            <>
              <h3 className="mt-3 text-lg font-semibold">No open pipeline work</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{control.booking.nextAction}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {control.booking.totalCount} recorded opportunit{control.booking.totalCount === 1 ? "y" : "ies"}
              </p>
            </>
          ) : (
            <>
              <h3 className="mt-3 text-lg font-semibold">{control.booking.title}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={control.booking.stage === "hold" ? "warning" : "violet"}>{control.booking.stage}</Badge>
                <span className="text-xs text-[var(--text-muted)]">
                  {control.booking.openCount} open · {control.booking.totalCount} recorded
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">{control.booking.nextAction}</p>
            </>
          )}
        </SurfaceCard>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-[var(--text-primary)]" data-testid="ops-show-control-next">
          {next ? `Next: ${next.nextAction}` : "No recorded next action."}
        </p>
        {next ? (
          workspaceTarget ? (
            <button
              type="button"
              className="sb-btn-primary w-fit shrink-0"
              onClick={() => onOpenWorkspace(workspaceTarget.tab, workspaceTarget.eventId, workspaceTarget.focus)}
            >
              {next.label}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <a className="sb-btn-primary w-fit shrink-0" href={next.href}>
              {next.label}
              <ArrowRight className="h-4 w-4" />
            </a>
          )
        ) : null}
        {!canManage ? (
          <p className="text-xs text-[var(--text-muted)]">Read-only. An owner or member must make changes. This control only opens existing records.</p>
        ) : null}
      </div>
    </section>
  );
}
