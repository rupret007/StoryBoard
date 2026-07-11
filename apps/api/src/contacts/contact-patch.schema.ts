import { z } from "zod";

const contactKindValues = ["general", "promoter", "venue_staff"] as const;
const relatedVenueId = z.string().trim().min(1);

/** Accepted fields for creating a contact. */
export const contactCreateSchema = z
  .object({
    fullName: z.string().trim().min(1),
    contactKind: z.enum(contactKindValues).optional(),
    role: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    venueId: relatedVenueId.nullable().optional()
  })
  .strict();

/** Allowed PATCH fields only; unknown keys rejected via `.strict()`. */
export const contactPatchSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    contactKind: z.enum(contactKindValues).optional(),
    role: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    venueId: relatedVenueId.nullable().optional()
  })
  .strict();

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactPatchInput = z.infer<typeof contactPatchSchema>;
