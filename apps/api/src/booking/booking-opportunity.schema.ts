import { z } from "zod";

const bookingStageValues = [
  "target",
  "outreach",
  "conversation",
  "offer",
  "hold",
  "confirmed",
  "closed"
] as const;

const relatedVenueId = z.string().trim().min(1);
const targetDate = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true, local: true })
]);

/** Accepted fields for creating an opportunity. */
export const bookingOpportunityCreateSchema = z
  .object({
    title: z.string().trim().min(1),
    venueId: relatedVenueId.nullable().optional(),
    stage: z.enum(bookingStageValues).optional(),
    targetDate: targetDate.nullable().optional(),
    marketNotes: z.string().nullable().optional()
  })
  .strict();

/** Accepted fields for updating an opportunity. Unknown keys are rejected. */
export const bookingOpportunityPatchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    venueId: relatedVenueId.nullable().optional(),
    targetDate: targetDate.nullable().optional(),
    marketNotes: z.string().nullable().optional()
  })
  .strict();

export const bookingOpportunityStageSchema = z
  .object({ stage: z.enum(bookingStageValues) })
  .strict();

export type BookingOpportunityCreateInput = z.infer<
  typeof bookingOpportunityCreateSchema
>;
export type BookingOpportunityPatchInput = z.infer<
  typeof bookingOpportunityPatchSchema
>;
