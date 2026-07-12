export const MANAGER_RESPONSE_REVIEW_POLICY_VERSION = "manager_response_review_v1" as const;
export const MANAGER_RESPONSE_EVAL_REVIEW_POLICY_VERSION = "manager_response_eval_review_v1" as const;

const REVIEW_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ManagerResponseReviewCandidate = {
  messageId: string;
  conversationId: string;
  conversationTitle: string | null;
  question: string;
  answer: string;
  citations: string[];
  actionTypes: string[];
  promptVersion: string;
  mode: string;
  createdAt: Date;
};

export type ManagerResponseReviewItem = ManagerResponseReviewCandidate & {
  selectionReason: "action_proposal" | "grounded_answer" | "recent_answer";
};

export type ManagerResponseReviewQueue = {
  policyVersion: typeof MANAGER_RESPONSE_REVIEW_POLICY_VERSION;
  windowDays: number;
  eligibleCount: number;
  conversationCount: number;
  items: ManagerResponseReviewItem[];
};

export type ManagerResponseEvalReviewCandidate = ManagerResponseReviewCandidate & {
  feedback: { helpful: boolean; reason: string | null; note: string | null; updatedAt: Date };
};

export type ManagerResponseEvalReviewQueue = {
  policyVersion: typeof MANAGER_RESPONSE_EVAL_REVIEW_POLICY_VERSION;
  windowDays: number;
  eligibleCount: number;
  conversationCount: number;
  items: ManagerResponseEvalReviewCandidate[];
};

function selectionReason(candidate: ManagerResponseReviewCandidate): ManagerResponseReviewItem["selectionReason"] {
  if (candidate.actionTypes.length) return "action_proposal";
  if (candidate.citations.length) return "grounded_answer";
  return "recent_answer";
}

function eligibleCandidates<T extends ManagerResponseReviewCandidate>(candidates: T[], now: Date) {
  const earliest = new Date(now.getTime() - REVIEW_WINDOW_DAYS * DAY_MS);
  return [...new Map(candidates
    .filter((candidate) => candidate.question.trim() && candidate.answer.trim() && candidate.createdAt >= earliest && candidate.createdAt <= now)
    .map((candidate) => [candidate.messageId, candidate]))
    .values()]
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || left.messageId.localeCompare(right.messageId));
}

function onePerConversation<T extends ManagerResponseReviewCandidate>(eligible: T[], limit: number) {
  const selected: T[] = [];
  const conversations = new Set<string>();
  for (const candidate of eligible) {
    if (conversations.has(candidate.conversationId)) continue;
    conversations.add(candidate.conversationId);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function selectManagerResponseReviewQueue(
  candidates: ManagerResponseReviewCandidate[],
  limit = 3,
  now = new Date()
): ManagerResponseReviewQueue {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 5);
  const eligible = eligibleCandidates(candidates, now);
  const selected = onePerConversation(eligible, boundedLimit).map((candidate) => ({ ...candidate, selectionReason: selectionReason(candidate) }));
  return {
    policyVersion: MANAGER_RESPONSE_REVIEW_POLICY_VERSION,
    windowDays: REVIEW_WINDOW_DAYS,
    eligibleCount: eligible.length,
    conversationCount: new Set(eligible.map((candidate) => candidate.conversationId)).size,
    items: selected
  };
}

export function selectManagerResponseEvalReviewQueue(
  candidates: ManagerResponseEvalReviewCandidate[],
  limit = 3,
  now = new Date()
): ManagerResponseEvalReviewQueue {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 5);
  const eligible = eligibleCandidates(candidates, now);
  return {
    policyVersion: MANAGER_RESPONSE_EVAL_REVIEW_POLICY_VERSION,
    windowDays: REVIEW_WINDOW_DAYS,
    eligibleCount: eligible.length,
    conversationCount: new Set(eligible.map((candidate) => candidate.conversationId)).size,
    items: onePerConversation(eligible, boundedLimit)
  };
}
