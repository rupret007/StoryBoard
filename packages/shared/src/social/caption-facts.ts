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

// A small presentation vocabulary, not a list of known venues or artists.
// Every other word must occur in a contiguous span of the supplied facts.
export const SOCIAL_CAPTION_CONNECTIVES = [
  "a", "an", "and", "at", "in", "on", "the", "this", "we", "will",
  "play", "playing", "tickets", "come", "sing", "see", "you"
] as const;

const INPUT_INSTRUCTION_PATTERNS = [
  /\b(?:ignore|disregard|override|forget|bypass)\b[\s\S]{0,100}\b(?:previous|above|prior|all|rules?|instructions?|prompts?|polic(?:y|ies)|guards?|validation|facts?)\b/i,
  /\b(?:system|developer|assistant|user)\s*(?:message|prompt|instructions?|role)?\s*:/i,
  /<\/?(?:system|developer|assistant|instructions?|prompt)\b|<\|[^>]+\|>|\[\/?INST\]/i,
  /\b(?:system|developer)\s+(?:message|prompt|instructions?)\b/i,
  /\b(?:return|output|respond|generate|write|include|add|use|say|claim|post|publish|send)\b[\s\S]{0,100}\b(?:json|schema|instructions?|prompt|instead|regardless|unverified|unconfirmed)\b/i,
  /\b(?:invent|fabricate|hallucinate)\b|\bmake\s+up\b|\bpretend\b|\bimagine\s+(?:we|you|that)\b/i,
  /\b(?:do not|don't|never)\s+(?:validate|verify|fact[- ]?check|follow|obey)\b/i,
  /\b(?:new|updated|highest[- ]priority)\s+(?:rules?|instructions?|policy)\b/i,
  /\b(?:captions?|responses?|outputs?|answers?)\s+(?:must|should|shall|need\s+to)\b/i,
  /\b(?:write|draft|generate|produce|create|compose|make)\s+(?:(?:me|us)\s+)?(?:(?:the|an?|our|this|social)\s+)*(?:captions?|posts?|responses?|outputs?|answers?)\b/i,
  /\b(?:caption|response|output|answer)\s*[:=]/i,
  /\byou\s+are\s+(?:now|an?|the)\b|\b(?:always|must)\s+(?:mention|include|say|write|claim)\b/i
];

/** Reject instruction-bearing data before it can become grounding evidence. */
export function assertSafeSocialCaptionFacts(facts: ConfirmedSocialFacts): void {
  for (const value of [facts.note, facts.show?.name, facts.show?.place, facts.show?.startsAt,
    facts.show?.ticketUrl, ...(facts.extra ?? [])]) {
    if (!value) continue;
    const normalized = value.normalize("NFKC");
    if (/[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(normalized) ||
      INPUT_INSTRUCTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
      throw new Error("Caption input must contain facts only. No draft was created.");
    }
  }
}

function factSources(facts: ConfirmedSocialFacts): string[] {
  assertSafeSocialCaptionFacts(facts);
  return [
    facts.note,
    facts.show?.name ?? "",
    facts.show?.place ?? "",
    facts.show?.startsAt ?? "",
    facts.show?.ticketUrl ?? "",
    facts.voice === "stalemate" ? "stalemate" : "",
    facts.voice === "rad_dad" ? "rad dad raddad" : "",
    ...(facts.extra ?? [])
  ].filter(Boolean);
}

export function normalizeFactText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[#@]/g, "").replace(/\s+/g, " ").trim();
}

export function confirmedSocialFactBag(facts: ConfirmedSocialFacts): string {
  return normalizeFactText(factSources(facts).join(" \n "));
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

function wordText(value: string): string {
  return normalizeFactText(value).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.join(" ") ?? "";
}

/** Validate one caption, title, or tag at a time so field boundaries stay intact. */
export function ungroundedSocialCaptionSpans(body: string, facts: ConfirmedSocialFacts): string[] {
  const sources = factSources(facts).flatMap((source) => source.split(/[\n,.!?;:·|]/u).map(wordText));
  const supported = (span: string) => sources.some((source) => factBagIncludes(source, span));
  const glue = new Set<string>(SOCIAL_CAPTION_CONNECTIVES);
  // Code-owned tags are formatting metadata; they never establish a venue or lineup.
  const voiceTags = facts.voice === "rad_dad"
    ? ["raddadband", "poppunk", "singalong", "cover band", "reel"] : ["live"];
  if (voiceTags.includes(wordText(body))) return [];
  const unsupported: string[] = [];
  // Inline tags are checked separately against the exact tag allowlist.
  const withoutLinks = linksInText(body).reduce((text, link) => text.replaceAll(link, " "), body)
    .replace(/#[\p{L}\p{N}_]+/gu, " ");
  for (const segment of withoutLinks.split(/[\n,.!?;:·|]/u)) {
    let span: string[] = [];
    const check = () => {
      const value = span.join(" ");
      if (value && !supported(value)) unsupported.push(value);
      span = [];
    };
    for (const token of wordText(segment).split(" ").filter(Boolean)) {
      const temporal = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tonight|tomorrow|yesterday|\d+(?:am|pm)?)$/.test(token);
      if (glue.has(token) || (temporal && supported(token))) check();
      else span.push(token);
    }
    check();
  }

  // Names made entirely from ordinary caption words still need evidence when
  // used as a venue or lineup. Keep the relation itself grounded, too: a band
  // mentioned elsewhere is not automatically an opening act or guest player.
  const relationPattern = /\b(?:at|in|venue\s*[:—-]|with|featuring|feat\.?|ft\.?|opening\s+for|support\s+from|joined\s+by|lineup\s*(?::|is|includes?)?|(?:vocals|drums|guitar|bass)\s*:|on\s+(?:vocals|drums|guitar|bass))\s+([^\n,.!?;:·|]+)/giu;
  for (const match of withoutLinks.matchAll(relationPattern)) {
    const relation = wordText(match[0]);
    const entity = wordText(match[1] ?? "");
    if (supported(relation)) continue;
    const venue = /^(?:at|in|venue\s*:)/i.test(match[0]);
    const place = wordText(facts.show?.place ?? "");
    if (venue && place && entity === place) continue;
    unsupported.push(relation);
  }
  const performerRole = /([^\n,.!?;:·|—]+?)\s*(?:\bon\s+|[:—]\s*|\(\s*)(?:vocals|drums|guitar|bass)\b\)?/giu;
  for (const match of withoutLinks.matchAll(performerRole)) {
    const relation = wordText(match[0]);
    if (!supported(relation)) unsupported.push(relation);
  }
  return unsupported;
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
