import { z } from "zod";

export const bandModes = ["original", "cover_event", "hybrid"] as const;
export const managerWorkstreams = ["live", "releases", "audience", "content", "business", "relationships", "band_operations"] as const;
export const managerGoalMeasurementKinds = ["manual", "qualified_prospects", "confirmed_gigs", "completed_gigs", "completed_projects"] as const;
export const managerGoalTargetDirections = ["at_least", "at_most", "exact"] as const;
export const managerProfileSchema = z.object({
  bandMode: z.enum(bandModes), careerStage: z.string().trim().max(120).nullable().optional(),
  homeCity: z.string().trim().max(120).nullable().optional(), homeRegion: z.string().trim().max(120).nullable().optional(), homeCountry: z.string().trim().max(120).nullable().optional(),
  genres: z.array(z.string().trim().min(1).max(80)).max(20).default([]), businessName: z.string().trim().max(200).nullable().optional(), taxIdLast4: z.string().regex(/^\d{4}$/).nullable().optional(),
  revenueSources: z.array(z.string().trim().min(1).max(100)).max(20).default([]), currentAssets: z.array(z.string().trim().min(1).max(200)).max(30).default([]), constraints: z.array(z.string().trim().min(1).max(300)).max(30).default([]), educationTopics: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  availabilityExpectations: z.string().trim().max(1000).nullable().optional(), budgetToleranceMinor: z.number().int().nonnegative().nullable().optional(), currency: z.string().trim().length(3).default("USD"), twelveMonthAmbition: z.string().trim().max(2000).nullable().optional(), communicationCadence: z.enum(["daily", "weekly"]).default("daily"), decisionStyle: z.enum(["guided", "concise", "detailed"]).default("guided")
}).strict();
export const bandMemberCreateSchema = z.object({ name: z.string().trim().min(1).max(160), linkedOperatorId: z.string().trim().min(1).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().trim().max(40).nullable().optional(), instruments: z.array(z.string().trim().min(1).max(80)).max(20).default([]), roles: z.array(z.string().trim().min(1).max(80)).max(20).default([]), defaultSplitBasisPoints: z.number().int().min(0).max(10000).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional(), active: z.boolean().default(true) }).strict();
export const bandMemberPatchSchema = bandMemberCreateSchema.partial().strict();
export const bandMemberCheckInStatuses = ["available", "limited", "unavailable"] as const;
export const bandMemberCheckInCreateSchema = z.object({
  status: z.enum(bandMemberCheckInStatuses),
  note: z.string().trim().min(1).max(500).nullable().optional(),
  effectiveUntil: z.string().datetime({ offset: true }).nullable().optional()
}).strict();
const managerGoalFields = { workstream: z.enum(managerWorkstreams), title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable(), targetValue: z.number().finite().nullable(), targetUnit: z.string().trim().max(80).nullable(), currentValue: z.number().finite().nullable(), targetDirection: z.enum(managerGoalTargetDirections), measurementKind: z.enum(managerGoalMeasurementKinds), deadline: z.string().datetime({ offset: true }).nullable(), status: z.enum(["draft","active","achieved","paused","abandoned"]) } as const;
export const managerGoalCreateSchema = z.object({ ...managerGoalFields, description: managerGoalFields.description.optional(), targetValue: managerGoalFields.targetValue.optional(), targetUnit: managerGoalFields.targetUnit.optional(), currentValue: managerGoalFields.currentValue.optional(), targetDirection: managerGoalFields.targetDirection.default("at_least"), measurementKind: managerGoalFields.measurementKind.default("manual"), deadline: managerGoalFields.deadline.optional(), status: managerGoalFields.status.default("draft") }).strict();
export const managerGoalPatchSchema = z.object(managerGoalFields).partial().strict().refine((value) => Object.keys(value).length > 0, { message: "At least one goal change is required" });
export const managerGoalProgressSchema = z.object({
  value: z.number().finite().optional(),
  delta: z.number().finite().refine((value) => value !== 0, { message: "Delta must not be zero" }).optional(),
  note: z.string().trim().min(1).max(1000).nullable().optional()
}).strict().refine((input) => (input.value === undefined) !== (input.delta === undefined), { message: "Provide exactly one of value or delta" });
export const managerGoalProgressSyncSchema = z.object({ observedValue: z.number().int().nonnegative() }).strict();
export const managerInitiativeCreateSchema = z.object({ goalId: z.string().trim().min(1).nullable().optional(), workstream: z.enum(managerWorkstreams), title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable().optional(), status: z.enum(["proposed","active","completed","blocked","abandoned"]).default("proposed"), startsAt: z.string().datetime({ offset: true }).nullable().optional(), dueAt: z.string().datetime({ offset: true }).nullable().optional(), successMetric: z.string().trim().max(500).nullable().optional() }).strict();
export const managerInitiativePatchSchema = managerInitiativeCreateSchema.partial().strict();
const managerDecisionOptionSchema = z.object({ label: z.string().trim().min(1).max(200), tradeoff: z.string().trim().min(1).max(1000) }).strict();
const managerDecisionFields = {
  workstream: z.enum(managerWorkstreams), title: z.string().trim().min(1).max(200), context: z.string().trim().max(3000).nullable().optional(),
  options: z.array(managerDecisionOptionSchema).min(2).max(6), choice: z.string().trim().min(1).max(200).nullable().optional(), rationale: z.string().trim().max(2000).nullable().optional(), expectedOutcome: z.string().trim().max(2000).nullable().optional(),
  evidence: z.array(z.string().trim().min(1).max(200)).max(20), reviewAt: z.string().datetime({ offset: true }).nullable().optional()
} as const;
function validateDecisionChoice(input: { options?: { label: string }[] | undefined; choice?: string | null | undefined }, context: z.RefinementCtx) {
  if (input.options) {
    const labels = input.options.map((option) => option.label.toLocaleLowerCase());
    if (new Set(labels).size !== labels.length) context.addIssue({ code: "custom", path: ["options"], message: "Decision options must have unique labels" });
    if (input.choice && !input.options.some((option) => option.label === input.choice)) context.addIssue({ code: "custom", path: ["choice"], message: "Choice must match one of the decision options" });
  }
}
export const managerDecisionCreateSchema = z.object({ ...managerDecisionFields, evidence: managerDecisionFields.evidence.default([]) }).strict().superRefine(validateDecisionChoice);
export const managerDecisionPatchSchema = z.object(managerDecisionFields).partial().strict().superRefine((input, context) => {
  if (!Object.keys(input).length) context.addIssue({ code: "custom", message: "At least one decision change is required" });
  validateDecisionChoice(input, context);
});
export const managerDecisionReviewSchema = z.object({ outcome: z.enum(["worked", "mixed", "did_not_work", "inconclusive"]), note: z.string().trim().min(1).max(3000), evidence: z.array(z.string().trim().min(1).max(200)).max(20).default([]) }).strict();
const managerTimezoneSchema = z.string().trim().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "Use a valid IANA timezone such as America/Chicago");
export const managerSettingsSchema = z.object({
  aiEnabled: z.boolean().optional(),
  fullContextEnabled: z.boolean().optional(),
  scheduleEnabled: z.boolean().optional(),
  scheduledAiEnabled: z.boolean().optional(),
  scheduleAudience: z.enum(["owners", "team"]).optional(),
  timezone: managerTimezoneSchema.nullable().optional(),
  dailyHour: z.number().int().min(6).max(20).optional(),
  weeklyDay: z.number().int().min(1).max(7).optional()
}).strict();
export const managerChatSchema = z.object({ conversationId: z.string().trim().min(1).nullable().optional(), message: z.string().trim().min(1).max(10000) }).strict();
export const managerMessageFeedbackReasons = ["incorrect", "missed_question", "too_vague", "too_long", "wrong_tone", "missing_context", "other"] as const;
export const managerMessageFeedbackSchema = z.object({
  helpful: z.boolean(),
  reason: z.enum(managerMessageFeedbackReasons).nullable().optional(),
  note: z.string().trim().min(1).max(1000).nullable().optional()
}).strict().superRefine((input, context) => {
  if (input.helpful && input.reason) context.addIssue({ code: "custom", path: ["reason"], message: "Helpful feedback cannot include a correction reason" });
  if (!input.helpful && !input.reason) context.addIssue({ code: "custom", path: ["reason"], message: "Choose what needs improvement" });
});
export const managerRecommendationReasons = ["accepted", "action_executed", "task_completed", "decision_reviewed", "already_handled", "not_relevant", "wrong_priority", "bad_timing", "missing_context", "other"] as const;
export const managerRecommendationFeedbackSchema = z.object({ reason: z.enum(managerRecommendationReasons).optional(), note: z.string().trim().max(1000).nullable().optional() }).strict();
export const managerEvalPromotionSchema = z.object({ label: z.enum(["useful", "not_useful", "needs_revision"]), notes: z.string().trim().max(2000).nullable().optional() }).strict();
export const managerResponseEvalPromotionSchema = z.object({
  label: z.enum(["useful", "not_useful", "needs_revision"]),
  expectedBehavior: z.string().trim().min(10).max(3000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
}).strict().superRefine((input, context) => {
  if (input.label !== "useful" && !input.expectedBehavior) context.addIssue({ code: "custom", path: ["expectedBehavior"], message: "Describe what the Manager should do instead" });
});
export const managerResponseEvalResolutionSchema = z.object({
  candidateVersion: z.string().regex(/^manager_os_v[1-9][0-9]*$/),
  note: z.string().trim().min(10).max(2000)
}).strict();
export const managerEvaluationRunSchema = z.object({ candidateVersion: z.literal("manager_os_v20").default("manager_os_v20") }).strict();
export const managerMemoryPatchSchema = z.object({
  value: z.json().optional(),
  confirmed: z.boolean().optional(),
  archived: z.boolean().optional(),
  sensitivity: z.enum(["normal", "sensitive", "restricted"]).optional()
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one memory change is required" });

export type ManagerProfileInput = z.infer<typeof managerProfileSchema>;
export type BandMemberCreateInput = z.infer<typeof bandMemberCreateSchema>;
export type BandMemberCheckInCreateInput = z.infer<typeof bandMemberCheckInCreateSchema>;
export type ManagerGoalCreateInput = z.infer<typeof managerGoalCreateSchema>;
export type ManagerGoalProgressInput = z.infer<typeof managerGoalProgressSchema>;
export type ManagerGoalProgressSyncInput = z.infer<typeof managerGoalProgressSyncSchema>;
export type ManagerInitiativeCreateInput = z.infer<typeof managerInitiativeCreateSchema>;
export type ManagerDecisionCreateInput = z.infer<typeof managerDecisionCreateSchema>;
export type ManagerDecisionPatchInput = z.infer<typeof managerDecisionPatchSchema>;
export type ManagerDecisionReviewInput = z.infer<typeof managerDecisionReviewSchema>;
export type ManagerRecommendationFeedbackInput = z.infer<typeof managerRecommendationFeedbackSchema>;
export type ManagerMessageFeedbackInput = z.infer<typeof managerMessageFeedbackSchema>;
export type ManagerEvalPromotionInput = z.infer<typeof managerEvalPromotionSchema>;
export type ManagerResponseEvalPromotionInput = z.infer<typeof managerResponseEvalPromotionSchema>;
export type ManagerResponseEvalResolutionInput = z.infer<typeof managerResponseEvalResolutionSchema>;
export type ManagerMemoryPatchInput = z.infer<typeof managerMemoryPatchSchema>;
export type ManagerSettingsInput = z.infer<typeof managerSettingsSchema>;
