import { managerSubjectCandidates, resolveManagerSubjectReference } from "./manager-subject-reference";
import { managerTextContainsSensitiveValue, resolveManagerTaskDate } from "./manager-task-capture";

export const MANAGER_TASK_UPDATE_POLICY_VERSION = "manager_task_update_v1" as const;

export const managerConversationTaskUpdateOperations = [
  "complete",
  "start",
  "resume",
  "block",
  "reschedule",
  "clear_due_date",
  "set_waiting_on",
  "clear_waiting_on"
] as const;

export type ManagerConversationTaskUpdateOperation = typeof managerConversationTaskUpdateOperations[number];

export type ManagerConversationTaskUpdateAction = {
  type: "update_conversation_task";
  sourceMessageId: string;
  sourceMessageCreatedAt: string;
  taskId: string;
  taskUpdatedAt: string;
  taskTitle: string;
  operation: ManagerConversationTaskUpdateOperation;
  dueDate: string | null;
  dateBasisTimezone: string | null;
  blockedReason: string | null;
  waitingOn: string | null;
};

export type ManagerTaskUpdateTask = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  updatedAt: Date;
  blockedReason?: string | null;
  waitingOn?: string | null;
  prerequisites?: { prerequisiteTask: { id: string; title: string; status: string; dueAt: Date | null } }[];
  dependents?: { task: { id: string; title: string; status: string; dueAt: Date | null } }[];
};

export type ManagerTaskUpdateResult = {
  status: "not_update" | "needs_clarification" | "blocked_sensitive" | "already_current" | "ready";
  message: string;
  action: ManagerConversationTaskUpdateAction | null;
  taskId: string | null;
  preview: string | null;
};

type ParsedOperation = {
  operation: ManagerConversationTaskUpdateOperation;
  dateText?: string;
  blockedReason?: string;
  waitingOn?: string;
};

function result(status: ManagerTaskUpdateResult["status"], message: string, extra: Partial<ManagerTaskUpdateResult> = {}): ManagerTaskUpdateResult {
  return { status, message, action: null, taskId: null, preview: null, ...extra };
}

function commandText(message: string) {
  return message.replace(/\s+/g, " ").trim().replace(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?/i, "").trim();
}

function taskUpdateCarrier(message: string) {
  return /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:mark|set|complete|finish|start|begin|resume|unblock|block|move|reschedule|postpone|clear)\b/i.test(message.trim());
}

function parseOperation(message: string): ParsedOperation | null {
  const text = commandText(message).replace(/[?]\s*$/, "").trim();
  if (/^(?:complete|finish)\b/i.test(text)) return { operation: "complete" };
  if (/^(?:start|begin)\b/i.test(text)) return { operation: "start" };
  if (/^(?:resume|unblock)\b/i.test(text)) return { operation: "resume" };
  if (/^clear\s+(?:the\s+)?due date\b/i.test(text)) return { operation: "clear_due_date" };
  if (/^clear\s+(?:the\s+)?(?:waiting (?:party|status)|waiting on)\b/i.test(text)) return { operation: "clear_waiting_on" };
  if (/^(?:move|reschedule|postpone|set\s+(?:the\s+)?due date\b)/i.test(text)) {
    const date = /(?:\s+(?:to|for|by|on)\s+)(\d{4}-\d{2}-\d{2}|today|tomorrow|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\.?$/i.exec(text);
    return date?.[1] ? { operation: "reschedule", dateText: date[1] } : null;
  }
  const block = /^(?:block\b.*?\s+because|(?:mark|set)\b.*?\bblocked\s+because)\s+(.+)$/i.exec(text);
  if (block?.[1]) return { operation: "block", blockedReason: block[1].replace(/[.!]+$/g, "").trim() };
  const waiting = /^(?:mark|set)\b.*?\bwaiting on\s+(.+)$/i.exec(text);
  if (waiting?.[1]) return { operation: "set_waiting_on", waitingOn: waiting[1].replace(/[.!]+$/g, "").trim() };
  if (/^(?:mark|set)\b.*?\b(?:done|complete|completed)\.?$/i.test(text)) return { operation: "complete" };
  if (/^(?:mark|set)\b.*?\bin[- ]progress\.?$/i.test(text)) return { operation: "start" };
  return null;
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase() === (b ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function displayDate(value: string) {
  return new Date(`${value}T12:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function actionChange(action: ManagerConversationTaskUpdateAction) {
  if (action.operation === "complete") return "Mark done";
  if (action.operation === "start") return "Mark in progress";
  if (action.operation === "resume") return "Resume and clear the blocker/waiting party";
  if (action.operation === "block") return `Mark blocked — ${action.blockedReason}`;
  if (action.operation === "reschedule") return `Move due date to ${displayDate(action.dueDate!)}`;
  if (action.operation === "clear_due_date") return "Clear due date";
  if (action.operation === "set_waiting_on") return `Waiting on ${action.waitingOn}`;
  return "Clear waiting party";
}

export function managerTaskUpdatePreview(action: ManagerConversationTaskUpdateAction) {
  return `Task: ${action.taskTitle}\nChange: ${actionChange(action)}`;
}

export function resolveManagerTaskUpdate(input: {
  message: string;
  sourceMessageId: string;
  sourceMessageCreatedAt: Date;
  timezone: string | null;
  tasks: ManagerTaskUpdateTask[];
}): ManagerTaskUpdateResult {
  if (!taskUpdateCarrier(input.message)) return result("not_update", "");
  if (input.message.includes("\n") || /\b(?:and also|plus another|second task|two tasks)\b/i.test(input.message)) {
    return result("needs_clarification", "Please update one task at a time so the record and review stay exact.");
  }
  const parsed = parseOperation(input.message);
  if (!parsed) return result("needs_clarification", "State one supported change: mark a task done, in progress, blocked because a reason, waiting on someone, move its due date, resume it, or clear its due date/waiting party.");
  if ((parsed.blockedReason && managerTextContainsSensitiveValue(parsed.blockedReason)) || (parsed.waitingOn && managerTextContainsSensitiveValue(parsed.waitingOn))) {
    return result("blocked_sensitive", "That update appears to contain a credential or sensitive identifier. Keep the secret out of StoryBoard and record only a safe blocker or waiting party.");
  }
  if (parsed.blockedReason && parsed.blockedReason.length > 1000) return result("needs_clarification", "Keep the blocker under 1,000 characters.");
  if (parsed.waitingOn && (parsed.waitingOn.length < 1 || parsed.waitingOn.length > 240)) return result("needs_clarification", "Name the waiting party in 240 characters or fewer.");

  const reference = resolveManagerSubjectReference(input.message, managerSubjectCandidates({ tasks: input.tasks }));
  if (reference.status === "needs_clarification") return result("needs_clarification", reference.clarification ?? "Which task do you mean?", { taskId: reference.candidates[0]?.id ?? null });
  if (reference.status !== "resolved" || reference.subject?.kind !== "task") {
    return result("needs_clarification", "Name the exact StoryBoard task, or put its title in quotation marks, so I do not update the wrong commitment.");
  }
  const task = input.tasks.find((candidate) => candidate.id === reference.subject!.id);
  if (!task) return result("needs_clarification", "I do not see that task in the current band workspace.");
  if (task.status === "done" && parsed.operation !== "complete") {
    return result("needs_clarification", `“${task.title}” is already complete. Reopen it deliberately from the task board before changing its active state.`, { taskId: task.id });
  }

  let dueDate: string | null = null;
  let dateBasisTimezone: string | null = null;
  if (parsed.operation === "reschedule") {
    const date = resolveManagerTaskDate(parsed.dateText!, input.sourceMessageCreatedAt, input.timezone);
    if (date.error || !date.dueDate) return result("needs_clarification", date.error ?? "Use today, tomorrow, this weekday, or YYYY-MM-DD.", { taskId: task.id });
    dueDate = date.dueDate;
    dateBasisTimezone = /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateText!) ? null : input.timezone;
    const dueAt = managerConversationTaskUpdateDueAt({ dueDate });
    const laterPrerequisite = task.prerequisites?.find((dependency) => dependency.prerequisiteTask.dueAt && dependency.prerequisiteTask.dueAt > dueAt!);
    if (laterPrerequisite) return result("needs_clarification", `“${task.title}” cannot be due before its prerequisite “${laterPrerequisite.prerequisiteTask.title}.”`, { taskId: task.id });
    const earlierDependent = task.dependents?.find((dependency) => dependency.task.dueAt && dependency.task.dueAt < dueAt!);
    if (earlierDependent) return result("needs_clarification", `“${task.title}” cannot be due after the task it unlocks, “${earlierDependent.task.title}.”`, { taskId: task.id });
  }
  if (parsed.operation === "complete") {
    const unfinished = task.prerequisites?.find((dependency) => dependency.prerequisiteTask.status !== "done");
    if (unfinished) return result("needs_clarification", `Complete the prerequisite “${unfinished.prerequisiteTask.title}” before finishing “${task.title}.”`, { taskId: task.id });
  }

  const currentDueDate = task.dueAt?.toISOString().slice(0, 10) ?? null;
  const alreadyCurrent = (parsed.operation === "complete" && task.status === "done")
    || (parsed.operation === "start" && task.status === "in_progress" && !task.blockedReason)
    || (parsed.operation === "resume" && task.status === "in_progress" && !task.blockedReason && !task.waitingOn)
    || (parsed.operation === "block" && task.status === "blocked" && sameText(task.blockedReason, parsed.blockedReason))
    || (parsed.operation === "reschedule" && currentDueDate === dueDate)
    || (parsed.operation === "clear_due_date" && !task.dueAt)
    || (parsed.operation === "set_waiting_on" && sameText(task.waitingOn, parsed.waitingOn))
    || (parsed.operation === "clear_waiting_on" && !task.waitingOn);
  if (alreadyCurrent) return result("already_current", `“${task.title}” already has that task state. I will not write a no-op update.`, { taskId: task.id });

  const action: ManagerConversationTaskUpdateAction = {
    type: "update_conversation_task",
    sourceMessageId: input.sourceMessageId,
    sourceMessageCreatedAt: input.sourceMessageCreatedAt.toISOString(),
    taskId: task.id,
    taskUpdatedAt: task.updatedAt.toISOString(),
    taskTitle: task.title,
    operation: parsed.operation,
    dueDate,
    dateBasisTimezone,
    blockedReason: parsed.blockedReason ?? null,
    waitingOn: parsed.waitingOn ?? null
  };
  const preview = managerTaskUpdatePreview(action);
  return result("ready", "I found the exact shared task. Review the change below before I update the band task board.", { action, taskId: task.id, preview });
}

export function managerConversationTaskUpdateActionMatchesMessage(
  action: ManagerConversationTaskUpdateAction,
  message: { id: string; content: string; createdAt: Date },
  tasks: ManagerTaskUpdateTask[]
) {
  if (message.id !== action.sourceMessageId || message.createdAt.toISOString() !== action.sourceMessageCreatedAt) return false;
  const resolved = resolveManagerTaskUpdate({ message: message.content, sourceMessageId: message.id, sourceMessageCreatedAt: message.createdAt, timezone: action.dateBasisTimezone, tasks });
  return resolved.status === "ready" && JSON.stringify(resolved.action) === JSON.stringify(action);
}

export function managerConversationTaskUpdateRecommendation(action: ManagerConversationTaskUpdateAction) {
  const key = action.sourceMessageId.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 52);
  return {
    stableKey: `conversation-task-update-${key}`.slice(0, 80),
    title: `Update task: ${action.taskTitle}`.slice(0, 200),
    reason: "You explicitly requested one change to an existing shared band task.",
    nextAction: `Review this exact change: ${actionChange(action)}.`,
    workstream: "band_operations" as const,
    priority: action.operation === "complete" || action.operation === "block" ? "med" as const : "low" as const,
    evidenceIds: [action.taskId],
    proposedAction: action
  };
}

export function managerConversationTaskUpdateDueAt(action: Pick<ManagerConversationTaskUpdateAction, "dueDate">) {
  return action.dueDate ? new Date(`${action.dueDate}T12:00:00.000Z`) : null;
}
