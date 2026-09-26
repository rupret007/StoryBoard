import { PageHeader } from "@storyboard/ui";
import { VenuesClient } from "./venues-client";
import { serverApiFetch } from "@/lib/api-server";
import type { Venue } from "@/lib/types";

export default async function VenuesPage() {
  let venues: Venue[] = [];
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  let loadError = "";
  try {
    const me = await serverApiFetch<{
      currentArtistId: string | null;
      memberships: { artistId: string; role: string }[];
    }>("/auth/me", { cache: "no-store" });
    const artistId =
      me.currentArtistId &&
      me.memberships.some((membership) => membership.artistId === me.currentArtistId)
        ? me.currentArtistId
        : me.memberships[0]?.artistId ?? null;
    const role = me.memberships.find((membership) => membership.artistId === artistId)?.role;
    accessState =
      role === "owner" || role === "member"
        ? "manage"
        : role === "viewer"
          ? "read_only"
          : "unavailable";
    if (!artistId) throw new Error("No band available");
    venues = await serverApiFetch<Venue[]>("/venues", {
      artistId,
      cache: "no-store"
    });
  } catch {
    loadError = "Venues could not be loaded. Reload before adding rooms or starting outreach.";
    accessState = "unavailable";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Venues"
        description="Find a venue, review its pack, and start an opportunity or prospect without manager chat. Travis books; StoryBoard does not send outreach on its own."
      />
      <VenuesClient
        initialVenues={venues}
        accessState={accessState}
        loadError={loadError}
      />
    </div>
  );
}
