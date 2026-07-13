import { managerSubjectCandidates, resolveManagerSubjectReference } from "./manager-subject-reference";

export const MANAGER_TASK_ASSIGNMENT_POLICY_VERSION = "manager_task_assignment_v1" as const;

export type ManagerConversationTaskAssignmentAction = {
  type: "assign_conversation_task";
  sourceMessageId: string;
  sourceMessageCreatedAt: string;
  taskId: string;
  taskUpdatedAt: string;
  taskTitle: string;
  bandMemberId: string;
  bandMemberName: string;
  previousBandMemberId: string | null;
  previousOwnerLabel: string | null;
  checkInId: string | null;
  availability: "available" | "limited" | "unknown";
};

export type ManagerTaskAssignmentTask = {
  id: string;
  title: string;
  status: string;
  updatedAt: Date;
  bandMemberId?: string | null;
  ownerLabel?: string | null;
};

export type ManagerTaskAssignmentMember = {
  id: string;
  name: string;
  checkInId: string | null;
  availability: "available" | "limited" | "unavailable" | "unknown";
};

export type ManagerTaskAssignmentResult = {
  status: "not_assignment" | "needs_clarification" | "blocked_unavailable" | "already_current" | "ready";
  message: string;
  action: ManagerConversationTaskAssignmentAction | null;
  taskId: string | null;
  memberId: string | null;
  preview: string | null;
};

function result(status: ManagerTaskAssignmentResult["status"], message: string, extra: Partial<ManagerTaskAssignmentResult> = {}): ManagerTaskAssignmentResult {
  return { status, message, action: null, taskId: null, memberId: null, preview: null, ...extra };
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

function assignmentParts(message: string) {
  const text = compact(message).replace(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?/i, "").replace(/[?]\s*$/, "").trim();
  const direct = /^(?:assign|give)\s+(.+?)\s+to\s+(.+)$/i.exec(text);
  if (direct?.[1] && direct[2]) return { taskText: direct[1], memberText: unquote(direct[2]) };
  const responsible = /^make\s+(.+?)\s+responsible\s+for\s+(.+)$/i.exec(text);
  if (responsible?.[1] && responsible[2]) return { taskText: responsible[2], memberText: unquote(responsible[1]) };
  if (/^(?:assign|give|make)\b/i.test(text)) return { taskText: "", memberText: "" };
  return null;
}

function resolveMember(memberText: string, members: ManagerTaskAssignmentMember[]) {
  const requested = normalize(memberText);
  if (!requested) return { member: null, candidates: [] as ManagerTaskAssignmentMember[] };
  const exact = members.filter((member) => normalize(member.name) === requested);
  if (exact.length === 1) return { member: exact[0]!, candidates: exact };
  if (exact.length > 1) return { member: null, candidates: exact };
  if (!requested.includes(" ")) {
    const firstName = members.filter((member) => normalize(member.name).split(" ")[0] === requested);
    if (firstName.length === 1) return { member: firstName[0]!, candidates: firstName };
    if (firstName.length > 1) return { member: null, candidates: firstName };
  }
  return { member: null, candidates: [] as ManagerTaskAssignmentMember[] };
}

function availabilityLabel(availability: ManagerTaskAssignmentMember["availability"]) {
  if (availability === "available") return "Available — current voluntary check-in";
  if (availability === "limited") return "Limited — current voluntary check-in";
  if (availability === "unavailable") return "Unavailable — current voluntary check-in";
  return "Not recorded";
}

export function managerTaskAssignmentPreview(action: ManagerConversationTaskAssignmentAction) {
  const previous = action.previousOwnerLabel?.trim() || "Unassigned";
  const owner = previous === action.bandMemberName ? action.bandMemberName : `${previous} → ${action.bandMemberName}`;
  return `Task: ${action.taskTitle}\nOwner: ${owner}\nAvailability: ${availabilityLabel(action.availability)}`;
}

export function resolveManagerTaskAssignment(input: {
  message: string;
  sourceMessageId: string;
  sourceMessageCreatedAt: Date;
  tasks: ManagerTaskAssignmentTask[];
  members: ManagerTaskAssignmentMember[];
}): ManagerTaskAssignmentResult {
  const parts = assignmentParts(input.message);
  if (!parts) return result("not_assignment", "");
  if (input.message.includes("\n") || /\b(?:and also|plus another|second task|two tasks)\b/i.test(input.message)) return result("needs_clarification", "Please assign one task to one person at a time so the review stays exact.");
  if (!parts.taskText || !parts.memberText) return result("needs_clarification", "Use “assign [exact task] to [active band member]” and name one task and one person.");

  const reference = resolveManagerSubjectReference(input.message, managerSubjectCandidates({ tasks: input.tasks }));
  if (reference.status === "needs_clarification") return result("needs_clarification", reference.clarification ?? "Which task do you mean?", { taskId: reference.candidates[0]?.id ?? null });
  if (reference.status !== "resolved" || reference.subject?.kind !== "task") return result("needs_clarification", "Name the exact StoryBoard task, or put its title in quotation marks, so I do not assign the wrong work.");
  const task = input.tasks.find((candidate) => candidate.id === reference.subject!.id);
  if (!task) return result("needs_clarification", "I do not see that task in the current band workspace.");
  if (task.status === "done") return result("needs_clarification", `“${task.title}” is already complete and cannot receive a new owner.`, { taskId: task.id });

  const memberResolution = resolveMember(parts.memberText, input.members);
  if (!memberResolution.member) {
    const choices = memberResolution.candidates.map((member) => `“${member.name}”`).join(" or ");
    return result("needs_clarification", choices ? `Which active member do you mean: ${choices}?` : `I do not see an active band member named “${parts.memberText}”. Use the name saved in Band context.`, { taskId: task.id });
  }
  const member = memberResolution.member;
  if (member.availability === "unavailable") return result("blocked_unavailable", `${member.name} is currently marked unavailable. Update that voluntary check-in or choose someone else before assigning this task.`, { taskId: task.id, memberId: member.id });
  if (task.bandMemberId === member.id) return result("already_current", `“${task.title}” is already assigned to ${member.name}. I will not write a no-op assignment.`, { taskId: task.id, memberId: member.id });

  const action: ManagerConversationTaskAssignmentAction = {
    type: "assign_conversation_task",
    sourceMessageId: input.sourceMessageId,
    sourceMessageCreatedAt: input.sourceMessageCreatedAt.toISOString(),
    taskId: task.id,
    taskUpdatedAt: task.updatedAt.toISOString(),
    taskTitle: task.title,
    bandMemberId: member.id,
    bandMemberName: member.name,
    previousBandMemberId: task.bandMemberId ?? null,
    previousOwnerLabel: task.ownerLabel?.trim() || null,
    checkInId: member.checkInId,
    availability: member.availability
  };
  return result("ready", "I found the exact task and active member. Review the ownership change below before I update the shared task board.", { action, taskId: task.id, memberId: member.id, preview: managerTaskAssignmentPreview(action) });
}

export function managerConversationTaskAssignmentActionMatchesMessage(
  action: ManagerConversationTaskAssignmentAction,
  message: { id: string; content: string; createdAt: Date },
  tasks: ManagerTaskAssignmentTask[],
  members: ManagerTaskAssignmentMember[]
) {
  if (message.id !== action.sourceMessageId || message.createdAt.toISOString() !== action.sourceMessageCreatedAt) return false;
  const resolved = resolveManagerTaskAssignment({ message: message.content, sourceMessageId: message.id, sourceMessageCreatedAt: message.createdAt, tasks, members });
  return resolved.status === "ready" && JSON.stringify(resolved.action) === JSON.stringify(action);
}

export function managerConversationTaskAssignmentRecommendation(action: ManagerConversationTaskAssignmentAction) {
  const key = action.sourceMessageId.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 48);
  return {
    stableKey: `conversation-task-owner-${key}`.slice(0, 80),
    title: `Assign ${action.taskTitle} to ${action.bandMemberName}`.slice(0, 200),
    reason: "You explicitly assigned one current shared task to one active band member.",
    nextAction: `Review the exact owner change${action.availability === "limited" ? "; the member's current voluntary check-in is limited" : action.availability === "unknown" ? "; no current availability check-in is recorded" : ""}.`,
    workstream: "band_operations" as const,
    priority: "med" as const,
    evidenceIds: [action.taskId, action.bandMemberId, ...(action.checkInId ? [action.checkInId] : [])].slice(0, 8),
    proposedAction: action
  };
}
