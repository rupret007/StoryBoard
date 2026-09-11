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
