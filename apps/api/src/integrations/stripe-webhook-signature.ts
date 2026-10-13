import { createHmac, timingSafeEqual } from "node:crypto";

export const STRIPE_WEBHOOK_SIGNATURE_TOLERANCE_SEC = 300;

export type StripeWebhookEvent = {
  id: string;
  type: string | null;
};

export type StripeSignatureResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing_secret"
        | "missing_payload"
        | "missing_signature"
        | "invalid_signature"
        | "timestamp_expired";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stripeEventId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value.id;
  if (typeof id !== "string") {
    return null;
  }
  const trimmed = id.trim();
  return /^evt_[A-Za-z0-9_]+$/.test(trimmed) ? trimmed : null;
}

export function stripeEventType(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const type = value.type;
  return typeof type === "string" && type.trim() ? type.trim() : null;
}

export function parseStripeEvent(payload: string): StripeWebhookEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
  const id = stripeEventId(parsed);
  if (!id) {
    return null;
  }
  return { id, type: stripeEventType(parsed) };
}

export function verifyStripeWebhookSignature(input: {
  payload: string | null | undefined;
  signatureHeader: string | null | undefined;
  secret: string | null | undefined;
  nowMs?: number;
  toleranceSec?: number;
}): StripeSignatureResult {
  const secret = input.secret?.trim() ?? "";
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }
  const payload = input.payload;
  if (typeof payload !== "string" || payload.length === 0) {
    return { ok: false, reason: "missing_payload" };
  }
  const header = input.signatureHeader?.trim() ?? "";
  if (!header) {
    return { ok: false, reason: "missing_signature" };
  }

  const parsed = parseStripeSignatureHeader(header);
  if (!parsed) {
    return { ok: false, reason: "invalid_signature" };
  }

  const toleranceSec = input.toleranceSec ?? STRIPE_WEBHOOK_SIGNATURE_TOLERANCE_SEC;
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - parsed.timestamp) > toleranceSec) {
    return { ok: false, reason: "timestamp_expired" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${parsed.timestamp}.${payload}`, "utf8")
    .digest("hex");
  const matched = parsed.signatures.some((signature) => timingSafeEqualHex(expected, signature));
  return matched ? { ok: true } : { ok: false, reason: "invalid_signature" };
}

function parseStripeSignatureHeader(
  header: string
): { timestamp: number; signatures: string[] } | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") {
      if (!/^\d+$/.test(value)) {
        return null;
      }
      timestamp = Number(value);
    } else if (key === "v1" && /^[a-f0-9]+$/i.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  if (timestamp === null || signatures.length === 0) {
    return null;
  }
  return { timestamp, signatures };
}

function timingSafeEqualHex(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length === 0 || expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
