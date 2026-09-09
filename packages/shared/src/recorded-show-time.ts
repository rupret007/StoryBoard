// Display only: never reinterpret the saved instant using the device clock.
export function formatRecordedShowTime(startsAt?: string | null, timezone?: string | null) {
  if (!startsAt) return "Date not recorded";
  const instant = new Date(startsAt);
  if (!Number.isFinite(instant.getTime())) return "Recorded date is invalid";
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  };
  if (timezone) {
    try {
      return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).format(instant);
    } catch {
      return `${new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(instant)} · recorded timezone is invalid`;
    }
  }
  return `${new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(instant)} · timezone not recorded`;
}
