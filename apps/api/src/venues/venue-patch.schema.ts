import { z } from "zod";

/** Allowed PATCH fields only; unknown keys rejected via `.strict()`. */
export const venuePatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    region: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    addressLine: z.string().nullable().optional(),
    capacity: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    driveMinutesFromBase: z.number().int().nonnegative().nullable().optional(),
    fitScore: z.number().int().nullable().optional()
  })
  .strict();

export type VenuePatchInput = z.infer<typeof venuePatchSchema>;
