export const COMMAND_HELPER_COPY =
  "Ask in plain words; risky work creates an approval row — nothing sends silently.";

export const NO_AUTO_PITCH_COPY =
  "StoryBoard will not send a pitch; a person still books";

export const TEAM_INVITE_HEADING = "Invite a bandmate";

export const TEAM_ROLE_HINTS = {
  owner: { label: "Owner", hint: "Full control of this band workspace." },
  member: { label: "Member", hint: "Changes shows, tasks, and booking records." },
  viewer: { label: "Viewer", hint: "Sees the records; cannot change them." }
} as const;

export type TeamInviteRole = keyof typeof TEAM_ROLE_HINTS;

/**
 * Accept a raw invite token or a pasted onboarding URL that carries `invite`.
 * Unknown shapes stay as trimmed text so the API can still reject them.
 */
export function parseInviteInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("invite")?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    // Relative paths and bare tokens are handled below.
  }
  const queryMatch = trimmed.match(/[?&]invite=([^&#]+)/i);
  if (queryMatch?.[1]) {
    try {
      return decodeURIComponent(queryMatch[1]).trim();
    } catch {
      return queryMatch[1].trim();
    }
  }
  return trimmed;
}

export function countHintWords(value: string): number {
  return value
    .replace(/[.,;:!?]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}
