import { z } from "zod";

const taskStatusValues = ["todo", "in_progress", "blocked", "done"] as const;

const relatedOpportunityId = z.string().trim().min(1);
const relatedProjectId = z.string().trim().min(1).max(128);
const relatedBandMemberId = z.string().trim().min(1).max(128);
const relatedTaskId = z.string().trim().min(1).max(128);
const dueAt = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true, local: true })
]);
const blockedReason = z.string().trim().min(1).max(1000).nullable();
const waitingOn = z.string().trim().min(1).max(240).nullable();

/** Accepted fields for creating a task. */
export const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1),
    opportunityId: relatedOpportunityId.nullable().optional(),
    projectId: relatedProjectId.nullable().optional(),
    bandMemberId: relatedBandMemberId.nullable().optional(),
    status: z.enum(taskStatusValues).optional(),
    ownerLabel: z.string().nullable().optional(),
    dueAt: dueAt.nullable().optional(),
    blockedReason: blockedReason.optional(),
    waitingOn: waitingOn.optional()
  })
  .strict()
  .superRefine((input, context) => {
    if (input.bandMemberId !== undefined && input.ownerLabel !== undefined) context.addIssue({ code: "custom", path: ["bandMemberId"], message: "Choose a linked band member or a legacy owner label, not both" });
    if (input.status === "blocked" && !input.blockedReason) context.addIssue({ code: "custom", path: ["blockedReason"], message: "A blocked task requires a reason" });
    if (input.status !== "blocked" && input.blockedReason) context.addIssue({ code: "custom", path: ["blockedReason"], message: "A blocker may only be recorded on a blocked task" });
    if (input.status === "done" && input.waitingOn) context.addIssue({ code: "custom", path: ["waitingOn"], message: "Completed work cannot remain waiting on someone" });
  });

/** Accepted fields for updating a task. Unknown keys are rejected. */
export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    opportunityId: relatedOpportunityId.nullable().optional(),
    projectId: relatedProjectId.nullable().optional(),
    bandMemberId: relatedBandMemberId.nullable().optional(),
    status: z.enum(taskStatusValues).optional(),
    ownerLabel: z.string().nullable().optional(),
    dueAt: dueAt.nullable().optional(),
    blockedReason: blockedReason.optional(),
    waitingOn: waitingOn.optional()
  })
  .strict()
  .superRefine((input, context) => {
    if (input.bandMemberId !== undefined && input.ownerLabel !== undefined) context.addIssue({ code: "custom", path: ["bandMemberId"], message: "Choose a linked band member or a legacy owner label, not both" });
    if (input.status && input.status !== "blocked" && input.blockedReason) context.addIssue({ code: "custom", path: ["blockedReason"], message: "A blocker may only be recorded on a blocked task" });
    if (input.status === "done" && input.waitingOn) context.addIssue({ code: "custom", path: ["waitingOn"], message: "Completed work cannot remain waiting on someone" });
  });

export const taskDependencyCreateSchema = z.object({
  prerequisiteTaskId: relatedTaskId
}).strict();

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskPatchInput = z.infer<typeof taskPatchSchema>;
export type TaskDependencyCreateInput = z.infer<typeof taskDependencyCreateSchema>;
