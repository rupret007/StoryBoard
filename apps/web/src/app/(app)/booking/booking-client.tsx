"use client";

import { bookingStageNextAction, bookingStages } from "@storyboard/shared";
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
        {opportunities.length === 0 && !loadError ? (
          <EmptyState
            title="No opportunities yet"
            description="Create your first deal above. Cards group by stage so you can scan momentum like a CRM board."
            icon={<Kanban className="h-6 w-6" />}
          />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {STAGES.map((stage) => (
              <div
                key={stage}
                className="flex w-[280px] shrink-0 flex-col gap-3"
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
                        setNotice(`${saved.title}: recorded as ${saved.stage}.`);
                        router.refresh();
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
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
