import { z } from "zod";

export const gmailDraftSchema = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1)
});

export const outboundEmailBatchPayloadSchema = z.object({
  drafts: z
    .array(
      z.object({
        venueId: z.string().optional(),
        message: gmailDraftSchema
      })
    )
    .min(1)
});

export const calendarHoldItemSchema = z.object({
  title: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  timeZone: z.string().optional()
});

export const calendarHoldBatchPayloadSchema = z.object({
  holds: z.array(calendarHoldItemSchema).min(1)
});

export const driveEnsureFolderPayloadSchema = z.object({
  folderName: z.string().min(1)
});

export type OutboundEmailBatchPayload = z.infer<
  typeof outboundEmailBatchPayloadSchema
>;
export type CalendarHoldBatchPayload = z.infer<
  typeof calendarHoldBatchPayloadSchema
>;
export type DriveEnsureFolderPayload = z.infer<
  typeof driveEnsureFolderPayloadSchema
>;
