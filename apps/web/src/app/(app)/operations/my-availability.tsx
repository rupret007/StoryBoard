"use client";

import { SurfaceCard } from "@storyboard/ui";
import { formatRecordedShowTime } from "@storyboard/shared";
import { useState } from "react";
import type { BandEvent, BandMember } from "@/lib/types";

export function MyAvailability({ member, events, busy, save }: { member: BandMember; events: BandEvent[]; busy: boolean; save: (path: string, json: unknown) => Promise<unknown> }) {
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const openEvents = events.filter((event) => event.status !== "cancelled" && event.status !== "completed");
  async function record(event: BandEvent, response: string) {
    setError(""); setReceipt("");
    try {
      await save(`/events/${event.id}/my-availability`, { bandMemberId: member.id, response });
      setReceipt(`Your availability for ${event.title} was recorded as ${response}.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Availability could not be saved"); }
  }
  return <SurfaceCard>
    <h2 className="font-semibold">My availability · {member.name}</h2>
    <p className="mt-1 text-sm text-[var(--text-muted)]">Your account records these updates. Coordinate other members in each event’s readiness details.</p>
    {!openEvents.length ? <p className="mt-3 text-sm">No open events are recorded.</p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">{openEvents.map((event) => <label key={event.id} className="min-w-0 rounded-lg border border-[var(--border)] p-3">
      <span className="block break-words font-medium">{event.title}</span>
      <span className="mt-1 block text-xs text-[var(--text-muted)]">{formatRecordedShowTime(event.startsAt, event.timezone)}</span>
      <select aria-label={`My availability for ${event.title}`} className="sb-select mt-2 w-full" value={event.participants.find((participant) => participant.bandMember.id === member.id)?.response ?? "unknown"} disabled={busy} onChange={(change) => void record(event, change.target.value)}>{["unknown", "available", "tentative", "unavailable"].map((response) => <option key={response} value={response}>{response}</option>)}</select>
    </label>)}</div>}
    {receipt ? <p className="mt-3 text-sm" role="status">{receipt}</p> : null}
    {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
  </SurfaceCard>;
}
