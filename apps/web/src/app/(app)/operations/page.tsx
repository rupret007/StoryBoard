import { parseOpsWorkspaceFocus, parseOpsWorkspaceTab } from "@storyboard/shared";
import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type {
  ArtistProject,
  BandEvent,
  BandMember,
  BookingOpportunity,
  Contact,
  DealOffer,
  DocumentTemplate,
  Expense,
  Invoice,
  Setlist,
  Settlement,
  ShowReadiness,
  Song,
  Venue
} from "@/lib/types";
import { OperationsClient } from "./operations-client";

type OperationsAccessState = "manage" | "read_only" | "unavailable";

export default async function OperationsPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; event?: string; focus?: string }>;
}) {
  const params = await searchParams;
  let events: BandEvent[] = [];
  let readiness: ShowReadiness[] = [];
  let songs: Song[] = [];
  let setlists: Setlist[] = [];
  let projects: ArtistProject[] = [];
  let deals: DealOffer[] = [];
  let invoices: Invoice[] = [];
  let expenses: Expense[] = [];
  let settlements: Settlement[] = [];
  let templates: DocumentTemplate[] = [];
  let members: BandMember[] = [];
  let contacts: Contact[] = [];
  let venues: Venue[] = [];
  let bookings: BookingOpportunity[] = [];
  let eventsAvailable = false;
  let readinessAvailable = false;
  let songsAvailable = false;
  let setlistsAvailable = false;
  let bookingsAvailable = false;
  let accessState: OperationsAccessState = "unavailable";
  let isOwner = false;

  // Resolve one band before loading its editors. A later band switch must not
  // pair one band's running order with another band's write context.
  const [meResult] = await Promise.allSettled([
    serverApiFetch<{
      currentArtistId: string | null;
      memberships: { artistId: string; role: string }[];
    }>("/auth/me", { cache: "no-store" })
  ]);
  let artistId: string | null = null;
  if (meResult.status === "fulfilled") {
    const me = meResult.value;
    artistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId)
      ? me.currentArtistId
      : me.memberships[0]?.artistId ?? null;
    const role = me.memberships.find((membership) => membership.artistId === artistId)?.role;
    isOwner = role === "owner";
    accessState = role === "owner" || role === "member" ? "manage" : role === "viewer" ? "read_only" : "unavailable";
  }
  const readOptions = { cache: "no-store" as const, ...(artistId ? { artistId } : {}) };

  const [
    eventRows,
    readinessRows,
    songRows,
    setlistRows,
    projectRows,
    dealRows,
    invoiceRows,
    expenseRows,
    settlementRows,
    templateRows,
    memberRows,
    contactRows,
    venueRows,
    bookingRows
  ] = await Promise.allSettled([
    serverApiFetch<BandEvent[]>("/events", readOptions),
    serverApiFetch<ShowReadiness[]>("/events/readiness?days=120", readOptions),
    serverApiFetch<Song[]>("/songs", readOptions),
    serverApiFetch<Setlist[]>("/setlists", readOptions),
    serverApiFetch<ArtistProject[]>("/projects", readOptions),
    serverApiFetch<DealOffer[]>("/deals", readOptions),
    serverApiFetch<Invoice[]>("/invoices", readOptions),
    serverApiFetch<Expense[]>("/expenses", readOptions),
    serverApiFetch<Settlement[]>("/settlements", readOptions),
    serverApiFetch<DocumentTemplate[]>("/document-templates", readOptions),
    serverApiFetch<BandMember[]>("/manager/members", readOptions),
    serverApiFetch<Contact[]>("/contacts", readOptions),
    serverApiFetch<Venue[]>("/venues", readOptions),
    serverApiFetch<BookingOpportunity[]>("/booking-opportunities", readOptions)
  ]);

  if (eventRows.status === "fulfilled") {
    events = eventRows.value;
    eventsAvailable = true;
  }
  if (readinessRows.status === "fulfilled") {
    readiness = readinessRows.value;
    readinessAvailable = true;
  }
  if (songRows.status === "fulfilled") {
    songs = songRows.value;
    songsAvailable = true;
  }
  if (setlistRows.status === "fulfilled") {
    setlists = setlistRows.value;
    setlistsAvailable = true;
  }
  if (projectRows.status === "fulfilled") projects = projectRows.value;
  if (dealRows.status === "fulfilled") deals = dealRows.value;
  if (invoiceRows.status === "fulfilled") invoices = invoiceRows.value;
  if (expenseRows.status === "fulfilled") expenses = expenseRows.value;
  if (settlementRows.status === "fulfilled") settlements = settlementRows.value;
  if (templateRows.status === "fulfilled") templates = templateRows.value;
  if (memberRows.status === "fulfilled") members = memberRows.value;
  if (contactRows.status === "fulfilled") contacts = contactRows.value;
  if (venueRows.status === "fulfilled") venues = venueRows.value;
  if (bookingRows.status === "fulfilled") {
    bookings = bookingRows.value;
    bookingsAvailable = true;
  }

  const dataLoadFailed = [
    eventRows,
    readinessRows,
    songRows,
    setlistRows,
    projectRows,
    dealRows,
    invoiceRows,
    expenseRows,
    settlementRows,
    templateRows,
    memberRows,
    contactRows,
    venueRows
  ].some((result) => result.status === "rejected");
  if (dataLoadFailed) accessState = "unavailable";

  const loadError = meResult.status === "rejected"
    ? "Your operations permissions could not be verified. Changes are disabled until you refresh."
    : dataLoadFailed
      ? "Some operations data could not be loaded. Changes are disabled so incomplete records are not used. Refresh to try again."
      : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Band operations"
        description="Show control names the live or next recorded gig, its assigned set, booking posture, and one safe next action before the editors. Travis still books. StoryBoard does not auto-pitch."
      />
      <OperationsClient
        artistId={artistId}
        initialTab={parseOpsWorkspaceTab(params.tab)}
        focusEventId={params.event?.trim() || null}
        focusField={parseOpsWorkspaceFocus(params.focus)}
        eventsAvailable={eventsAvailable}
        readinessAvailable={readinessAvailable}
        setlistsAvailable={setlistsAvailable}
        songsAvailable={songsAvailable}
        bookingsAvailable={bookingsAvailable}
        initialEvents={events}
        initialReadiness={readiness}
        initialSongs={songs}
        initialSetlists={setlists}
        initialBookings={bookings}
        initialProjects={projects}
        initialDeals={deals}
        initialInvoices={invoices}
        initialExpenses={expenses}
        initialSettlements={settlements}
        initialTemplates={templates}
        members={members}
        contacts={contacts}
        venues={venues}
        accessState={accessState}
        isOwner={isOwner}
        loadError={loadError}
      />
    </div>
  );
}
