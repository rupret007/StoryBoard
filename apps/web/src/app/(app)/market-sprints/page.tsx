import { PageHeader } from "@storyboard/ui";
import { serverApiFetch, serverBandAccess } from "@/lib/api-server";
import type { BookingMarketSprint } from "@/lib/types";
import { MarketSprintsClient } from "./market-sprints-client";

export default async function MarketSprintsPage() {
  let sprints: BookingMarketSprint[] = [];
  let artistId: string | null = null;
  let canManage = false;
  let loadError = "";
  try {
    const access = await serverBandAccess();
    artistId = access.artistId;
    canManage = access.canManage;
    sprints = await serverApiFetch<BookingMarketSprint[]>("/market-sprints", { cache: "no-store", artistId });
  } catch {
    loadError = "Market sprints could not be loaded. Reload to verify your band and try again.";
  }
  return (
    <div className="space-y-8">
      <PageHeader title="Market sprints" description="Focus one city at a time: qualify the right rooms, pitch deliberately, and follow up until you have a clear outcome." />
      {loadError ? <p role="alert" className="text-sm text-rose-200">{loadError}</p> : (
        <MarketSprintsClient key={artistId ?? "unverified"} artistId={artistId} canManage={canManage} initialSprints={sprints} />
      )}
    </div>
  );
}
