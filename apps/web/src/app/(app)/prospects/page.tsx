import { PageHeader } from "@storyboard/ui";
import { serverApiFetch, serverBandAccess } from "@/lib/api-server";
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
  let artistId: string | null = null;
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  let loadError: string | null = null;
  try {
    const access = await serverBandAccess();
    artistId = access.artistId;
    accessState = access.accessState;
    [profile, prospects, contacts, sprints] = await Promise.all([
      serverApiFetch<BookingProfileResponse>("/booking-profile", {
        cache: "no-store", artistId
      }),
      serverApiFetch<BookingProspect[]>("/booking-prospects", {
        cache: "no-store", artistId
      }),
      serverApiFetch<Contact[]>("/contacts", {
        cache: "no-store", artistId
      }),
      serverApiFetch<BookingMarketSprint[]>("/market-sprints", { cache: "no-store", artistId })
    ]);
  } catch {
    loadError = artistId
      ? "Booking research could not be loaded. Changes are disabled until you retry."
      : "Your band permissions could not be verified. Changes are disabled until you retry.";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Find shows"
        description="Research one market at a time, qualify the right rooms or buyers, then turn each lead into a deliberate booking opportunity."
      />
      <ProspectsClient
        key={artistId ?? "unavailable"}
        artistId={artistId}
        accessState={accessState}
        loadError={loadError}
        initialProfile={profile}
        initialProspects={prospects}
        contacts={contacts}
        sprints={sprints}
      />
    </div>
  );
}
