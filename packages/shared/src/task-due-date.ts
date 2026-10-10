export const TASK_DUE_DATE_POLICY_VERSION = "task_due_date_v1" as const;

export type TaskDueTiming = "past" | "today" | "upcoming";

export type TaskDueDateDescription = {
  policyVersion: typeof TASK_DUE_DATE_POLICY_VERSION;
  timing: TaskDueTiming;
  /** Calendar-day label, e.g. "Tue, Sep 15" — always the UTC day it was recorded as. */
  label: string;
};

const utcDateLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});

function utcDayNumber(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function parseDueAt(dueAt: string | Date | null | undefined): Date | null {
  if (!dueAt) return null;
  const parsed = dueAt instanceof Date ? dueAt : new Date(dueAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * True when the recorded due calendar day is before today's UTC calendar day.
 * A task due later today is never overdue. Instant comparison is not used.
 */
export function isTaskOverdueByUtcDay(
  dueAt: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const parsed = parseDueAt(dueAt);
  if (!parsed) return false;
  return utcDayNumber(parsed) < utcDayNumber(now);
}

/**
 * Prisma/query cutoff: `dueAt <` this instant means a past UTC calendar day.
 * When `graceDays` &gt; 0, the due day must be before (today minus that many UTC days).
 */
export function taskOverdueUtcCutoff(now: Date = new Date(), graceDays?: number | null): Date {
  const grace = graceDays != null && graceDays > 0 ? Math.floor(graceDays) : 0;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - grace, 0, 0, 0, 0));
}

/**
 * Plain-language description of a task's recorded due date. A due date is a
 * calendar day, not an instant — the editor is a plain date input — so
 * rendering it through the viewer's local timezone can shift the day by one:
 * a due date of Sept 15 reads as "Sept 14" on any phone west of UTC. This
 * formats and compares the same UTC calendar day the value was recorded as,
 * so a task due later today is never mislabeled and never called "past".
 * Pure: no clock beyond `now`, no write.
 */
export function describeTaskDueDate(
  dueAt: string | Date | null | undefined,
  now: Date = new Date()
): TaskDueDateDescription | null {
  if (!dueAt) return null;
  const parsed = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return null;

  const delta = utcDayNumber(parsed) - utcDayNumber(now);
  const timing: TaskDueTiming = delta < 0 ? "past" : delta === 0 ? "today" : "upcoming";
  return {
    policyVersion: TASK_DUE_DATE_POLICY_VERSION,
    timing,
    label: utcDateLabel.format(parsed)
  };
}
