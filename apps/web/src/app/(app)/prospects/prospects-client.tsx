"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { Compass, ExternalLink, Plus, Save, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { BuyerContactLinker } from "@/components/buyer-contact-linker";
import type { BookingProfileResponse, BookingProspect, Contact } from "@/lib/types";

type DiscoverySignal = Omit<BookingProspect, "id"> & {
  sourceMetadata?: Record<string, unknown>;
  saved: boolean;
};

type DiscoveryResponse = {
  mode: "ticketmaster" | "manual";
  reason?: string;
  signals: DiscoverySignal[];
};

const kinds = ["venue", "festival", "private_event", "corporate_event"] as const;
const statuses = ["discovered", "qualified", "disqualified"] as const;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function ProspectsClient({
  initialProfile,
  initialProspects,
  contacts
}: {
  initialProfile: BookingProfileResponse;
  initialProspects: BookingProspect[];
  contacts: Contact[];
}) {
  const router = useRouter();
  const profile = initialProfile.profile;
  const [profileForm, setProfileForm] = useState({
    homeCity: profile?.homeCity ?? "",
    homeRegion: profile?.homeRegion ?? "",
    homeCountry: profile?.homeCountry ?? "US",
    genres: profile?.genres.join(", ") ?? "",
    targetCapacityMin: profile?.targetCapacityMin?.toString() ?? "",
    targetCapacityMax: profile?.targetCapacityMax?.toString() ?? "",
    bookingPitch: profile?.bookingPitch ?? "",
    pressKitUrl: profile?.pressKitUrl ?? "",
    liveVideoUrl: profile?.liveVideoUrl ?? ""
  });
  const [market, setMarket] = useState({
    city: profile?.homeCity ?? "",
    region: profile?.homeRegion ?? "",
    country: profile?.homeCountry ?? "US",
    keyword: ""
  });
  const [signals, setSignals] = useState<DiscoveryResponse | null>(null);
  const [manual, setManual] = useState({
    kind: "venue" as (typeof kinds)[number],
    name: "",
    city: profile?.homeCity ?? "",
    region: profile?.homeRegion ?? "",
    country: profile?.homeCountry ?? "US",
    websiteUrl: "",
    capacity: "",
    notes: ""
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setBusy("profile");
    setError(null);
    try {
      await apiFetch("/booking-profile", {
        method: "PUT",
        json: {
          homeCity: profileForm.homeCity || null,
          homeRegion: profileForm.homeRegion || null,
          homeCountry: profileForm.homeCountry || null,
          genres: profileForm.genres
            .split(",")
            .map((genre) => genre.trim())
            .filter(Boolean),
          targetCapacityMin: profileForm.targetCapacityMin
            ? Number(profileForm.targetCapacityMin)
            : null,
          targetCapacityMax: profileForm.targetCapacityMax
            ? Number(profileForm.targetCapacityMax)
            : null,
          bookingPitch: profileForm.bookingPitch || null,
          pressKitUrl: profileForm.pressKitUrl || null,
          liveVideoUrl: profileForm.liveVideoUrl || null
        }
      });
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function searchMarket(event: React.FormEvent) {
    event.preventDefault();
    setBusy("search");
    setError(null);
    try {
      const params = new URLSearchParams({ city: market.city });
      if (market.region) params.set("region", market.region);
      if (market.country) params.set("country", market.country);
      if (market.keyword) params.set("keyword", market.keyword);
      setSignals(await apiFetch<DiscoveryResponse>(`/booking-prospects/discover?${params}`));
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveProspect(input: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      await apiFetch("/booking-prospects", { method: "POST", json: input });
      router.refresh();
      if (key.startsWith("signal-")) {
        setSignals((current) =>
          current
            ? {
                ...current,
                signals: current.signals.map((signal) =>
                  signal.sourceRef === input.sourceRef ? { ...signal, saved: true } : signal
                )
              }
            : current
        );
      }
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function createManual(event: React.FormEvent) {
    event.preventDefault();
    await saveProspect(
      {
        kind: manual.kind,
        name: manual.name,
        city: manual.city,
        region: manual.region || null,
        country: manual.country || null,
        websiteUrl: manual.websiteUrl || null,
        capacity: manual.capacity ? Number(manual.capacity) : null,
        notes: manual.notes || null
      },
      "manual"
    );
    setManual((current) => ({ ...current, name: "", websiteUrl: "", capacity: "", notes: "" }));
  }

  async function updateStatus(id: string, status: (typeof statuses)[number]) {
    await savePatch(id, { status }, `status-${id}`);
  }

  async function savePatch(id: string, json: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      await apiFetch(`/booking-prospects/${id}`, { method: "PATCH", json });
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function convert(id: string) {
    setBusy(`convert-${id}`);
    setError(null);
    try {
      await apiFetch(`/booking-prospects/${id}/convert`, {
        method: "POST",
        json: {}
      });
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      <SurfaceCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Quick booking profile</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Save a draft any time. Complete market, genres, capacity, and pitch before converting a lead or starting a campaign.
            </p>
          </div>
          <Badge variant={initialProfile.ready ? "success" : "warning"}>
            {initialProfile.ready ? "Ready to book" : `Missing: ${initialProfile.missing.join(", ")}`}
          </Badge>
        </div>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void saveProfile(event)}>
          <FormInput label="Home city" value={profileForm.homeCity} onChange={(homeCity) => setProfileForm({ ...profileForm, homeCity })} />
          <FormInput label="Region / state" value={profileForm.homeRegion} onChange={(homeRegion) => setProfileForm({ ...profileForm, homeRegion })} />
          <FormInput label="Country code" value={profileForm.homeCountry} onChange={(homeCountry) => setProfileForm({ ...profileForm, homeCountry })} />
          <FormInput label="Genres (comma separated)" value={profileForm.genres} onChange={(genres) => setProfileForm({ ...profileForm, genres })} />
          <FormInput label="Capacity minimum" type="number" value={profileForm.targetCapacityMin} onChange={(targetCapacityMin) => setProfileForm({ ...profileForm, targetCapacityMin })} />
          <FormInput label="Capacity maximum" type="number" value={profileForm.targetCapacityMax} onChange={(targetCapacityMax) => setProfileForm({ ...profileForm, targetCapacityMax })} />
          <label className="block md:col-span-2"><span className="sb-label">Short booking pitch</span><textarea className="sb-input mt-1.5 min-h-20" value={profileForm.bookingPitch} onChange={(event) => setProfileForm({ ...profileForm, bookingPitch: event.target.value })} placeholder="A concise, human pitch: sound, draw, recent proof, and why this room or buyer fits." /></label>
          <FormInput label="Press kit URL (optional)" type="url" value={profileForm.pressKitUrl} onChange={(pressKitUrl) => setProfileForm({ ...profileForm, pressKitUrl })} />
          <FormInput label="Live video URL (optional)" type="url" value={profileForm.liveVideoUrl} onChange={(liveVideoUrl) => setProfileForm({ ...profileForm, liveVideoUrl })} />
          <div className="md:col-span-2"><button className="sb-btn-secondary" disabled={busy === "profile"} type="submit"><Save className="h-4 w-4" />Save profile</button></div>
        </form>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex items-center gap-2"><Compass className="h-4 w-4 text-[var(--accent)]" /><h2 className="text-sm font-semibold text-[var(--text-primary)]">Search one market</h2></div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Ticketmaster is optional. If it is unavailable, this stays an honest manual prospecting workspace.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={(event) => void searchMarket(event)}>
          <FormInput required label="City" value={market.city} onChange={(city) => setMarket({ ...market, city })} />
          <FormInput label="Region" value={market.region} onChange={(region) => setMarket({ ...market, region })} />
          <FormInput label="Country" value={market.country} onChange={(country) => setMarket({ ...market, country })} />
          <FormInput label="Keyword" value={market.keyword} onChange={(keyword) => setMarket({ ...market, keyword })} />
          <div className="md:col-span-4"><button className="sb-btn-primary" disabled={busy === "search"} type="submit"><Search className="h-4 w-4" />Find signals</button></div>
        </form>
        {signals ? (
          <div className="mt-5 space-y-3">
            {signals.mode === "manual" ? <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">{signals.reason}</p> : null}
            {signals.signals.map((signal) => (
              <div key={signal.sourceRef} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-3">
                <div><p className="font-medium text-[var(--text-primary)]">{signal.name}</p><p className="text-xs text-[var(--text-muted)]">{signal.kind.replace("_", " ")} · {[signal.city, signal.region, signal.country].filter(Boolean).join(", ")}</p></div>
                <button className="sb-btn-secondary" disabled={signal.saved || busy === `signal-${signal.sourceRef}`} onClick={() => void saveProspect({ ...signal, saved: undefined }, `signal-${signal.sourceRef}`)} type="button">{signal.saved ? "Saved" : "Save prospect"}</button>
              </div>
            ))}
          </div>
        ) : null}
      </SurfaceCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SurfaceCard>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Prospects</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Qualify a lead before conversion. Venue conversion creates a physical venue; festivals, private events, and corporate buyers stay venue-less.</p>
          {initialProspects.length === 0 ? <div className="mt-5"><EmptyState title="No prospects yet" description="Search a market or add a manual lead — private and corporate buyers are manual-first." icon={<Sparkles className="h-6 w-6" />} /></div> : <div className="mt-4 space-y-3">{initialProspects.map((prospect) => <ProspectRow key={prospect.id} prospect={prospect} contacts={contacts} busy={busy} onStatus={updateStatus} onConvert={convert} onLinked={() => router.refresh()} />)}</div>}
        </SurfaceCard>

        <div className="space-y-6">
          <SurfaceCard>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Add a manual lead</h2>
            <form className="mt-4 space-y-3" onSubmit={(event) => void createManual(event)}>
              <label className="block"><span className="sb-label">Lead type</span><select className="sb-select mt-1.5" value={manual.kind} onChange={(event) => setManual({ ...manual, kind: event.target.value as typeof manual.kind })}>{kinds.map((kind) => <option key={kind} value={kind}>{kind.replace("_", " ")}</option>)}</select></label>
              <FormInput required label="Name" value={manual.name} onChange={(name) => setManual({ ...manual, name })} />
              <FormInput required label="City" value={manual.city} onChange={(city) => setManual({ ...manual, city })} />
              <FormInput label="Region" value={manual.region} onChange={(region) => setManual({ ...manual, region })} />
              <FormInput label="Website (optional)" type="url" value={manual.websiteUrl} onChange={(websiteUrl) => setManual({ ...manual, websiteUrl })} />
              <FormInput label="Capacity (optional)" type="number" value={manual.capacity} onChange={(capacity) => setManual({ ...manual, capacity })} />
              <label className="block"><span className="sb-label">Research notes</span><textarea className="sb-input mt-1.5 min-h-20" value={manual.notes} onChange={(event) => setManual({ ...manual, notes: event.target.value })} /></label>
              <button className="sb-btn-primary" disabled={busy === "manual"} type="submit"><Plus className="h-4 w-4" />Save lead</button>
            </form>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

function ProspectRow({ prospect, contacts, busy, onStatus, onConvert, onLinked }: { prospect: BookingProspect; contacts: Contact[]; busy: string | null; onStatus: (id: string, status: (typeof statuses)[number]) => Promise<void>; onConvert: (id: string) => Promise<void>; onLinked: () => void }) {
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><p className="font-medium text-[var(--text-primary)]">{prospect.name}</p><Badge variant={prospect.status === "qualified" ? "success" : prospect.status === "disqualified" ? "neutral" : prospect.status === "converted" ? "violet" : "accent"}>{prospect.status}</Badge></div><p className="mt-1 text-xs text-[var(--text-muted)]">{prospect.kind.replace("_", " ")} · {[prospect.city, prospect.region, prospect.country].filter(Boolean).join(", ")}{prospect.capacity ? ` · ${prospect.capacity.toLocaleString()} cap` : ""}</p>{prospect.notes ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{prospect.notes}</p> : null}</div>{prospect.websiteUrl ? <a className="text-xs text-[var(--accent)] hover:underline" href={prospect.websiteUrl} target="_blank" rel="noreferrer">Research <ExternalLink className="ml-1 inline h-3 w-3" /></a> : null}</div><div className="mt-3 flex flex-wrap items-center gap-2"><select aria-label={`Status for ${prospect.name}`} className="sb-select py-2 text-xs" value={prospect.status === "converted" ? "converted" : prospect.status} disabled={prospect.status === "converted" || busy === `status-${prospect.id}`} onChange={(event) => void onStatus(prospect.id, event.target.value as (typeof statuses)[number])}>{prospect.status === "converted" ? <option value="converted">converted</option> : statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>{prospect.status !== "converted" ? <BuyerContactLinker prospectId={prospect.id} contacts={contacts} onLinked={onLinked} /> : null}{prospect.contact ? <span className="text-xs text-[var(--text-muted)]">Buyer: {prospect.contact.fullName}{prospect.contact.email ? ` · ${prospect.contact.email}` : " · no email"}</span> : null}{prospect.status === "qualified" ? <button type="button" className="sb-btn-primary py-2 text-xs" disabled={busy === `convert-${prospect.id}`} onClick={() => void onConvert(prospect.id)}>Convert to booking</button> : null}{prospect.opportunity ? <a className="sb-btn-secondary py-2 text-xs" href="/booking">Open pipeline</a> : null}</div></div>;
}

function FormInput({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block"><span className="sb-label">{label}</span><input required={required} type={type} className="sb-input mt-1.5" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
