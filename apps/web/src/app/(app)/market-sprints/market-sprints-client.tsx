"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { MapPinned, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { scopedApiFetch } from "@/lib/api";
import type { BookingMarketSprint } from "@/lib/types";

export function MarketSprintsClient({ artistId, canManage, initialSprints }: { artistId: string | null; canManage: boolean; initialSprints: BookingMarketSprint[] }) {
  const apiFetch = scopedApiFetch(artistId);
  const router = useRouter(); const [name, setName] = useState(""); const [city, setCity] = useState(""); const [region, setRegion] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function create(event: React.FormEvent) { event.preventDefault(); if (!canManage) return; setBusy(true); setError(null); try { await apiFetch("/market-sprints", { method: "POST", json: { name: name.trim(), city: city.trim(), region: region.trim() || null, status: "active" } }); setName(""); setCity(""); setRegion(""); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create market sprint"); } finally { setBusy(false); } }
  async function status(id: string, value: BookingMarketSprint["status"]) {
    if (!canManage) return;
    setBusy(true); setError(null);
    try { await apiFetch(`/market-sprints/${id}`, { method: "PATCH", json: { status: value } }); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update market sprint"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">{error ? <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}{canManage ? <SurfaceCard><h2 className="text-sm font-semibold text-[var(--text-primary)]">Start a market sprint</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Use a named, intentional target market rather than scattered leads.</p><form className="mt-4 grid gap-3 sm:grid-cols-3" onSubmit={(event) => void create(event)}><label><span className="sb-label">Sprint name</span><input required className="sb-input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Austin fall rooms" /></label><label><span className="sb-label">City</span><input required className="sb-input mt-1.5" value={city} onChange={(e) => setCity(e.target.value)} /></label><label><span className="sb-label">Region / state</span><input className="sb-input mt-1.5" value={region} onChange={(e) => setRegion(e.target.value)} /></label><div><button className="sb-btn-primary" type="submit" disabled={busy || !canManage}><Plus className="h-4 w-4" />Create sprint</button></div></form></SurfaceCard> : null}{initialSprints.length ? <div className="grid gap-4 md:grid-cols-2">{initialSprints.map((sprint) => <SurfaceCard key={sprint.id}><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-[var(--text-primary)]">{sprint.name}</h2><p className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]"><MapPinned className="h-3 w-3" />{[sprint.city, sprint.region, sprint.country].filter(Boolean).join(", ")}</p></div><Badge variant={sprint.status === "active" ? "success" : "neutral"}>{sprint.status}</Badge></div><div className="mt-4 flex items-center justify-between gap-2"><a className="sb-btn-secondary py-2 text-xs" href={`/prospects?sprint=${sprint.id}`}>Open leads</a><select disabled={busy || !canManage} aria-label={`Status for ${sprint.name}`} className="sb-select py-2 text-xs" value={sprint.status} onChange={(e) => void status(sprint.id, e.target.value as BookingMarketSprint["status"])}>{["draft", "active", "completed", "abandoned"].map((value) => <option key={value}>{value}</option>)}</select></div></SurfaceCard>)}</div> : <EmptyState title="No market sprints yet" description={canManage ? "Pick one city and build a deliberate, measurable outreach loop." : "An owner or member can start a market sprint for this band."} icon={<MapPinned className="h-6 w-6" />} />}</div>;
}
