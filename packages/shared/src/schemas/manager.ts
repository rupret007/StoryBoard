import { z } from "zod";

export const bandModes = ["original", "cover_event", "hybrid"] as const;
export const managerWorkstreams = ["live", "releases", "audience", "content", "business", "relationships", "band_operations"] as const;
export const managerProfileSchema = z.object({
  bandMode: z.enum(bandModes), careerStage: z.string().trim().max(120).nullable().optional(),
  homeCity: z.string().trim().max(120).nullable().optional(), homeRegion: z.string().trim().max(120).nullable().optional(), homeCountry: z.string().trim().max(120).nullable().optional(),
  genres: z.array(z.string().trim().min(1).max(80)).max(20).default([]), businessName: z.string().trim().max(200).nullable().optional(), taxIdLast4: z.string().regex(/^\d{4}$/).nullable().optional(),
  revenueSources: z.array(z.string().trim().min(1).max(100)).max(20).default([]), currentAssets: z.array(z.string().trim().min(1).max(200)).max(30).default([]), constraints: z.array(z.string().trim().min(1).max(300)).max(30).default([]), educationTopics: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  availabilityExpectations: z.string().trim().max(1000).nullable().optional(), budgetToleranceMinor: z.number().int().nonnegative().nullable().optional(), currency: z.string().trim().length(3).default("USD"), twelveMonthAmbition: z.string().trim().max(2000).nullable().optional(), communicationCadence: z.enum(["daily", "weekly"]).default("daily"), decisionStyle: z.enum(["guided", "concise", "detailed"]).default("guided")
}).strict();
export const bandMemberCreateSchema = z.object({ name: z.string().trim().min(1).max(160), linkedOperatorId: z.string().trim().min(1).nullable().optional(), email: z.string().email().nullable().optional(), phone: z.string().trim().max(40).nullable().optional(), instruments: z.array(z.string().trim().min(1).max(80)).max(20).default([]), roles: z.array(z.string().trim().min(1).max(80)).max(20).default([]), defaultSplitBasisPoints: z.number().int().min(0).max(10000).nullable().optional(), notes: z.string().trim().max(2000).nullable().optional(), active: z.boolean().default(true) }).strict();
export const bandMemberPatchSchema = bandMemberCreateSchema.partial().strict();
export const managerGoalCreateSchema = z.object({ workstream: z.enum(managerWorkstreams), title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable().optional(), targetValue: z.number().nullable().optional(), targetUnit: z.string().trim().max(80).nullable().optional(), currentValue: z.number().nullable().optional(), deadline: z.string().datetime({ offset: true }).nullable().optional(), status: z.enum(["draft","active","achieved","paused","abandoned"]).default("draft") }).strict();
export const managerGoalPatchSchema = managerGoalCreateSchema.partial().strict();
export const managerGoalProgressSchema = z.object({
  value: z.number().finite().optional(),
  delta: z.number().finite().refine((value) => value !== 0, { message: "Delta must not be zero" }).optional(),
  note: z.string().trim().min(1).max(1000).nullable().optional()
}).strict().refine((input) => (input.value === undefined) !== (input.delta === undefined), { message: "Provide exactly one of value or delta" });
export const managerInitiativeCreateSchema = z.object({ goalId: z.string().trim().min(1).nullable().optional(), workstream: z.enum(managerWorkstreams), title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable().optional(), status: z.enum(["proposed","active","completed","blocked","abandoned"]).default("proposed"), startsAt: z.string().datetime({ offset: true }).nullable().optional(), dueAt: z.string().datetime({ offset: true }).nullable().optional(), successMetric: z.string().trim().max(500).nullable().optional() }).strict();
export const managerInitiativePatchSchema = managerInitiativeCreateSchema.partial().strict();
export const managerDecisionCreateSchema = z.object({ workstream: z.enum(managerWorkstreams), title: z.string().trim().min(1).max(200), context: z.string().trim().max(3000).nullable().optional(), options: z.array(z.object({ label: z.string().trim().min(1).max(200), tradeoff: z.string().trim().max(1000) }).strict()).min(2).max(6), choice: z.string().trim().max(200).nullable().optional(), rationale: z.string().trim().max(2000).nullable().optional(), evidence: z.array(z.string().trim().min(1).max(200)).max(20).default([]), reviewAt: z.string().datetime({ offset: true }).nullable().optional() }).strict();
export const managerSettingsSchema = z.object({ aiEnabled: z.boolean().optional(), fullContextEnabled: z.boolean().optional(), scheduleEnabled: z.boolean().optional(), timezone: z.string().trim().max(80).nullable().optional(), dailyHour: z.number().int().min(6).max(20).optional() }).strict();
export const managerChatSchema = z.object({ conversationId: z.string().trim().min(1).nullable().optional(), message: z.string().trim().min(1).max(10000) }).strict();
export const managerRecommendationReasons = ["accepted", "task_completed", "already_handled", "not_relevant", "wrong_priority", "bad_timing", "missing_context", "other"] as const;
export const managerRecommendationFeedbackSchema = z.object({ reason: z.enum(managerRecommendationReasons).optional(), note: z.string().trim().max(1000).nullable().optional() }).strict();
export const managerEvalPromotionSchema = z.object({ label: z.enum(["useful", "not_useful", "needs_revision"]), notes: z.string().trim().max(2000).nullable().optional() }).strict();
export const managerEvaluationRunSchema = z.object({ candidateVersion: z.literal("manager_os_v3").default("manager_os_v3") }).strict();
export const managerMemoryPatchSchema = z.object({
  value: z.json().optional(),
  confirmed: z.boolean().optional(),
  archived: z.boolean().optional(),
  sensitivity: z.enum(["normal", "sensitive", "restricted"]).optional()
}).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one memory change is required" });

export type ManagerProfileInput = z.infer<typeof managerProfileSchema>;
export type BandMemberCreateInput = z.infer<typeof bandMemberCreateSchema>;
export type ManagerGoalCreateInput = z.infer<typeof managerGoalCreateSchema>;
export type ManagerGoalProgressInput = z.infer<typeof managerGoalProgressSchema>;
export type ManagerInitiativeCreateInput = z.infer<typeof managerInitiativeCreateSchema>;
export type ManagerRecommendationFeedbackInput = z.infer<typeof managerRecommendationFeedbackSchema>;
export type ManagerEvalPromotionInput = z.infer<typeof managerEvalPromotionSchema>;
export type ManagerMemoryPatchInput = z.infer<typeof managerMemoryPatchSchema>;
