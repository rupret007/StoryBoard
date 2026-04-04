import { z } from "zod";

const contactKindValues = ["general", "promoter", "venue_staff"] as const;

/** Allowed PATCH fields only; unknown keys rejected via `.strict()`. */
export const contactPatchSchema = z
  .object({
    fullName: z.string().min(1).optional(),
    contactKind: z.enum(contactKindValues).optional(),
    role: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    venueId: z.string().nullable().optional()
  })
  .strict();

export type ContactPatchInput = z.infer<typeof contactPatchSchema>;
