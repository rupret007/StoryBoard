"use client";

import { EmptyState, SurfaceCard } from "@storyboard/ui";
import { Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { scopedApiFetch } from "@/lib/api";
import type { Venue } from "@/lib/types";

export function VenuesClient({ artistId, canManage, initialVenues }: { artistId: string | null; canManage: boolean; initialVenues: Venue[] }) {
  const apiFetch = scopedApiFetch(artistId);
  const router = useRouter();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [fitScore, setFitScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createVenue(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch<Venue>("/venues", {
        method: "POST",
        json: {
          name: name.trim(),
          city: city.trim(),
          fitScore: fitScore ? parseInt(fitScore, 10) : undefined
        }
      });
      setName("");
      setCity("");
      setFitScore("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create venue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}
      {canManage ? <SurfaceCard>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Add venue
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Fit score and drive time power routing and outreach ranking.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-3"
          onSubmit={(ev) => void createVenue(ev)}
        >
          <label>
            <span className="sb-label">Name</span>
            <input
              required
              className="sb-input mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span className="sb-label">City</span>
            <input
              required
              className="sb-input mt-1.5"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </label>
          <label>
            <span className="sb-label">Fit score</span>
            <input
              type="number"
              className="sb-input mt-1.5"
              value={fitScore}
              onChange={(e) => setFitScore(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={busy} className="sb-btn-primary">
              Create venue
            </button>
          </div>
        </form>
      </SurfaceCard> : null}

      <VenueTable artistId={artistId} canManage={canManage} venues={initialVenues} onSaved={() => router.refresh()} />
    </div>
  );
}

function VenueTable({
  artistId,
  canManage,
  venues,
  onSaved
}: {
  artistId: string | null;
  canManage: boolean;
  venues: Venue[];
  onSaved: () => void;
}) {
  if (venues.length === 0) {
    return (
      <EmptyState
        title="No venues yet"
        description={canManage ? "Venues anchor your CRM and booking outreach. Add one above to get started." : "An owner or member can add venues for this band."}
        icon={<Building2 className="h-6 w-6" />}
      />
    );
  }

  return (
    <SurfaceCard padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Fit</th>
              <th className="px-4 py-3">Drive</th>
              <th className="px-4 py-3 w-28"> </th>
            </tr>
          </thead>
          <tbody>
            {venues.map((v) => (
              <VenueRow key={v.id} artistId={artistId} canManage={canManage} venue={v} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}

function VenueRow({
  artistId,
  canManage,
  venue,
  onSaved
}: {
  artistId: string | null;
  canManage: boolean;
  venue: Venue;
  onSaved: () => void;
}) {
  const apiFetch = scopedApiFetch(artistId);
  const [name, setName] = useState(venue.name);
  const [city, setCity] = useState(venue.city);
  const [fitScore, setFitScore] = useState(
    venue.fitScore != null ? String(venue.fitScore) : ""
  );
  const [driveMin, setDriveMin] = useState(
    venue.driveMinutesFromBase != null
      ? String(venue.driveMinutesFromBase)
      : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(venue.name);
    setCity(venue.city);
    setFitScore(venue.fitScore != null ? String(venue.fitScore) : "");
    setDriveMin(
      venue.driveMinutesFromBase != null
        ? String(venue.driveMinutesFromBase)
        : ""
    );
  }, [venue]);

  async function save() {
    if (!canManage) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/venues/${venue.id}`, {
        method: "PATCH",
        json: {
          name: name.trim(),
          city: city.trim(),
          fitScore: fitScore === "" ? null : parseInt(fitScore, 10),
          driveMinutesFromBase:
            driveMin === "" ? null : parseInt(driveMin, 10)
        }
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save venue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-0)]/80">
      <td className="px-4 py-3">
        <input
          disabled={!canManage}
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-[var(--text-primary)] outline-none hover:border-[var(--border)] focus:border-[var(--accent)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        <input
          disabled={!canManage}
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-[var(--text-primary)] outline-none hover:border-[var(--border)] focus:border-[var(--accent)]"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        <input
          disabled={!canManage}
          type="number"
          className="sb-input w-24 py-1.5 text-xs"
          value={fitScore}
          onChange={(e) => setFitScore(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        <input
          disabled={!canManage}
          type="number"
          className="sb-input w-24 py-1.5 text-xs"
          value={driveMin}
          onChange={(e) => setDriveMin(e.target.value)}
        />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          disabled={busy || !canManage}
          onClick={() => void save()}
          className="sb-btn-secondary py-1.5 text-xs"
        >
          Save
        </button>
        {error ? <p role="alert" className="mt-1 text-xs text-rose-200">{error}</p> : null}
      </td>
    </tr>
  );
}
