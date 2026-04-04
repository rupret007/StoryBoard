/**
 * Telegram deep-links pass the start payload as text: "/start <payload>" (payload may be absent).
 */
export function parseTelegramStartPayload(messageText: string | undefined): string | null {
  if (typeof messageText !== "string") {
    return null;
  }
  const trimmed = messageText.trim();
  const m = trimmed.match(/^\/start(?:\s+(\S+))?/i);
  const payload = m?.[1];
  return payload && payload.length > 0 ? payload : null;
}
