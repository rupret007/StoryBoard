import { bookingStages, type BookingStageValue } from "./booking-stage-review";

export const BOOKING_TARGET_POLICY_VERSION = "booking_target_v1" as const;

export type BookingTargetTiming = "none" | "past" | "today" | "upcoming";

export type BookingTargetDescription = {
  policyVersion: typeof BOOKING_TARGET_POLICY_VERSION;
  timing: BookingTargetTiming;
  /** Short UTC calendar label for a pipeline card, or a plain "no date" phrase. */
  label: string;
  /** Extra plain-language flag for a still-open deal, or null when nothing to add. */
  note: string | null;
};

/** Stages where a passed target date is a scheduling problem rather than history. */
const OPEN_STAGES: readonly BookingStageValue[] = [
  "target",
  "outreach",
  "conversation",
  "offer",
  "hold"
];

const utcLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC"
});

function utcDayNumber(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Plain-language description of an opportunity's recorded target date for the
 * booking pipeline board. Comparison is by UTC calendar day so a show later
 * the same day is never called "passed"; the framing matches the UTC target
 * date shown in the stage-change review. Pure: no clock beyond `now`, no write.
 */
export function describeBookingTarget(input: {
  targetDate: string | Date | null | undefined;
  stage: string;
  now?: Date;
}): BookingTargetDescription {
  const base = {
    policyVersion: BOOKING_TARGET_POLICY_VERSION
  } as const;

  const raw = input.targetDate;
  const parsed =
    raw instanceof Date
      ? raw
      : typeof raw === "string" && raw.trim()
        ? new Date(raw)
        : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { ...base, timing: "none", label: "No target date", note: null };
  }

  const now = input.now ?? new Date();
  const label = `Target ${utcLabel.format(parsed)} (UTC)`;
  const stageIsOpen = (bookingStages as readonly string[]).includes(input.stage)
    ? OPEN_STAGES.includes(input.stage as BookingStageValue)
    : true;

  const delta = utcDayNumber(parsed) - utcDayNumber(now);
  if (delta < 0) {
    return {
      ...base,
      timing: "past",
      label,
      note: stageIsOpen ? "Target date passed" : null
    };
  }
  if (delta === 0) {
    return {
      ...base,
      timing: "today",
      label,
      note: stageIsOpen ? "Target date is today" : null
    };
  }
  return { ...base, timing: "upcoming", label, note: null };
}
