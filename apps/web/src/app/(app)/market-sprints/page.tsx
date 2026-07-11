import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingMarketSprint } from "@/lib/types";
import { MarketSprintsClient } from "./market-sprints-client";

export default async function MarketSprintsPage() {
  let sprints: BookingMarketSprint[] = [];
  try { sprints = await serverApiFetch<BookingMarketSprint[]>("/market-sprints", { cache: "no-store" }); } catch { /* usable empty state */ }
  return <div className="space-y-8"><PageHeader title="Market sprints" description="Focus one city at a time: qualify the right rooms, pitch deliberately, and follow up until you have a clear outcome." /><MarketSprintsClient initialSprints={sprints} /></div>;
}
