import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { EventDayOfResponse } from "@/lib/types";
import { DayOfClient } from "./day-of-client";

export default async function EventDayOfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await serverApiFetch<{
    currentArtistId: string | null;
    memberships: { artistId: string; role: string }[];
  }>("/auth/me", { cache: "no-store" });
  const artistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId)
    ? me.currentArtistId
    : me.memberships[0]?.artistId ?? null;
  if (!artistId) throw new Error("Show band access could not be verified");
  const role = me.memberships.find((membership) => membership.artistId === artistId)?.role;
  const accessState = role === "owner" || role === "member" ? "manage" : role === "viewer" ? "read_only" : "unavailable";
  const data = await serverApiFetch<EventDayOfResponse>(`/events/${encodeURIComponent(id)}/day-of`, { cache: "no-store", artistId });
  return <div className="space-y-6">
    <PageHeader title={data.event.title} description="Run the assigned set from a recorded cursor, keep the show-day checkpoints honest, and record after-show facts without inventing a result." />
    <DayOfClient key={`${artistId}:${id}`} artistId={artistId} initialData={data} accessState={accessState} />
  </div>;
}
