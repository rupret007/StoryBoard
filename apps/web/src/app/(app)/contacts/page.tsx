import { PageHeader } from "@storyboard/ui";
import { ContactsClient } from "./contacts-client";
import { serverApiFetch } from "@/lib/api-server";
import type { Contact, Venue } from "@/lib/types";

export default async function ContactsPage() {
  let contacts: Contact[] = [];
  let venues: Venue[] = [];
  try {
    [contacts, venues] = await Promise.all([
      serverApiFetch<Contact[]>("/contacts", { cache: "no-store" }),
      serverApiFetch<Venue[]>("/venues", { cache: "no-store" })
    ]);
  } catch {
    // leave empty
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contacts"
        description="Promoters, venue staff, and partners — optionally linked to venues."
      />
      <ContactsClient initialContacts={contacts} venues={venues} />
    </div>
  );
}
