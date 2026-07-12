export const MANAGER_NATURAL_FEEDBACK_POLICY_VERSION = "manager_natural_feedback_v1" as const;

export type ManagerNaturalFeedbackReason =
  | "incorrect"
  | "missed_question"
  | "too_vague"
  | "too_long"
  | "wrong_tone"
  | "missing_context"
  | "other";

export type ManagerNaturalFeedbackInput = {
  helpful: boolean;
  reason: ManagerNaturalFeedbackReason | null;
  note: string | null;
};

export type ManagerNaturalFeedbackParse = {
  policyVersion: typeof MANAGER_NATURAL_FEEDBACK_POLICY_VERSION;
  input: ManagerNaturalFeedbackInput;
  signal: "helpful" | ManagerNaturalFeedbackReason;
};

export type ManagerNaturalFeedbackHistoryTurn = {
  id: string;
  role: string;
};

export type ManagerNaturalFeedbackResolution =
  | {
      policyVersion: typeof MANAGER_NATURAL_FEEDBACK_POLICY_VERSION;
      status: "not_feedback";
      parsed: null;
      targetMessageId: null;
    }
  | {
      policyVersion: typeof MANAGER_NATURAL_FEEDBACK_POLICY_VERSION;
      status: "no_target";
      parsed: ManagerNaturalFeedbackParse;
      targetMessageId: null;
    }
  | {
      policyVersion: typeof MANAGER_NATURAL_FEEDBACK_POLICY_VERSION;
      status: "ready";
      parsed: ManagerNaturalFeedbackParse;
      targetMessageId: string;
    };

const MAX_INPUT_LENGTH = 1200;
const MAX_NOTE_LENGTH = 1000;
const ACTION_OR_APPROVAL = /(?:^|[,;.!]\s*|\b(?:and|then|now|please)\s+|\bbecause\s+(?:please\s+)?)(?:approve|accept|go ahead|do it|run it|execute|send|email|contact|schedule|book|buy|purchase|pay|sign|publish|post|upload|delete|remove|create|assign|commit|push|deploy)\b/i;
const CONTRAST = /\b(?:but|however|although|except|on the other hand)\b/i;

function normalize(value: string) {
  return value
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutAddress(value: string) {
  return value.replace(/^(?:manager|storyboard)\s*[,;:!-]\s*/i, "").trim();
}

function splitExplanation(value: string) {
  const match = value.match(/^(.+?)(?:\s+(?:because|since)\s+|\s*[—:]\s*)(.+)$/i);
  if (!match) return { verdict: value, note: null };
  const note = match[2]?.trim() ?? "";
  return note.length > 0 && note.length <= MAX_NOTE_LENGTH
    ? { verdict: match[1]!.trim(), note }
    : { verdict: value, note: null };
}

function cleanVerdict(value: string) {
  return value.toLocaleLowerCase().replace(/[.!]+$/g, "").trim();
}

function input(helpful: boolean, reason: ManagerNaturalFeedbackReason | null, note: string | null): ManagerNaturalFeedbackParse {
  return {
    policyVersion: MANAGER_NATURAL_FEEDBACK_POLICY_VERSION,
    input: { helpful, reason, note },
    signal: helpful ? "helpful" : reason ?? "other"
  };
}

/**
 * Natural response feedback is deliberately narrower than sentiment. It must
 * be a standalone verdict about an answer and may not contain an action,
 * approval, question, mixed verdict, or claim that operational work finished.
 */
export function parseManagerNaturalFeedback(value: string): ManagerNaturalFeedbackParse | null {
  const raw = withoutAddress(normalize(value));
  if (!raw || raw.length > MAX_INPUT_LENGTH || value.includes("\n") || raw.includes("?") || ACTION_OR_APPROVAL.test(raw)) return null;
  const { verdict: rawVerdict, note } = splitExplanation(raw);
  if ((rawVerdict === raw && /\b(?:because|since)\b/i.test(raw)) || CONTRAST.test(rawVerdict)) return null;
  const verdict = cleanVerdict(rawVerdict);

  if (/^(?:(?:that|this|the|your) (?:answer|response|advice) (?:was|is) (?:helpful|useful|exactly right|a good answer)|(?:that|this) (?:was|is) (?:helpful|useful|exactly right)|helpful answer|good answer|exactly what i needed|(?:that|this) answered my question)$/.test(verdict)) {
    return input(true, null, note);
  }
  if (/^(?:(?:that|this|the|your) (?:answer|response|advice) (?:was|is) (?:wrong|incorrect|inaccurate)|(?:that|this) (?:was|is) (?:wrong|incorrect|inaccurate)|you got (?:that|this|the answer|your answer) wrong)$/.test(verdict)) {
    return input(false, "incorrect", note);
  }
  if (/^(?:(?:that|this|your answer|your response) (?:did not|didn't) answer my question|you (?:did not|didn't) answer my question|(?:that|this|you) missed (?:my question|the point|what i asked))$/.test(verdict)) {
    return input(false, "missed_question", note);
  }
  if (/^(?:(?:that|this|the|your) (?:answer|response|advice) (?:was|is) (?:too vague|too general|not specific enough)|(?:that|this) (?:was|is) (?:too vague|too general|not specific enough))$/.test(verdict)) {
    return input(false, "too_vague", note);
  }
  if (/^(?:(?:that|this|the|your) (?:answer|response) (?:was|is) (?:too long|too detailed|too wordy)|(?:that|this) (?:was|is) (?:too long|too detailed|too wordy))$/.test(verdict)) {
    return input(false, "too_long", note);
  }
  if (/^(?:(?:the|your) tone (?:was|is|felt) (?:wrong|off)|(?:that|this) (?:sounded|felt) (?:too corporate|too cold|robotic))$/.test(verdict)) {
    return input(false, "wrong_tone", note);
  }
  if (/^(?:(?:that|this|the|your) (?:answer|response) (?:was|is) missing (?:important |key )?context|(?:that|this) (?:was|is) missing (?:important |key )?context|you missed (?:important |key )?context)$/.test(verdict)) {
    return input(false, "missing_context", note);
  }
  if (/^(?:(?:that|this|the|your) (?:answer|response|advice) (?:was|is) (?:not helpful|not useful|a bad answer)|(?:that|this) (?:was|is) (?:not helpful|not useful)|bad answer)$/.test(verdict)) {
    return input(false, "other", note);
  }
  return null;
}

export function resolveManagerNaturalFeedback(
  value: string,
  priorHistory: ManagerNaturalFeedbackHistoryTurn[]
): ManagerNaturalFeedbackResolution {
  const parsed = parseManagerNaturalFeedback(value);
  const base = { policyVersion: MANAGER_NATURAL_FEEDBACK_POLICY_VERSION } as const;
  if (!parsed) return { ...base, status: "not_feedback", parsed: null, targetMessageId: null };
  const directPrior = priorHistory.at(-1);
  if (!directPrior || directPrior.role !== "assistant") return { ...base, status: "no_target", parsed, targetMessageId: null };
  return { ...base, status: "ready", parsed, targetMessageId: directPrior.id };
}

const reasonLabel: Record<ManagerNaturalFeedbackReason, string> = {
  incorrect: "it was incorrect",
  missed_question: "it missed your question",
  too_vague: "it was too vague",
  too_long: "it was too long",
  wrong_tone: "the tone was wrong",
  missing_context: "it was missing context",
  other: "it was not useful"
};

export function managerNaturalFeedbackAcknowledgement(resolution: ManagerNaturalFeedbackResolution) {
  if (resolution.status === "no_target") {
    return "I can record that, but there is no immediately preceding Manager answer in this thread. Open the thread with the answer and reply there, or use Helpful or Needs work on that answer.";
  }
  if (resolution.status !== "ready") return null;
  if (resolution.parsed.input.helpful) {
    return "Got it. I marked that answer as helpful. That reviews the response; it does not mark any task or real-world result complete.";
  }
  const label = reasonLabel[resolution.parsed.input.reason ?? "other"];
  const note = resolution.parsed.input.note
    ? " I kept your explanation with the review, but I did not save it as a band fact."
    : "";
  return `Got it. I marked that answer as needing work because ${label}.${note}`;
}
