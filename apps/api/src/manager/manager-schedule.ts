export type ManagerScheduleCadence = "daily" | "weekly";

export type ManagerScheduleSlot = {
  cadence: ManagerScheduleCadence;
  due: boolean;
  localDate: string;
  localHour: number;
  localWeekday: number;
  periodKey: string;
};

const WEEKDAY_NUMBER: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7
};

function localParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const weekday = WEEKDAY_NUMBER[get("weekday") ?? ""];
  if (![year, month, day, hour, weekday].every(Number.isInteger)) {
    throw new Error("Could not resolve the Manager schedule timezone");
  }
  return { year, month, day, hour, weekday: weekday! };
}

function isoWeekKey(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

export function managerScheduleSlot(input: {
  now: Date;
  timezone: string;
  cadence: ManagerScheduleCadence;
  dailyHour: number;
  weeklyDay: number;
}): ManagerScheduleSlot {
  const local = localParts(input.now, input.timezone);
  const localDate = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  const timeHasArrived = local.hour >= input.dailyHour;
  const due = input.cadence === "daily"
    ? timeHasArrived
    : local.weekday > input.weeklyDay || (local.weekday === input.weeklyDay && timeHasArrived);
  return {
    cadence: input.cadence,
    due,
    localDate,
    localHour: local.hour,
    localWeekday: local.weekday,
    periodKey: input.cadence === "daily"
      ? `daily:${localDate}`
      : `weekly:${isoWeekKey(local.year, local.month, local.day)}`
  };
}

export function managerScheduleKey(artistId: string, slot: ManagerScheduleSlot) {
  return `${artistId}:${slot.periodKey}`;
}
