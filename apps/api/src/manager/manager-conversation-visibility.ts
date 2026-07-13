import {
  managerMemoryRecommendationIsVisible,
  managerRecommendationActionType,
  type ManagerFollowThroughVisibility,
  type ManagerMemoryRecommendationVisibilitySource
} from "./manager-follow-through";
import { managerRunFullContextSourceBinding, managerRunUsesOwnerOnlyContext } from "./manager-provider-context";

export type ManagerConversationVisibility = "normal" | "owner" | "provider_redacted" | "provider_full";

/**
 * Local deterministic reasoning must follow the privacy level of the current
 * turn, not merely the caller's role. An owner may disable full context while
 * continuing an existing conversation; in that case prior owner-only turns
 * must be redacted before continuity or subject-resolution logic runs.
 */
export function managerConversationReasoningVisibility(fullContextEnabled: boolean): ManagerConversationVisibility {
  return fullContextEnabled ? "owner" : "normal";
}

export type ManagerConversationVisibilityRecommendation = ManagerMemoryRecommendationVisibilitySource & {
  id: string;
};

export type ManagerConversationVisibilityMessage = {
  id?: string;
  role: string;
  visibility?: string | null;
  content: string;
  createdAt?: Date | string;
  citations?: unknown;
  proposedActions?: unknown;
  managerRun?: {
    recommendations?: ManagerConversationVisibilityRecommendation[];
    trace?: unknown;
  } | null;
};

export type ManagerMessageVisibilitySource = {
  visibility?: string | null;
};

export type ManagerRunVisibilitySource = {
  trace?: unknown;
  message?: ManagerMessageVisibilitySource | null;
};

const HIDDEN_USER_MESSAGE = "[Memory request hidden by current privacy settings.]";
const HIDDEN_ASSISTANT_MESSAGE = "[Manager memory response hidden by current privacy settings.]";
const HIDDEN_FULL_CONTEXT_USER_MESSAGE = "[Owner-only Manager question hidden by current privacy settings.]";
const HIDDEN_FULL_CONTEXT_ASSISTANT_MESSAGE = "[Owner-only Manager response hidden by current privacy settings.]";

export type ManagerMemoryRecommendationSourceBinding = {
  sourceMessageId: string;
  sourceMessageCreatedAt: string;
};

export function managerMemoryRecommendationSourceBinding(
  recommendation: Pick<ManagerConversationVisibilityRecommendation, "proposedAction">
): ManagerMemoryRecommendationSourceBinding | null {
  if (!recommendation.proposedAction || typeof recommendation.proposedAction !== "object" || Array.isArray(recommendation.proposedAction)) return null;
  const action = recommendation.proposedAction as Record<string, unknown>;
  if (action.type !== "remember_fact" || typeof action.sourceMessageId !== "string" || !action.sourceMessageId) return null;
  if (typeof action.sourceMessageCreatedAt !== "string" || Number.isNaN(Date.parse(action.sourceMessageCreatedAt))) return null;
  return { sourceMessageId: action.sourceMessageId, sourceMessageCreatedAt: action.sourceMessageCreatedAt };
}

function followThroughVisibility(visibility: ManagerConversationVisibility): ManagerFollowThroughVisibility {
  if (visibility === "owner") return "owner";
  if (visibility === "provider_full") return "provider_full";
  return "normal";
}

export function managerConversationRecommendationIsVisible(
  recommendation: ManagerConversationVisibilityRecommendation,
  visibility: ManagerConversationVisibility
) {
  if (managerRecommendationActionType(recommendation.proposedAction) !== "remember_fact") return true;
  // A legacy action cannot be safely paired with the user turn that authorized
  // it, so it must not expose an Accept control or conversation content.
  if (!managerMemoryRecommendationSourceBinding(recommendation)) return false;
  // An unaccepted conversational note is not authoritative provider context.
  // Once accepted, provider visibility follows the current memory record.
  if (recommendation.outcome === "suggested" && visibility.startsWith("provider_")) return false;
  return managerMemoryRecommendationIsVisible(recommendation, followThroughVisibility(visibility));
}

export function managerMessageIsVisible(
  message: ManagerMessageVisibilitySource,
  visibility: ManagerConversationVisibility
) {
  return message.visibility !== "owner_only" || visibility === "owner" || visibility === "provider_full";
}

export function managerRunIsVisible(
  managerRun: ManagerRunVisibilitySource | null | undefined,
  visibility: ManagerConversationVisibility
) {
  if (managerRun?.message && !managerMessageIsVisible(managerRun.message, visibility)) return false;
  if (visibility === "owner" || visibility === "provider_full") return true;
  // Trace inspection is retained only as a conservative compatibility path
  // for rows written before ManagerMessage.visibility existed.
  return !managerRunUsesOwnerOnlyContext(managerRun);
}

/**
 * Feedback is a write against the original assistant response, so known
 * message IDs must be checked against the same current privacy boundary as a
 * conversation read. This covers both persisted owner-only turns and memory
 * responses whose linked fact was later made private or archived.
 */
export function managerConversationAssistantMessageIsVisible(
  message: Pick<ManagerConversationVisibilityMessage, "role" | "visibility" | "managerRun">,
  visibility: ManagerConversationVisibility
) {
  if (message.role !== "assistant" || !managerMessageIsVisible(message, visibility)) return false;
  if (visibility !== "owner" && visibility !== "provider_full" && managerRunFullContextSourceBinding(message.managerRun)) return false;
  return (message.managerRun?.recommendations ?? []).every((recommendation) =>
    managerRecommendationActionType(recommendation.proposedAction) !== "remember_fact" ||
    managerConversationRecommendationIsVisible(recommendation, visibility)
  );
}

export function projectManagerConversationMessages<T extends ManagerConversationVisibilityMessage>(
  messages: readonly T[],
  visibility: ManagerConversationVisibility
): T[] {
  const hiddenAssistantIndexes = new Set<number>();
  const hiddenUserIndexes = new Set<number>();
  const hiddenFullContextAssistantIndexes = new Set<number>();
  const hiddenFullContextUserIndexes = new Set<number>();
  let hideLegacyWindow = false;
  let hideLegacyFullContextWindow = false;

  messages.forEach((message, index) => {
    if (!managerMessageIsVisible(message, visibility)) {
      if (message.role === "assistant") hiddenFullContextAssistantIndexes.add(index);
      else hiddenFullContextUserIndexes.add(index);
    }
    const fullContextBinding = visibility !== "owner" && visibility !== "provider_full"
      ? managerRunFullContextSourceBinding(message.managerRun)
      : null;
    if (fullContextBinding) {
      hiddenFullContextAssistantIndexes.add(index);
      if (fullContextBinding.sourceMessageId && fullContextBinding.sourceMessageCreatedAt) {
        let sourceMatched = false;
        messages.forEach((candidate, candidateIndex) => {
          const createdAt = candidate.createdAt instanceof Date ? candidate.createdAt.toISOString() : candidate.createdAt;
          if (candidate.role === "user" && candidate.id === fullContextBinding.sourceMessageId && createdAt === fullContextBinding.sourceMessageCreatedAt) {
            hiddenFullContextUserIndexes.add(candidateIndex);
            sourceMatched = true;
          }
        });
        if (!sourceMatched) hideLegacyFullContextWindow = true;
      } else {
        // Older full-context runs did not bind their initiating turn. Hiding
        // only the answer would leave the user prompt/title and later history
        // available to a non-owner even though they may repeat private facts.
        hideLegacyFullContextWindow = true;
      }
    }
    const recommendations = message.managerRun?.recommendations ?? [];
    const hiddenMemory = recommendations.filter((recommendation) =>
      managerRecommendationActionType(recommendation.proposedAction) === "remember_fact" &&
      !managerConversationRecommendationIsVisible(recommendation, visibility)
    );
    if (!hiddenMemory.length) return;
    hiddenAssistantIndexes.add(index);
    for (const recommendation of hiddenMemory) {
      const binding = managerMemoryRecommendationSourceBinding(recommendation);
      if (!binding) {
        // Old recommendations did not record the source turn. Hiding the whole
        // bounded window is intentionally conservative: adjacency is unsafe
        // when two browser requests write into one conversation concurrently.
        hideLegacyWindow = true;
        continue;
      }
      messages.forEach((candidate, candidateIndex) => {
        if (candidate.role === "user" && candidate.id === binding.sourceMessageId) hiddenUserIndexes.add(candidateIndex);
      });
    }
  });

  return messages.map((message, index) => {
    const recommendations = message.managerRun?.recommendations ?? [];
    const projectedRecommendations = recommendations.filter((recommendation) =>
      managerConversationRecommendationIsVisible(recommendation, visibility)
    );
    const hiddenForFullContext = hideLegacyFullContextWindow || hiddenFullContextAssistantIndexes.has(index) || hiddenFullContextUserIndexes.has(index);
    const hidden = hideLegacyWindow || hiddenAssistantIndexes.has(index) || hiddenUserIndexes.has(index) || hiddenForFullContext;
    return {
      ...message,
      ...(message.managerRun ? { managerRun: { ...message.managerRun, recommendations: hidden ? [] : projectedRecommendations } } : {}),
      ...(hidden ? {
        content: hiddenForFullContext
          ? message.role === "assistant" ? HIDDEN_FULL_CONTEXT_ASSISTANT_MESSAGE : HIDDEN_FULL_CONTEXT_USER_MESSAGE
          : message.role === "assistant" ? HIDDEN_ASSISTANT_MESSAGE : HIDDEN_USER_MESSAGE,
        ...(Object.hasOwn(message, "citations") ? { citations: [] } : {}),
        ...(Object.hasOwn(message, "proposedActions") ? { proposedActions: [] } : {})
      } : {})
    } as T;
  });
}
