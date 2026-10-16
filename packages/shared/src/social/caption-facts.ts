import type { SocialPlatform, SocialVoiceKey } from "./voice";

export type SocialShowHint = {
  name: string;
  startsAt?: string | null | undefined;
  place?: string | null | undefined;
  ticketUrl?: string | null | undefined;
};

export const SOCIAL_CAPTION_LIMITS = {
  facebook: { caption: 1200, title: 0 },
  instagram: { caption: 300, title: 0 },
  tiktok: { caption: 150, title: 0 },
  youtube: { caption: 5000, title: 100 }
} as const;

/** Cities we refuse to hashtag or name unless they appear in confirmed data. */
export const SOCIAL_LOCATION_TOKENS = [
  "chicago",
  "nyc",
  "new york",
  "brooklyn",
  "los angeles",
  "austin",
  "nashville",
  "denver",
  "seattle",
  "portland",
  "boston",
  "atlanta",
  "dallas",
  "houston",
  "detroit",
  "minneapolis",
  "philadelphia",
  "san francisco",
  "london",
  "toronto"
] as const;

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

export type ConfirmedSocialFacts = {
  voice: SocialVoiceKey;
  note: string;
  mediaKind: "photo" | "video";
  show?: SocialShowHint | null | undefined;
  extra?: string[] | undefined;
};

export function normalizeFactText(value: string): string {
  return value.toLowerCase().replace(/[#@]/g, "").replace(/\s+/g, " ").trim();
}

export function confirmedSocialFactBag(facts: ConfirmedSocialFacts): string {
  return normalizeFactText(
    [
      facts.note,
      facts.show?.name ?? "",
      facts.show?.place ?? "",
      facts.show?.startsAt ?? "",
      facts.show?.ticketUrl ?? "",
      facts.voice === "stalemate" ? "stalemate" : "",
      facts.voice === "rad_dad" ? "rad dad raddad" : "",
      ...(facts.extra ?? [])
    ].join(" ")
  );
}

export function factBagIncludes(bag: string, value: string): boolean {
  const needle = normalizeFactText(value);
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(bag);
}

function linksInText(text: string): string[] {
  return (text.match(/(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi) ?? [])
    .map((link) => link.replace(/[.,;!?)]+$/, ""));
}

export function inventedFactsInText(text: string, facts: ConfirmedSocialFacts): string[] {
  const bag = confirmedSocialFactBag(facts);
  const invented: string[] = [];
  const body = text ?? "";
  const confirmedLinks = new Set(linksInText([
    facts.note,
    facts.show?.name,
    facts.show?.place,
    facts.show?.startsAt,
    facts.show?.ticketUrl,
    ...(facts.extra ?? [])
  ].filter(Boolean).join(" ")));
  for (const link of linksInText(body)) {
    if (!confirmedLinks.has(link)) invented.push(link);
  }

  for (const match of body.match(/\$\d+(?:\.\d{1,2})?/g) ?? []) {
    if (!factBagIncludes(bag, match)) invented.push(match);
  }
  for (const match of body.match(/\b\d+\s*(?:dollars|usd)\b/gi) ?? []) {
    if (!factBagIncludes(bag, match)) invented.push(match);
  }
  const datePattern = new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*,\\s*\\d{4})?\\b`, "gi");
  for (const match of body.match(datePattern) ?? []) {
    if (!factBagIncludes(bag, match) && !factBagIncludes(bag, match.replace(/,/g, ""))) {
      invented.push(match);
    }
  }
  for (const match of body.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []) {
    if (!factBagIncludes(bag, match)) invented.push(match);
  }
  for (const match of body.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g) ?? []) {
    if (!factBagIncludes(bag, match)) invented.push(match);
  }
  for (const match of body.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tonight|tomorrow|yesterday)\b/gi) ?? []) {
    if (!factBagIncludes(bag, match)) invented.push(match);
  }
  for (const match of body.match(/\b(?:\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?|\d{1,2}:\d{2})\b/gi) ?? []) {
    if (!factBagIncludes(bag, match)) invented.push(match);
  }

  const lower = normalizeFactText(body);
  for (const city of SOCIAL_LOCATION_TOKENS) {
    const hashed = `#${city.replace(/\s+/g, "")}`;
    const mentioned =
      factBagIncludes(lower, city) ||
      factBagIncludes(lower, city.replace(/\s+/g, "")) ||
      body.toLowerCase().includes(hashed);
    if (mentioned && !factBagIncludes(bag, city) && !factBagIncludes(bag, city.replace(/\s+/g, ""))) {
      invented.push(city);
    }
  }
  return [...new Set(invented)];
}

export function locationHashtagsFromFacts(facts: ConfirmedSocialFacts): string[] {
  const bag = confirmedSocialFactBag(facts);
  return SOCIAL_LOCATION_TOKENS.filter(
    (city) => factBagIncludes(bag, city) || factBagIncludes(bag, city.replace(/\s+/g, ""))
  ).map((city) => city.replace(/\s+/g, ""));
}

export function enforceCaptionLength(
  platform: SocialPlatform,
  input: { caption: string; title?: string | undefined }
): { caption: string; title?: string | undefined } {
  const limits = SOCIAL_CAPTION_LIMITS[platform];
  const caption = trimToLimit(input.caption, limits.caption);
  const title = limits.title ? trimToLimit(input.title ?? "", limits.title) : input.title;
  return title ? { caption, title } : { caption, title: input.title };
}

function trimToLimit(value: string, max: number): string {
  const text = value.trim();
  if (max <= 0 || text.length <= max) return text;
  const sliced = text.slice(0, max);
  const atSpace = sliced.lastIndexOf(" ");
  return (atSpace > max * 0.6 ? sliced.slice(0, atSpace) : sliced).trim();
}
