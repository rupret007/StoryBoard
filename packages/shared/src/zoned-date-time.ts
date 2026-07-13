export type DateTimeLocalErrorCode =
  | "invalid_instant"
  | "invalid_local_datetime"
  | "invalid_timezone"
  | "nonexistent_local_time"
  | "ambiguous_local_time";

export type DateTimeLocalResult =
  | { ok: true; value: string }
  | { ok: false; code: DateTimeLocalErrorCode; message: string };

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string) {
  const existing = FORMATTERS.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  FORMATTERS.set(timeZone, formatter);
  return formatter;
}

export function isValidIanaTimeZone(timeZone: string) {
  try {
    formatterFor(timeZone.trim());
    return Boolean(timeZone.trim());
  } catch {
    return false;
  }
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function formatParts(parts: DateTimeParts) {
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function utcEpoch(parts: DateTimeParts) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);
  return date.getTime();
}

function parseLocalDateTime(value: string): DateTimeParts | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const parts: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? "").padEnd(3, "0") || 0)
  };
  const roundTrip = new Date(utcEpoch(parts));
  if (
    parts.year < 1 ||
    roundTrip.getUTCFullYear() !== parts.year ||
    roundTrip.getUTCMonth() + 1 !== parts.month ||
    roundTrip.getUTCDate() !== parts.day ||
    roundTrip.getUTCHours() !== parts.hour ||
    roundTrip.getUTCMinutes() !== parts.minute ||
    roundTrip.getUTCSeconds() !== parts.second ||
    roundTrip.getUTCMilliseconds() !== parts.millisecond
  ) return null;
  return parts;
}

function partsInTimeZone(instant: number, formatter: Intl.DateTimeFormat): DateTimeParts {
  const values = new Map(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
    millisecond: 0
  };
}

function sameLocalTime(left: DateTimeParts, right: DateTimeParts) {
  return left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second;
}

function localDeviceParts(date: Date): DateTimeParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds()
  };
}

/**
 * Formats an absolute instant for a datetime-local control. When a timezone is
 * supplied, the displayed wall time belongs to that IANA zone. With no zone,
 * this deliberately retains the browser/device-local behavior.
 */
export function instantToDateTimeLocal(value: string | number | Date, timeZone?: string | null): DateTimeLocalResult {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false, code: "invalid_instant", message: "The saved date and time is invalid." };
  const zone = timeZone?.trim();
  if (!zone) return { ok: true, value: formatParts(localDeviceParts(date)) };
  try {
    return { ok: true, value: formatParts(partsInTimeZone(date.getTime(), formatterFor(zone))) };
  } catch {
    return { ok: false, code: "invalid_timezone", message: "Use a valid IANA timezone such as America/Chicago." };
  }
}

/**
 * Converts a datetime-local wall time into an ISO instant. IANA-zone inputs
 * fail closed during daylight-saving gaps and overlaps instead of silently
 * moving the time or choosing one of two possible instants. With no zone, the
 * browser/device parser is retained for backwards-compatible local behavior.
 */
export function dateTimeLocalToIso(value: string, timeZone?: string | null): DateTimeLocalResult {
  const local = parseLocalDateTime(value);
  if (!local) return { ok: false, code: "invalid_local_datetime", message: "Enter a valid local date and time." };
  const zone = timeZone?.trim();
  if (!zone) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? { ok: false, code: "invalid_local_datetime", message: "Enter a valid local date and time." }
      : { ok: true, value: date.toISOString() };
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = formatterFor(zone);
  } catch {
    return { ok: false, code: "invalid_timezone", message: "Use a valid IANA timezone such as America/Chicago." };
  }

  const wallTimeAsUtc = utcEpoch(local);
  const offsets = new Set<number>();
  const sixHours = 6 * 60 * 60 * 1000;
  for (let delta = -48 * 60 * 60 * 1000; delta <= 48 * 60 * 60 * 1000; delta += sixHours) {
    const sample = wallTimeAsUtc + delta;
    const sampleRoundedToSecond = Math.floor(sample / 1000) * 1000;
    offsets.add(utcEpoch(partsInTimeZone(sampleRoundedToSecond, formatter)) - sampleRoundedToSecond);
  }

  const matches = new Set<number>();
  for (const offset of offsets) {
    const candidate = wallTimeAsUtc - offset;
    if (sameLocalTime(partsInTimeZone(candidate, formatter), local)) matches.add(candidate);
  }
  if (matches.size === 0) {
    return {
      ok: false,
      code: "nonexistent_local_time",
      message: `That local time does not exist in ${zone} because the clock moves forward. Choose another time.`
    };
  }
  if (matches.size > 1) {
    return {
      ok: false,
      code: "ambiguous_local_time",
      message: `That local time occurs twice in ${zone} because the clock moves back. Choose another time.`
    };
  }
  return { ok: true, value: new Date([...matches][0]!).toISOString() };
}
