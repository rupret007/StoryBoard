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
  let contextError = "";
  let profileAvailable = false;
  let prospectsAvailable = false;
  try {
    const access = await serverBandAccess();
    artistId = access.artistId;
    accessState = access.accessState;
    const [profileRows, prospectRows, contactRows, sprintRows] = await Promise.allSettled([
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
    if (profileRows.status === "fulfilled") {
      profile = profileRows.value;
      profileAvailable = true;
    }
    if (prospectRows.status === "fulfilled") {
      prospects = prospectRows.value;
      prospectsAvailable = true;
    }
    if (contactRows.status === "fulfilled") contacts = contactRows.value;
    if (sprintRows.status === "fulfilled") sprints = sprintRows.value;
    if (!profileAvailable && !prospectsAvailable) {
      loadError = "Booking research could not be loaded. Changes are disabled until you retry.";
    } else {
      const parts: string[] = [];
      if (!profileAvailable) {
        parts.push("The booking profile could not be loaded. A missing badge is not proof this band has no profile.");
      }
      if (!prospectsAvailable) {
        parts.push("Prospects could not be loaded. An unavailable list does not mean this band has no leads.");
      }
      if (contactRows.status === "rejected") {
        parts.push("Contacts could not be loaded. Recorded prospects are still shown; buyer links may be incomplete.");
      }
      if (sprintRows.status === "rejected") {
        parts.push("Market sprints could not be loaded. Recorded prospects are still shown.");
      }
      contextError = parts.join(" ");
    }
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
        contextError={contextError}
        profileAvailable={profileAvailable}
        prospectsAvailable={prospectsAvailable}
        initialProfile={profile}
        initialProspects={prospects}
        contacts={contacts}
        sprints={sprints}
      />
    </div>
  );
}
