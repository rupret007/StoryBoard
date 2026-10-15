export type AdapterId =
  | "gmail"
  | "google-calendar"
  | "google-drive"
  | "bandsintown"
  | "ticketmaster"
  | "youtube"
  | "youtube-publish"
  | "facebook"
  | "instagram"
  | "tiktok"
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
    id: "youtube-publish",
    displayName: "YouTube upload",
    capabilities: ["write", "dry-run", "approval-required"],
    notes: "videos.insert resumable upload. Defaults to private until the Google project is audited."
  },
  {
    id: "facebook",
    displayName: "Facebook Pages",
    capabilities: ["write", "dry-run", "approval-required"],
    notes: "Page photo/video posts and show Events. Nothing posts without an approval record."
  },
  {
    id: "instagram",
    displayName: "Instagram Content Publishing",
    capabilities: ["write", "dry-run", "approval-required"],
    notes: "Feed photo or Reel via a public https media URL. Query content_publishing_limit before send."
  },
  {
    id: "tiktok",
    displayName: "TikTok inbox draft",
    capabilities: ["write", "dry-run", "approval-required"],
    notes: "Upload-to-inbox draft only. Jeff finishes in the TikTok app. Unaudited apps stay SELF_ONLY."
  },
  {
    id: "spotify",
    displayName: "Spotify Web API",
    capabilities: ["read"],
    notes: "Audience, artist profile, and release context."
  }
];
