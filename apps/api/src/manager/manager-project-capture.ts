import { PROJECT_PLAN_VERSION, projectPlanTemplate } from "../operations/project-plan";
import { managerTextContainsSensitiveValue } from "./manager-task-capture";

export const MANAGER_PROJECT_CAPTURE_POLICY_VERSION = "manager_project_capture_v1" as const;

export const managerConversationProjectTypes = ["release", "content_campaign", "tour", "business"] as const;
export type ManagerConversationProjectType = typeof managerConversationProjectTypes[number];

export type ManagerConversationProjectAction = {
  type: "create_conversation_project";
  sourceMessageId: string;
  sourceMessageCreatedAt: string;
  projectType: ManagerConversationProjectType;
  name: string;
  dueDate: string;
  planVersion: typeof PROJECT_PLAN_VERSION;
};

export type ManagerProjectCaptureProject = {
  id: string;
  type: string;
  status: string;
  name: string;
  dueAt: Date | null;
};

export type ManagerProjectCaptureResult = {
  status: "not_project" | "needs_clarification" | "blocked_sensitive" | "duplicate" | "ready";
  message: string;
  action: ManagerConversationProjectAction | null;
  duplicateProjectId: string | null;
  preview: string | null;
};

const MONTHS = new Map([
  ["january", 1], ["february", 2], ["march", 3], ["april", 4], ["may", 5], ["june", 6],
  ["july", 7], ["august", 8], ["september", 9], ["october", 10], ["november", 11], ["december", 12]
]);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function result(status: ManagerProjectCaptureResult["status"], message: string, extra: Partial<ManagerProjectCaptureResult> = {}): ManagerProjectCaptureResult {
  return { status, message, action: null, duplicateProjectId: null, preview: null, ...extra };
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

function parseCalendarDate(value: string) {
  const trimmed = compact(value).replace(/[.!?]+$/g, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return validCalendarDate(trimmed) ? trimmed : null;
  const named = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(trimmed);
  if (!named) return null;
  const month = MONTHS.get(named[1]!.toLocaleLowerCase())!;
  const day = Number(named[2]);
  const year = Number(named[3]);
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return validCalendarDate(candidate) ? candidate : null;
}

function projectTypes(value: string): ManagerConversationProjectType[] {
  return [
    /\b(?:release|single|ep|album|record)\b/i.test(value) ? "release" as const : null,
    /\btour\b/i.test(value) ? "tour" as const : null,
    /\b(?:content\s+campaign|content\s+rollout|promo(?:tion)?\s+campaign)\b/i.test(value) ? "content_campaign" as const : null,
    /\bbusiness\s+project\b/i.test(value) ? "business" as const : null
  ].filter((value): value is ManagerConversationProjectType => value !== null);
}

function extractProjectRequest(message: string) {
  const source = compact(message);
  if (!/^(?:please\s+)?(?:create|start|set\s+up|plan|build)\b/i.test(source)) return null;
  const matchedTypes = projectTypes(source);
  const type = matchedTypes.length === 1 ? matchedTypes[0]! : null;
  if (!type) {
    if (/\bproject\b/i.test(source) || matchedTypes.length > 1) return { type: null, name: null, dateText: null, intent: true };
    return null;
  }
  const dateMatch = /\s+(?:due|for|by|on|targeting|with\s+(?:a\s+)?target(?:\s+date)?\s+of)\s+(\d{4}-\d{2}-\d{2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})[.!?]*$/i.exec(source);
  if (!dateMatch?.[1]) return { type, name: null, dateText: null, intent: true };
  const beforeDate = source.slice(0, dateMatch.index).trim();
  const named = /\b(?:called|named)\s+[“"]?(.+?)[”"]?$/i.exec(beforeDate)?.[1];
  const withoutCarrier = beforeDate
    .replace(/^(?:please\s+)?(?:create|start|set\s+up|plan|build)\s+/i, "")
    .replace(/^(?:a|an|the|our)\s+/i, "")
    .replace(/\b(?:project)\s+(?:called|named)\s+/i, "")
    .replace(/\s+(?:project)\s*$/i, "")
    .trim();
  const name = compact(named ?? withoutCarrier).replace(/^[“"]|[”"]$/g, "").replace(/[.!?]+$/g, "");
  return { type, name, dateText: dateMatch[1], intent: true };
}

export function normalizeManagerProjectName(value: string) {
  return compact(value).toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function managerConversationProjectDueAt(action: ManagerConversationProjectAction) {
  return new Date(`${action.dueDate}T12:00:00.000Z`);
}

export function managerProjectCapturePreview(action: ManagerConversationProjectAction, now = new Date(action.sourceMessageCreatedAt)) {
  const dueAt = managerConversationProjectDueAt(action);
  const milestones = projectPlanTemplate(action.projectType, dueAt);
  const due = dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const overdueAtCapture = milestones.filter((milestone) => milestone.dueAt < now).length;
  const lines = milestones.map((milestone) => {
    const date = milestone.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    return `• ${date} — ${milestone.title}`;
  });
  return `Project: ${action.name}\nType: ${action.projectType.replaceAll("_", " ")}\nTarget: ${due}\nStatus: Active\nMilestones (${milestones.length}):\n${lines.join("\n")}${overdueAtCapture ? `\n\nCompressed timeline: ${overdueAtCapture} milestone${overdueAtCapture === 1 ? " is" : "s are"} already due by the request date. You can reschedule them after setup.` : ""}`;
}

export function resolveManagerProjectCapture(input: {
  message: string;
  sourceMessageId: string;
  sourceMessageCreatedAt: Date;
  projects: ManagerProjectCaptureProject[];
}): ManagerProjectCaptureResult {
  const requested = extractProjectRequest(input.message);
  if (!requested) return result("not_project", "");
  if (!requested.type) return result("needs_clarification", "Name one project type: release, tour, content campaign, or business project.");
  if (input.message.includes("\n") || /(?:^|\s)(?:and\s+also|plus\s+another|second\s+project|two\s+projects)\b/i.test(input.message)) return result("needs_clarification", "Please give me one project at a time so its target date and milestone plan stay exact.");
  if (managerTextContainsSensitiveValue(input.message)) return result("blocked_sensitive", "That looks like a credential or sensitive identifier. Keep the secret out of StoryBoard chat and name only the safe project.");
  if (/\?\s*$/.test(input.message)) return result("needs_clarification", "That reads like a question. Say “plan our … for YYYY-MM-DD” when you want a project prepared for review.");
  if (!requested.dateText) return result("needs_clarification", "Give this project one exact target date, including the year—for example, 2026-10-15 or October 15, 2026.");
  const dueDate = parseCalendarDate(requested.dateText);
  if (!dueDate) return result("needs_clarification", "That target date is not valid. Use YYYY-MM-DD or a full date such as October 15, 2026.");
  if (!requested.name || requested.name.length < 3 || requested.name.length > 240) return result("needs_clarification", "Use one project name between 3 and 240 characters.");
  const duplicate = input.projects.find((project) => project.status !== "cancelled" && project.type === requested.type && normalizeManagerProjectName(project.name) === normalizeManagerProjectName(requested.name!) && project.dueAt?.toISOString().slice(0, 10) === dueDate);
  if (duplicate) return result("duplicate", `“${duplicate.name}” already has this project type and target date. I will not create a duplicate.`, { duplicateProjectId: duplicate.id });
  const action: ManagerConversationProjectAction = {
    type: "create_conversation_project",
    sourceMessageId: input.sourceMessageId,
    sourceMessageCreatedAt: input.sourceMessageCreatedAt.toISOString(),
    projectType: requested.type,
    name: requested.name,
    dueDate,
    planVersion: PROJECT_PLAN_VERSION
  };
  return result("ready", "I can create that active project and its milestone plan after you review the exact setup below.", { action, preview: managerProjectCapturePreview(action, input.sourceMessageCreatedAt) });
}

export function managerConversationProjectActionMatchesMessage(action: ManagerConversationProjectAction, message: { id: string; content: string; createdAt: Date }, projects: ManagerProjectCaptureProject[] = []) {
  if (message.id !== action.sourceMessageId || message.createdAt.toISOString() !== action.sourceMessageCreatedAt || action.planVersion !== PROJECT_PLAN_VERSION) return false;
  const resolved = resolveManagerProjectCapture({ message: message.content, sourceMessageId: message.id, sourceMessageCreatedAt: message.createdAt, projects });
  return resolved.status === "ready" && resolved.action?.projectType === action.projectType && resolved.action.name === action.name && resolved.action.dueDate === action.dueDate && resolved.action.planVersion === action.planVersion;
}

export function managerConversationProjectRecommendation(action: ManagerConversationProjectAction) {
  const key = action.sourceMessageId.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 52);
  const workstream: "releases" | "content" | "live" | "business" = action.projectType === "release" ? "releases" : action.projectType === "content_campaign" ? "content" : action.projectType === "tour" ? "live" : "business";
  return {
    stableKey: `conversation-project-${key}`.slice(0, 80),
    title: `Create project: ${action.name}`.slice(0, 200),
    reason: "You explicitly asked StoryBoard to create one band project with a target date and working plan.",
    nextAction: `Review the ${action.projectType.replaceAll("_", " ")} project and its ${projectPlanTemplate(action.projectType, managerConversationProjectDueAt(action)).length} dated milestones, then create it.`,
    workstream,
    priority: "low" as const,
    evidenceIds: [] as string[],
    proposedAction: action
  };
}
