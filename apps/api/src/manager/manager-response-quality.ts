export type ManagerResponseFeedbackSignal = {
  helpful: boolean;
  reason: string | null;
};

export type ManagerResponseQuality = {
  passed: boolean;
  wordCount: number;
  maxWords: number;
  violations: string[];
};

export const MANAGER_RESPONSE_ADAPTATION_POLICY_VERSION = "manager_response_adaptation_v1" as const;

export type ManagerResponseAdaptationPolicy = {
  policyVersion: typeof MANAGER_RESPONSE_ADAPTATION_POLICY_VERSION;
  decisionStyle: "concise" | "guided" | "detailed";
  itemLimit: number;
  leadWithAnswer: boolean;
  requireConcreteNextAction: boolean;
  usePlainTone: boolean;
  askForMissingPremise: boolean;
  appliedReasons: string[];
};

const MAX_WORDS = { concise: 140, guided: 260, detailed: 500 } as const;

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function evaluateManagerResponseQuality(
  answer: string,
  decisionStyle: string
): ManagerResponseQuality {
  const words = wordCount(answer);
  const maxWords = MAX_WORDS[decisionStyle as keyof typeof MAX_WORDS] ?? MAX_WORDS.guided;
  const violations: string[] = [];
  const trimmed = answer.trim();

  if (words < 4) violations.push("too_thin");
  if (words > maxWords) violations.push("too_long");
  if (/^(?:certainly|absolutely|of course|great question|based on (?:the )?(?:data|information|records))\b/i.test(trimmed)) {
    violations.push("canned_preamble");
  }
  if (/\b(?:as an ai|language model|ai assistant|read_manager_snapshot|system prompt|provided snapshot|database records?|record ids?)\b/i.test(answer)) {
    violations.push("assistant_meta_language");
  }
  if (/\bI (?:have )?(?:sent|emailed|contacted|scheduled|paid|signed|booked|published|uploaded|created (?:a )?calendar)\b/i.test(answer)) {
    violations.push("unverified_external_action_claim");
  }
  const formattedLines = answer.split("\n").filter((line) => /^\s*(?:#{1,6}\s|[-*]\s|\d+[.)]\s)/.test(line)).length;
  if (formattedLines > 8) violations.push("excessive_formatting");

  return { passed: violations.length === 0, wordCount: words, maxWords, violations };
}

export function summarizeManagerResponseFeedback(rows: ManagerResponseFeedbackSignal[]) {
  const reasonCounts = new Map<string, number>();
  let helpful = 0;
  let notHelpful = 0;
  for (const row of rows) {
    if (row.helpful) helpful += 1;
    else {
      notHelpful += 1;
      if (row.reason) reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1);
    }
  }
  const reasons = [...reasonCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([reason, count]) => ({ reason, count }));
  const total = helpful + notHelpful;
  return { total, helpful, notHelpful, helpfulRate: total ? helpful / total : null, reasons };
}

export function managerResponseGuidance(rows: ManagerResponseFeedbackSignal[]) {
  const summary = summarizeManagerResponseFeedback(rows);
  const guidanceByReason: Record<string, string> = {
    incorrect: "Re-check each band-specific fact and state uncertainty instead of filling a gap.",
    missed_question: "Answer the operator's exact question in the first sentence before adding context.",
    too_vague: "Name the specific next action and the recorded reason it matters.",
    too_long: "Keep the answer compact; remove repeated context and optional background.",
    wrong_tone: "Use calm, plainspoken band-manager language without canned enthusiasm or corporate phrasing.",
    missing_context: "When a key premise is missing, say what is unknown and ask one focused question.",
    other: "Prefer a direct answer, one clear rationale, and one practical next step."
  };
  const selected = summary.reasons.slice(0, 2).map((item) => guidanceByReason[item.reason]).filter(Boolean);
  return selected.length
    ? `Recent explicit response feedback adds these code-owned presentation rules: ${selected.join(" ")}`
    : "No response-specific correction is established yet; follow the configured decision style.";
}

export function managerResponseAdaptationPolicy(decisionStyle: string, rows: ManagerResponseFeedbackSignal[] = []): ManagerResponseAdaptationPolicy {
  const style: ManagerResponseAdaptationPolicy["decisionStyle"] = decisionStyle === "concise" || decisionStyle === "detailed" ? decisionStyle : "guided";
  const reasons = summarizeManagerResponseFeedback(rows).reasons.map((item) => item.reason);
  const has = (reason: string) => reasons.includes(reason);
  const baseLimit = style === "concise" ? 2 : style === "detailed" ? 6 : 4;
  return {
    policyVersion: MANAGER_RESPONSE_ADAPTATION_POLICY_VERSION,
    decisionStyle: style,
    itemLimit: has("too_long") ? Math.min(baseLimit, 2) : baseLimit,
    leadWithAnswer: has("missed_question"),
    requireConcreteNextAction: has("too_vague") || has("missed_question"),
    usePlainTone: has("wrong_tone"),
    askForMissingPremise: has("missing_context"),
    appliedReasons: reasons.filter((reason) => ["missed_question", "too_vague", "too_long", "wrong_tone", "missing_context"].includes(reason)).slice(0, 5)
  };
}

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function applyManagerResponseAdaptation<T extends { answer: string; recommendation: { nextAction: string } | null }>(
  result: T,
  policy: ManagerResponseAdaptationPolicy,
  options: { missingPremiseQuestion?: string | null } = {}
): T {
  let answer = result.answer.trim();
  if (policy.leadWithAnswer || policy.usePlainTone) {
    answer = answer
      .replace(/^I would keep this simple\.\s*/i, "")
      .replace(/\bMy next move would be:\s*/gi, "Next: ")
      .replace(/\bI am basing that on what is recorded now\.\s*/gi, "That order uses the current StoryBoard record. ");
  }
  const nextAction = result.recommendation?.nextAction?.trim();
  if (policy.requireConcreteNextAction && nextAction && !normalized(answer).includes(normalized(nextAction))) {
    answer = `${answer}\n\nNext: ${nextAction}`;
  }
  const missingPremise = options.missingPremiseQuestion?.trim();
  if (policy.askForMissingPremise && missingPremise && !normalized(answer).includes(normalized(missingPremise))) {
    answer = `${answer}\n\nBefore leaning on that: ${missingPremise}`;
  }
  return answer === result.answer ? result : { ...result, answer };
}
