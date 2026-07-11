import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingCampaign, BookingMarketSprint, BookingProspect, Contact } from "@/lib/types";
import { BookingCampaignsClient } from "./booking-campaigns-client";

export default async function BookingCampaignsPage() {
  let campaigns: BookingCampaign[] = [];
  let prospects: BookingProspect[] = [];
  let contacts: Contact[] = [];
  let sprints: BookingMarketSprint[] = [];
  try {
    [campaigns, prospects, contacts, sprints] = await Promise.all([
      serverApiFetch<BookingCampaign[]>("/booking-campaigns", {
        cache: "no-store"
      }),
      serverApiFetch<BookingProspect[]>("/booking-prospects", {
        cache: "no-store"
      }),
      serverApiFetch<Contact[]>("/contacts", {
        cache: "no-store"
      }),
      serverApiFetch<BookingMarketSprint[]>("/market-sprints", { cache: "no-store" })
    ]);
  } catch {
    // Keep the workspace available for a fresh account or unavailable API.
  }
  return (
    <div className="space-y-8">
      <PageHeader
        title="Pitch campaigns"
        description="Compose thoughtful booking outreach, preview every personalized message, then explicitly approve and execute either drafts or immediate sends."
      />
      <BookingCampaignsClient
        initialCampaigns={campaigns}
        qualifiedProspects={prospects.filter((prospect) => prospect.status === "qualified")}
        contacts={contacts}
        sprints={sprints}
      />
    </div>
  );
}
