export const MANAGER_RECOMMENDATION_EVAL_REVIEW_POLICY_VERSION = "manager_recommendation_eval_review_v1" as const;

const REVIEW_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ManagerRecommendationEvalReviewCandidate = {
  recommendationId: string;
  stableKey: string;
  workstream: string;
  title: string;
  reason: string;
  nextAction: string;
  priority: string;
  evidenceIds: string[];
  actionType: string | null;
  outcome: "completed" | "dismissed" | "blocked";
  outcomeReason: string | null;
  outcomeNote: string | null;
  outcomeAt: Date;
  createdAt: Date;
  promptVersion: string;
  cadence: string;
  task: { id: string; title: string; status: string } | null;
  decision: { id: string; title: string; status: string; reviewOutcome: string | null } | null;
  project: { id: string; name: string; status: string } | null;
  event: { id: string; title: string; status: string } | null;
};

export type ManagerRecommendationEvalReviewItem = ManagerRecommendationEvalReviewCandidate & {
  selectionReason: "completed_work" | "dismissed_advice" | "blocked_advice";
};

export type ManagerRecommendationEvalReviewQueue = {
  policyVersion: typeof MANAGER_RECOMMENDATION_EVAL_REVIEW_POLICY_VERSION;
  windowDays: number;
  eligibleCount: number;
  stableKeyCount: number;
  items: ManagerRecommendationEvalReviewItem[];
};

export function summarizeManagerRecommendationReviews(rows: { label: string }[]) {
  const counts = { useful: 0, notUseful: 0, needsRevision: 0 };
  for (const row of rows) {
    if (row.label === "useful") counts.useful += 1;
    else if (row.label === "not_useful") counts.notUseful += 1;
    else if (row.label === "needs_revision") counts.needsRevision += 1;
  }
  const total = counts.useful + counts.notUseful + counts.needsRevision;
  return { total, ...counts, usefulRate: total ? counts.useful / total : null };
}

function reasonFor(candidate: ManagerRecommendationEvalReviewCandidate): ManagerRecommendationEvalReviewItem["selectionReason"] {
  if (candidate.outcome === "dismissed") return "dismissed_advice";
  if (candidate.outcome === "blocked") return "blocked_advice";
  return "completed_work";
}

export function selectManagerRecommendationEvalReviewQueue(
  candidates: ManagerRecommendationEvalReviewCandidate[],
  limit = 3,
  now = new Date()
): ManagerRecommendationEvalReviewQueue {
  const earliest = new Date(now.getTime() - REVIEW_WINDOW_DAYS * DAY_MS);
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 5);
  const eligible = [...new Map(candidates
    .filter((candidate) => candidate.stableKey.trim() && candidate.title.trim() && candidate.outcomeAt >= earliest && candidate.outcomeAt <= now)
    .map((candidate) => [candidate.recommendationId, candidate]))
    .values()]
    .sort((left, right) => right.outcomeAt.getTime() - left.outcomeAt.getTime() || left.recommendationId.localeCompare(right.recommendationId));
  const items: ManagerRecommendationEvalReviewItem[] = [];
  const stableKeys = new Set<string>();
  for (const candidate of eligible) {
    if (stableKeys.has(candidate.stableKey)) continue;
    stableKeys.add(candidate.stableKey);
    items.push({ ...candidate, selectionReason: reasonFor(candidate) });
    if (items.length >= boundedLimit) break;
  }
  return {
    policyVersion: MANAGER_RECOMMENDATION_EVAL_REVIEW_POLICY_VERSION,
    windowDays: REVIEW_WINDOW_DAYS,
    eligibleCount: eligible.length,
    stableKeyCount: new Set(eligible.map((candidate) => candidate.stableKey)).size,
    items
  };
}
