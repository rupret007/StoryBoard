import { z } from "zod";

export const commandDraftSchema = z.object({
  intent: z.string().min(1),
  targetModule: z.enum([
    "venues",
    "contacts",
    "promoters",
    "booking-pipeline",
    "tasks",
    "approvals",
    "weekly-summary"
  ]),
  risky: z.boolean(),
  requiresApproval: z.boolean(),
  dryRunSupported: z.boolean()
});

export type CommandDraft = z.infer<typeof commandDraftSchema>;
