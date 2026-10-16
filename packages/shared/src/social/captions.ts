import {
  assertSafeSocialCaptionFacts,
  enforceCaptionLength,
  locationHashtagsFromFacts,
  type ConfirmedSocialFacts,
  type SocialShowHint
} from "./caption-facts";
import {
  hashtagCapForVoice,
  stripBannedPhrases,
  voiceProfileFor,
  type SocialPlatform,
  type SocialVoiceKey
} from "./voice";

export type { SocialShowHint };

export type SocialCaptionVariant = {
  caption: string;
  title?: string | undefined;
  tags: string[];
};

export type SocialCaptionDraft = {
  platform: SocialPlatform;
  caption: string;
  title?: string | undefined;
  tags: string[];
  includeFacebookEvent: boolean;
  variants: SocialCaptionVariant[];
  selectedVariantIndex: number;
};

export type DraftCaptionsInput = {
  voice: SocialVoiceKey;
  note: string;
  mediaKind: "photo" | "video";
  show?: SocialShowHint | null;
  extraFacts?: string[] | undefined;
};

export function formatShowLine(show?: SocialShowHint | null): string {
  if (!show?.name) return "";
  const bits = [show.name];
  if (show.place) bits.push(show.place);
  if (show.startsAt) bits.push(show.startsAt);
  return bits.join(" · ");
}

export function firstSentence(text: string): string {
  return text.split(/(?<=[.!?])\s+/)[0]?.trim() || text.trim();
}

function factsFromInput(input: DraftCaptionsInput): ConfirmedSocialFacts {
  return {
    voice: input.voice,
    note: input.note,
    mediaKind: input.mediaKind,
    show: input.show,
    extra: input.extraFacts
  };
}

function hashtagsFor(input: DraftCaptionsInput, platform: SocialPlatform, extras: string[] = []): string[] {
  const cap = hashtagCapForVoice(input.voice, platform);
  const voiceTags =
    input.voice === "stalemate"
      ? ["stalemate"]
      : input.voice === "rad_dad"
        ? platform === "instagram"
          ? ["raddad", "poppunk", "singalong"]
          : platform === "tiktok"
            ? ["raddadband"]
            : platform === "youtube"
              ? ["rad dad", "cover band"]
              : ["raddad"]
        : [];
  const location = locationHashtagsFromFacts(factsFromInput(input));
  const media = input.mediaKind === "video" && platform === "instagram" && input.voice === "rad_dad" ? ["reel"] : [];
  const unique: string[] = [];
  for (const tag of [...voiceTags, ...location, ...media, ...extras]) {
    const clean = tag.replace(/^#/, "").trim();
    if (!clean) continue;
    if (unique.some((row) => row.toLowerCase() === clean.toLowerCase())) continue;
    unique.push(clean);
    if (unique.length >= cap) break;
  }
  return unique;
}

function renderHashtags(tags: string[]): string {
  if (!tags.length) return "";
  return `\n\n${tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ")}`;
}

function variant(
  platform: SocialPlatform,
  caption: string,
  tags: string[],
  title?: string
): SocialCaptionVariant {
  const limited = enforceCaptionLength(platform, { caption, title });
  return {
    caption: limited.caption,
    ...(limited.title ? { title: limited.title } : {}),
    tags
  };
}

function pack(
  platform: SocialPlatform,
  variants: SocialCaptionVariant[],
  includeFacebookEvent: boolean
): SocialCaptionDraft {
  const chosen = variants[0] ?? { caption: "", tags: [] };
  return {
    platform,
    caption: chosen.caption,
    title: chosen.title,
    tags: chosen.tags,
    includeFacebookEvent,
    variants,
    selectedVariantIndex: 0
  };
}

function cleanedNote(note: string, voice: SocialVoiceKey): string {
  return stripBannedPhrases(note.replace(/!+/g, voice === "rad_dad" ? "!" : ".").trim(), voice);
}

function stalemateDrafts(input: DraftCaptionsInput): SocialCaptionDraft[] {
  const note = cleanedNote(input.note, "stalemate");
  const showLine = formatShowLine(input.show);
  const ticket = input.show?.ticketUrl ?? "";
  const igTags = hashtagsFor(input, "instagram");
  const ytTags = hashtagsFor(input, "youtube", ["live"]);
  const ttTags = hashtagsFor(input, "tiktok");
  const facebook = pack(
    "facebook",
    [
      variant("facebook", [note, showLine, ticket].filter(Boolean).join("\n\n"), []),
      variant("facebook", [showLine, note, ticket].filter(Boolean).join("\n\n"), []),
      variant("facebook", [firstSentence(note), showLine, ticket].filter(Boolean).join("\n\n"), [])
    ],
    Boolean(input.show?.name)
  );
  const instagram = pack(
    "instagram",
    [
      variant("instagram", `${note}${showLine ? `\n${showLine}` : ""}${renderHashtags(igTags)}`, igTags),
      variant("instagram", `${firstSentence(note)}${showLine ? ` ${showLine}` : "."}${renderHashtags(igTags)}`, igTags),
      variant(
        "instagram",
        `${showLine || firstSentence(note)}${renderHashtags(igTags.slice(0, 1))}`,
        igTags.slice(0, 1)
      )
    ],
    false
  );
  const youtubeTitle = input.show?.name || firstSentence(note).slice(0, 80) || "Stalemate";
  const youtube = pack(
    "youtube",
    [
      variant("youtube", [note, showLine, ticket].filter(Boolean).join("\n\n"), ytTags, youtubeTitle),
      variant("youtube", [showLine, note, ticket].filter(Boolean).join("\n\n"), ytTags, youtubeTitle),
      variant("youtube", [firstSentence(note), ticket].filter(Boolean).join("\n\n"), ytTags, youtubeTitle)
    ],
    false
  );
  const tiktok = pack(
    "tiktok",
    [
      variant("tiktok", firstSentence(note), ttTags),
      variant("tiktok", showLine || firstSentence(note), ttTags),
      variant("tiktok", note, ttTags)
    ],
    false
  );
  return [facebook, instagram, youtube, tiktok];
}

function radDadDrafts(input: DraftCaptionsInput): SocialCaptionDraft[] {
  const note = cleanedNote(input.note, "rad_dad");
  const energetic = note.endsWith("!") ? note : `${note}!`;
  const showLine = formatShowLine(input.show);
  const ticket = input.show?.ticketUrl ? `Tickets: ${input.show.ticketUrl}` : "";
  const igTags = hashtagsFor(input, "instagram");
  const fbTags = hashtagsFor(input, "facebook");
  const ytTags = hashtagsFor(input, "youtube");
  const ttTags = hashtagsFor(input, "tiktok");
  const facebook = pack(
    "facebook",
    [
      variant("facebook", [energetic, showLine, ticket].filter(Boolean).join("\n\n"), fbTags),
      variant("facebook", [showLine, energetic, ticket].filter(Boolean).join("\n\n"), fbTags),
      variant("facebook", [firstSentence(energetic), showLine, ticket].filter(Boolean).join("\n\n"), fbTags)
    ],
    Boolean(input.show?.name)
  );
  const instagram = pack(
    "instagram",
    [
      variant("instagram", `${energetic}${showLine ? `\n${showLine}` : ""}${renderHashtags(igTags)}`, igTags),
      variant("instagram", `${firstSentence(energetic)}${showLine ? `\n${showLine}` : ""}${renderHashtags(igTags)}`, igTags),
      variant("instagram", `${showLine || firstSentence(energetic)}${renderHashtags(igTags.slice(0, 3))}`, igTags.slice(0, 3))
    ],
    false
  );
  const youtubeTitle = input.show?.name ? `${input.show.name} | Rad Dad` : firstSentence(note).slice(0, 70) || "Rad Dad";
  const youtube = pack(
    "youtube",
    [
      variant("youtube", [energetic, showLine, ticket].filter(Boolean).join("\n\n"), ytTags, youtubeTitle),
      variant("youtube", [showLine, energetic, ticket].filter(Boolean).join("\n\n"), ytTags, youtubeTitle),
      variant("youtube", [firstSentence(energetic), ticket].filter(Boolean).join("\n\n"), ytTags, youtubeTitle)
    ],
    false
  );
  const tiktok = pack(
    "tiktok",
    [
      variant("tiktok", firstSentence(energetic), ttTags),
      variant("tiktok", showLine || firstSentence(energetic), ttTags),
      variant("tiktok", energetic, ttTags)
    ],
    false
  );
  return [facebook, instagram, youtube, tiktok];
}

function unknownDrafts(input: DraftCaptionsInput): SocialCaptionDraft[] {
  const note = input.note.trim();
  const showLine = formatShowLine(input.show);
  const ticket = input.show?.ticketUrl ?? "";
  const caption = [note, showLine, ticket].filter(Boolean).join("\n\n");
  return [
    pack("facebook", [variant("facebook", caption, []), variant("facebook", [showLine, note].filter(Boolean).join("\n\n"), [])], Boolean(input.show?.name)),
    pack("instagram", [variant("instagram", caption, []), variant("instagram", firstSentence(note), [])], false),
    pack(
      "youtube",
      [
        variant("youtube", caption, [], note.slice(0, 80) || "Untitled"),
        variant("youtube", [showLine, note].filter(Boolean).join("\n\n"), [], input.show?.name || note.slice(0, 80) || "Untitled")
      ],
      false
    ),
    pack("tiktok", [variant("tiktok", note.slice(0, 150), []), variant("tiktok", firstSentence(note), [])], false)
  ];
}

/** Deterministic per-platform drafts in the band's voice. Used when no LLM key is set. */
export function draftPlatformCaptions(input: DraftCaptionsInput): SocialCaptionDraft[] {
  assertSafeSocialCaptionFacts(factsFromInput(input));
  const next = { ...input, note: input.note.trim() };
  if (next.voice === "stalemate") return stalemateDrafts(next);
  if (next.voice === "rad_dad") return radDadDrafts(next);
  return unknownDrafts(next);
}

export function instagramUsesReel(mediaKind: "photo" | "video"): boolean {
  return mediaKind === "video";
}

export function voiceDisplayName(voice: SocialVoiceKey): string {
  return voiceProfileFor(voice)?.displayName ?? "Unknown voice";
}

export function applyCaptionVariant(draft: SocialCaptionDraft, index: number): SocialCaptionDraft {
  const selected = draft.variants[index];
  if (!selected) return draft;
  return {
    ...draft,
    caption: selected.caption,
    title: selected.title,
    tags: selected.tags,
    selectedVariantIndex: index
  };
}
