import type { SocialShowHint } from "./caption-facts";

export const SOCIAL_SHOW_NOT_RECORDED =
  "That show is not on this band. Pick a recorded show or leave it blank.";

export type RecordedSocialEvent = {
  title: string;
  startsAt?: Date | string | null | undefined;
  locationName?: string | null | undefined;
};

/** Map a recorded BandEvent to caption facts. Never invents a ticket URL. */
export function recordedSocialShowFromEvent(
  event: RecordedSocialEvent | null | undefined
): SocialShowHint | null {
  if (!event) return null;
  const name = event.title.trim();
  if (!name) return null;
  const startsAt = recordedShowStartsAt(event.startsAt);
  const place = event.locationName?.trim() || undefined;
  return {
    name,
    ...(startsAt ? { startsAt } : {}),
    ...(place ? { place } : {})
  };
}

/**
 * Show facts for a drop come only from a recorded artist event.
 * A missing eventId is fine. A client-supplied show object is not a source.
 */
export function resolveRecordedSocialShow(input: {
  eventId?: string | null | undefined;
  event: RecordedSocialEvent | null | undefined;
}): SocialShowHint | null {
  const eventId = input.eventId?.trim();
  if (!eventId) return null;
  const show = recordedSocialShowFromEvent(input.event);
  if (!show) {
    throw new Error(SOCIAL_SHOW_NOT_RECORDED);
  }
  return show;
}

function recordedShowStartsAt(value: Date | string | null | undefined): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  return undefined;
}
