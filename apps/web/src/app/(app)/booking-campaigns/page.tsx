import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingCampaign, BookingProspect, Contact } from "@/lib/types";
import { BookingCampaignsClient } from "./booking-campaigns-client";

export default async function BookingCampaignsPage() {
  let campaigns: BookingCampaign[] = [];
  let prospects: BookingProspect[] = [];
  let contacts: Contact[] = [];
  try {
    [campaigns, prospects, contacts] = await Promise.all([
      serverApiFetch<BookingCampaign[]>("/booking-campaigns", {
        cache: "no-store"
      }),
      serverApiFetch<BookingProspect[]>("/booking-prospects", {
        cache: "no-store"
      }),
      serverApiFetch<Contact[]>("/contacts", {
        cache: "no-store"
      })
    ]);
  } catch {
    // Keep the workspace available for a fresh account or unavailable API.
  }
  return (
    <div className="space-y-8">
      <PageHeader
        title="Pitch campaigns"
        description="Compose thoughtful booking outreach, preview every personalized draft, then use the approval center to create Gmail drafts — never send automatically."
      />
      <BookingCampaignsClient
        initialCampaigns={campaigns}
        qualifiedProspects={prospects.filter((prospect) => prospect.status === "qualified")}
        contacts={contacts}
      />
    </div>
  );
}
