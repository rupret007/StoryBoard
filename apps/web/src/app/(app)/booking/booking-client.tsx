"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Kanban, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { BookingOpportunity, Venue } from "@/lib/types";

const STAGES = [
  "target",
  "outreach",
  "conversation",
  "offer",
  "hold",
  "confirmed",
  "closed"
] as const;

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
  opportunityRisks = {}
}: {
  initialOpportunities: BookingOpportunity[];
  venues: Venue[];
  opportunityRisks?: Record<string, "low" | "med" | "high">;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [venueId, setVenueId] = useState("");
  const [busy, setBusy] = useState(false);

  const byStage = useMemo(() => {
    const m = {} as Record<(typeof STAGES)[number], BookingOpportunity[]>;
    for (const s of STAGES) {
      m[s] = [];
    }
    for (const o of initialOpportunities) {
      const stage: (typeof STAGES)[number] = STAGES.includes(
        o.stage as (typeof STAGES)[number]
      )
        ? (o.stage as (typeof STAGES)[number])
        : "target";
      m[stage].push(o);
    }
    return m;
  }, [initialOpportunities]);

  async function createOpp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/booking-opportunities", {
        method: "POST",
        json: {
          title: title.trim(),
          venueId: venueId || undefined
        }
      });
      setTitle("");
      setVenueId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <SurfaceCard>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              New opportunity
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Adds a card to your pipeline — drag-free for now, stages update in
              place.
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
      </SurfaceCard>

      <div>
        <div className="mb-4 flex items-center gap-2">
          <Kanban className="h-4 w-4 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Pipeline
          </h2>
        </div>
        {initialOpportunities.length === 0 ? (
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
                      onStageChange={() => router.refresh()}
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
  onStageChange
}: {
  opportunity: BookingOpportunity;
  risk?: "low" | "med" | "high";
  onStageChange: () => void;
}) {
  const [stage, setStage] = useState(o.stage);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStage(o.stage);
  }, [o.stage]);

  async function updateStage() {
    if (stage === o.stage) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/booking-opportunities/${o.id}/stage`, {
        method: "PATCH",
        json: { stage }
      });
      onStageChange();
    } finally {
      setBusy(false);
    }
  }

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
      <div className="mt-3 flex flex-col gap-2">
        <select
          className="sb-select text-xs"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || stage === o.stage}
          className="sb-btn-secondary py-2 text-xs disabled:opacity-40"
          onClick={() => void updateStage()}
        >
          Apply stage
        </button>
      </div>
    </SurfaceCard>
  );
}
