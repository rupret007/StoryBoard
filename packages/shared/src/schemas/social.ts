import { z } from "zod";
import { SOCIAL_PLATFORMS, SOCIAL_VOICE_KEYS } from "../social/voice";

export const socialPlatformSchema = z.enum(SOCIAL_PLATFORMS);
export const socialVoiceKeySchema = z.enum(SOCIAL_VOICE_KEYS);
export const socialMediaKindSchema = z.enum(["photo", "video"]);

export const socialShowHintSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    startsAt: z.string().trim().min(1).max(80).optional(),
    place: z.string().trim().min(1).max(200).optional(),
    ticketUrl: z.string().url().optional()
  })
  .strict();

export const socialDropInputSchema = z
  .object({
    note: z.string().trim().min(1).max(4000),
    mediaAssetId: z.string().trim().min(1).optional(),
    mediaUrl: z
      .string()
      .trim()
      .url()
      .refine((value) => value.startsWith("https://"), "Media URL must be https")
      .optional(),
    mediaKind: socialMediaKindSchema.optional(),
    eventId: z.string().trim().min(1).optional(),
    show: socialShowHintSchema.optional(),
    platforms: z.array(socialPlatformSchema).min(1).max(4).optional()
  })
  .strict();

export const socialTargetEditSchema = z
  .object({
    id: z.string().trim().min(1),
    enabled: z.boolean(),
    caption: z.string().max(63206),
    title: z.string().max(100).optional(),
    tags: z.array(z.string().trim().max(40)).max(15).optional(),
    includeFacebookEvent: z.boolean().optional()
  })
  .strict();

export const socialApproveAndPostSchema = z
  .object({
    postId: z.string().trim().min(1),
    targets: z.array(socialTargetEditSchema).min(1).optional()
  })
  .strict();

export const socialMediaInitSchema = z
  .object({
    filename: z.string().trim().min(1).max(240),
    mimeType: z.string().trim().min(1).max(120),
    byteSize: z.number().int().positive().max(2_000_000_000)
  })
  .strict();

export const socialConnectProviderSchema = z.enum(["meta", "youtube_publish", "tiktok"]);

export const socialPostBatchPayloadSchema = z
  .object({
    postId: z.string().trim().min(1),
    voiceKey: socialVoiceKeySchema,
    mediaUrl: z.string().url().optional(),
    mediaKind: socialMediaKindSchema.optional(),
    targets: z
      .array(
        z
          .object({
            targetId: z.string().trim().min(1),
            platform: socialPlatformSchema,
            enabled: z.boolean(),
            caption: z.string(),
            title: z.string().optional(),
            tags: z.array(z.string()).optional(),
            includeFacebookEvent: z.boolean().optional(),
            facebookEventName: z.string().optional(),
            facebookEventStartsAt: z.string().optional(),
            facebookEventPlace: z.string().optional(),
            accountExternalId: z.string().optional(),
            accountLabel: z.string().optional(),
            accountVoiceKey: socialVoiceKeySchema.optional()
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export type SocialDropInput = z.infer<typeof socialDropInputSchema>;
export type SocialTargetEdit = z.infer<typeof socialTargetEditSchema>;
export type SocialApproveAndPostInput = z.infer<typeof socialApproveAndPostSchema>;
export type SocialPostBatchPayload = z.infer<typeof socialPostBatchPayloadSchema>;
export type SocialMediaInitInput = z.infer<typeof socialMediaInitSchema>;
export type SocialConnectProvider = z.infer<typeof socialConnectProviderSchema>;
