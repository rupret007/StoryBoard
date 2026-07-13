import { createHash } from "node:crypto";

export type ManagerMemoryCaptureAssessment = {
  status: "ready";
  key: string;
  label: string;
  value: string;
} | {
  status: "blocked_sensitive" | "profile_owned" | "invalid" | "not_requested";
  reason: string;
};

export const MANAGER_MEMORY_CAPTURE_POLICY_VERSION = "manager_memory_capture_v3" as const;
export const MANAGER_SENSITIVE_CAPTURE_REDACTION = "[Sensitive memory request removed before storage.]" as const;

const explicitCapture = /^(?:please\s+)?(?:remember|note|save|keep in mind)(?:\s+(?:that|this))?\s*[:,-]?\s*(.+)$/is;
const explicitCaptureIntent = /^(?:please\s+)?(?:remember|note|save|keep in mind)\b/i;
const sensitive = /\b(?:password|passcode|credential|api\s*key|secret\s*key|client\s*secret|access\s*token|refresh\s*token|auth(?:entication)?\s*token|private\s*key|signing\s*key|seed\s*phrase|recovery\s*code|social\s*security|ssn|tax\s*id|routing\s*number|bank\s*account|credit\s*card|medical|diagnos(?:is|ed)|health\s*condition|medication)\b/i;
const profileOwned = /\b(?:home\s+(?:city|market)|based\s+in|twelve[- ]month\s+ambition|12[- ]month\s+ambition|band\s+mode|original\s+band|cover\s+band|hybrid\s+band|our\s+constraints?\s+(?:are|include))\b/i;

const credentialTokenPatterns = [
  /\bsk-(?:proj-)?[a-z0-9_-]{16,}\b/i,
  /\b(?:sk|rk|pk)_(?:live|test)_[a-z0-9]{16,}\b/i,
  /\bgh[pousr]_[a-z0-9]{20,}\b/i,
  /\bgithub_pat_[a-z0-9_]{20,}\b/i,
  /\bnpm_[a-z0-9]{24,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{12,}\b/i,
  /\bSG\.[a-z0-9_-]{12,}\.[a-z0-9_-]{12,}\b/i,
  /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/i,
  /\bBearer\s+[a-z0-9._~+/-]{12,}={0,2}/i,
  /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i
];

function containsCredentialToken(value: string) {
  return credentialTokenPatterns.some((pattern) => pattern.test(value));
}

function keyFromStatement(statement: string) {
  const digest = createHash("sha256").update(statement, "utf8").digest("hex").slice(0, 32);
  return `operator_note_${digest}`;
}

export function assessManagerMemoryCapture(question: string): ManagerMemoryCaptureAssessment {
  const trimmed = question.trim();
  const match = explicitCapture.exec(trimmed);
  if (!match?.[1]) return explicitCaptureIntent.test(trimmed)
    ? { status: "invalid", reason: "Name the non-sensitive band fact you want StoryBoard to remember." }
    : { status: "not_requested", reason: "The operator did not explicitly ask StoryBoard to remember a fact." };
  const fullValue = match[1].trim().replace(/\s+/g, " ");
  if (fullValue.length < 3) return { status: "invalid", reason: "Name the non-sensitive band fact you want StoryBoard to remember." };
  if (sensitive.test(fullValue) || containsCredentialToken(fullValue)) return { status: "blocked_sensitive", reason: "Credentials, financial identifiers, and personal health information cannot be saved as normal conversational memory." };
  if (profileOwned.test(fullValue)) return { status: "profile_owned", reason: "This fact belongs in the authoritative operating profile rather than duplicate Manager memory." };
  const value = fullValue.slice(0, 1000);
  return {
    status: "ready",
    key: keyFromStatement(value),
    label: value.replace(/[.!?]+$/, "").slice(0, 120),
    value
  };
}

export function managerMemoryCapturePolicy(question: string) {
  const assessment = assessManagerMemoryCapture(question);
  return {
    policyVersion: MANAGER_MEMORY_CAPTURE_POLICY_VERSION,
    assessment,
    requiresLocalHandling: assessment.status !== "not_requested",
    persistedMessage: assessment.status === "blocked_sensitive" ? MANAGER_SENSITIVE_CAPTURE_REDACTION : question
  };
}

export function managerMemoryCaptureMatches(question: string, action: { key: string; label: string; value: string }) {
  const assessment = assessManagerMemoryCapture(question);
  return assessment.status === "ready" && assessment.key === action.key && assessment.label === action.label && assessment.value === action.value;
}
