import { managerTextContainsSensitiveValue } from "./manager-task-capture";

export const MANAGER_EVENT_CAPTURE_POLICY_VERSION = "manager_event_capture_v1" as const;

export const managerConversationEventTypes = ["gig", "rehearsal", "studio", "release", "promotion", "travel", "meeting"] as const;
export type ManagerConversationEventType = typeof managerConversationEventTypes[number];
export const managerConversationEventStatuses = ["draft", "hold", "confirmed"] as const;
export type ManagerConversationEventStatus = typeof managerConversationEventStatuses[number];

export type ManagerConversationEventAction = {
  type: "create_conversation_event";
  sourceMessageId: string;
  sourceMessageCreatedAt: string;
  eventType: ManagerConversationEventType;
  status: ManagerConversationEventStatus;
  title: string;
  startsAt: string;
  timezone: string;
  locationName: string | null;
  bandMemberIds: string[];
};

export type ManagerEventCaptureEvent = {
  id: string;
  type: string;
  status: string;
  title: string;
  startsAt: Date | null;
};

export type ManagerEventCaptureMember = {
  id: string;
  name: string;
};

export type ManagerEventCaptureResult = {
  status: "not_event" | "needs_clarification" | "blocked_sensitive" | "duplicate" | "ready";
  message: string;
  action: ManagerConversationEventAction | null;
  duplicateEventId: string | null;
  preview: string | null;
};

const MONTHS = new Map([
  ["january", 1], ["february", 2], ["march", 3], ["april", 4], ["may", 5], ["june", 6],
  ["july", 7], ["august", 8], ["september", 9], ["october", 10], ["november", 11], ["december", 12]
]);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function result(status: ManagerEventCaptureResult["status"], message: string, extra: Partial<ManagerEventCaptureResult> = {}): ManagerEventCaptureResult {
  return { status, message, action: null, duplicateEventId: null, preview: null, ...extra };
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
  const trimmed = compact(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return validCalendarDate(trimmed) ? trimmed : null;
  const named = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(trimmed);
  if (!named) return null;
  const month = MONTHS.get(named[1]!.toLocaleLowerCase())!;
  const day = Number(named[2]);
  const year = Number(named[3]);
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return validCalendarDate(candidate) ? candidate : null;
}

function parseClockTime(value: string) {
  const normalized = compact(value).toLocaleLowerCase();
  const twelveHour = /^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/.exec(normalized);
  if (twelveHour) {
    const rawHour = Number(twelveHour[1]);
    if (rawHour < 1 || rawHour > 12) return null;
    const minute = Number(twelveHour[2] ?? 0);
    const hour = rawHour % 12 + (twelveHour[3] === "pm" ? 12 : 0);
    return { hour, minute };
  }
  const twentyFourHour = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(normalized);
  return twentyFourHour ? { hour: Number(twentyFourHour[1]), minute: Number(twentyFourHour[2]) } : null;
}

type LocalDateTime = { year: number; month: number; day: number; hour: number; minute: number };

function timezoneParts(value: Date, timezone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const resolved = { year: number("year"), month: number("month"), day: number("day"), hour: number("hour"), minute: number("minute") };
  if (!Object.values(resolved).every(Number.isFinite)) throw new Error("Could not resolve the Manager timezone");
  return resolved;
}

function sameLocal(left: LocalDateTime, right: LocalDateTime) {
  return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute;
}

function localDateTimeToIso(date: string, time: { hour: number; minute: number }, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const target: LocalDateTime = { year: year!, month: month!, day: day!, hour: time.hour, minute: time.minute };
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  let candidateMs = targetAsUtc;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const observed = timezoneParts(new Date(candidateMs), timezone);
      const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute);
      candidateMs += targetAsUtc - observedAsUtc;
    }
    const candidate = new Date(candidateMs);
    if (!sameLocal(timezoneParts(candidate, timezone), target)) return { iso: null, error: "That local time does not exist in the saved timezone because of a clock change. Choose another time or update the timezone." };
    const alternatives = [candidateMs - 3_600_000, candidateMs + 3_600_000].filter((value) => sameLocal(timezoneParts(new Date(value), timezone), target));
    if (alternatives.length) return { iso: null, error: "That local time occurs twice in the saved timezone because of a clock change. Choose a different time so the event is unambiguous." };
    return { iso: candidate.toISOString(), error: null };
  } catch {
    return { iso: null, error: "The saved Manager timezone is invalid. Correct it in Manager cadence before scheduling an event." };
  }
}

function eventType(value: string): ManagerConversationEventType | null {
  const normalized = compact(value).toLocaleLowerCase();
  if (normalized === "gig" || normalized === "show") return "gig";
  if (normalized === "rehearsal") return "rehearsal";
  if (normalized === "studio session" || normalized === "recording session") return "studio";
  if (normalized === "release event" || normalized === "release day") return "release";
  if (normalized === "promotion event" || normalized === "promo event") return "promotion";
  if (normalized === "travel" || normalized === "travel day") return "travel";
  if (normalized === "meeting") return "meeting";
  return null;
}

const DATE_PATTERN = "(?:\\d{4}-\\d{2}-\\d{2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4})";
const TIME_PATTERN = "(?:\\d{1,2}(?::[0-5]\\d)?\\s*(?:am|pm)|(?:[01]?\\d|2[0-3]):[0-5]\\d)";
const EVENT_PATTERN = new RegExp(`^(?:please\\s+)?(?:add|create|schedule|record)\\s+(?:a|an)\\s+(?:(draft|hold|confirmed)\\s+)?(gig|show|rehearsal|studio\\s+session|recording\\s+session|release\\s+(?:event|day)|promotion\\s+event|promo\\s+event|travel(?:\\s+day)?|meeting)\\s+(?:called|named)\\s+[“"]?(.+?)[”"]?\\s+(?:on|for)\\s+(${DATE_PATTERN})\\s+at\\s+(${TIME_PATTERN})(?:\\s+(?:at|in)\\s+[“"]?(.+?)[”"]?)?[.!]*$`, "i");

export function normalizeManagerEventTitle(value: string) {
  return compact(value).toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function managerEventCapturePreview(action: ManagerConversationEventAction) {
  const start = new Intl.DateTimeFormat("en-US", {
    timeZone: action.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(action.startsAt));
  return `Event: ${action.title}\nType: ${action.eventType.replaceAll("_", " ")}\nStatus: ${action.status}\nStarts: ${start}\nLocation: ${action.locationName ?? "Not recorded"}\nAvailability: ${action.bandMemberIds.length} active member${action.bandMemberIds.length === 1 ? "" : "s"} will start as unknown\n\nThis creates only StoryBoard records. It does not contact anyone or add an external calendar event.`;
}

export function resolveManagerEventCapture(input: {
  message: string;
  sourceMessageId: string;
  sourceMessageCreatedAt: Date;
  timezone: string | null;
  events: ManagerEventCaptureEvent[];
  members: ManagerEventCaptureMember[];
}): ManagerEventCaptureResult {
  const source = compact(input.message);
  const carrier = /^(?:please\s+)?(?:add|create|schedule|record)\b/i.test(source);
  const mentionsEventType = /\b(?:gig|show|rehearsal|studio\s+session|recording\s+session|release\s+(?:event|day)|promotion\s+event|promo\s+event|travel(?:\s+day)?|meeting)\b/i.test(source);
  if (!carrier || !mentionsEventType) return result("not_event", "");
  if (input.message.includes("\n") || /\b(?:and also|plus another|second event|two events)\b/i.test(source)) return result("needs_clarification", "Please give me one event at a time so its status, time, and lineup review stay exact.");
  if (managerTextContainsSensitiveValue(source)) return result("blocked_sensitive", "That looks like a credential or sensitive identifier. Keep the secret out of StoryBoard chat and name only the safe event details.");
  if (/\?\s*$/.test(source)) return result("needs_clarification", "That reads like a question. State one event explicitly—for example, “Schedule a rehearsal called Album run-through on 2026-10-15 at 7:00 PM.”");
  const match = EVENT_PATTERN.exec(source);
  if (!match) return result("needs_clarification", "Use one event type, name, exact date, and time—for example, “Schedule a rehearsal called Album run-through on 2026-10-15 at 7:00 PM.”");
  if (!input.timezone) return result("needs_clarification", "An event time needs a Manager timezone. Set it in Manager cadence, then repeat this request so the preview is exact.");
  const type = eventType(match[2] ?? "");
  const status = (match[1]?.toLocaleLowerCase() ?? "draft") as ManagerConversationEventStatus;
  const title = compact(match[3] ?? "").replace(/^[“"]|[”"]$/g, "").replace(/[.!?]+$/g, "");
  const date = parseCalendarDate(match[4] ?? "");
  const time = parseClockTime(match[5] ?? "");
  const locationName = compact(match[6] ?? "").replace(/^[“"]|[”"]$/g, "").replace(/[.!?]+$/g, "") || null;
  if (!type || !date || !time) return result("needs_clarification", "That date or time is not valid. Use a full date with year and either 7:00 PM or 19:00.");
  if (title.length < 3 || title.length > 240) return result("needs_clarification", "Use one event name between 3 and 240 characters.");
  if (locationName && locationName.length > 240) return result("needs_clarification", "Keep the location name at 240 characters or fewer.");
  const converted = localDateTimeToIso(date, time, input.timezone);
  if (!converted.iso) return result("needs_clarification", converted.error ?? "That event time could not be resolved.");
  const duplicate = input.events.find((event) => event.status !== "cancelled" && event.type === type && normalizeManagerEventTitle(event.title) === normalizeManagerEventTitle(title) && event.startsAt?.toISOString() === converted.iso);
  if (duplicate) return result("duplicate", `“${duplicate.title}” already has this event type and start time. I will not create a duplicate.`, { duplicateEventId: duplicate.id });
  const action: ManagerConversationEventAction = {
    type: "create_conversation_event",
    sourceMessageId: input.sourceMessageId,
    sourceMessageCreatedAt: input.sourceMessageCreatedAt.toISOString(),
    eventType: type,
    status,
    title,
    startsAt: converted.iso,
    timezone: input.timezone,
    locationName,
    bandMemberIds: [...new Set(input.members.map((member) => member.id))].sort()
  };
  return result("ready", "I can add that event and start availability as unknown after you review the exact setup below.", { action, preview: managerEventCapturePreview(action) });
}

export function managerConversationEventActionMatchesMessage(action: ManagerConversationEventAction, message: { id: string; content: string; createdAt: Date }, events: ManagerEventCaptureEvent[], members: ManagerEventCaptureMember[]) {
  if (message.id !== action.sourceMessageId || message.createdAt.toISOString() !== action.sourceMessageCreatedAt) return false;
  const resolved = resolveManagerEventCapture({ message: message.content, sourceMessageId: message.id, sourceMessageCreatedAt: message.createdAt, timezone: action.timezone, events, members });
  const current = resolved.action;
  return resolved.status === "ready" && current?.eventType === action.eventType && current.status === action.status && current.title === action.title && current.startsAt === action.startsAt && current.timezone === action.timezone && current.locationName === action.locationName && current.bandMemberIds.join("|") === action.bandMemberIds.join("|");
}

export function managerConversationEventRecommendation(action: ManagerConversationEventAction) {
  const key = action.sourceMessageId.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 54);
  const workstream: "live" | "releases" | "content" | "band_operations" = ["gig", "rehearsal", "studio", "travel"].includes(action.eventType) ? "live" : action.eventType === "release" ? "releases" : action.eventType === "promotion" ? "content" : "band_operations";
  return {
    stableKey: `conversation-event-${key}`.slice(0, 80),
    title: `Add event: ${action.title}`.slice(0, 200),
    reason: "You explicitly asked StoryBoard to record one band event with an exact start time.",
    nextAction: `Review the ${action.status} ${action.eventType.replaceAll("_", " ")} and its availability setup, then add it.`,
    workstream,
    priority: "low" as const,
    evidenceIds: action.bandMemberIds.slice(0, 8),
    proposedAction: action
  };
}
