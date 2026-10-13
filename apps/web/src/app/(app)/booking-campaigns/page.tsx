import { PageHeader } from "@storyboard/ui";
import { serverApiFetch, serverBandAccess } from "@/lib/api-server";
import type { BookingCampaign, BookingMarketSprint, BookingProspect, Contact } from "@/lib/types";
import { BookingCampaignsClient } from "./booking-campaigns-client";

export default async function BookingCampaignsPage() {
  let campaigns: BookingCampaign[] = [];
  let prospects: BookingProspect[] = [];
  let contacts: Contact[] = [];
  let sprints: BookingMarketSprint[] = [];
  let artistId: string | null = null;
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  let campaignsLoaded = false;
  let loadError: string | null = null;
  try {
    const access = await serverBandAccess();
    artistId = access.artistId;
    accessState = access.accessState;
    const [campaignRows, prospectRows, contactRows, sprintRows] =
    await Promise.allSettled([
      serverApiFetch<BookingCampaign[]>("/booking-campaigns", {
        cache: "no-store", artistId
      }),
      serverApiFetch<BookingProspect[]>("/booking-prospects", {
        cache: "no-store", artistId
      }),
      serverApiFetch<Contact[]>("/contacts", { cache: "no-store", artistId }),
      serverApiFetch<BookingMarketSprint[]>("/market-sprints", {
        cache: "no-store", artistId
      })
    ]);
    campaignsLoaded = campaignRows.status === "fulfilled";
    if (campaignRows.status === "fulfilled") campaigns = campaignRows.value;
    if (prospectRows.status === "fulfilled") prospects = prospectRows.value;
    if (contactRows.status === "fulfilled") contacts = contactRows.value;
    if (sprintRows.status === "fulfilled") sprints = sprintRows.value;
    const supportingDataLoadFailed = [prospectRows, contactRows, sprintRows].some(
      (result) => result.status === "rejected"
    );
    loadError = !campaignsLoaded
      ? "Pitch campaigns could not be loaded. Campaign creation and changes are disabled until you refresh."
      : supportingDataLoadFailed
      ? "Some campaign data could not be loaded. Refresh before making changes that depend on missing prospects, contacts, or market sprints."
      : null;
  } catch {
    loadError = "Your campaign permissions could not be verified. Changes are disabled until you refresh.";
  }
  return (
    <div className="space-y-8">
      <PageHeader
        title="Pitch campaigns"
        description="Compose thoughtful booking outreach, preview every personalized message, then explicitly approve and execute either drafts or immediate sends."
      />
      <BookingCampaignsClient
        key={artistId ?? "unavailable"}
        artistId={artistId}
        initialCampaigns={campaigns}
        qualifiedProspects={prospects.filter((prospect) => prospect.status === "qualified")}
        contacts={contacts}
        sprints={sprints}
        accessState={accessState}
        campaignsLoaded={campaignsLoaded}
        loadError={loadError}
      />
    </div>
  );
}
