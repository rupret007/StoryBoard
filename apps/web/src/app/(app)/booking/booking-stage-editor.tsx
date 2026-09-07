"use client";

import { nextBookingStages } from "@storyboard/shared";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { BookingOpportunity } from "@/lib/types";

type Review = { opportunity: BookingOpportunity; stage: string };

export function BookingStageEditor({ opportunity, artistId, canManage, onSaved }: {
  opportunity: BookingOpportunity;
  artistId: string | null;
  canManage: boolean;
  onSaved: (saved: BookingOpportunity) => void;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(opportunity.stage);
  const [review, setReview] = useState<Review | null>(null);
  const [latest, setLatest] = useState<BookingOpportunity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [mustReview, setMustReview] = useState(false);
  const current = latest && Date.parse(latest.updatedAt ?? "") >= Date.parse(opportunity.updatedAt ?? "") ? latest : opportunity;
  const choices = nextBookingStages(current.stage);
  const allowed = choices.some((choice) => choice === stage);
  const stale = Boolean(review && review.opportunity.updatedAt !== current.updatedAt);
  const canReview = canManage && Boolean(artistId && current.updatedAt) && allowed && !busy && !needsReload;

  function startReview() {
    if (!canReview) return;
    setReview({ opportunity: current, stage });
    setMustReview(false);
    setError("");
  }

  function checkRecord(value: BookingOpportunity) {
    if (value.id !== opportunity.id || value.artistId !== artistId || !value.updatedAt || !Number.isFinite(Date.parse(value.updatedAt))) {
      throw new Error("The opportunity response could not be verified.");
    }
    return value;
  }

  async function loadLatest() {
    if (!artistId || busy) return;
    setBusy(true);
    try {
      const row = checkRecord(await apiFetch<BookingOpportunity>(`/booking-opportunities/${opportunity.id}`, {
        artistId, signal: AbortSignal.timeout(15_000), cache: "no-store"
      }));
      setLatest(row);
      setNeedsReload(false);
      setMustReview(true);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the latest opportunity.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!review || !canManage || !artistId || busy || stale || needsReload || mustReview) return;
    setBusy(true);
    setError("");
    try {
      const row = checkRecord(await apiFetch<BookingOpportunity>(`/booking-opportunities/${opportunity.id}/stage`, {
        method: "PATCH", artistId, signal: AbortSignal.timeout(15_000),
        json: { stage: review.stage, expectedUpdatedAt: review.opportunity.updatedAt }
      }));
      if (row.stage !== review.stage) throw new Error("The saved stage could not be verified.");
      onSaved(row);
      setReview(null);
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "The save response was interrupted."} Save is not confirmed here. Load the latest details before trying again.`);
      setNeedsReload(true);
      setMustReview(true);
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return <p className="text-xs text-[var(--text-muted)]">Recorded stage: {opportunity.stage}</p>;

  return <div className="space-y-3" data-testid={`booking-stage-editor-${opportunity.id}`}>
    <label className="block">
      <span className="sb-label">Next stage for {opportunity.title}</span>
      <select className="sb-select mt-1 text-xs" value={stage} disabled={busy || !current.updatedAt || !choices.length}
        onChange={(event) => { setStage(event.target.value); setReview(null); }}>
        <option value={current.stage}>{current.stage} (recorded)</option>
        {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
        {stage !== current.stage && !allowed ? <option value={stage} disabled>{stage} (no longer available)</option> : null}
      </select>
    </label>
    {current.stage === "closed" ? <p className="text-xs text-[var(--text-muted)]">This opportunity is closed. Its history cannot be reopened from the pipeline.</p> : null}
    {!current.updatedAt ? <p role="alert" className="text-xs text-amber-200">The saved version is unavailable. Reload the pipeline before changing its stage.</p> : null}
    {error ? <p role="alert" className="text-xs text-amber-200">{error}</p> : null}
    {needsReload ? <button type="button" className="sb-btn-secondary text-xs" disabled={busy} onClick={() => void loadLatest()}>Load latest details</button> : null}
    {review ? <section aria-label={`Review stage for ${opportunity.title}`} className="space-y-3 rounded-lg border border-[var(--border-strong)] p-3">
      <h4 className="text-sm font-semibold">Review stage change</h4>
      <p className="text-sm">{review.opportunity.stage} → {review.stage}</p>
      <BookingReviewFacts opportunity={review.opportunity} />
      {review.stage === "confirmed" ? <p className="text-xs text-amber-200">Record confirmed only after Travis has booked it. This creates a linked internal gig if one is missing, using the recorded title, venue, and target date. Existing gig details stay as saved. Fees and conditions remain booking notes; this does not create a contract, payment, Calendar hold, or message.</p> : review.stage === "closed" ? <p className="text-xs text-amber-200">Closing ends this opportunity's pipeline history. It does not cancel an existing gig or send a message.</p> : <p className="text-xs text-[var(--text-muted)]">This records the stage only. Travis books; no pitch or message is sent.</p>}
      {stale || mustReview ? <p role="status" className="text-xs text-amber-200">Review the latest saved details before another save. Your selected stage remains {stage}.</p> : null}
      <button type="button" className="sb-btn-primary w-full text-xs" disabled={busy || stale || mustReview || needsReload}
        onClick={() => void save()}>{busy ? "Working…" : "Save reviewed stage"}</button>
      <button type="button" className="sb-btn-ghost text-xs" disabled={busy} onClick={() => { setReview(null); setStage(current.stage); router.refresh(); }}>Cancel review</button>
    </section> : null}
    {(stale || mustReview) && !needsReload ? <section aria-label="Latest saved booking details" className="space-y-2 rounded-lg border border-amber-500/30 p-3">
      <h4 className="text-sm font-semibold">Latest saved details</h4>
      <p className="text-xs">Recorded stage: {current.stage}</p>
      <BookingReviewFacts opportunity={current} />
      {stage === current.stage ? <p className="text-xs">The latest record already has the selected stage. No new write is needed.</p> : !allowed ? <p className="text-xs">The selected move is no longer available. Choose one of the latest stage options.</p> : null}
    </section> : null}
    {(!review || stale || mustReview) && current.stage !== "closed" ? <button type="button" className="sb-btn-secondary w-full text-xs" disabled={!canReview}
      onClick={startReview}>{stale || mustReview ? "Review latest details" : "Review stage change"}</button> : null}
  </div>;
}

function BookingReviewFacts({ opportunity }: { opportunity: BookingOpportunity }) {
  const date = opportunity.targetDate ? new Date(opportunity.targetDate) : null;
  return <dl className="space-y-2 text-xs break-words">
    <div><dt className="text-[var(--text-muted)]">Title</dt><dd>{opportunity.title}</dd></div>
    <div><dt className="text-[var(--text-muted)]">Venue</dt><dd>{opportunity.venue?.name ?? "Not recorded"}</dd></div>
    <div><dt className="text-[var(--text-muted)]">Recorded target date (UTC)</dt><dd>{date && Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").replace(".000Z", " UTC") : "Not recorded — the new gig will need a start time"}</dd></div>
    <div><dt className="text-[var(--text-muted)]">Recorded fee</dt><dd>{opportunity.proposedFeeMinor != null ? `${opportunity.proposedCurrency ?? "Currency not recorded"} ${(opportunity.proposedFeeMinor / 100).toFixed(2)}` : "Not recorded"}</dd></div>
    <div><dt className="text-[var(--text-muted)]">Conditions</dt><dd className="whitespace-pre-wrap">{opportunity.negotiationConditions?.trim() || "Not recorded"}</dd></div>
  </dl>;
}
