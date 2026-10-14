import { PageHeader } from "@storyboard/ui";
import { serverApiFetch, serverBandAccess } from "@/lib/api-server";
import type { Venue } from "@/lib/types";
import { VenuesClient } from "./venues-client";

export default async function VenuesPage() {
  let venues: Venue[] = [];
  let artistId: string | null = null;
  let canManage = false;
  let loadError = "";
  try {
    const access = await serverBandAccess();
    artistId = access.artistId;
    canManage = access.canManage;
    venues = await serverApiFetch<Venue[]>("/venues", { cache: "no-store", artistId });
  } catch {
    loadError = "Venues could not be loaded. Reload to verify your band and try again.";
  }
  return (
    <div className="space-y-8">
      <PageHeader
        title="Venues"
        description="Find a venue, review its pack, and start an opportunity or prospect without manager chat. Travis books; StoryBoard does not send outreach on its own."
      />
      {loadError ? <p role="alert" className="text-sm text-rose-200">{loadError}</p> : (
        <VenuesClient key={artistId ?? "unverified"} artistId={artistId} canManage={canManage} initialVenues={venues} />
      )}
    </div>
  );
}
