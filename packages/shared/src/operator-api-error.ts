/**
 * Turn a Nest (or other JSON) error body into an operator-facing sentence.
 * Raw JSON, HTML, and empty bodies fail closed to a short fallback so a
 * fail-close 400 is readable instead of dumped as transport text.
 */
export function operatorApiErrorMessage(body: string, fallback: string): string {
  const trimmed = body.trim();
  if (!trimmed) return fallback;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    const fromJson = messageFromUnknown(parsed);
    if (fromJson) return fromJson;
  } catch {
    /* not JSON */
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("<")) {
    return fallback;
  }
  return trimmed.length > 500 ? `${trimmed.slice(0, 497)}...` : trimmed;
}

function messageFromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return parts.length ? parts.join(" ") : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as { message?: unknown; error?: unknown };
  const fromMessage = messageFromUnknown(record.message);
  if (fromMessage) return fromMessage;
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  return null;
}
