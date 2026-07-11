import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingProfileResponse, BookingProspect, Contact } from "@/lib/types";
import { ProspectsClient } from "./prospects-client";

export default async function ProspectsPage() {
  let profile: BookingProfileResponse = {
    profile: null,
    ready: false,
    missing: ["booking profile"]
  };
  let prospects: BookingProspect[] = [];
  let contacts: Contact[] = [];
  try {
    [profile, prospects, contacts] = await Promise.all([
      serverApiFetch<BookingProfileResponse>("/booking-profile", {
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
    // The client renders a usable empty/manual state if the API is unavailable.
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
      />
    </div>
  );
}
