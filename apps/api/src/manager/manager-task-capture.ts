export const MANAGER_TASK_CAPTURE_POLICY_VERSION = "manager_task_capture_v1" as const;

export type ManagerConversationTaskAction = {
  type: "create_conversation_task";
  sourceMessageId: string;
  sourceMessageCreatedAt: string;
  title: string;
  dueDate: string | null;
  dateBasisTimezone: string | null;
};

export type ManagerTaskCaptureTask = {
  id: string;
  title: string;
  status: string;
};

export type ManagerTaskCaptureResult = {
  status: "not_task" | "needs_clarification" | "blocked_sensitive" | "duplicate" | "ready";
  message: string;
  action: ManagerConversationTaskAction | null;
  duplicateTaskId: string | null;
  preview: string | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const SENSITIVE_VALUE = /\b(?:password|passcode|pin|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|social security|ssn|tax id|routing number|bank account|credit card)\b\s*(?:is|=|:|#)\s*[a-z0-9/+_.-]{4,}/i;

export function managerTextContainsSensitiveValue(value: string) {
  return SENSITIVE_VALUE.test(value);
}

function result(status: ManagerTaskCaptureResult["status"], message: string, extra: Partial<ManagerTaskCaptureResult> = {}): ManagerTaskCaptureResult {
  return { status, message, action: null, duplicateTaskId: null, preview: null, ...extra };
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeManagerTaskTitle(value: string) {
  return compact(value).toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[.!?]+$/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function validCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function calendarParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (![year, month, day].every(Number.isFinite)) throw new Error("Could not resolve the Manager timezone");
  return { year, month, day };
}

function isoCalendarDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function relativeCalendarDate(value: string, now: Date, timezone: string | null): { dueDate: string | null; error: string | null } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return validCalendarDate(value)
      ? { dueDate: value, error: null }
      : { dueDate: null, error: "That calendar date is not valid. Use YYYY-MM-DD." };
  }
  if (!timezone) return { dueDate: null, error: "Relative task dates need a Manager timezone. Set it in Manager cadence, or use an exact YYYY-MM-DD date." };
  let local: { year: number; month: number; day: number };
  try {
    local = calendarParts(now, timezone);
  } catch {
    return { dueDate: null, error: "The saved Manager timezone is invalid. Correct it, or use an exact YYYY-MM-DD date." };
  }
  const base = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const lower = value.toLocaleLowerCase();
  if (lower === "today") return { dueDate: isoCalendarDate(base), error: null };
  if (lower === "tomorrow") return { dueDate: isoCalendarDate(new Date(base.getTime() + 86_400_000)), error: null };
  const weekday = lower.replace(/^this\s+/, "");
  const targetDay = WEEKDAYS.indexOf(weekday as typeof WEEKDAYS[number]);
  if (targetDay >= 0) {
    const delta = (targetDay - base.getUTCDay() + 7) % 7;
    return { dueDate: isoCalendarDate(new Date(base.getTime() + delta * 86_400_000)), error: null };
  }
  return { dueDate: null, error: "Use today, tomorrow, this weekday, or an exact YYYY-MM-DD date." };
}

export function resolveManagerTaskDate(value: string, now: Date, timezone: string | null) {
  return relativeCalendarDate(value.trim().toLocaleLowerCase(), now, timezone);
}

function extractRequestedTask(message: string) {
  const source = compact(message);
  const sharedReminder = /^(?:please\s+)?remind\s+(?:us|the band|everyone)\s+to\s+(.+)$/i.exec(source);
  const explicitTask = /^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:new\s+)?task(?:\s+(?:to|for)\s+|\s*:\s*)(.+)$/i.exec(source);
  if (sharedReminder?.[1]) return { titleAndDate: sharedReminder[1], personal: false };
  if (explicitTask?.[1]) return { titleAndDate: explicitTask[1], personal: false };
  if (/^(?:please\s+)?remind\s+(?:me|him|her|them)\b/i.test(source)) return { titleAndDate: null, personal: true };
  if (/^(?:please\s+)?(?:add|create|make)\s+(?:a\s+)?(?:new\s+)?task\b/i.test(source) || /^(?:please\s+)?remind\s+(?:us|the band|everyone)\b/i.test(source)) return { titleAndDate: "", personal: false };
  return null;
}

function splitDueDate(value: string, now: Date, timezone: string | null) {
  const ambiguous = /\s+(?:(?:by|on|due)\s+)?(?:next\s+\w+|this\s+week|next\s+week|later|soon)\.?$/i.exec(value);
  if (ambiguous) return { title: null, dueDate: null, error: "That due date is ambiguous. Use today, tomorrow, this weekday, or YYYY-MM-DD." };
  const match = /^(.*?)\s+(?:(?:by|on|due)\s+)?(\d{4}-\d{2}-\d{2}|today|tomorrow|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\.?$/i.exec(value);
  if (!match) return { title: compact(value).replace(/[.!?]+$/g, ""), dueDate: null, error: null };
  const title = compact(match[1] ?? "").replace(/[.!?]+$/g, "");
  const parsed = relativeCalendarDate((match[2] ?? "").toLocaleLowerCase(), now, timezone);
  return { title, dueDate: parsed.dueDate, error: parsed.error };
}

export function managerTaskCapturePreview(action: ManagerConversationTaskAction) {
  const due = action.dueDate
    ? new Date(`${action.dueDate}T12:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "No due date";
  return `Task: ${action.title}\nDue: ${due}\nOwner: Unassigned`;
}

export function resolveManagerTaskCapture(input: {
  message: string;
  sourceMessageId: string;
  sourceMessageCreatedAt: Date;
  timezone: string | null;
  openTasks: ManagerTaskCaptureTask[];
}): ManagerTaskCaptureResult {
  const requested = extractRequestedTask(input.message);
  if (!requested) return result("not_task", "");
  if (requested.personal) return result("needs_clarification", "StoryBoard tasks are shared with the band. Say “remind us to …” if this belongs on the band task board.");
  if (!requested.titleAndDate) return result("needs_clarification", "Name one specific task after “add a task to” or “remind us to.”");
  if (input.message.includes("\n") || /(?:^|\s)(?:and also|plus another|second task|two tasks)\b/i.test(requested.titleAndDate)) {
    return result("needs_clarification", "Please give me one task at a time so each title, date, and review stays exact.");
  }
  if (managerTextContainsSensitiveValue(requested.titleAndDate)) return result("blocked_sensitive", "That looks like a credential or sensitive identifier. Keep the secret out of StoryBoard chat and name only the safe work item.");
  if (/\?\s*$/.test(requested.titleAndDate)) return result("needs_clarification", "That reads like a question. State the concrete band task you want recorded.");
  const parsed = splitDueDate(requested.titleAndDate, input.sourceMessageCreatedAt, input.timezone);
  if (parsed.error) return result("needs_clarification", parsed.error);
  const title = parsed.title ?? "";
  if (title.length < 3 || title.length > 240) return result("needs_clarification", "Use one task title between 3 and 240 characters.");
  const duplicate = input.openTasks.find((task) => task.status !== "done" && normalizeManagerTaskTitle(task.title) === normalizeManagerTaskTitle(title));
  if (duplicate) return result("duplicate", `“${duplicate.title}” is already open. I will not add a duplicate task.`, { duplicateTaskId: duplicate.id });
  const action: ManagerConversationTaskAction = {
    type: "create_conversation_task",
    sourceMessageId: input.sourceMessageId,
    sourceMessageCreatedAt: input.sourceMessageCreatedAt.toISOString(),
    title,
    dueDate: parsed.dueDate,
    dateBasisTimezone: parsed.dueDate && /\b(?:today|tomorrow|(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\.?$/i.test(requested.titleAndDate) ? input.timezone : null
  };
  const preview = managerTaskCapturePreview(action);
  return result("ready", "I can add that to the shared band task board after you review the exact title and due date below.", { action, preview });
}

export function managerConversationTaskActionMatchesMessage(action: ManagerConversationTaskAction, message: { id: string; content: string; createdAt: Date }, openTasks: ManagerTaskCaptureTask[] = []) {
  if (message.id !== action.sourceMessageId || message.createdAt.toISOString() !== action.sourceMessageCreatedAt) return false;
  const resolved = resolveManagerTaskCapture({ message: message.content, sourceMessageId: message.id, sourceMessageCreatedAt: message.createdAt, timezone: action.dateBasisTimezone, openTasks });
  return resolved.status === "ready" && resolved.action?.title === action.title && resolved.action.dueDate === action.dueDate;
}

export function managerConversationTaskRecommendation(action: ManagerConversationTaskAction) {
  const key = action.sourceMessageId.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 55);
  return {
    stableKey: `conversation-task-${key}`.slice(0, 80),
    title: `Add task: ${action.title}`.slice(0, 200),
    reason: "You explicitly asked StoryBoard to add one item to the shared band task board.",
    nextAction: action.dueDate ? `Review the task and its ${action.dueDate} due date, then add it.` : "Review the task and add it without a due date.",
    workstream: "band_operations" as const,
    priority: "low" as const,
    evidenceIds: [] as string[],
    proposedAction: action
  };
}

export function managerConversationTaskDueAt(action: ManagerConversationTaskAction) {
  return action.dueDate ? new Date(`${action.dueDate}T12:00:00.000Z`) : null;
}
