import { z } from "zod";

export const STRUCTURED_COMMAND_INTENTS = [
  "list_pending_approvals",
  "list_overdue_tasks",
  "list_stale_followups",
  "booking_pipeline_health",
  "draft_venue_outreach",
  "rank_venues_by_fit",
  "draft_release_checklist",
  "research_booking_intel",
  "enqueue_research_refresh"
] as const;

export type StructuredCommandIntent =
  (typeof STRUCTURED_COMMAND_INTENTS)[number];

export const executeCommandBodySchema = z
  .object({
    text: z.string().optional(),
    intent: z.enum(STRUCTURED_COMMAND_INTENTS).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    dryRun: z.boolean().optional()
  })
  .strict()
  .refine(
    (b) => (b.text != null && b.text.trim() !== "") || b.intent != null,
    { message: "Provide non-empty text and/or intent" }
  );

export type ExecuteCommandBody = z.infer<typeof executeCommandBodySchema>;

export const researchBookingIntelPayloadSchema = z
  .object({
    city: z.string().trim().min(1).optional()
  })
  .strict();

export const enqueueResearchRefreshPayloadSchema = z.object({
  city: z.string().optional()
});
