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
  sendMessage(_draftId: string): Promise<{ messageId: string }>;
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
  /**
   * Best-effort “venues near a market”: when a default artist is configured in env,
   * derives venue names from that artist’s upcoming events filtered by city match.
   * Otherwise returns an empty list (see note in implementation).
   */
  searchVenuesNearCity(
    city: string,
    radiusKm: number
  ): Promise<{ name: string; city: string; capacity?: number }[]>;
}

export interface TicketmasterVenueHit {
  id: string;
  name: string;
  city: string;
  state?: string;
  url?: string;
}

export interface TicketmasterEventHit {
  id: string;
  name: string;
  startAt: string;
  venueName: string;
  city?: string;
  url?: string;
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
