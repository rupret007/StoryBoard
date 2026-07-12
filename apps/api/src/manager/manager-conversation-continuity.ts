export const MANAGER_CONVERSATION_CONTINUITY_POLICY_VERSION = "manager_conversation_continuity_v1" as const;

export type ManagerConversationContinuityIntent = "explain" | "recheck" | "blocking" | "details" | "act";

export type ManagerConversationRecommendationReference = {
  id: string;
  stableKey: string;
  title: string;
  reason: string;
  nextAction: string;
  outcome: string;
  evidenceIds: string[];
  proposedAction: Record<string, unknown> | null;
};

export type ManagerConversationHistoryTurn = {
  role: string;
  managerRun?: {
    recommendations?: Array<{
      id: string;
      stableKey: string;
      title: string;
      reason: string;
      nextAction: string;
      outcome: string;
      evidence: unknown;
      proposedAction: unknown;
    }>;
  } | null;
};

export type ManagerConversationContinuity = {
  policyVersion: typeof MANAGER_CONVERSATION_CONTINUITY_POLICY_VERSION;
  status: "not_follow_up" | "resolved" | "needs_clarification";
  intent: ManagerConversationContinuityIntent | null;
  confidence: number;
  reasonCode: "not_reference_bound" | "structured_prior_recommendation" | "no_structured_prior_recommendation" | "multiple_prior_recommendations";
  recommendation: ManagerConversationRecommendationReference | null;
  clarification: string | null;
};

type CurrentRecommendationIdentity = {
  stableKey: string;
  proposedAction: unknown;
};

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
}

function followUpIntent(question: string): { intent: ManagerConversationContinuityIntent; confidence: number } | null {
  const text = normalize(question);
  if (/^(why|why (?:that|this|it)|why did you (?:recommend|suggest|pick|choose) (?:that|this|it)|explain (?:that|this|it|your recommendation))(?:\?|\.|!|$)/.test(text)) {
    return { intent: "explain", confidence: text === "why" || text === "why?" ? 0.9 : 0.96 };
  }
  if (/^(is (?:that|this|it) still (?:right|current|valid|the priority)|does (?:that|this|it) still make sense|should we still (?:do|prioritize) (?:that|this|it))(?:\?|\.|!|$)/.test(text)) {
    return { intent: "recheck", confidence: 0.97 };
  }
  if (/^(what(?:'s| is) blocking (?:that|this|it)|what is holding (?:that|this|it) up|why is (?:that|this|it) blocked)(?:\?|\.|!|$)/.test(text)) {
    return { intent: "blocking", confidence: 0.97 };
  }
  if (/^(tell me more(?: about (?:that|this|it))?|what do you mean by (?:that|this|it)|how would (?:that|this|it) work)(?:\?|\.|!|$)/.test(text)) {
    return { intent: "details", confidence: 0.94 };
  }
  if (/^(do|handle|accept|start|create|make|take care of|go ahead with) (?:that|this|it)(?: for me)?(?:\?|\.|!|$)/.test(text)) {
    return { intent: "act", confidence: 0.97 };
  }
  return null;
}

function evidenceIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))].slice(0, 20)
    : [];
}

function proposedAction(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringField(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] as string : null;
}

function nullableStringField(value: Record<string, unknown>, key: string) {
  return value[key] === null ? null : stringField(value, key);
}

function actionIdentity(value: unknown): string | null {
  const action = proposedAction(value);
  const type = action ? stringField(action, "type") : null;
  if (!action || !type) return null;
  if (type === "generate_event_advance") return stringField(action, "eventId") ? `${type}:${stringField(action, "eventId")}` : null;
  if (type === "generate_project_plan") return stringField(action, "projectId") ? `${type}:${stringField(action, "projectId")}` : null;
  if (type === "assign_task") {
    const taskId = stringField(action, "taskId");
    const memberId = stringField(action, "bandMemberId");
    const availability = stringField(action, "availability");
    if (!taskId || !memberId || !availability) return null;
    return `${type}:${taskId}:${memberId}:${nullableStringField(action, "checkInId") ?? "none"}:${availability}`;
  }
  if (type === "create_task") {
    const title = stringField(action, "title");
    if (!title) return null;
    return `${type}:${nullableStringField(action, "initiativeId") ?? "none"}:${title}:${nullableStringField(action, "dueAt") ?? "none"}`;
  }
  if (type === "remember_fact") {
    const key = stringField(action, "key");
    const label = stringField(action, "label");
    const valueText = stringField(action, "value");
    return key && label && valueText ? `${type}:${key}:${label}:${valueText}` : null;
  }
  if (type === "create_decision") {
    const title = stringField(action, "title");
    const workstream = stringField(action, "workstream");
    const context = nullableStringField(action, "context");
    const options = Array.isArray(action.options)
      ? action.options.map((option) => option && typeof option === "object" && !Array.isArray(option)
        ? { label: stringField(option as Record<string, unknown>, "label"), tradeoff: stringField(option as Record<string, unknown>, "tradeoff") }
        : null)
      : null;
    return title && workstream && options && options.every((option) => option?.label && option.tradeoff)
      ? `${type}:${workstream}:${title}:${context ?? "none"}:${JSON.stringify(options)}`
      : null;
  }
  return null;
}

export function managerConversationRecommendationMatchesCurrent(
  prior: ManagerConversationRecommendationReference,
  current: CurrentRecommendationIdentity
) {
  if (prior.stableKey === current.stableKey) return true;
  const priorAction = actionIdentity(prior.proposedAction);
  return priorAction !== null && priorAction === actionIdentity(current.proposedAction);
}

function referenceFrom(input: NonNullable<NonNullable<ManagerConversationHistoryTurn["managerRun"]>["recommendations"]>[number]): ManagerConversationRecommendationReference {
  return {
    id: input.id,
    stableKey: input.stableKey,
    title: input.title,
    reason: input.reason,
    nextAction: input.nextAction,
    outcome: input.outcome,
    evidenceIds: evidenceIds(input.evidence),
    proposedAction: proposedAction(input.proposedAction)
  };
}

export function resolveManagerConversationContinuity(
  question: string,
  history: ManagerConversationHistoryTurn[]
): ManagerConversationContinuity {
  const detected = followUpIntent(question);
  const base = { policyVersion: MANAGER_CONVERSATION_CONTINUITY_POLICY_VERSION } as const;
  if (!detected) return {
    ...base,
    status: "not_follow_up",
    intent: null,
    confidence: 1,
    reasonCode: "not_reference_bound",
    recommendation: null,
    clarification: null
  };

  const precedingAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
  const recommendations = precedingAssistant?.managerRun?.recommendations ?? [];
  if (recommendations.length === 1) return {
    ...base,
    status: "resolved",
    intent: detected.intent,
    confidence: detected.confidence,
    reasonCode: "structured_prior_recommendation",
    recommendation: referenceFrom(recommendations[0]!),
    clarification: null
  };
  if (recommendations.length > 1) return {
    ...base,
    status: "needs_clarification",
    intent: detected.intent,
    confidence: detected.confidence,
    reasonCode: "multiple_prior_recommendations",
    recommendation: null,
    clarification: `Which recommendation do you mean: ${recommendations.slice(0, 3).map((item) => `“${item.title}”`).join(", ")}?`
  };
  return {
    ...base,
    status: "needs_clarification",
    intent: detected.intent,
    confidence: detected.confidence,
    reasonCode: "no_structured_prior_recommendation",
    recommendation: null,
    clarification: "Which recommendation do you mean? Name the task, show, goal, or project so I can use the right current record."
  };
}
