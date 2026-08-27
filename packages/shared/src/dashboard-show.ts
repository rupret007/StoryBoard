export type DashboardRecordedGig = {
  id: string;
  type: string;
  status: string;
  startsAt?: string | null;
};

const ACTIVE_GIG_STATUSES = new Set(["draft", "hold", "confirmed"]);

/**
 * Select the nearest dated gig that is still an active record.
 *
 * The dashboard deliberately does not promote rehearsals, completed/cancelled
 * events, undated records, or invalid dates into a supposed "next show".
 * Drafts and holds remain eligible but retain their visible status in the UI.
 */
export function selectNextRecordedGig<T extends DashboardRecordedGig>(
  events: T[],
  now = new Date()
): T | null {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return null;

  const candidates = events.flatMap((event) => {
    if (
      event.type !== "gig" ||
      !ACTIVE_GIG_STATUSES.has(event.status) ||
      !event.startsAt
    ) {
      return [];
    }
    const startsAtMs = Date.parse(event.startsAt);
    return Number.isFinite(startsAtMs) && startsAtMs >= nowMs
      ? [{ event, startsAtMs }]
      : [];
  });

  candidates.sort((left, right) => {
    if (left.startsAtMs !== right.startsAtMs) {
      return left.startsAtMs - right.startsAtMs;
    }
    return left.event.id < right.event.id
      ? -1
      : left.event.id > right.event.id
        ? 1
        : 0;
  });

  return candidates[0]?.event ?? null;
}
