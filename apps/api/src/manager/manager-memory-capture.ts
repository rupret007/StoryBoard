export type ManagerMemoryCaptureAssessment = {
  status: "ready";
  key: string;
  label: string;
  value: string;
} | {
  status: "blocked_sensitive" | "profile_owned" | "not_requested";
  reason: string;
};

const explicitCapture = /^(?:please\s+)?(?:remember|note|save|keep in mind)(?:\s+(?:that|this))?\s*[:,-]?\s*(.+)$/is;
const sensitive = /\b(?:password|passcode|api\s*key|secret\s*key|access\s*token|refresh\s*token|private\s*key|social\s*security|ssn|tax\s*id|routing\s*number|bank\s*account|credit\s*card|medical|diagnos(?:is|ed)|health\s*condition|medication)\b/i;
const profileOwned = /\b(?:home\s+(?:city|market)|based\s+in|twelve[- ]month\s+ambition|12[- ]month\s+ambition|band\s+mode|original\s+band|cover\s+band|hybrid\s+band|our\s+constraints?\s+(?:are|include))\b/i;

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function keyFromStatement(statement: string) {
  const words = statement.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "band_fact";
  return `operator_note_${words}_${stableHash(statement)}`.slice(0, 80);
}

export function assessManagerMemoryCapture(question: string): ManagerMemoryCaptureAssessment {
  const match = explicitCapture.exec(question.trim());
  if (!match?.[1]) return { status: "not_requested", reason: "The operator did not explicitly ask StoryBoard to remember a fact." };
  const value = match[1].trim().replace(/\s+/g, " ").slice(0, 1000);
  if (value.length < 3) return { status: "not_requested", reason: "The requested memory is empty or too short." };
  if (sensitive.test(value)) return { status: "blocked_sensitive", reason: "Credentials, financial identifiers, and personal health information cannot be saved as normal conversational memory." };
  if (profileOwned.test(value)) return { status: "profile_owned", reason: "This fact belongs in the authoritative operating profile rather than duplicate Manager memory." };
  return {
    status: "ready",
    key: keyFromStatement(value),
    label: value.replace(/[.!?]+$/, "").slice(0, 120),
    value
  };
}

export function managerMemoryCaptureMatches(question: string, action: { key: string; label: string; value: string }) {
  const assessment = assessManagerMemoryCapture(question);
  return assessment.status === "ready" && assessment.key === action.key && assessment.label === action.label && assessment.value === action.value;
}
