import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "sb_session";

export type SessionPayloadV1 = {
  v: 1;
  operatorId: string;
  currentArtistId: string | null;
  iat: number;
  exp: number;
};

export function signSessionPayload(
  payload: SessionPayloadV1,
  secret: string
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionPayload(
  token: string | undefined,
  secret: string
): SessionPayloadV1 | null {
  if (!token?.includes(".")) {
    return null;
  }
  const dot = token.indexOf(".");
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  try {
    if (
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  let parsed: SessionPayloadV1;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    parsed?.v !== 1 ||
    typeof parsed.operatorId !== "string" ||
    !parsed.operatorId.trim()
  ) {
    return null;
  }
  if (parsed.currentArtistId !== null && typeof parsed.currentArtistId !== "string") {
    return null;
  }
  if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) {
    return null;
  }
  return parsed;
}

export function readSessionFromCookieHeader(
  cookieHeader: string | undefined,
  secret: string
): SessionPayloadV1 | null {
  if (!cookieHeader?.trim()) {
    return null;
  }
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = p.slice(0, eq).trim();
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }
    const val = decodeURIComponent(p.slice(eq + 1).trim());
    return verifySessionPayload(val, secret);
  }
  return null;
}
