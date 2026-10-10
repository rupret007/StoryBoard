/**
 * App-shell /auth/me outcomes. 401 stays a sign-in gate; every other failure
 * (API down, 5xx, network) is a recoverable unreachable state so operators
 * are not thrown into the workspace error page and looped back to Dashboard.
 */
export type AppAuthLoadKind = "ready" | "sign_in" | "unreachable";

export const APP_AUTH_UNREACHABLE_TITLE = "StoryBoard is unreachable";

export const APP_AUTH_SAVED_RECORDS_COPY =
  "Check your connection, then try again. Saved band records are kept. If a save was interrupted, check the record before submitting it again.";

export function isUnauthorizedAppAuthError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "ApiHttpError" &&
    "status" in error &&
    (error as { status: unknown }).status === 401
  );
}

export function classifyAppAuthLoadError(error: unknown): "sign_in" | "unreachable" {
  return isUnauthorizedAppAuthError(error) ? "sign_in" : "unreachable";
}

export function resolveAppAuthLoad(
  result: { ok: true } | { ok: false; error: unknown }
): AppAuthLoadKind {
  if (result.ok) return "ready";
  return classifyAppAuthLoadError(result.error);
}
