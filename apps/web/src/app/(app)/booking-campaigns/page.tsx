import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingCampaign, BookingMarketSprint, BookingProspect, Contact } from "@/lib/types";
import { BookingCampaignsClient } from "./booking-campaigns-client";

export default async function BookingCampaignsPage() {
  let campaigns: BookingCampaign[] = [];
  let prospects: BookingProspect[] = [];
  let contacts: Contact[] = [];
  let sprints: BookingMarketSprint[] = [];
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  const [campaignRows, prospectRows, contactRows, sprintRows, meResult] =
    await Promise.allSettled([
      serverApiFetch<BookingCampaign[]>("/booking-campaigns", {
        cache: "no-store"
      }),
      serverApiFetch<BookingProspect[]>("/booking-prospects", {
        cache: "no-store"
      }),
      serverApiFetch<Contact[]>("/contacts", { cache: "no-store" }),
      serverApiFetch<BookingMarketSprint[]>("/market-sprints", {
        cache: "no-store"
      }),
      serverApiFetch<{
        currentArtistId: string | null;
        memberships: { artistId: string; role: string }[];
      }>("/auth/me", { cache: "no-store" })
    ]);
  const campaignsLoaded = campaignRows.status === "fulfilled";
  if (campaignRows.status === "fulfilled") campaigns = campaignRows.value;
  if (prospectRows.status === "fulfilled") prospects = prospectRows.value;
  if (contactRows.status === "fulfilled") contacts = contactRows.value;
  if (sprintRows.status === "fulfilled") sprints = sprintRows.value;
  if (meResult.status === "fulfilled") {
    const me = meResult.value;
    const activeArtistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId)
      ? me.currentArtistId
      : me.memberships[0]?.artistId ?? null;
    const role = me.memberships.find((membership) => membership.artistId === activeArtistId)?.role;
    accessState = role === "owner" || role === "member"
      ? "manage"
      : role === "viewer"
        ? "read_only"
        : "unavailable";
  }
  const supportingDataLoadFailed = [prospectRows, contactRows, sprintRows].some(
    (result) => result.status === "rejected"
  );
  const loadError = meResult.status === "rejected"
    ? "Your campaign permissions could not be verified. Changes are disabled until you refresh."
    : !campaignsLoaded
      ? "Pitch campaigns could not be loaded. Campaign creation and changes are disabled until you refresh."
      : supportingDataLoadFailed
      ? "Some campaign data could not be loaded. Refresh before making changes that depend on missing prospects, contacts, or market sprints."
      : null;
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
        accessState={accessState}
        campaignsLoaded={campaignsLoaded}
        loadError={loadError}
      />
    </div>
  );
}
