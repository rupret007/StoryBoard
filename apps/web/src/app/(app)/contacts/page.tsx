import { PageHeader } from "@storyboard/ui";
import { ContactsClient } from "./contacts-client";
import { serverApiFetch } from "@/lib/api-server";
import type { Contact, Venue } from "@/lib/types";

export default async function ContactsPage() {
  let contacts: Contact[] = [];
  let venues: Venue[] = [];
  let loadError = "";
  let contextError = "";
  let artistId: string | null = null;
  let canManage = false;
  try {
    const me = await serverApiFetch<{ currentArtistId: string | null; memberships: { artistId: string; role: string }[] }>("/auth/me", { cache: "no-store" });
    artistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId) ? me.currentArtistId : me.memberships[0]?.artistId ?? null;
    if (!artistId) throw new Error("Band access could not be verified");
    const role = me.memberships.find((membership) => membership.artistId === artistId)?.role;
    canManage = role === "owner" || role === "member";
  } catch {
    loadError = "Contacts could not be loaded. Reload to see your rolodex.";
  }
  if (artistId) {
    const [contactRows, venueRows] = await Promise.allSettled([
      serverApiFetch<Contact[]>("/contacts", { cache: "no-store", artistId }),
      serverApiFetch<Venue[]>("/venues", { cache: "no-store", artistId })
    ]);
    if (contactRows.status === "fulfilled") contacts = contactRows.value;
    else loadError = "Contacts could not be loaded. Reload to see your rolodex.";
    if (venueRows.status === "fulfilled") venues = venueRows.value;
    else contextError = "Venues could not be loaded. Recorded contacts are still shown; venue links may be incomplete.";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contacts"
        description="Promoters, venue staff, and partners — optionally linked to venues."
      />
      <ContactsClient key={artistId ?? "unverified"} artistId={artistId} canManage={canManage && !loadError} initialContacts={contacts} venues={venues} loadError={loadError} contextError={contextError} />
    </div>
  );
}
