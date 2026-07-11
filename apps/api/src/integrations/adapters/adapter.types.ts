export type AdapterId =
  | "gmail"
  | "google-calendar"
  | "google-drive"
  | "bandsintown"
  | "ticketmaster"
  | "youtube"
  | "spotify";

export interface GmailDraft {
  to: string;
  subject: string;
  body: string;
}

export interface GmailAdapter {
  readonly id: AdapterId;
  readonly mode: "mock" | "real";
  draftMessage(input: GmailDraft): Promise<{ draftId: string; preview: string }>;
  sendMessage(input: GmailDraft): Promise<{ messageId: string; preview: string }>;
}

export interface CalendarHoldRequest {
  title: string;
  start: string;
  end: string;
  timeZone?: string;
}

export interface GoogleCalendarAdapter {
  readonly id: AdapterId;
  readonly mode: "mock" | "real";
  proposeHold(
    input: CalendarHoldRequest
  ): Promise<{ eventId: string; htmlLink: string | null }>;
}

export interface DriveFileRef {
  name: string;
  mimeType: string;
}

export interface GoogleDriveAdapter {
  readonly id: AdapterId;
  readonly mode: "mock" | "real";
  uploadDraftMeta(input: DriveFileRef): Promise<{ fileId: string; viewUrl: string }>;
  ensureStoryboardFolder(
    folderName: string
  ): Promise<{ folderId: string; webViewLink: string | null }>;
  listFolderFiles(
    folderId: string
  ): Promise<{ id: string; name: string; webViewLink: string | null }[]>;
}

/** Normalized artist reference from Bandsintown-style providers */
export interface ArtistRef {
  id: string;
  name: string;
  url?: string;
}

/** Single show / event for booking intel */
export interface EventIntel {
  id: string;
  title: string;
  venueName: string;
  city?: string;
  region?: string;
  startsAt: string;
  ticketUrl?: string;
}

export interface BandsintownAdapter {
  readonly id: AdapterId;
  readonly mode: "mock" | "real";
  /** Artist lookup by human-readable name or slug */
  resolveArtist(query: string): Promise<ArtistRef | null>;
  /** Upcoming events for an artist identifier (same slug/name as used on Bandsintown URLs) */
  listUpcomingEvents(artistIdentifier: string): Promise<EventIntel[]>;
}

export interface TicketmasterVenueHit {
  id: string;
  name: string;
  city: string;
  state?: string;
  country?: string;
  capacity?: number;
  url?: string;
}

export interface TicketmasterEventHit {
  id: string;
  name: string;
  startAt: string;
  venueName: string;
  city?: string;
  state?: string;
  country?: string;
  url?: string;
}

export interface TicketmasterMarketSearch {
  city: string;
  region?: string;
  country?: string;
  keyword?: string;
  size?: number;
}

export interface TicketmasterMarketSignals {
  venues: TicketmasterVenueHit[];
  events: TicketmasterEventHit[];
}

export interface TicketmasterAdapter {
  readonly id: AdapterId;
  readonly mode: "mock" | "real";
  /** Discovery: venues keyword search */
  discoverVenues(query: string): Promise<{ name: string; city: string }[]>;
  searchVenues(
    keyword: string,
    opts?: { size?: number }
  ): Promise<TicketmasterVenueHit[]>;
  searchEvents(
    keywordOrCity: string,
    opts?: { size?: number }
  ): Promise<TicketmasterEventHit[]>;
  /** Bounded, city-first Discovery API request used for booking prospecting. */
  searchMarket(input: TicketmasterMarketSearch): Promise<TicketmasterMarketSignals>;
}

export interface YoutubeAdapter {
  readonly id: AdapterId;
  readonly mode: "mock" | "real";
  channelStats(channelId: string): Promise<{ title: string; subscribers: number }>;
}

export interface SpotifyAdapter {
  readonly id: AdapterId;
  readonly mode: "mock" | "real";
  artistProfile(artistName: string): Promise<{ name: string; followers: number }>;
}

/** Registry shape used by commands and approval execution */
export interface StoryboardAdapterRegistry {
  gmail: GmailAdapter;
  calendar: GoogleCalendarAdapter;
  drive: GoogleDriveAdapter;
  bandsintown: BandsintownAdapter;
  ticketmaster: TicketmasterAdapter;
  youtube: YoutubeAdapter;
  spotify: SpotifyAdapter;
}
