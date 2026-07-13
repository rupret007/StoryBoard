import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { EventDayOfResponse } from "@/lib/types";
import { DayOfClient } from "./day-of-client";

export default async function EventDayOfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await serverApiFetch<EventDayOfResponse>(`/events/${encodeURIComponent(id)}/day-of`, { cache: "no-store" });
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  try {
    const me = await serverApiFetch<{
      currentArtistId: string | null;
      memberships: { artistId: string; role: string }[];
    }>("/auth/me", { cache: "no-store" });
    const activeArtistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId)
      ? me.currentArtistId
      : me.memberships[0]?.artistId ?? null;
    const role = me.memberships.find((membership) => membership.artistId === activeArtistId)?.role;
    accessState = role === "owner" || role === "member"
      ? "manage"
      : role === "viewer"
        ? "read_only"
        : "unavailable";
  } catch {
    /* Keep the event readable while all changes fail closed. */
  }
  return <div className="space-y-6">
    <PageHeader title={data.event.title} description="The live show plan: what matters now, what happens next, and what still needs attention." />
    <DayOfClient initialData={data} accessState={accessState} />
  </div>;
}
