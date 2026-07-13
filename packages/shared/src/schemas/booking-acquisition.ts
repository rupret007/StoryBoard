import { z } from "zod";

export const bookingProspectKinds = [
  "venue",
  "festival",
  "private_event",
  "corporate_event"
] as const;

export const bookingProspectStatuses = [
  "discovered",
  "qualified",
  "disqualified",
  "converted"
] as const;

export const bookingCampaignStatuses = ["draft", "active", "closed"] as const;
export const bookingMarketSprintStatuses = [
  "draft",
  "active",
  "completed",
  "abandoned"
] as const;
export const bookingCampaignDeliveryModes = [
  "draft_only",
  "send_on_execution"
] as const;
export const bookingRecipientOutcomeKinds = [
  "no_response",
  "wrong_fit",
  "date_unavailable",
  "budget",
  "booked_elsewhere",
  "other"
] as const;

export const bookingCampaignRecipientStatuses = [
  "needs_contact",
  "ready",
  "approval_requested",
  "drafted",
  "sent",
  "replied",
  "declined",
  "booked"
] as const;

const nullableText = z.string().trim().max(4_000).nullable().optional();
const nullableUrl = z.string().trim().url().max(2_000).nullable().optional();
const nullablePositiveInt = z.int().positive().max(1_000_000).nullable().optional();
const nullableId = z.string().trim().min(1).max(128).nullable().optional();
const isoDate = z.string().datetime({ offset: true });

export const artistBookingProfileSchema = z
  .object({
    homeCity: nullableText,
    homeRegion: nullableText,
    homeCountry: nullableText,
    genres: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    targetCapacityMin: nullablePositiveInt,
    targetCapacityMax: nullablePositiveInt,
    bookingPitch: nullableText,
    pressKitUrl: nullableUrl,
    liveVideoUrl: nullableUrl
  })
  .strict()
  .superRefine((value, ctx) => {
    const min = value.targetCapacityMin;
    const max = value.targetCapacityMax;
    if ((min == null) !== (max == null)) {
      ctx.addIssue({
        code: "custom",
        path: [min == null ? "targetCapacityMin" : "targetCapacityMax"],
        message: "Target capacity needs both a minimum and maximum."
      });
    }
    if (min != null && max != null && min > max) {
      ctx.addIssue({
        code: "custom",
        path: ["targetCapacityMax"],
        message: "Target capacity maximum must be at least the minimum."
      });
    }
  });

const prospectFields = {
  kind: z.enum(bookingProspectKinds),
  status: z.enum(bookingProspectStatuses).optional(),
  name: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(120),
  region: nullableText,
  country: nullableText,
  capacity: nullablePositiveInt,
  websiteUrl: nullableUrl,
  notes: nullableText,
  sourceSystem: z.string().trim().min(1).max(80).nullable().optional(),
  sourceRef: z.string().trim().min(1).max(240).nullable().optional(),
  sourceMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  venueId: nullableId,
  contactId: nullableId,
  opportunityId: nullableId,
  marketSprintId: nullableId
};

function sourcePairCheck(
  value: {
    sourceSystem?: string | null | undefined;
    sourceRef?: string | null | undefined;
  },
  ctx: z.RefinementCtx
) {
  if ((value.sourceSystem == null) !== (value.sourceRef == null)) {
    ctx.addIssue({
      code: "custom",
      path: [value.sourceSystem == null ? "sourceSystem" : "sourceRef"],
      message: "Source system and source reference must be provided together."
    });
  }
}

export const bookingProspectCreateSchema = z
  .object(prospectFields)
  .strict()
  .superRefine(sourcePairCheck);

export const bookingProspectPatchSchema = z
  .object({
    kind: z.enum(bookingProspectKinds).optional(),
    status: z.enum(bookingProspectStatuses).optional(),
    name: z.string().trim().min(1).max(240).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    region: nullableText,
    country: nullableText,
    capacity: nullablePositiveInt,
    websiteUrl: nullableUrl,
    notes: nullableText,
    sourceSystem: z.string().trim().min(1).max(80).nullable().optional(),
    sourceRef: z.string().trim().min(1).max(240).nullable().optional(),
    sourceMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
    venueId: nullableId,
    contactId: nullableId,
    opportunityId: nullableId,
    marketSprintId: nullableId
  })
  .strict();

export const bookingProspectDiscoverSchema = z
  .object({
    city: z.string().trim().min(1).max(120),
    region: z.string().trim().min(1).max(120).optional(),
    country: z.string().trim().min(1).max(120).optional(),
    keyword: z.string().trim().min(1).max(160).optional()
  })
  .strict();

export const bookingProspectConversionSchema = z
  .object({
    contactId: nullableId,
    contact: z
      .object({
        fullName: z.string().trim().min(1).max(160),
        role: nullableText,
        email: z.string().trim().email().max(320).nullable().optional(),
        phone: nullableText,
        notes: nullableText
      })
      .strict()
      .optional(),
    opportunityTitle: z.string().trim().min(1).max(240).optional(),
    targetDate: isoDate.nullable().optional(),
    marketNotes: nullableText
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.contactId != null && value.contact != null) {
      ctx.addIssue({
        code: "custom",
        path: ["contact"],
        message: "Choose an existing contact or provide a new contact, not both."
      });
    }
  });

export const bookingProspectContactSchema = z
  .object({
    contactId: nullableId,
    contact: z
      .object({
        fullName: z.string().trim().min(1).max(160),
        role: nullableText,
        email: z.string().trim().email().max(320),
        phone: nullableText,
        notes: nullableText
      })
      .strict()
      .optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.contactId == null) === (value.contact == null)) {
      ctx.addIssue({
        code: "custom",
        path: ["contact"],
        message: "Choose an existing contact or provide one new buyer/promoter."
      });
    }
  });

export const bookingTemplateVariables = [
  "artistName",
  "contactName",
  "prospectName",
  "market",
  "bookingPitch",
  "pressKitUrl"
] as const;

export type BookingTemplateVariable = (typeof bookingTemplateVariables)[number];
export type BookingTemplateValues = Record<BookingTemplateVariable, string>;

const templateToken = /{{\s*([^{}]+?)\s*}}/g;

export function templateVariableErrors(template: string): string[] {
  const errors: string[] = [];
  for (const token of template.matchAll(templateToken)) {
    const variable = token[1]!.trim();
    if (!(bookingTemplateVariables as readonly string[]).includes(variable)) {
      errors.push(`Unknown template variable: ${variable}`);
    }
  }
  if (template.includes("{{") && !templateToken.test(template)) {
    errors.push("Template contains an unclosed variable.");
  }
  templateToken.lastIndex = 0;
  return errors;
}

export function renderBookingTemplate(
  template: string,
  values: BookingTemplateValues
): string {
  const errors = templateVariableErrors(template);
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
  return template.replace(templateToken, (_, raw: string) => {
    return values[raw.trim() as BookingTemplateVariable];
  });
}

const campaignFields = {
  name: z.string().trim().min(1).max(160),
  status: z.enum(bookingCampaignStatuses).optional(),
  dateWindowStart: isoDate.nullable().optional(),
  dateWindowEnd: isoDate.nullable().optional(),
  subjectTemplate: z.string().trim().min(1).max(240),
  bodyTemplate: z.string().trim().min(1).max(12_000),
  defaultFollowUpDays: z.int().min(1).max(90).optional(),
  deliveryMode: z.enum(bookingCampaignDeliveryModes).optional(),
  marketSprintId: nullableId
};

const sprintFields = {
  name: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(120),
  region: nullableText,
  country: nullableText,
  targetDateWindowStart: isoDate.nullable().optional(),
  targetDateWindowEnd: isoDate.nullable().optional(),
  targetQualifiedCount: nullablePositiveInt,
  targetOutreachCount: nullablePositiveInt,
  targetBookedCount: nullablePositiveInt,
  status: z.enum(bookingMarketSprintStatuses).optional()
};

function sprintWindowCheck(
  value: { targetDateWindowStart?: string | null | undefined; targetDateWindowEnd?: string | null | undefined },
  ctx: z.RefinementCtx
) {
  if (value.targetDateWindowStart && value.targetDateWindowEnd && new Date(value.targetDateWindowStart) > new Date(value.targetDateWindowEnd)) {
    ctx.addIssue({ code: "custom", path: ["targetDateWindowEnd"], message: "Sprint date window end must be on or after its start." });
  }
}

export const bookingMarketSprintCreateSchema = z.object(sprintFields).strict().superRefine(sprintWindowCheck);
export const bookingMarketSprintPatchSchema = z.object({
  name: sprintFields.name.optional(), city: sprintFields.city.optional(), region: nullableText,
  country: nullableText, targetDateWindowStart: isoDate.nullable().optional(),
  targetDateWindowEnd: isoDate.nullable().optional(), targetQualifiedCount: nullablePositiveInt,
  targetOutreachCount: nullablePositiveInt, targetBookedCount: nullablePositiveInt,
  status: z.enum(bookingMarketSprintStatuses).optional()
}).strict().superRefine(sprintWindowCheck);

function templateCheck(
  value: {
    subjectTemplate?: string | undefined;
    bodyTemplate?: string | undefined;
    dateWindowStart?: string | null | undefined;
    dateWindowEnd?: string | null | undefined;
  },
  ctx: z.RefinementCtx
) {
  for (const key of ["subjectTemplate", "bodyTemplate"] as const) {
    if (value[key] === undefined) continue;
    for (const message of templateVariableErrors(value[key]!)) {
      ctx.addIssue({ code: "custom", path: [key], message });
    }
  }
  if (
    value.dateWindowStart != null &&
    value.dateWindowEnd != null &&
    new Date(value.dateWindowStart) > new Date(value.dateWindowEnd)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["dateWindowEnd"],
      message: "Campaign date window end must be on or after its start."
    });
  }
}

export const bookingCampaignCreateSchema = z
  .object(campaignFields)
  .strict()
  .superRefine(templateCheck);

export const bookingCampaignPatchSchema = z
  .object({
    name: campaignFields.name.optional(),
    status: z.enum(bookingCampaignStatuses).optional(),
    dateWindowStart: isoDate.nullable().optional(),
    dateWindowEnd: isoDate.nullable().optional(),
    subjectTemplate: campaignFields.subjectTemplate.optional(),
    bodyTemplate: campaignFields.bodyTemplate.optional(),
    defaultFollowUpDays: z.int().min(1).max(90).optional(),
    deliveryMode: z.enum(bookingCampaignDeliveryModes).optional(),
    marketSprintId: nullableId
  })
  .strict()
  .superRefine(templateCheck);

export const bookingCampaignRecipientCreateSchema = z
  .object({
    prospectId: z.string().trim().min(1).max(128),
    contactId: nullableId,
    opportunityId: nullableId,
    followUpDueAt: isoDate.nullable().optional()
  })
  .strict();

export const bookingCampaignRecipientPatchSchema = z
  .object({
    contactId: nullableId,
    opportunityId: nullableId,
    outcomeNote: nullableText,
    outcomeKind: z.enum(bookingRecipientOutcomeKinds).nullable().optional(),
    followUpDueAt: isoDate.nullable().optional(),
    status: z.enum(["replied", "declined", "booked"]).optional()
  })
  .strict();

export const bookingCampaignPrepareApprovalSchema = z
  .object({
    recipientIds: z.array(z.string().trim().min(1).max(128)).min(1).max(25).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.recipientIds &&
      new Set(value.recipientIds).size !== value.recipientIds.length
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientIds"],
        message: "Each campaign recipient may appear only once."
      });
    }
  });

export type ArtistBookingProfileInput = z.infer<typeof artistBookingProfileSchema>;
export type BookingProspectCreateInput = z.infer<typeof bookingProspectCreateSchema>;
export type BookingProspectPatchInput = z.infer<typeof bookingProspectPatchSchema>;
export type BookingProspectDiscoverInput = z.infer<typeof bookingProspectDiscoverSchema>;
export type BookingProspectConversionInput = z.infer<typeof bookingProspectConversionSchema>;
export type BookingProspectContactInput = z.infer<typeof bookingProspectContactSchema>;
export type BookingCampaignCreateInput = z.infer<typeof bookingCampaignCreateSchema>;
export type BookingCampaignPatchInput = z.infer<typeof bookingCampaignPatchSchema>;
export type BookingMarketSprintCreateInput = z.infer<typeof bookingMarketSprintCreateSchema>;
export type BookingMarketSprintPatchInput = z.infer<typeof bookingMarketSprintPatchSchema>;
export type BookingCampaignRecipientCreateInput = z.infer<typeof bookingCampaignRecipientCreateSchema>;
export type BookingCampaignRecipientPatchInput = z.infer<typeof bookingCampaignRecipientPatchSchema>;
export type BookingCampaignPrepareApprovalInput = z.infer<typeof bookingCampaignPrepareApprovalSchema>;
