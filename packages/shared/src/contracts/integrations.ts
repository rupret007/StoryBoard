export type AdapterId =
  | "gmail"
  | "google-calendar"
  | "google-drive"
  | "bandsintown"
  | "ticketmaster"
  | "youtube"
  | "spotify";

export type AdapterCapability =
  | "read"
  | "write"
  | "dry-run"
  | "approval-required"
  | "webhook";

export interface ExternalAdapterContract {
  id: AdapterId;
  displayName: string;
  capabilities: AdapterCapability[];
  notes: string;
}

export const MVP_ADAPTERS: ExternalAdapterContract[] = [
  {
    id: "gmail",
    displayName: "Gmail",
    capabilities: ["read", "write", "dry-run", "approval-required"],
    notes: "Email drafting and send approval path."
  },
  {
    id: "google-calendar",
    displayName: "Google Calendar",
    capabilities: ["read", "write", "dry-run", "approval-required"],
    notes: "Hold dates, routing, and coordination."
  },
  {
    id: "google-drive",
    displayName: "Google Drive",
    capabilities: ["read", "write", "dry-run"],
    notes: "Store show docs, tech riders, and release assets."
  },
  {
    id: "bandsintown",
    displayName: "Bandsintown",
    capabilities: ["read"],
    notes: "Event lookup and market intelligence."
  },
  {
    id: "ticketmaster",
    displayName: "Ticketmaster Discovery",
    capabilities: ["read"],
    notes: "Venue and market discovery support."
  },
  {
    id: "youtube",
    displayName: "YouTube Data API",
    capabilities: ["read"],
    notes: "Channel and release performance context."
  },
  {
    id: "spotify",
    displayName: "Spotify Web API",
    capabilities: ["read"],
    notes: "Audience, artist profile, and release context."
  }
];
