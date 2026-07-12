import type { ManagerRecommendationDraft } from "./manager-intelligence";
import type { ManagerContextGap, ManagerContextHealth } from "./manager-context-health";

export const MANAGER_CONTEXT_CAPTURE_POLICY_VERSION = "manager_context_capture_v1" as const;

export type ManagerProfileContextField =
  | "careerStage"
  | "homeMarket"
  | "genres"
  | "twelveMonthAmbition"
  | "constraints"
  | "availabilityExpectations"
  | "revenueSources"
  | "currentAssets"
  | "budgetTolerance";

type ContextActionBase = {
  type: "update_profile_context";
  profileId: string;
  profileUpdatedAt: string;
  gapCode: string;
};

export type ManagerProfileContextAction = ContextActionBase & (
  | { field: "careerStage"; value: string }
  | { field: "homeMarket"; value: { homeCity: string; homeRegion?: string | undefined; homeCountry?: string | undefined } }
  | { field: "genres"; value: string[] }
  | { field: "twelveMonthAmbition"; value: string }
  | { field: "constraints"; value: string[] }
  | { field: "availabilityExpectations"; value: string }
  | { field: "revenueSources"; value: string[] }
  | { field: "currentAssets"; value: string[] }
  | { field: "budgetTolerance"; value: { amountMinor: number; currency: string } }
);

export type ManagerContextCaptureProfile = {
  id: string;
  updatedAt: Date;
  currency: string;
  careerStage?: string | null;
  homeCity?: string | null;
  genres?: string[];
  twelveMonthAmbition?: string | null;
  constraints?: string[];
  availabilityExpectations?: string | null;
  revenueSources?: string[];
  currentAssets?: string[];
  budgetToleranceMinor?: number | null;
};

export type ManagerContextCaptureHistoryTurn = { id: string; role: string; content: string };

export type ManagerContextCaptureResolution =
  | { policyVersion: typeof MANAGER_CONTEXT_CAPTURE_POLICY_VERSION; status: "not_answer"; gap: null; action: null; preview: null; message: null }
  | { policyVersion: typeof MANAGER_CONTEXT_CAPTURE_POLICY_VERSION; status: "ready"; gap: ManagerContextGap; action: ManagerProfileContextAction; preview: string; message: string }
  | { policyVersion: typeof MANAGER_CONTEXT_CAPTURE_POLICY_VERSION; status: "needs_clarification" | "structured_required" | "blocked_sensitive"; gap: ManagerContextGap | null; action: null; preview: null; message: string };

const GAP_FIELDS: Record<string, ManagerProfileContextField | undefined> = {
  career_stage: "careerStage",
  home_market: "homeMarket",
  genres: "genres",
  ambition: "twelveMonthAmbition",
  constraints: "constraints",
  availability_expectations: "availabilityExpectations",
  revenue_sources: "revenueSources",
  current_assets: "currentAssets",
  budget_tolerance: "budgetTolerance"
};

const FIELD_LABELS: Record<ManagerProfileContextField, string> = {
  careerStage: "career stage",
  homeMarket: "home market",
  genres: "genre labels",
  twelveMonthAmbition: "twelve-month ambition",
  constraints: "planning constraints",
  availabilityExpectations: "availability expectations",
  revenueSources: "revenue sources",
  currentAssets: "usable assets",
  budgetTolerance: "ninety-day budget ceiling"
};

const SENSITIVE = /\b(?:password|passcode|api\s*key|secret\s*key|access\s*token|refresh\s*token|private\s*key|social\s*security|ssn|tax\s*id|routing\s*number|bank\s*account|credit\s*card|medical|diagnos(?:is|ed)|health\s*condition|medication)\b/i;
const UNCERTAIN = /^(?:i\s+)?(?:do not|don't) know|^(?:not sure|maybe|skip|pass|no idea)\b/i;

function normalize(value: string) {
  return value.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

function list(value: string, max: number, itemMax: number) {
  const items = value.split(/[,;\n]+/).map((item) => normalize(item).replace(/[.!]+$/, "")).filter(Boolean);
  return items.length > 0 && items.length <= max && items.every((item) => item.length <= itemMax) ? [...new Set(items)] : null;
}

function budget(value: string, currency: string) {
  if (/\b(?:about|around|roughly|approximately|up to maybe)\b/i.test(value)) return null;
  const escapedCurrency = currency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const normalized = value
    .replace(new RegExp(`\\b${escapedCurrency}\\b`, "gi"), "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amountMinor = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(amountMinor) && amountMinor >= 0 && amountMinor <= 2_147_483_647 ? amountMinor : null;
}

function actionFor(gap: ManagerContextGap, answer: string, profile: ManagerContextCaptureProfile): ManagerProfileContextAction | null {
  const base: ContextActionBase = { type: "update_profile_context", profileId: profile.id, profileUpdatedAt: profile.updatedAt.toISOString(), gapCode: gap.code };
  const field = GAP_FIELDS[gap.code];
  const compact = normalize(answer);
  if (!field) return null;
  if (field === "careerStage") return compact.length <= 120 ? { ...base, field, value: compact } : null;
  if (field === "homeMarket") {
    const parts = compact.split(",").map((item) => normalize(item)).filter(Boolean);
    if (!parts.length || parts.length > 3 || parts.some((item) => item.length > 120)) return null;
    return { ...base, field, value: { homeCity: parts[0]!, ...(parts[1] ? { homeRegion: parts[1] } : {}), ...(parts[2] ? { homeCountry: parts[2] } : {}) } };
  }
  if (field === "genres") { const values = list(answer, 20, 80); return values ? { ...base, field, value: values } : null; }
  if (field === "twelveMonthAmbition") return compact.length <= 2000 ? { ...base, field, value: compact } : null;
  if (field === "constraints") { const values = list(answer, 30, 300); return values ? { ...base, field, value: values } : null; }
  if (field === "availabilityExpectations") return compact.length <= 1000 ? { ...base, field, value: compact } : null;
  if (field === "revenueSources") { const values = list(answer, 20, 100); return values ? { ...base, field, value: values } : null; }
  if (field === "currentAssets") { const values = list(answer, 30, 200); return values ? { ...base, field, value: values } : null; }
  const amountMinor = budget(compact, profile.currency);
  return amountMinor === null ? null : { ...base, field, value: { amountMinor, currency: profile.currency } };
}

export function managerContextActionIsValid(action: ManagerProfileContextAction) {
  return GAP_FIELDS[action.gapCode] === action.field;
}

export function managerContextActionStillNeeded(profile: ManagerContextCaptureProfile, action: ManagerProfileContextAction) {
  if (!managerContextActionIsValid(action) || profile.id !== action.profileId || profile.updatedAt.toISOString() !== action.profileUpdatedAt) return false;
  if (action.field === "careerStage") return !profile.careerStage;
  if (action.field === "homeMarket") return !profile.homeCity;
  if (action.field === "genres") return !profile.genres?.length;
  if (action.field === "twelveMonthAmbition") return !profile.twelveMonthAmbition;
  if (action.field === "constraints") return !profile.constraints?.length;
  if (action.field === "availabilityExpectations") return !profile.availabilityExpectations;
  if (action.field === "revenueSources") return !profile.revenueSources?.length;
  if (action.field === "currentAssets") return !profile.currentAssets?.length;
  return profile.budgetToleranceMinor === null || profile.budgetToleranceMinor === undefined;
}

export function managerContextProfileUpdateData(action: ManagerProfileContextAction): Record<string, unknown> {
  if (action.field === "homeMarket") return { homeCity: action.value.homeCity, ...(action.value.homeRegion ? { homeRegion: action.value.homeRegion } : {}), ...(action.value.homeCountry ? { homeCountry: action.value.homeCountry } : {}) };
  if (action.field === "budgetTolerance") return { budgetToleranceMinor: action.value.amountMinor };
  return { [action.field]: action.value };
}

export function parseManagerContextAnswer(gap: ManagerContextGap, value: string, profile: ManagerContextCaptureProfile) {
  const answer = value.replace(/[’‘]/g, "'").replace(/[ \t]+/g, " ").trim();
  if (!answer || answer.length > 2000 || value.includes("\n\n") || answer.includes("?") || UNCERTAIN.test(answer) || SENSITIVE.test(answer)) return null;
  return actionFor(gap, answer, profile);
}

export function managerContextActionMatchesAnswer(action: ManagerProfileContextAction, answer: string, gap: ManagerContextGap, profile: ManagerContextCaptureProfile) {
  const parsed = parseManagerContextAnswer(gap, answer, profile);
  return parsed !== null && JSON.stringify(parsed) === JSON.stringify(action);
}

export function managerContextActionPreview(action: ManagerProfileContextAction) {
  const label = FIELD_LABELS[action.field];
  if (action.field === "homeMarket") return `${label}: ${[action.value.homeCity, action.value.homeRegion, action.value.homeCountry].filter(Boolean).join(", ")}`;
  if (action.field === "budgetTolerance") return `${label}: ${action.value.currency} ${(action.value.amountMinor / 100).toFixed(2)}`;
  if (Array.isArray(action.value)) return `${label}: ${action.value.join(", ")}`;
  return `${label}: ${action.value}`;
}

export function resolveManagerContextCapture(
  value: string,
  priorHistory: ManagerContextCaptureHistoryTurn[],
  contextHealth: ManagerContextHealth,
  profile: ManagerContextCaptureProfile | null
): ManagerContextCaptureResolution {
  const base = { policyVersion: MANAGER_CONTEXT_CAPTURE_POLICY_VERSION } as const;
  const directPrior = priorHistory.at(-1);
  if (!directPrior || directPrior.role !== "assistant") return { ...base, status: "not_answer", gap: null, action: null, preview: null, message: null };
  const referenced = contextHealth.gaps.filter((gap) => directPrior.content.includes(gap.question));
  if (!referenced.length) return { ...base, status: "not_answer", gap: null, action: null, preview: null, message: null };
  if (referenced.length > 1) return { ...base, status: "needs_clarification", gap: null, action: null, preview: null, message: "I asked more than one context question in that answer. Name which one you are answering so I do not save your reply to the wrong field." };
  const gap = referenced[0]!;
  if (!profile) return { ...base, status: "structured_required", gap, action: null, preview: null, message: "Finish the guided Manager setup before adding operating context from conversation." };
  if (!GAP_FIELDS[gap.code]) return { ...base, status: "structured_required", gap, action: null, preview: null, message: "That answer belongs to a structured lineup, goal, or active-work record. I did not turn it into a profile fact; use the linked Manager workspace so the right people and records stay connected." };
  if (SENSITIVE.test(value)) return { ...base, status: "blocked_sensitive", gap, action: null, preview: null, message: "I did not stage that answer because it appears to contain sensitive personal, credential, banking, tax, or health information. Keep those details out of Manager conversation." };
  const action = parseManagerContextAnswer(gap, value, profile);
  if (!action) return { ...base, status: "needs_clarification", gap, action: null, preview: null, message: `I could not map that safely to ${FIELD_LABELS[GAP_FIELDS[gap.code]!]}. Give one direct answer without estimates or a question, or update Band context manually.` };
  const preview = managerContextActionPreview(action);
  return { ...base, status: "ready", gap, action, preview, message: `That answers the ${FIELD_LABELS[action.field]} question. I prepared the exact Band context change below; nothing is saved until you review it.` };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) { hash ^= character.codePointAt(0) ?? 0; hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

export function managerContextCaptureRecommendation(resolution: ManagerContextCaptureResolution): ManagerRecommendationDraft | null {
  if (resolution.status !== "ready") return null;
  return {
    stableKey: `context-save-${resolution.gap.code}-${stableHash(resolution.preview)}`.slice(0, 80),
    title: `Save ${FIELD_LABELS[resolution.action.field]}`,
    reason: `You answered the current missing-context question: ${resolution.gap.question}`,
    nextAction: `Review and save “${resolution.preview}”.`,
    workstream: resolution.gap.section === "business" ? "business" : "band_operations",
    priority: "low",
    evidenceIds: [resolution.action.profileId],
    proposedAction: resolution.action
  };
}
