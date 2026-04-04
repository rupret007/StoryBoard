/** Single OAuth connection per artist; used for Gmail + Calendar + Drive readiness. */
export const GOOGLE_CONNECTION_PROVIDER = "google" as const;

/** Scopes requested during StoryBoard Google connect (phase 2B). */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file"
].join(" ");

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
export const CALENDAR_EVENTS_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** `granted === null` means env fallback: assume token has required scopes. */
export function scopeAllows(
  granted: string[] | null | undefined,
  required: string
): boolean {
  if (granted == null) {
    return true;
  }
  return granted.includes(required);
}
