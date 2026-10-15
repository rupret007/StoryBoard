import { z } from "zod";
import {
  enforceCaptionLength,
  inventedFactsInText,
  type ConfirmedSocialFacts
} from "./caption-facts";
import {
  applyCaptionVariant,
  draftPlatformCaptions,
  type DraftCaptionsInput,
  type SocialCaptionDraft,
  type SocialCaptionVariant
} from "./captions";
import {
  containsBannedPhrase,
  stripBannedPhrases,
  voiceProfileFor,
  type SocialPlatform,
  type SocialVoiceKey
} from "./voice";

export const SOCIAL_CAPTION_LLM_NOTICE_NO_KEY =
  "Template captions — no LLM key is set. These are the fallback drafts.";
export const SOCIAL_CAPTION_LLM_NOTICE_FAILED =
  "Template captions — the LLM draft failed or invented facts, so the template was used.";
export const SOCIAL_CAPTION_LLM_NOTICE_OK = "Captions were drafted by the manager LLM. Pick a variant, then edit if you want.";

export type SocialCaptionDraftSource = "llm" | "template";

export type SocialCaptionDraftResult = {
  drafts: SocialCaptionDraft[];
  source: SocialCaptionDraftSource;
  notice: string;
};

const llmVariantSchema = z
  .object({
    caption: z.string(),
    title: z.string(),
    tags: z.array(z.string())
  })
  .strict();

const llmPlatformSchema = z
  .object({
    platform: z.enum(["facebook", "instagram", "youtube", "tiktok"]),
    variants: z.array(llmVariantSchema).min(2).max(3)
  })
  .strict();

export const socialCaptionLlmOutputSchema = z
  .object({
    platforms: z.array(llmPlatformSchema).min(1).max(4)
  })
  .strict();

export type SocialCaptionLlmOutput = z.infer<typeof socialCaptionLlmOutputSchema>;

export function socialCaptionLlmJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["platforms"],
    properties: {
      platforms: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["platform", "variants"],
          properties: {
            platform: { type: "string", enum: ["facebook", "instagram", "youtube", "tiktok"] },
            variants: {
              type: "array",
              minItems: 2,
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["caption", "title", "tags"],
                properties: {
                  caption: { type: "string" },
                  title: { type: "string" },
                  tags: { type: "array", items: { type: "string" } }
                }
              }
            }
          }
        }
      }
    }
  };
}

export function socialCaptionLlmInstructions(voice: SocialVoiceKey): string {
  const profile = voiceProfileFor(voice);
  return [
    "You write social captions for StoryBoard. Use only the confirmed facts in the input.",
    "Never invent dates, prices, venues, cities, or ticket URLs.",
    "If a fact is missing, omit it. Do not guess.",
    "Write a fresh caption for each platform. Offer 2-3 distinct variants.",
    "Instagram and TikTok: short and punchy.",
    "Facebook: a bit longer, conversational, include the show facts you were given.",
    "YouTube: title plus description. Title names the song or room from the facts.",
    "Hashtags must suit the platform. Location hashtags only if that place is in the facts.",
    profile
      ? [
          `Voice: ${profile.displayName}. ${profile.toneDescription}`,
          `Rules: ${profile.toneRules.join(" ")}`,
          `Banned phrases: ${profile.bannedPhrases.join("; ")}`,
          `Instagram: ${profile.instagramNotes}`,
          `Facebook: ${profile.facebookNotes}`,
          `YouTube: ${profile.youtubeNotes}`,
          `TikTok: ${profile.tiktokNotes}`,
          `Good: ${profile.goodExamples.join(" / ")}`,
          `Bad: ${profile.badExamples.join(" / ")}`
        ].join("\n")
      : "Unknown band voice. Do not inherit Stalemate or Rad Dad wording.",
    "Return JSON only that matches the schema."
  ].join("\n");
}

export function socialCaptionLlmInput(input: DraftCaptionsInput): Record<string, unknown> {
  const profile = voiceProfileFor(input.voice);
  return {
    voice: input.voice,
    displayName: profile?.displayName ?? "Unknown",
    note: input.note,
    mediaKind: input.mediaKind,
    confirmedFacts: {
      showName: input.show?.name ?? null,
      venue: input.show?.place ?? null,
      date: input.show?.startsAt ?? null,
      ticketUrl: input.show?.ticketUrl ?? null,
      extra: input.extraFacts ?? []
    },
    limits: {
      instagram: "short, punchy, max 300 characters",
      tiktok: "short hook, max 150 characters",
      facebook: "longer, max 1200 characters",
      youtubeTitle: "max 100 characters",
      youtubeDescription: "facts, max 5000 characters"
    }
  };
}

export function parseSocialCaptionLlmOutput(raw: unknown): SocialCaptionLlmOutput | null {
  const parsed = socialCaptionLlmOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function sanitizeVariant(
  platform: SocialPlatform,
  voice: SocialVoiceKey,
  facts: ConfirmedSocialFacts,
  raw: { caption: string; title?: string; tags: string[] }
): SocialCaptionVariant | null {
  const caption = stripBannedPhrases(raw.caption, voice).trim();
  const title = raw.title ? stripBannedPhrases(raw.title, voice).trim() : undefined;
  if (!caption) return null;
  if (containsBannedPhrase(caption, voice) || (title && containsBannedPhrase(title, voice))) return null;
  if (inventedFactsInText(`${caption}\n${title ?? ""}\n${raw.tags.join(" ")}`, facts).length) return null;
  const limited = enforceCaptionLength(platform, { caption, title });
  return {
    caption: limited.caption,
    ...(limited.title ? { title: limited.title } : {}),
    tags: raw.tags.map((tag) => tag.replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
  };
}

export function completeSocialCaptionDrafts(
  input: DraftCaptionsInput,
  llmRaw?: unknown
): SocialCaptionDraftResult {
  const templates = draftPlatformCaptions(input);
  const parsed = llmRaw === undefined || llmRaw === null ? null : parseSocialCaptionLlmOutput(llmRaw);
  if (!parsed) {
    return {
      drafts: templates,
      source: "template",
      notice: llmRaw == null ? SOCIAL_CAPTION_LLM_NOTICE_NO_KEY : SOCIAL_CAPTION_LLM_NOTICE_FAILED
    };
  }
  const facts: ConfirmedSocialFacts = {
    voice: input.voice,
    note: input.note,
    mediaKind: input.mediaKind,
    show: input.show,
    extra: input.extraFacts
  };
  const drafts: SocialCaptionDraft[] = [];
  let usedLlm = 0;
  for (const template of templates) {
    const fromModel = parsed.platforms.find((row) => row.platform === template.platform);
    const variants = (fromModel?.variants ?? [])
      .map((row) => sanitizeVariant(template.platform, input.voice, facts, row))
      .filter((row): row is SocialCaptionVariant => Boolean(row));
    if (variants.length >= 2) {
      usedLlm += 1;
      drafts.push(applyCaptionVariant({ ...template, variants, selectedVariantIndex: 0 }, 0));
    } else {
      drafts.push(template);
    }
  }
  if (!usedLlm) {
    return { drafts: templates, source: "template", notice: SOCIAL_CAPTION_LLM_NOTICE_FAILED };
  }
  return { drafts, source: "llm", notice: SOCIAL_CAPTION_LLM_NOTICE_OK };
}
