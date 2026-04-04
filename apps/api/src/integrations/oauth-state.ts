import { createHmac, timingSafeEqual } from "crypto";

export type OAuthStatePayload = {
  artistId: string;
  issuedAt: number;
  operatorId: string;
};

export function signOAuthState(
  payload: OAuthStatePayload,
  secret: string
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyOAuthState(
  state: string | undefined,
  secret: string,
  maxAgeMs: number
): OAuthStatePayload | null {
  if (!state?.includes(".")) {
    return null;
  }
  const dot = state.indexOf(".");
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
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
  let parsed: OAuthStatePayload;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed.artistId !== "string" || !parsed.artistId.trim()) {
    return null;
  }
  if (typeof parsed.operatorId !== "string" || !parsed.operatorId.trim()) {
    return null;
  }
  if (
    typeof parsed.issuedAt !== "number" ||
    Date.now() - parsed.issuedAt > maxAgeMs
  ) {
    return null;
  }
  return parsed;
}
