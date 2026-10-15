import { stripBannedPhrases, voiceProfileFor, type SocialPlatform, type SocialVoiceKey } from "./voice";

export type SocialShowHint = {
  name: string;
  startsAt?: string | null | undefined;
  place?: string | null | undefined;
  ticketUrl?: string | null | undefined;
};

export type SocialCaptionDraft = {
  platform: SocialPlatform;
  caption: string;
  title?: string;
  tags: string[];
  includeFacebookEvent: boolean;
};

export type DraftCaptionsInput = {
  voice: SocialVoiceKey;
  note: string;
  mediaKind: "photo" | "video";
  show?: SocialShowHint | null;
};

function formatShowLine(show?: SocialShowHint | null): string {
  if (!show?.name) return "";
  const bits = [show.name];
  if (show.place) bits.push(show.place);
  if (show.startsAt) bits.push(show.startsAt);
  return bits.join(" · ");
}

function stalemateDrafts(note: string, mediaKind: "photo" | "video", show?: SocialShowHint | null): SocialCaptionDraft[] {
  const showLine = formatShowLine(show);
  const cleaned = stripBannedPhrases(note.replace(/!+/g, ".").trim(), "stalemate");
  const facebook = [cleaned, showLine, show?.ticketUrl].filter(Boolean).join("\n\n");
  const instagram =
    mediaKind === "video"
      ? `${cleaned}${showLine ? `\n${showLine}` : ""}\n\n#stalemate #chicago`
      : `${cleaned}${showLine ? ` ${showLine}.` : ""}\n\n#stalemate`;
  const youtubeTitle = show?.name ? `${show.name}` : cleaned.slice(0, 80) || "Stalemate";
  const youtube = [cleaned, showLine, show?.ticketUrl].filter(Boolean).join("\n\n");
  const tiktok = cleaned.split(/[.!?]/)[0]?.trim() || cleaned;
  return [
    { platform: "facebook", caption: facebook, tags: [], includeFacebookEvent: Boolean(show?.name) },
    { platform: "instagram", caption: instagram, tags: mediaKind === "video" ? ["stalemate", "chicago"] : ["stalemate"], includeFacebookEvent: false },
    {
      platform: "youtube",
      caption: youtube,
      title: youtubeTitle,
      tags: ["stalemate", "live"],
      includeFacebookEvent: false
    },
    { platform: "tiktok", caption: tiktok, tags: ["stalemate"], includeFacebookEvent: false }
  ];
}

function radDadDrafts(note: string, mediaKind: "photo" | "video", show?: SocialShowHint | null): SocialCaptionDraft[] {
  const showLine = formatShowLine(show);
  const cleaned = stripBannedPhrases(note.trim(), "rad_dad");
  const facebook = [
    cleaned.endsWith("!") ? cleaned : `${cleaned}!`,
    showLine,
    show?.ticketUrl ? `Tickets: ${show.ticketUrl}` : null,
    "Bring the people from the group chat."
  ]
    .filter(Boolean)
    .join("\n\n");
  const instagram = `${cleaned}${showLine ? `\n${showLine}` : ""}\n\n#raddad #chicago #poppunk #singalong`;
  const youtubeTitle = show?.name ? `${show.name} | Rad Dad` : cleaned.slice(0, 70) || "Rad Dad";
  const youtube = [cleaned, showLine, "Covers. Crowd first.", show?.ticketUrl].filter(Boolean).join("\n\n");
  const tiktok = cleaned.split(/[.!?]/)[0]?.trim() || cleaned;
  return [
    { platform: "facebook", caption: facebook, tags: ["raddad"], includeFacebookEvent: Boolean(show?.name) },
    {
      platform: "instagram",
      caption: instagram,
      tags: ["raddad", "chicago", "poppunk", "singalong"],
      includeFacebookEvent: false
    },
    {
      platform: "youtube",
      caption: youtube,
      title: youtubeTitle,
      tags: ["rad dad", "cover band", "chicago"],
      includeFacebookEvent: false
    },
    { platform: "tiktok", caption: tiktok, tags: ["raddadband"], includeFacebookEvent: false }
  ];
}

function unknownDrafts(note: string, show?: SocialShowHint | null): SocialCaptionDraft[] {
  const showLine = formatShowLine(show);
  const caption = [note.trim(), showLine, show?.ticketUrl].filter(Boolean).join("\n\n");
  return [
    { platform: "facebook", caption, tags: [], includeFacebookEvent: Boolean(show?.name) },
    { platform: "instagram", caption, tags: [], includeFacebookEvent: false },
    { platform: "youtube", caption, title: note.trim().slice(0, 80) || "Untitled", tags: [], includeFacebookEvent: false },
    { platform: "tiktok", caption: note.trim().slice(0, 150), tags: [], includeFacebookEvent: false }
  ];
}

/** Deterministic per-platform drafts in the band's voice. No live LLM required. */
export function draftPlatformCaptions(input: DraftCaptionsInput): SocialCaptionDraft[] {
  const note = input.note.trim();
  if (input.voice === "stalemate") return stalemateDrafts(note, input.mediaKind, input.show);
  if (input.voice === "rad_dad") return radDadDrafts(note, input.mediaKind, input.show);
  return unknownDrafts(note, input.show);
}

export function instagramUsesReel(mediaKind: "photo" | "video"): boolean {
  return mediaKind === "video";
}

export function voiceDisplayName(voice: SocialVoiceKey): string {
  return voiceProfileFor(voice)?.displayName ?? "Unknown voice";
}
