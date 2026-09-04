"use client";

import { Badge, SurfaceCard } from "@storyboard/ui";
import {
  catalogSourceLabel,
  projectOpsShowControl,
  showControlActionContextLabel,
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
  const nextContext = next ? showControlActionContextLabel(next.code) : "Recorded posture";

  return (
    <section
      data-testid="ops-show-control"
      aria-labelledby="ops-show-control-heading"
      className="rounded-[var(--radius-xl)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-5 shadow-[var(--shadow-sm)]"
    >
      <header className="mb-4">
        <p className="sb-kicker">Show control</p>
        <h2 id="ops-show-control-heading" className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
          One clear next move
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
          StoryBoard puts one recorded action first, then shows the facts behind it. Travis books and owns connections; StoryBoard will not pitch, post, or invent a schedule.
        </p>
      </header>

      <div
        data-testid="ops-show-control-action"
        className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--accent)]/40 bg-[var(--surface-0)] p-5 shadow-[var(--shadow-sm)]"
      >
        <div className="absolute inset-y-0 left-0 w-1 bg-[var(--accent)]" aria-hidden />
        <div className="flex flex-col gap-5 pl-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              {next ? `Do this next · ${nextContext}` : "Current records"}
            </p>
            <h3 id="ops-show-control-next-heading" className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              {next?.label ?? "No recorded action right now"}
            </h3>
            <p
              id="ops-show-control-next-description"
              className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]"
              data-testid="ops-show-control-next"
            >
              {next?.nextAction ?? "Review the recorded posture below. StoryBoard will not invent work to fill an empty queue."}
            </p>
            {!canManage ? (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Read-only. An owner or member must make changes; this action only opens existing records.
              </p>
            ) : null}
          </div>
          {next ? (
            workspaceTarget ? (
              <button
                type="button"
                data-testid="ops-show-control-primary"
                className="sb-btn-primary w-full shrink-0 justify-center sm:w-auto"
                aria-describedby="ops-show-control-next-description"
                onClick={() => onOpenWorkspace(workspaceTarget.tab, workspaceTarget.eventId, workspaceTarget.focus)}
              >
                {next.label}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <a
                data-testid="ops-show-control-primary"
                className="sb-btn-primary w-full shrink-0 justify-center sm:w-auto"
                href={next.href}
                aria-describedby="ops-show-control-next-description"
              >
                {next.label}
                <ArrowRight className="h-4 w-4" />
              </a>
            )
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="sb-kicker">Recorded posture</p>
          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">Why this action is first</h3>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-[var(--text-muted)]">
          Show, set, and booking records support the priority above. These cards are evidence, not extra action choices.
        </p>
      </div>

      <div data-testid="ops-show-control-posture" className="mt-3 grid gap-3 lg:grid-cols-3">
        <SurfaceCard padding="sm" className="flex flex-col">
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
              {control.show.phase === "overdue" ? (
                <div data-testid="ops-show-control-wrap-up" className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-sm font-semibold text-amber-100">{control.show.wrapUpRecorded ? "After-show facts are recorded" : "After-show wrap-up is ready"}</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                    {control.show.wrapUpRecorded
                      ? "Attendance, money, lessons, or the relationship outcome is already saved. Next is a draft settlement when you are ready. StoryBoard will not invent net or close the gig."
                      : "Record attendance, gross revenue, lessons, and the buyer or venue relationship outcome. Pre-show gaps stay visible in the record, but they no longer hide this follow-through."}
                  </p>
                </div>
              ) : control.show.readinessAvailability === "ok" ? (
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

        <SurfaceCard padding="sm" className="flex flex-col">
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

        <SurfaceCard padding="sm" className="flex flex-col">
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

    </section>
  );
}
