import { z } from "zod";

export const venueCreateOpportunitySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    targetDate: z.union([z.iso.date(), z.iso.datetime({ offset: true, local: true })]).optional()
  })
  .strict();

export const venueCreateProspectSchema = z
  .object({
    opportunityId: z.string().trim().min(1).optional()
  })
  .strict();

export type VenueCreateOpportunityInput = z.infer<typeof venueCreateOpportunitySchema>;
export type VenueCreateProspectInput = z.infer<typeof venueCreateProspectSchema>;
