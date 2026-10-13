export const INBOUND_WEBHOOK_PROVIDERS = ["telegram", "stripe"] as const;

export type InboundWebhookProvider = (typeof INBOUND_WEBHOOK_PROVIDERS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Telegram Bot API `Update.update_id` — unique per bot, reused on retries. */
export function telegramUpdateId(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const updateId = body.update_id;
  if (typeof updateId === "number" && Number.isInteger(updateId) && updateId >= 0) {
    return String(updateId);
  }
  if (typeof updateId === "string" && /^\d+$/.test(updateId)) {
    return updateId;
  }
  return null;
}

/** Stripe Event `id` (`evt_...`). */
export function stripeEventId(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const id = body.id;
  if (typeof id !== "string") {
    return null;
  }
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}
