/**
 * Separate StoryLiner-ported voices for Stalemate and Rad Dad.
 * Unknown bands must not inherit either voice.
 */
export const SOCIAL_VOICE_KEYS = ["stalemate", "rad_dad", "unknown"] as const;
export type SocialVoiceKey = (typeof SOCIAL_VOICE_KEYS)[number];

export const SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "youtube",
  "tiktok"
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialVoiceProfile = {
  voiceKey: Exclude<SocialVoiceKey, "unknown">;
  displayName: string;
  toneDescription: string;
  personalityTraits: string[];
  toneRules: string[];
  bannedPhrases: string[];
  bannedTopics: string[];
  emojiTolerance: number;
  defaultTone: string;
  instagramNotes: string;
  facebookNotes: string;
  youtubeNotes: string;
  tiktokNotes: string;
  goodExamples: string[];
  badExamples: string[];
};

export const STALEMATE_VOICE: SocialVoiceProfile = {
  voiceKey: "stalemate",
  displayName: "Stalemate",
  toneDescription:
    "Dry. Direct. Slightly self-aware but never self-deprecating for comedic effect. Scene-rooted originals. Allergic to hype.",
  personalityTraits: [
    "dry wit",
    "scene-rooted",
    "anti-hype",
    "honest",
    "understated",
    "occasionally sardonic"
  ],
  toneRules: [
    "Never beg. If someone doesn't come to the show, that's fine.",
    "No exclamation marks unless absolutely unavoidable.",
    "Do not explain the joke.",
    "Do not use the word 'journey'.",
    "Do not describe a show as 'epic' or 'unforgettable'.",
    "If it sounds like a band promoting itself, rewrite it.",
    "Dry is better than hype.",
    "Short is usually better than long."
  ],
  bannedPhrases: [
    "journey",
    "excited to announce",
    "honored",
    "we can't wait",
    "epic night",
    "don't miss out",
    "making memories",
    "limited tickets",
    "grab your tickets now",
    "unforgettable experience",
    "passionate about",
    "proud to share",
    "game changer",
    "incredibly proud"
  ],
  bannedTopics: [
    "fake album chart claims",
    "streaming numbers unless real",
    "corporate partnerships",
    "brand deals"
  ],
  emojiTolerance: 2,
  defaultTone: "AUTHENTIC",
  instagramNotes: "One or two hashtags max. No emoji stacks.",
  facebookNotes: "Conversational. Link and show facts. No hype.",
  youtubeNotes: "Title is the song or room. Description is facts, not a trailer.",
  tiktokNotes: "One dry hook line. No trending-speak.",
  goodExamples: [
    "Playing Burlington Bar Saturday. Nine-ish.",
    "We finished a record. It's called Nothing Stays. Out in February.",
    "Rehearsal went long. No one's complaining."
  ],
  badExamples: [
    "We are SO EXCITED to announce our upcoming show — don't miss out on this unforgettable night!!!",
    "Honored to share that we've been working incredibly hard and are proud to reveal our new single!"
  ]
};

export const RAD_DAD_VOICE: SocialVoiceProfile = {
  voiceKey: "rad_dad",
  displayName: "Rad Dad",
  toneDescription:
    "Energetic, nostalgic, crowd-first cover-band energy. Warm, shareable, one step from a mid-2000s reference.",
  personalityTraits: [
    "nostalgic",
    "crowd-focused",
    "high-energy",
    "self-aware",
    "warm",
    "slightly chaotic"
  ],
  toneRules: [
    "It's okay to be enthusiastic — Rad Dad is allowed to have exclamation marks.",
    "Reference specific songs or albums when relevant.",
    "Never sound corporate or formal.",
    "The singalong is always the point. Center it.",
    "Crowd first. Always.",
    "Abbreviations and informal language are fine."
  ],
  bannedPhrases: [
    "critically acclaimed",
    "music journey",
    "authentic experience",
    "world-class",
    "industry",
    "monetize",
    "content creator",
    "leveraging",
    "synergy"
  ],
  bannedTopics: ["political opinions", "band drama", "gear talk nobody asked for"],
  emojiTolerance: 5,
  defaultTone: "ENERGETIC",
  instagramNotes: "Reels work. Caption should be fun and quick. 3-5 hashtags is fine.",
  facebookNotes: "Event posts get reach. Tag the venue. Crowd first.",
  youtubeNotes: "Title names the room or the song. Description lists the covers.",
  tiktokNotes: "Short hook. Crowd singalong is the format.",
  goodExamples: [
    "Playing Lincoln Hall this Saturday. We will 100% play Mr. Brightside. Come fight us.",
    "Hey Chicago. Friday night. Full pop punk set. Bring your friends who 'don't really like live music'."
  ],
  badExamples: [
    "We are incredibly honored to announce our upcoming performance and can't wait to share this incredible experience with all of you!",
    "Our music journey continues as we bring our critically acclaimed set to a new stage!"
  ]
};

export function voiceProfileFor(voice: SocialVoiceKey): SocialVoiceProfile | null {
  if (voice === "stalemate") return STALEMATE_VOICE;
  if (voice === "rad_dad") return RAD_DAD_VOICE;
  return null;
}

export function resolveSocialVoice(bandName: string): SocialVoiceKey {
  const name = (bandName ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (name.includes("rad dad")) return "rad_dad";
  if (name.includes("stalemate")) return "stalemate";
  return "unknown";
}

export function hashtagCapForVoice(voice: SocialVoiceKey, platform: SocialPlatform): number {
  if (voice === "stalemate" && platform === "instagram") return 2;
  if (platform === "instagram") return 8;
  if (platform === "tiktok") return 5;
  if (platform === "youtube") return 8;
  return 4;
}

export function containsBannedPhrase(text: string, voice: SocialVoiceKey): string | null {
  const profile = voiceProfileFor(voice);
  if (!profile) return null;
  const lower = text.toLowerCase();
  return profile.bannedPhrases.find((phrase) => lower.includes(phrase.toLowerCase())) ?? null;
}

export function stripBannedPhrases(text: string, voice: SocialVoiceKey): string {
  const profile = voiceProfileFor(voice);
  if (!profile) return text;
  let next = text;
  for (const phrase of profile.bannedPhrases) {
    const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    next = next.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
  }
  return next;
}
