"use client";

import { EmptyState, SurfaceCard } from "@storyboard/ui";
import { Building2, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sanitizeOperatorHref } from "@storyboard/shared";
import { apiFetch } from "@/lib/api";
import type { Contact, Venue } from "@/lib/types";

type VenuePackDetail = {
  venue: Venue;
  contacts: Contact[];
  pack: {
    slug: string | null;
    bookingEmail: string | null;
    phone: string | null;
    applyUrl: string | null;
    webApplicationFirst: boolean;
    capacity: number | null;
    notes: string | null;
    region: string | null;
  };
};

type ProspectFromVenueResult = {
  prospect: { id: string };
  created: boolean;
  applicationTask: { id: string; title: string } | null;
  travisNote: string;
};

type VenueOpportunityResult = {
  id: string;
  title: string;
  created: boolean;
};

export function VenuesClient({
  initialVenues,
  accessState,
  loadError
}: {
  initialVenues: Venue[];
  accessState: "manage" | "read_only" | "unavailable";
  loadError: string;
}) {
  const router = useRouter();
  const canManage = accessState === "manage";
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [fitScore, setFitScore] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [venueOpportunityId, setVenueOpportunityId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [packDetail, setPackDetail] = useState<VenuePackDetail | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState("");
  const [actionBusy, setActionBusy] = useState<"opportunity" | "prospect" | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const filteredVenues = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return initialVenues;
    return initialVenues.filter((v) => {
      const hay = `${v.name} ${v.city} ${v.region ?? ""} ${v.notes ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter, initialVenues]);

  const loadPack = useCallback(async (venueId: string) => {
    setPackLoading(true);
    setPackError("");
    setActionNotice("");
    setActionError("");
    try {
      const detail = await apiFetch<VenuePackDetail>(`/venues/${venueId}/pack`);
      setPackDetail(detail);
    } catch (err) {
      setPackDetail(null);
      setPackError(err instanceof Error ? err.message : "Could not load venue pack");
    } finally {
      setPackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setPackDetail(null);
      setPackError("");
      setVenueOpportunityId(null);
      return;
    }
    setVenueOpportunityId(null);
    void loadPack(selectedId);
  }, [selectedId, loadPack]);

  async function createVenue(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setFormError("");
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
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create venue");
    } finally {
      setBusy(false);
    }
  }

  async function createOpportunityFromVenue() {
    if (!selectedId) return;
    setActionBusy("opportunity");
    setActionError("");
    setActionNotice("");
    try {
      const opp = await apiFetch<VenueOpportunityResult>(
        `/venues/${selectedId}/opportunities`,
        { method: "POST", json: {} }
      );
      setVenueOpportunityId(opp.id);
      setActionNotice(
        opp.created
          ? `Opportunity recorded: ${opp.title}. Travis books — StoryBoard will not pitch or send.`
          : `Open opportunity already on file: ${opp.title}. Linked prospect actions will use this deal.`
      );
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not create opportunity");
    } finally {
      setActionBusy(null);
    }
  }

  async function createProspectFromVenue() {
    if (!selectedId) return;
    setActionBusy("prospect");
    setActionError("");
    setActionNotice("");
    try {
      const result = await apiFetch<ProspectFromVenueResult>(
        `/venues/${selectedId}/prospects`,
        {
          method: "POST",
          json: venueOpportunityId ? { opportunityId: venueOpportunityId } : {}
        }
      );
      const taskHint = result.applicationTask
        ? ` Application task added: ${result.applicationTask.title}`
        : "";
      setActionNotice(
        `${result.created ? "Prospect created" : "Prospect already on file"} with venue contact linked.${taskHint} ${result.travisNote}`
      );
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not create prospect");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {loadError ? (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {loadError}{" "}
          <button type="button" className="sb-btn-secondary" onClick={() => router.refresh()}>
            Reload venues
          </button>
        </div>
      ) : null}
      {accessState === "read_only" ? (
        <p role="status" className="text-sm text-[var(--text-muted)]">
          You have read-only access. An owner or member can add venues or start booking records.
        </p>
      ) : null}
      {formError ? (
        <div role="alert" className="text-sm text-red-200">{formError}</div>
      ) : null}
      {canManage && !loadError ? (
      <SurfaceCard>
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
      </SurfaceCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <VenueTable
          venues={filteredVenues}
          allCount={initialVenues.length}
          filter={filter}
          onFilterChange={setFilter}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
          onSaved={() => router.refresh()}
          loadError={loadError}
          canManage={canManage && !loadError}
        />
        <VenuePackPanel
          selectedId={selectedId}
          detail={packDetail}
          loading={packLoading}
          error={packError}
          actionBusy={actionBusy}
          actionNotice={actionNotice}
          actionError={actionError}
          canManage={canManage && !loadError}
          onCreateOpportunity={() => void createOpportunityFromVenue()}
          onCreateProspect={() => void createProspectFromVenue()}
          onRetry={() => selectedId && void loadPack(selectedId)}
        />
      </div>
    </div>
  );
}

function VenueTable({
  venues,
  allCount,
  filter,
  onFilterChange,
  selectedId,
  onSelect,
  onSaved,
  loadError,
  canManage
}: {
  venues: Venue[];
  allCount: number;
  filter: string;
  onFilterChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSaved: () => void;
  loadError: string;
  canManage: boolean;
}) {
  if (loadError) {
    return (
      <SurfaceCard>
        <p className="text-sm text-[var(--text-muted)]">
          Venue list unavailable until reload succeeds. StoryBoard is not showing an empty workspace.
        </p>
      </SurfaceCard>
    );
  }
  if (allCount === 0) {
    return (
      <EmptyState
        title="No venues yet"
        description={
          canManage
            ? "Venues anchor your CRM and booking outreach. Add one above to get started."
            : "No venues are recorded for this band yet. An owner or member can add the first room."
        }
        icon={<Building2 className="h-6 w-6" />}
      />
    );
  }

  return (
    <SurfaceCard padding="none" className="overflow-hidden">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <label className="block">
          <span className="sb-label">Find venue</span>
          <input
            className="sb-input mt-1.5"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Name, city, or notes"
          />
        </label>
        {filter.trim() && venues.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]" role="status">
            No venues match this filter. Clear the box to see all {allCount} venues.
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3 w-8"> </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Capacity</th>
              <th className="px-4 py-3">Fit</th>
              <th className="px-4 py-3">Drive</th>
              <th className="px-4 py-3 w-28"> </th>
            </tr>
          </thead>
          <tbody>
            {venues.map((v) => (
              <VenueRow
                key={v.id}
                venue={v}
                selected={selectedId === v.id}
                onSelect={() => onSelect(v.id)}
                onSaved={onSaved}
              />
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}

function VenueRow({
  venue,
  selected,
  onSelect,
  onSaved
}: {
  venue: Venue;
  selected: boolean;
  onSelect: () => void;
  onSaved: () => void;
}) {
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
  const [saveError, setSaveError] = useState("");

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
    setBusy(true);
    setSaveError("");
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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save venue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr
      className={`border-b border-[var(--border)] transition-colors hover:bg-[var(--surface-0)]/80 ${selected ? "bg-[var(--accent)]/5" : ""}`}
    >
      <td className="px-2 py-3">
        <button
          type="button"
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          aria-label={selected ? `Collapse ${venue.name} pack` : `View ${venue.name} pack`}
          aria-expanded={selected}
          onClick={onSelect}
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${selected ? "rotate-90" : ""}`}
          />
        </button>
      </td>
      <td className="px-4 py-3">
        <input
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 font-medium text-[var(--text-primary)] outline-none hover:border-[var(--border)] focus:border-[var(--accent)]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="px-4 py-3">
        <input
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-[var(--text-primary)] outline-none hover:border-[var(--border)] focus:border-[var(--accent)]"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="px-4 py-3 text-[var(--text-muted)]">
        {venue.capacity != null ? venue.capacity : "—"}
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          className="sb-input w-20 py-1.5 text-xs"
          value={fitScore}
          onChange={(e) => setFitScore(e.target.value)}
          aria-label={`Fit score for ${venue.name}`}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          className="sb-input w-20 py-1.5 text-xs"
          value={driveMin}
          onChange={(e) => setDriveMin(e.target.value)}
          aria-label={`Drive minutes for ${venue.name}`}
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="sb-btn-secondary py-1.5 text-xs"
          >
            Save
          </button>
          {saveError ? (
            <span className="text-[10px] text-red-200" role="alert">{saveError}</span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function VenuePackPanel({
  selectedId,
  detail,
  loading,
  error,
  actionBusy,
  actionNotice,
  actionError,
  canManage,
  onCreateOpportunity,
  onCreateProspect,
  onRetry
}: {
  selectedId: string | null;
  detail: VenuePackDetail | null;
  loading: boolean;
  error: string;
  actionBusy: "opportunity" | "prospect" | null;
  actionNotice: string;
  actionError: string;
  canManage: boolean;
  onCreateOpportunity: () => void;
  onCreateProspect: () => void;
  onRetry: () => void;
}) {
  if (!selectedId) {
    return (
      <SurfaceCard className="h-fit">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Venue pack</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Select a venue to see booking contact, apply link, and notes — no manager chat required.
        </p>
      </SurfaceCard>
    );
  }

  if (loading) {
    return (
      <SurfaceCard className="h-fit">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading venue pack…
        </div>
      </SurfaceCard>
    );
  }

  if (error) {
    return (
      <SurfaceCard className="h-fit">
        <div role="alert" className="space-y-3 text-sm text-amber-200">
          <p>{error}</p>
          <button type="button" className="sb-btn-secondary" onClick={onRetry}>
            Retry
          </button>
        </div>
      </SurfaceCard>
    );
  }

  if (!detail) {
    return null;
  }

  const { pack, venue } = detail;
  const displayNotes =
    pack.notes?.replace(/^seed:dfw-venue-pack:[^\s]+\s*—\s*/i, "") ?? null;

  return (
    <SurfaceCard className="h-fit space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{venue.name}</h2>
        <p className="text-xs text-[var(--text-muted)]">
          {[venue.city, pack.region ?? venue.region].filter(Boolean).join(", ")}
        </p>
      </div>

      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Booking email
          </dt>
          <dd className="text-[var(--text-primary)]">
            {pack.bookingEmail ?? "No contact email on file"}
          </dd>
        </div>
        {pack.phone ? (
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Phone
            </dt>
            <dd>{pack.phone}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Apply URL
          </dt>
          <dd>
            {pack.applyUrl ? (
              <a
                href={sanitizeOperatorHref(pack.applyUrl) ?? pack.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              >
                Open application
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-[var(--text-muted)]">—</span>
            )}
          </dd>
        </div>
        {pack.capacity != null ? (
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Capacity
            </dt>
            <dd>{pack.capacity}</dd>
          </div>
        ) : null}
        {displayNotes ? (
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Notes
            </dt>
            <dd className="text-xs text-[var(--text-muted)]">{displayNotes}</dd>
          </div>
        ) : null}
      </dl>

      {pack.webApplicationFirst ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
          Primary outreach for this room is a web application. StoryBoard will add a task to
          track the submit step; Gmail drafts still require Travis review before anything sends.
        </p>
      ) : null}

      <p className="text-xs text-[var(--text-muted)]">
        Travis owns the send. StoryBoard records opportunities and prospects only — nothing
        auto-pitches or auto-sends.
      </p>

      {actionError ? (
        <div role="alert" className="text-sm text-red-200">{actionError}</div>
      ) : null}
      {actionNotice ? (
        <div role="status" className="space-y-2 text-sm text-emerald-200">
          <p>{actionNotice}</p>
          <div className="flex flex-col gap-2">
            <Link href="/prospects" className="text-[var(--accent)] hover:underline">
              View in Find shows →
            </Link>
            <Link href="/booking-campaigns" className="text-[var(--accent)] hover:underline">
              Add to a pitch campaign →
            </Link>
            <Link href="/booking" className="text-[var(--accent)] hover:underline">
              Open booking pipeline →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!canManage || actionBusy != null}
          className="sb-btn-primary w-full justify-center"
          onClick={onCreateOpportunity}
        >
          {actionBusy === "opportunity" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Create opportunity
        </button>
        <button
          type="button"
          disabled={
            !canManage ||
            actionBusy != null ||
            (!pack.bookingEmail && !pack.applyUrl)
          }
          className="sb-btn-secondary w-full justify-center"
          onClick={onCreateProspect}
        >
          {actionBusy === "prospect" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Create prospect
        </button>
        {!pack.bookingEmail && !pack.applyUrl ? (
          <p className="text-xs text-[var(--text-muted)]">
            Add a booking email or apply URL on this venue before creating a prospect.
          </p>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
