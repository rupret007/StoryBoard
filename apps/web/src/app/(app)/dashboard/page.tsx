import { Badge, MetricStat, PageHeader, SurfaceCard } from "@storyboard/ui";
import {
  catalogSourceLabel,
  selectNextRecordedGig,
  summarizeSetlist
} from "@storyboard/shared";
import { serverApiFetch } from "@/lib/api-server";
import type {
  BandEvent,
  DashboardInsights,
  DashboardStats,
  Setlist,
  ShowReadiness,
  Task,
  WeeklySummary
} from "@/lib/types";
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  ClipboardList,
  ListMusic,
  ListTodo,
  Sparkles
} from "lucide-react";
import Link from "next/link";

type BadgeVariant = "neutral" | "warning" | "success" | "danger";

function eventStatusVariant(status: string): BadgeVariant {
  return status === "confirmed"
    ? "success"
    : status === "hold"
      ? "warning"
      : "neutral";
}

function readinessVariant(status: ShowReadiness["status"]): BadgeVariant {
  return status === "ready"
    ? "success"
    : status === "attention"
      ? "warning"
      : "danger";
}

function formatRecordedShowTime(show: BandEvent) {
  if (!show.startsAt) return "Date not recorded";
  const instant = new Date(show.startsAt);
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
  if (show.timezone) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        ...options,
        timeZone: show.timezone
      }).format(instant);
    } catch {
      return `${new Intl.DateTimeFormat("en-US", options).format(instant)} · recorded timezone is invalid`;
    }
  }
  return `${new Intl.DateTimeFormat("en-US", options).format(instant)} · timezone not recorded`;
}

export default async function DashboardPage() {
  let stats: DashboardStats | null = null;
  let tasks: Task[] = [];
  let summary: WeeklySummary | null = null;
  let insights: DashboardInsights | null = null;
  let events: BandEvent[] | null = null;
  let readiness: ShowReadiness[] | null = null;
  let setlists: Setlist[] | null = null;
  let error: string | null = null;
  try {
    const [coreRows, operationsRows] = await Promise.all([
      Promise.all([
        serverApiFetch<DashboardStats>("/dashboard/stats", {
          cache: "no-store"
        }),
        serverApiFetch<Task[]>("/tasks", { cache: "no-store" }),
        serverApiFetch<WeeklySummary>("/weekly-summary", {
          cache: "no-store"
        }),
        serverApiFetch<DashboardInsights>("/dashboard/insights", {
          cache: "no-store"
        }).catch(() => null)
      ]),
      Promise.allSettled([
        serverApiFetch<BandEvent[]>("/events", { cache: "no-store" }),
        serverApiFetch<ShowReadiness[]>("/events/readiness?days=120", {
          cache: "no-store"
        }),
        serverApiFetch<Setlist[]>("/setlists", { cache: "no-store" })
      ])
    ]);
    [stats, tasks, summary, insights] = coreRows;
    const [eventRows, readinessRows, setlistRows] = operationsRows;
    if (eventRows.status === "fulfilled") events = eventRows.value;
    if (readinessRows.status === "fulfilled") readiness = readinessRows.value;
    if (setlistRows.status === "fulfilled") setlists = setlistRows.value;
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach the API.";
  }

  const now = new Date();
  const overdueList =
    stats && !error
      ? tasks.filter(
          (t) =>
            t.status !== "done" &&
            t.dueAt &&
            new Date(t.dueAt) < now
        )
      : [];
  const nextShow = events ? selectNextRecordedGig(events, now) : null;
  const nextShowReadiness =
    nextShow && readiness
      ? readiness.find((item) => item.eventId === nextShow.id) ?? null
      : null;
  const assignedSetlist = nextShow
    ? nextShow.setlist ??
      (nextShow.setlistId && setlists
        ? setlists.find((setlist) => setlist.id === nextShow.setlistId) ?? null
        : null)
    : null;
  const assignedSetSummary = assignedSetlist
    ? assignedSetlist.summary ?? summarizeSetlist(assignedSetlist.items)
    : null;
  const assignedSetTitles = assignedSetlist
    ? assignedSetlist.items.flatMap((item) => {
        if (item.itemType !== "song") return [];
        const title = item.song?.title?.trim() || item.label?.trim();
        return title ? [title] : [];
      })
    : [];

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Command center"
          description="Connect the API to see live operational data."
        />
        <SurfaceCard elevated className="border-amber-500/20 bg-amber-950/20">
          <div className="flex gap-3">
            <CircleAlert className="h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-100">API unavailable</p>
              <p className="mt-1 text-sm text-amber-200/85">{error}</p>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Start the API with{" "}
                <code className="rounded-md bg-[var(--surface-0)] px-1.5 py-0.5 text-xs">
                  pnpm dev:api
                </code>{" "}
                and confirm{" "}
                <code className="rounded-md bg-[var(--surface-0)] px-1.5 py-0.5 text-xs">
                  API_URL
                </code>{" "}
                matches this app.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  const s = stats!;
  const approvalAttention = s.approvalAttention;
  const statCards = [
    { label: "Venues", value: s.venues, href: "/venues" },
    { label: "Contacts", value: s.contacts, href: "/contacts" },
    { label: "Opportunities", value: s.bookingOpportunities, href: "/booking" },
    { label: "Active pipeline", value: s.activeOpportunities, href: "/booking" },
    { label: "Tasks", value: s.tasks, href: "/tasks" },
    { label: "Overdue", value: s.overdueTasks, href: "/tasks" },
    { label: "Approval decisions", value: approvalAttention.pendingDecision, href: "/approvals#pending-decisions" },
    { label: "Ready to execute", value: approvalAttention.readyToExecute, href: "/approvals#ready-to-execute" },
    { label: "Execution in progress", value: approvalAttention.executionInProgress, href: "/approvals#execution-in-progress" },
    { label: "Needs reconciliation", value: approvalAttention.needsReconciliation, href: "/approvals#needs-reconciliation" }
  ];
  const isNewWorkspace = s.venues === 0 && s.contacts === 0 && s.bookingOpportunities === 0;
  const bookingHref = isNewWorkspace ? "/prospects" : "/booking";
  const bookingAction = isNewWorkspace
    ? "Set up booking profile"
    : s.activeOpportunities > 0
      ? "Review active pipeline"
      : "Open booking pipeline";

  return (
    <div className="space-y-10">
      <PageHeader
        title="Command center"
        description="Your operational home base: the next recorded show, its assigned set, and the booking work that moves the calendar forward."
        actions={
          <Link
            href="/summary"
            className="sb-btn-secondary hidden items-center gap-2 sm:inline-flex"
          >
            <ClipboardList className="h-4 w-4" />
            Weekly briefing
          </Link>
        }
      />

      <section aria-labelledby="show-set-booking-heading">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[var(--accent)]" />
          <h2
            id="show-set-booking-heading"
            className="text-sm font-semibold text-[var(--text-primary)]"
          >
            Show, set, booking
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <SurfaceCard elevated className="flex min-h-72 flex-col">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Next recorded show
              </p>
              {nextShow ? (
                <Badge variant={eventStatusVariant(nextShow.status)}>
                  {nextShow.status.replaceAll("_", " ")}
                </Badge>
              ) : null}
            </div>
            {events === null ? (
              <>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                  Show data unavailable
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  StoryBoard could not verify the event list. It will not guess
                  which show is next.
                </p>
              </>
            ) : nextShow ? (
              <>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                  {nextShow.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {formatRecordedShowTime(nextShow)}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {nextShow.venue?.name ??
                    nextShow.locationName ??
                    "Location not recorded"}
                </p>
                {nextShowReadiness ? (
                  <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={readinessVariant(nextShowReadiness.status)}>
                        {nextShowReadiness.status.replaceAll("_", " ")}
                      </Badge>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">
                        {nextShowReadiness.score}/100
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {nextShowReadiness.confidenceLabel} record confidence
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                      {nextShowReadiness.headline}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-[var(--text-muted)]">
                    {readiness === null
                      ? "Readiness data unavailable."
                      : "No readiness assessment is recorded in the 120-day window."}
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                  No upcoming show is recorded
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Add a real hold, draft, or confirmed gig when its date is
                  known. StoryBoard will not invent a live band schedule.
                </p>
              </>
            )}
            <Link
              href={nextShow ? `/operations/events/${nextShow.id}` : "/operations"}
              className="sb-btn-secondary mt-auto w-fit"
            >
              {nextShow ? "Open show" : "Open band operations"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </SurfaceCard>

          <SurfaceCard elevated className="flex min-h-72 flex-col">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Assigned set
              </p>
              <ListMusic className="h-4 w-4 text-[var(--accent)]" />
            </div>
            {!nextShow ? (
              <>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                  {events === null ? "Set assignment unavailable" : "Waiting for a show"}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {events === null
                    ? "StoryBoard cannot verify a show or its set while event data is unavailable."
                    : "Record the next show first; its exact assigned set will appear here."}
                </p>
              </>
            ) : assignedSetlist && assignedSetSummary ? (
              <>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                  {assignedSetlist.name}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="accent">
                    {catalogSourceLabel(assignedSetlist.sourceKey)}
                  </Badge>
                  <Badge>
                    {assignedSetSummary.songCount} song
                    {assignedSetSummary.songCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">
                  {assignedSetSummary.durationLabel}
                </p>
                {assignedSetTitles.length > 0 ? (
                  <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
                    First up: {assignedSetTitles.slice(0, 3).join(" · ")}
                    {assignedSetTitles.length > 3 ? " · …" : ""}
                  </p>
                ) : (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    No song titles are recorded in this set.
                  </p>
                )}
              </>
            ) : !nextShow.setlistId ? (
              <>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                  No setlist assigned
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {nextShow.title} has no recorded set. Assign an existing
                  Vault-fed or manually maintained set in Band operations.
                </p>
              </>
            ) : setlists === null ? (
              <>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                  Setlist data unavailable
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  This show has a setlist ID, but StoryBoard could not verify
                  the set contents.
                </p>
              </>
            ) : (
              <>
                <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
                  Assigned set not found
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  The show points to a setlist that was not returned. Review
                  the assignment instead of substituting another set.
                </p>
              </>
            )}
            <Link href="/operations" className="sb-btn-secondary mt-auto w-fit">
              Open band operations
              <ArrowRight className="h-4 w-4" />
            </Link>
          </SurfaceCard>

          <SurfaceCard elevated className="flex min-h-72 flex-col">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Booking
              </p>
              <Badge>Travis books</Badge>
            </div>
            <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
              {s.activeOpportunities} active pipeline
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {s.bookingOpportunities} total {s.bookingOpportunities === 1
                ? "opportunity"
                : "opportunities"} recorded
            </p>
            {insights ? (
              <div className="mt-4 flex items-center gap-2">
                <Badge
                  variant={
                    insights.bookingHealth.label === "Healthy"
                      ? "success"
                      : insights.bookingHealth.label === "Attention"
                        ? "warning"
                        : "danger"
                  }
                >
                  {insights.bookingHealth.label}
                </Badge>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {insights.bookingHealth.score}/100 health
                </span>
              </div>
            ) : (
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Booking health is unavailable; recorded pipeline counts remain
                visible.
              </p>
            )}
            <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
              Travis handles booking. StoryBoard tracks reviewed work and never
              pitches, posts, or sends on its own.
            </p>
            <Link href={bookingHref} className="sb-btn-secondary mt-auto w-fit">
              {bookingAction}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </SurfaceCard>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            At a glance
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {statCards.map((card) => (
            <MetricStat
              key={card.label}
              label={card.label}
              value={card.value}
              href={card.href}
            />
          ))}
        </div>
      </section>

      {approvalAttention.needsReconciliation > 0 ? (
        <SurfaceCard elevated className="border-red-500/30 bg-red-500/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
              <div>
                <h2 className="font-semibold text-red-100">Provider work needs reconciliation</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-red-200/80">
                  {approvalAttention.needsReconciliation} failed or unresolved one-shot execution {approvalAttention.needsReconciliation === 1 ? "claim requires" : "claims require"} human review. StoryBoard will not retry this work automatically.
                </p>
              </div>
            </div>
            <Link href="/approvals#needs-reconciliation" className="sb-btn-secondary min-h-11 shrink-0 border-red-500/30">
              Review safely
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </SurfaceCard>
      ) : null}

      {isNewWorkspace ? (
        <SurfaceCard elevated className="border-[var(--accent)]/20 bg-[var(--accent-muted)]/30">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Start your next show</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Build one market, one deliberate step at a time.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">Start with the booking profile, add a target, then qualify and pitch it when the details are ready.</p>
            </div>
            <Link href="/prospects" className="sb-btn-primary min-h-11 shrink-0">Set up booking profile<ArrowRight className="h-4 w-4" /></Link>
          </div>
          <ol className="mt-5 grid gap-3 border-t border-[var(--accent)]/15 pt-5 sm:grid-cols-3">
            {["Complete profile", "Add a qualified lead", "Create a reviewed pitch"].map((step, index) => <li key={step} className="flex items-center gap-3 text-sm text-[var(--text-secondary)]"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-1)] font-mono text-xs text-[var(--accent)]">{index + 1}</span>{step}</li>)}
          </ol>
        </SurfaceCard>
      ) : null}

      {insights ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <SurfaceCard elevated>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Booking health
              </h2>
              <Badge
                variant={
                  insights.bookingHealth.label === "Healthy"
                    ? "success"
                    : insights.bookingHealth.label === "Attention"
                      ? "warning"
                      : "danger"
                }
              >
                {insights.bookingHealth.label}
              </Badge>
            </div>
            <p className="font-mono text-4xl font-bold tabular-nums text-[var(--text-primary)]">
              {insights.bookingHealth.score}
              <span className="ml-1 text-lg font-normal text-[var(--text-muted)]">
                /100
              </span>
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Deterministic score: starts at 100, subtracts impact for overdue
              tasks, stale follow-ups, pending approvals, and early-stage backlog.
              See docs/architecture.md for factors.
            </p>
            {insights.bookingHealth.factors.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm text-[var(--text-secondary)]">
                {insights.bookingHealth.factors.slice(0, 5).map((f) => (
                  <li
                    key={f.code}
                    className="flex justify-between gap-2 border-l-2 border-amber-500/40 pl-3"
                  >
                    <span>{f.detail}</span>
                    <span className="shrink-0 text-[var(--text-muted)]">
                      −{f.impact}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                No negative factors detected.
              </p>
            )}
          </SurfaceCard>

          <SurfaceCard elevated>
            <div className="mb-4 flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Priority actions
              </h2>
            </div>
            {insights.priorityActions.length > 0 ? (
              <ul className="space-y-3">
                {insights.priorityActions.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      className="group block rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-3 transition hover:border-[var(--accent)]/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                          {a.title}
                        </span>
                        <Badge
                          variant={
                            a.severity === "high"
                              ? "danger"
                              : a.severity === "med"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {a.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {a.reason}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Nothing urgent — you are caught up.
              </p>
            )}
          </SurfaceCard>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SurfaceCard elevated>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Manager briefing
            </h2>
            <Link
              href="/summary"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              Full summary
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {summary && summary.recommendations.length > 0 ? (
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              {summary.recommendations.slice(0, 4).map((r, i) => (
                <li
                  key={i}
                  className="flex gap-3 border-l-2 border-[var(--accent-muted)] pl-3 leading-relaxed"
                >
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              No automated recommendations this week — data looks quiet.
            </p>
          )}
          {summary ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                Pipeline
              </span>
              {Object.entries(summary.bookingPipelineByStage)
                .filter(([, n]) => n > 0)
                .slice(0, 6)
                .map(([stage, count]) => (
                  <span
                    key={stage}
                    className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                  >
                    {stage}:{" "}
                    <span className="font-mono text-[var(--text-primary)]">
                      {count}
                    </span>
                  </span>
                ))}
            </div>
          ) : null}
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Quick links
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link
                href="/booking"
                className="text-[var(--accent)] hover:text-[var(--accent-hover)]"
              >
                Booking pipeline
              </Link>
              <span className="text-[var(--text-muted)]">
                {" "}
                — move deals stage by stage
              </span>
            </li>
            <li>
              <Link
                href="/approvals"
                className="text-[var(--accent)] hover:text-[var(--accent-hover)]"
              >
                Approval center
              </Link>
              <span className="text-[var(--text-muted)]">
                {" "}
                — {approvalAttention.pendingDecision} decide · {approvalAttention.readyToExecute} execute · {approvalAttention.needsReconciliation} reconcile
              </span>
            </li>
            <li>
              <Link
                href="/activity"
                className="text-[var(--accent)] hover:text-[var(--accent-hover)]"
              >
                Activity log
              </Link>
              <span className="text-[var(--text-muted)]">
                {" "}
                — audited changes
              </span>
            </li>
          </ul>
        </SurfaceCard>
      </div>

      {overdueList.length > 0 ? (
        <SurfaceCard className="border-amber-500/25 bg-amber-950/10">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-100">
            <CircleAlert className="h-4 w-4" />
            Overdue by due date
          </h2>
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {overdueList.slice(0, 8).map((t) => (
              <li
                key={t.id}
                className="flex justify-between gap-4 py-3 text-sm first:pt-0"
              >
                <span className="text-[var(--text-primary)]">{t.title}</span>
                <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                  {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : "—"}
                </span>
              </li>
            ))}
          </ul>
          {overdueList.length > 8 ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              +{overdueList.length - 8} more in Tasks
            </p>
          ) : null}
          <Link
            href="/tasks"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]"
          >
            Open tasks
            <ArrowRight className="h-3 w-3" />
          </Link>
        </SurfaceCard>
      ) : null}
    </div>
  );
}
