import { managerSubjectCandidates, resolveManagerSubjectReference } from "./manager-subject-reference";
import { managerTextContainsSensitiveValue } from "./manager-task-capture";

export const MANAGER_EVENT_AVAILABILITY_POLICY_VERSION = "manager_event_availability_v1" as const;

export const managerEventAvailabilityResponses = ["unknown", "available", "tentative", "unavailable"] as const;
export type ManagerEventAvailabilityResponse = typeof managerEventAvailabilityResponses[number];

export type ManagerConversationEventAvailabilityAction = {
  type: "update_conversation_event_availability";
  sourceMessageId: string;
  sourceMessageCreatedAt: string;
  eventId: string;
  eventUpdatedAt: string;
  eventTitle: string;
  eventStartsAt: string | null;
  bandMemberId: string;
  bandMemberName: string;
  participantId: string | null;
  previousResponse: ManagerEventAvailabilityResponse;
  previousRespondedAt: string | null;
  response: ManagerEventAvailabilityResponse;
};

export type ManagerEventAvailabilityEvent = {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  updatedAt: Date;
  participants: {
    id: string;
    bandMemberId: string;
    response: string;
    respondedAt: Date | null;
  }[];
};

export type ManagerEventAvailabilityMember = {
  id: string;
  name: string;
};

export type ManagerEventAvailabilityResult = {
  status: "not_availability" | "needs_clarification" | "blocked_sensitive" | "already_current" | "ready";
  message: string;
  action: ManagerConversationEventAvailabilityAction | null;
  eventId: string | null;
  memberId: string | null;
  preview: string | null;
};

function result(status: ManagerEventAvailabilityResult["status"], message: string, extra: Partial<ManagerEventAvailabilityResult> = {}): ManagerEventAvailabilityResult {
  return { status, message, action: null, eventId: null, memberId: null, preview: null, ...extra };
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return compact(value).toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function unquote(value: string) {
  return compact(value).replace(/^[“"]|[”"]$/g, "").replace(/[.!?]+$/g, "").trim();
}

function availabilityParts(message: string): { memberText: string; eventText: string; response: ManagerEventAvailabilityResponse } | null {
  const original = compact(message);
  const explicitCommand = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:mark|record|set)\b/i.test(original);
  if (/\?\s*$/.test(original) && !explicitCommand) return null;
  const text = original.replace(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?/i, "").replace(/[?]\s*$/, "").trim();
  const direct = /^(?:mark|record)\s+(.+?)\s+(?:as\s+)?(available|tentative|unavailable|unknown)\s+for\s+(.+)$/i.exec(text);
  if (direct?.[1] && direct[2] && direct[3]) return { memberText: unquote(direct[1]), response: direct[2].toLocaleLowerCase() as ManagerEventAvailabilityResponse, eventText: unquote(direct[3]) };
  const set = /^set\s+(.+?)(?:[’']s)?\s+availability\s+for\s+(.+?)\s+to\s+(available|tentative|unavailable|unknown)$/i.exec(text);
  if (set?.[1] && set[2] && set[3]) return { memberText: unquote(set[1]), eventText: unquote(set[2]), response: set[3].toLocaleLowerCase() as ManagerEventAvailabilityResponse };
  const statement = /^(.+?)\s+(?:is|will\s+be)\s+(available|tentative|unavailable)\s+for\s+(.+)$/i.exec(text);
  if (statement?.[1] && statement[2] && statement[3]) return { memberText: unquote(statement[1]), response: statement[2].toLocaleLowerCase() as ManagerEventAvailabilityResponse, eventText: unquote(statement[3]) };
  const canMake = /^(.+?)\s+(can|cannot|can\s+not|can't|won't|will\s+not)\s+make\s+(.+)$/i.exec(text);
  if (canMake?.[1] && canMake[2] && canMake[3]) {
    const available = normalize(canMake[2]) === "can";
    return { memberText: unquote(canMake[1]), eventText: unquote(canMake[3]), response: available ? "available" : "unavailable" };
  }
  return null;
}

export function managerMessageIsEventAvailabilityIntent(message: string) {
  return Boolean(availabilityParts(message));
}

function resolveMember(memberText: string, members: ManagerEventAvailabilityMember[]) {
  const requested = normalize(memberText);
  if (!requested) return { member: null, candidates: [] as ManagerEventAvailabilityMember[] };
  const exact = members.filter((member) => normalize(member.name) === requested);
  if (exact.length === 1) return { member: exact[0]!, candidates: exact };
  if (exact.length > 1) return { member: null, candidates: exact };
  if (!requested.includes(" ")) {
    const firstName = members.filter((member) => normalize(member.name).split(" ")[0] === requested);
    if (firstName.length === 1) return { member: firstName[0]!, candidates: firstName };
    if (firstName.length > 1) return { member: null, candidates: firstName };
  }
  return { member: null, candidates: [] as ManagerEventAvailabilityMember[] };
}

function responseLabel(value: ManagerEventAvailabilityResponse) {
  return value === "unknown" ? "Unknown" : value[0]!.toLocaleUpperCase() + value.slice(1);
}

export function managerEventAvailabilityPreview(action: ManagerConversationEventAvailabilityAction) {
  const previous = responseLabel(action.previousResponse);
  const next = responseLabel(action.response);
  return `Event: ${action.eventTitle}\nMember: ${action.bandMemberName}\nAvailability: ${previous === next ? next : `${previous} → ${next}`}\n\nThis updates only the shared StoryBoard availability list. It does not notify the member or save a private explanation.`;
}

export function resolveManagerEventAvailability(input: {
  message: string;
  sourceMessageId: string;
  sourceMessageCreatedAt: Date;
  events: ManagerEventAvailabilityEvent[];
  members: ManagerEventAvailabilityMember[];
}): ManagerEventAvailabilityResult {
  const source = compact(input.message);
  const parts = availabilityParts(source);
  const mentionsAvailability = /\b(?:available|availability|tentative|unavailable|can(?:not|'t)?\s+make|won't\s+make|will\s+not\s+make)\b/i.test(source);
  const carrier = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:mark|record|set)\b/i.test(source) || Boolean(parts);
  if (!carrier || !mentionsAvailability) return result("not_availability", "");
  if (input.message.includes("\n") || /\b(?:and also|plus another|second member|two members|everyone|whole band|all members)\b/i.test(source)) return result("needs_clarification", "Please record one active member for one event at a time so the review stays exact.");
  if (managerTextContainsSensitiveValue(source)) return result("blocked_sensitive", "That looks like a credential or sensitive identifier. Keep it out of StoryBoard chat and record only the member's availability response.");
  if (!parts) return result("needs_clarification", "Use one active member, one exact event, and available, tentative, unavailable, or unknown—for example, “Mark Morgan available for Bluebird show.”");

  const memberResolution = resolveMember(parts.memberText, input.members);
  if (!memberResolution.member) {
    const choices = memberResolution.candidates.map((member) => `“${member.name}”`).join(" or ");
    return result("needs_clarification", choices ? `Which active member do you mean: ${choices}?` : `I do not see an active band member named “${parts.memberText}”. Use the name saved in Band context.`);
  }
  const member = memberResolution.member;
  const reference = resolveManagerSubjectReference(parts.eventText, managerSubjectCandidates({ events: input.events }));
  if (reference.status === "needs_clarification") return result("needs_clarification", reference.clarification ?? "Which event do you mean?", { memberId: member.id, eventId: reference.candidates[0]?.id ?? null });
  if (reference.status !== "resolved" || reference.subject?.kind !== "event") return result("needs_clarification", `I do not see one current event matching “${parts.eventText}”. Name the exact event, or put its title in quotation marks.`, { memberId: member.id });
  const event = input.events.find((candidate) => candidate.id === reference.subject!.id);
  if (!event || !["draft", "hold", "confirmed"].includes(event.status)) return result("needs_clarification", "That event is no longer open for availability responses.", { memberId: member.id, eventId: reference.subject.id });
  const participant = event.participants.find((candidate) => candidate.bandMemberId === member.id) ?? null;
  const previousResponse = managerEventAvailabilityResponses.includes(participant?.response as ManagerEventAvailabilityResponse) ? participant!.response as ManagerEventAvailabilityResponse : "unknown";
  if (previousResponse === parts.response) return result("already_current", `${member.name} is already marked ${parts.response} for “${event.title}”. I will not write a no-op response.`, { memberId: member.id, eventId: event.id });

  const action: ManagerConversationEventAvailabilityAction = {
    type: "update_conversation_event_availability",
    sourceMessageId: input.sourceMessageId,
    sourceMessageCreatedAt: input.sourceMessageCreatedAt.toISOString(),
    eventId: event.id,
    eventUpdatedAt: event.updatedAt.toISOString(),
    eventTitle: event.title,
    eventStartsAt: event.startsAt?.toISOString() ?? null,
    bandMemberId: member.id,
    bandMemberName: member.name,
    participantId: participant?.id ?? null,
    previousResponse,
    previousRespondedAt: participant?.respondedAt?.toISOString() ?? null,
    response: parts.response
  };
  return result("ready", "I found the exact active member and event. Review the one availability change below before I update the shared lineup.", { action, memberId: member.id, eventId: event.id, preview: managerEventAvailabilityPreview(action) });
}

export function managerConversationEventAvailabilityActionMatchesMessage(
  action: ManagerConversationEventAvailabilityAction,
  message: { id: string; content: string; createdAt: Date },
  events: ManagerEventAvailabilityEvent[],
  members: ManagerEventAvailabilityMember[]
) {
  if (message.id !== action.sourceMessageId || message.createdAt.toISOString() !== action.sourceMessageCreatedAt) return false;
  const resolved = resolveManagerEventAvailability({ message: message.content, sourceMessageId: message.id, sourceMessageCreatedAt: message.createdAt, events, members });
  return resolved.status === "ready" && JSON.stringify(resolved.action) === JSON.stringify(action);
}

export function managerConversationEventAvailabilityRecommendation(action: ManagerConversationEventAvailabilityAction) {
  const key = action.sourceMessageId.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 43);
  return {
    stableKey: `conversation-event-availability-${key}`.slice(0, 80),
    title: `${action.bandMemberName}: ${action.response} for ${action.eventTitle}`.slice(0, 200),
    reason: "You explicitly recorded one active member's availability for one current event.",
    nextAction: "Review the exact member, event, and response before updating the shared availability list.",
    workstream: "live" as const,
    priority: action.response === "unavailable" || action.response === "tentative" ? "med" as const : "low" as const,
    evidenceIds: [action.eventId, action.bandMemberId, ...(action.participantId ? [action.participantId] : [])].slice(0, 8),
    proposedAction: action
  };
}
