import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingMarketSprint, BookingProfileResponse, BookingProspect, Contact } from "@/lib/types";
import { ProspectsClient } from "./prospects-client";

export default async function ProspectsPage() {
  let profile: BookingProfileResponse = {
    profile: null,
    ready: false,
    missing: ["booking profile"]
  };
  let prospects: BookingProspect[] = [];
  let contacts: Contact[] = [];
  let sprints: BookingMarketSprint[] = [];
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  let loadError = "";
  const [profileResult, prospectResult, contactResult, sprintResult, meResult] =
    await Promise.allSettled([
      serverApiFetch<BookingProfileResponse>("/booking-profile", { cache: "no-store" }),
      serverApiFetch<BookingProspect[]>("/booking-prospects", { cache: "no-store" }),
      serverApiFetch<Contact[]>("/contacts", { cache: "no-store" }),
      serverApiFetch<BookingMarketSprint[]>("/market-sprints", { cache: "no-store" }),
      serverApiFetch<{
        currentArtistId: string | null;
        memberships: { artistId: string; role: string }[];
      }>("/auth/me", { cache: "no-store" })
    ]);
  if (profileResult.status === "fulfilled") profile = profileResult.value;
  if (prospectResult.status === "fulfilled") prospects = prospectResult.value;
  if (contactResult.status === "fulfilled") contacts = contactResult.value;
  if (sprintResult.status === "fulfilled") sprints = sprintResult.value;
  if (meResult.status === "fulfilled") {
    const me = meResult.value;
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
  }
  const dataFailed = [profileResult, prospectResult, contactResult, sprintResult].some(
    (result) => result.status === "rejected"
  );
  if (meResult.status === "rejected") {
    loadError = "Your workspace permissions could not be verified. Reload before changing prospects.";
    accessState = "unavailable";
  } else if (dataFailed) {
    loadError =
      "Find shows data could not be loaded. StoryBoard is not treating this as an empty workspace — reload before qualifying leads.";
    accessState = "unavailable";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Find shows"
        description="Research one market at a time, qualify the right rooms or buyers, then turn each lead into a deliberate booking opportunity."
      />
      <ProspectsClient
        initialProfile={profile}
        initialProspects={prospects}
        contacts={contacts}
        sprints={sprints}
        accessState={accessState}
        loadError={loadError}
      />
    </div>
  );
}
