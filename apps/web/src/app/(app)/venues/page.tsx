import { PageHeader } from "@storyboard/ui";
import { VenuesClient } from "./venues-client";
import { serverApiFetch } from "@/lib/api-server";
import type { Venue } from "@/lib/types";

export default async function VenuesPage() {
  let venues: Venue[] = [];
  try {
    venues = await serverApiFetch<Venue[]>("/venues", { cache: "no-store" });
  } catch {
    venues = [];
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Venues"
        description="Find a venue, review its pack, and start an opportunity or prospect without manager chat. Travis books; StoryBoard does not send outreach on its own."
      />
      <VenuesClient initialVenues={venues} />
    </div>
  );
}
