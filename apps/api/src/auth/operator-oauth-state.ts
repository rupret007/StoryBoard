import { randomBytes, timingSafeEqual } from "crypto";

export const OPERATOR_OAUTH_STATE_COOKIE = "sb_operator_oauth_state";
export const OPERATOR_OAUTH_STATE_TTL_SECONDS = 10 * 60;

/** Create an opaque callback nonce; its value is only stored in an HttpOnly cookie. */
export function createOperatorOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/** Compare callback state without leaking partial-match timing information. */
export function operatorOAuthStateMatches(
  expected: string | undefined | null,
  provided: string | undefined | null
): boolean {
  if (!expected || !provided || expected.length !== provided.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}
