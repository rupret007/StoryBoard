"use client";

import { bookingStageNextAction, bookingStages, describeBookingTarget } from "@storyboard/shared";
import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Kanban, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { BookingOpportunity, Venue } from "@/lib/types";
import { BookingStageEditor } from "./booking-stage-editor";

const STAGES = bookingStages;

const stageStyle: Record<string, "accent" | "violet" | "neutral" | "success" | "warning"> = {
  target: "neutral",
  outreach: "accent",
  conversation: "violet",
  offer: "violet",
  hold: "warning",
  confirmed: "success",
  closed: "neutral"
};

export function BookingClient({
  initialOpportunities,
  venues,
  opportunityRisks = {},
  artistId,
  accessState,
  loadError
}: {
  initialOpportunities: BookingOpportunity[];
  venues: Venue[];
  artistId: string | null;
  accessState: "manage" | "read_only" | "unavailable";
  loadError: string;
  opportunityRisks?: Record<string, "low" | "med" | "high">;
}) {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [notice, setNotice] = useState("");
  const canManage = accessState === "manage" && Boolean(artistId);
  useEffect(() => setOpportunities(initialOpportunities), [initialOpportunities]);
  const [title, setTitle] = useState("");
  const [venueId, setVenueId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chosenStage, setChosenStage] = useState<(typeof STAGES)[number] | null>(null);

  const byStage = useMemo(() => {
    const m = {} as Record<(typeof STAGES)[number], BookingOpportunity[]>;
    for (const s of STAGES) {
      m[s] = [];
    }
    for (const o of opportunities) {
      const stage: (typeof STAGES)[number] = STAGES.includes(
        o.stage as (typeof STAGES)[number]
      )
        ? (o.stage as (typeof STAGES)[number])
        : "target";
      m[stage].push(o);
    }
    return m;
  }, [opportunities]);
  const visibleStage = chosenStage ?? STAGES.find((stage) => byStage[stage].length > 0) ?? "target";

  async function createOpp(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage || !artistId || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch("/booking-opportunities", {
        method: "POST",
        artistId,
        signal: AbortSignal.timeout(15_000),
        json: {
          title: title.trim(),
          venueId: venueId || undefined
        }
      });
      setTitle("");
      setVenueId("");
      setChosenStage("target");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the opportunity");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {notice ? <p role="status" className="text-sm text-emerald-200">{notice}</p> : null}
      {accessState !== "manage" ? <p role="status" className="text-sm text-[var(--text-muted)]">{accessState === "read_only" ? "You have read-only access. An owner or member can record booking changes." : "Booking access could not be verified. Reload before making changes."}</p> : null}
      {loadError ? <div role="alert" className="text-sm text-amber-200">{loadError} <button className="sb-btn-secondary" onClick={() => router.refresh()}>Reload pipeline</button></div> : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {canManage ? <SurfaceCard>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              New opportunity
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Travis books. StoryBoard tracks the pipeline and will not pitch,
              post, or send on its own.
            </p>
          </div>
        </div>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(ev) => void createOpp(ev)}
        >
          <label className="block flex-1">
            <span className="sb-label">Title</span>
            <input
              required
              className="sb-input mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ryman — fall window"
            />
          </label>
          <label className="block w-full sm:w-56">
            <span className="sb-label">Venue</span>
            <select
              className="sb-select mt-1.5"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
            >
              <option value="">Optional</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="sb-btn-primary shrink-0"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </form>
      </SurfaceCard> : null}

      <div>
        <div className="mb-4 flex items-center gap-2">
          <Kanban className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Pipeline
          </h2>
        </div>
        {loadError ? null : opportunities.length === 0 ? (
          <EmptyState
            title="No opportunities yet"
            description={canManage ? "Create your first deal above. Cards group by stage so you can scan momentum like a CRM board." : "An owner or member can record the first opportunity. Travis books; this board tracks recorded deals."}
            icon={<Kanban className="h-6 w-6" />}
          />
        ) : (
          <div>
            <div className="mb-4 sm:hidden">
              <label className="sb-label" htmlFor="booking-stage-view">View booking stage</label>
              <select
                id="booking-stage-view"
                className="sb-select mt-1.5 min-h-11 w-full"
                value={visibleStage}
                aria-describedby="booking-stage-count"
                onChange={(event) => setChosenStage(event.target.value as (typeof STAGES)[number])}
              >
                {STAGES.map((stage) => (
                  <option key={stage} value={stage}>{stage} ({byStage[stage].length})</option>
                ))}
              </select>
              <p id="booking-stage-count" className="mt-2 text-xs text-[var(--text-muted)]" role="status">
                {byStage[visibleStage].length} of {opportunities.length} recorded opportunities shown.
              </p>
            </div>
            <div className="flex min-w-0 gap-4 pb-2 sm:overflow-x-auto">
            {STAGES.map((stage) => (
              <div
                key={stage}
                data-testid={`booking-column-${stage}`}
                className={`${visibleStage === stage ? "flex" : "hidden sm:flex"} w-full min-w-0 shrink-0 flex-col gap-3 sm:w-[280px]`}
              >
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {stage.replace("_", " ")}
                  </span>
                  <Badge variant={stageStyle[stage] ?? "neutral"}>
                    {byStage[stage]?.length ?? 0}
                  </Badge>
                </div>
                <div className="min-h-[120px] space-y-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--surface-0)]/50 p-2">
                  {byStage[stage].length === 0 ? <p className="p-2 text-sm text-[var(--text-muted)] sm:hidden">No opportunities in {stage}. Choose another stage to see this band's recorded deals.</p> : null}
                  {(byStage[stage] ?? []).map((o) => (
                    <OppCard
                      key={o.id}
                      opportunity={o}
                      {...(o.id in opportunityRisks
                        ? { risk: opportunityRisks[o.id]! }
                        : {})}
                      artistId={artistId}
                      canManage={canManage}
                      onSaved={(saved) => {
                        setOpportunities((rows) => rows.map((row) => row.id === saved.id ? saved : row));
                        setChosenStage(saved.stage as (typeof STAGES)[number]);
                        setNotice(`${saved.title}: recorded as ${saved.stage}.`);
                        router.refresh();
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OppCard({
  opportunity: o,
  risk,
  artistId,
  canManage,
  onSaved
}: {
  opportunity: BookingOpportunity;
  risk?: "low" | "med" | "high";
  artistId: string | null;
  canManage: boolean;
  onSaved: (saved: BookingOpportunity) => void;
}) {
  const next = bookingStageNextAction(o.stage);
  const target = describeBookingTarget({ targetDate: o.targetDate, stage: o.stage });

  return (
    <SurfaceCard padding="sm" className="border-[var(--border-strong)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-medium leading-snug text-[var(--text-primary)]">
          {o.title}
        </h3>
        {risk && risk !== "low" ? (
          <Badge variant={risk === "high" ? "danger" : "warning"}>
            {risk} risk
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {o.venue ? `${o.venue.name} · ${o.venue.city}` : "No venue"}
      </p>
      <p
        className={`mt-1 text-xs ${
          target.timing === "past"
            ? "text-amber-300"
            : target.timing === "none"
              ? "text-[var(--text-muted)]"
              : "text-[var(--text-secondary)]"
        }`}
        data-testid={`booking-target-${o.id}`}
      >
        {target.label}
        {target.note ? ` — ${target.note}` : ""}
      </p>
      {o.proposedFeeMinor != null ? (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Recorded terms {o.proposedCurrency ?? "USD"} {(o.proposedFeeMinor / 100).toFixed(2)}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-[var(--text-secondary)]" data-testid={`booking-next-action-${o.id}`}>
        Next: {next.nextAction}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <BookingStageEditor opportunity={o} artistId={artistId} canManage={canManage} onSaved={onSaved} />
        <a className="text-xs font-medium text-[var(--accent)]" href={next.href}>
          Open next workspace
        </a>
      </div>
    </SurfaceCard>
  );
}
