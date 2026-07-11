import { z } from "zod";

const taskStatusValues = ["todo", "in_progress", "blocked", "done"] as const;

const relatedOpportunityId = z.string().trim().min(1);
const dueAt = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true, local: true })
]);

/** Accepted fields for creating a task. */
export const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1),
    opportunityId: relatedOpportunityId.nullable().optional(),
    status: z.enum(taskStatusValues).optional(),
    ownerLabel: z.string().nullable().optional(),
    dueAt: dueAt.nullable().optional()
  })
  .strict();

/** Accepted fields for updating a task. Unknown keys are rejected. */
export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    opportunityId: relatedOpportunityId.nullable().optional(),
    status: z.enum(taskStatusValues).optional(),
    ownerLabel: z.string().nullable().optional(),
    dueAt: dueAt.nullable().optional()
  })
  .strict();

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;
