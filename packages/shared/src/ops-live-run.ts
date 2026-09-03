import { formatSetlistDuration, summarizeSetlist, type SetlistSummary, type SetlistSummaryItem } from "./setlist-summary";
import { selectLiveOrNextOpsGig, type OpsShowPhase } from "./ops-show-control";

export const OPS_LIVE_RUN_POLICY_VERSION = "ops_live_run_v1" as const;

export type OpsLivePhase = Extract<OpsShowPhase, "live" | "upcoming" | "overdue"> | "closed" | "none";
export type OpsLiveSetAvailability = "ok" | "unassigned" | "missing_record" | "empty";
export type OpsLiveSetItemState = "unstarted" | "played" | "current" | "later";

export type OpsLiveRunEvent = {
  id: string;
  type: string;
  status: string;
  title: string;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  timezone?: string | null;
  venue?: { name?: string | null } | null;
  locationName?: string | null;
  setlistId?: string | null;
  liveSetlistItemId?: string | null;
  attendance?: number | null;
  grossRevenueMinor?: number | null;
  postShowNotes?: string | null;
  relationshipOutcome?: string | null;
};

export type OpsLiveRunSetlistItem = {
  id: string;
  itemType?: string;
  label?: string | null;
  transitionNotes?: string | null;
  song?: {
    id?: string;
    title?: string | null;
    durationSeconds?: number | null;
    musicalKey?: string | null;
    leadVocalist?: string | null;
  } | null;
};

export type OpsLiveRunSetlist = {
  id: string;
  name: string;
  sourceKey?: string | null;
  items: OpsLiveRunSetlistItem[];
};

export type OpsLiveRunItem = {
  id: string;
  itemType: "song" | "break" | "note";
  title: string;
  musicalKey: string | null;
  leadVocalist: string | null;
  durationSeconds: number | null;
  durationLabel: string | null;
  transitionNotes: string | null;
  state: OpsLiveSetItemState;
};

export type OpsLiveRun = {
  policyVersion: typeof OPS_LIVE_RUN_POLICY_VERSION;
  phase: OpsLivePhase;
  eventId: string;
  title: string;
  location: string | null;
  timezone: string | null;
  startsAt: string | null;
  endsAt: string | null;
  set: {
    availability: OpsLiveSetAvailability;
    setlistId: string | null;
    name: string | null;
    sourceKey: string | null;
    currentItemId: string | null;
    nextItemId: string | null;
    currentTitle: string | null;
    nextTitle: string | null;
    summary: SetlistSummary | null;
    items: OpsLiveRunItem[];
  };
  wrapUp: {
    available: boolean;
    reason: string;
  };
};

function instantMs(value?: string | Date | null): number | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function instantIso(value?: string | Date | null): string | null {
  const ms = instantMs(value);
  return ms == null ? null : new Date(ms).toISOString();
}

export function opsLivePhaseForEvent(event: OpsLiveRunEvent, now = new Date()): OpsLivePhase {
  if (["completed", "cancelled"].includes(event.status)) return "closed";
  const selected = selectLiveOrNextOpsGig([{
    ...event,
    startsAt: instantIso(event.startsAt),
    endsAt: instantIso(event.endsAt)
  }], now);
  if (!selected || selected.event.id !== event.id) return "none";
  return selected.phase;
}

function itemTypeOf(item: OpsLiveRunSetlistItem): OpsLiveRunItem["itemType"] {
  if (item.itemType === "break" || item.itemType === "note") return item.itemType;
  return "song";
}

function itemTitle(item: OpsLiveRunSetlistItem): string {
  return item.song?.title?.trim() || item.label?.trim() || itemTypeOf(item);
}

function toSummaryItem(item: OpsLiveRunSetlistItem): SetlistSummaryItem {
  const summary: SetlistSummaryItem = { id: item.id };
  if (item.itemType != null) summary.itemType = item.itemType;
  if (item.label !== undefined) summary.label = item.label;
  if (item.song === null) {
    summary.song = null;
  } else if (item.song) {
    const song: NonNullable<SetlistSummaryItem["song"]> = {};
    if (item.song.id !== undefined) song.id = item.song.id;
    if (item.song.title != null) song.title = item.song.title;
    if (item.song.durationSeconds !== undefined) song.durationSeconds = item.song.durationSeconds;
    summary.song = song;
  }
  return summary;
}

export function resolveAssignedLiveSet(input: {
  event: Pick<OpsLiveRunEvent, "setlistId">;
  setlist?: OpsLiveRunSetlist | null;
}): { availability: OpsLiveSetAvailability; setlist: OpsLiveRunSetlist | null } {
  if (!input.event.setlistId) return { availability: "unassigned", setlist: null };
  if (!input.setlist || input.setlist.id !== input.event.setlistId) {
    return { availability: "missing_record", setlist: null };
  }
  return { availability: "ok", setlist: input.setlist };
}

/**
 * Project the assigned running order. Current/next come only from an explicit
 * recorded cursor. Time is never used to invent which song is playing, and
 * another set is never substituted.
 */
export function projectOpsLiveRun(input: {
  event: OpsLiveRunEvent;
  setlist?: OpsLiveRunSetlist | null;
  now?: Date;
}): OpsLiveRun {
  const now = input.now ?? new Date();
  const phase = opsLivePhaseForEvent(input.event, now);
  const location = input.event.venue?.name?.trim() || input.event.locationName?.trim() || null;
  const assigned = resolveAssignedLiveSet(input);
  const items = assigned.setlist?.items ?? [];
  const currentIndex = input.event.liveSetlistItemId
    ? items.findIndex((item) => item.id === input.event.liveSetlistItemId)
    : -1;
  const currentItem = currentIndex >= 0 ? items[currentIndex] : null;
  const nextItem = currentIndex >= 0 ? items[currentIndex + 1] ?? null : items[0] ?? null;
  const started = currentIndex >= 0;
  const projectedItems: OpsLiveRunItem[] = items.map((item, index) => {
    const durationSeconds = Number.isInteger(item.song?.durationSeconds) && (item.song?.durationSeconds ?? 0) > 0
      ? item.song!.durationSeconds!
      : null;
    return {
      id: item.id,
      itemType: itemTypeOf(item),
      title: itemTitle(item),
      musicalKey: item.song?.musicalKey?.trim() || null,
      leadVocalist: item.song?.leadVocalist?.trim() || null,
      durationSeconds,
      durationLabel: durationSeconds != null ? formatSetlistDuration(durationSeconds) : null,
      transitionNotes: item.transitionNotes?.trim() || null,
      state: !started ? "unstarted" : index < currentIndex ? "played" : index === currentIndex ? "current" : "later"
    };
  });

  const startsAt = instantIso(input.event.startsAt);
  const endsAt = instantIso(input.event.endsAt);
  const startMs = instantMs(startsAt);
  const nowMs = now.getTime();
  const showHasStarted = startMs != null && Number.isFinite(nowMs) && startMs <= nowMs;
  const wrapAvailable = input.event.type === "gig" && (phase === "closed" || showHasStarted);

  return {
    policyVersion: OPS_LIVE_RUN_POLICY_VERSION,
    phase,
    eventId: input.event.id,
    title: input.event.title,
    location,
    timezone: input.event.timezone?.trim() || null,
    startsAt,
    endsAt,
    set: {
      availability: assigned.availability === "ok" && !items.length ? "empty" : assigned.availability,
      setlistId: input.event.setlistId ?? null,
      name: assigned.setlist?.name ?? null,
      sourceKey: assigned.setlist?.sourceKey ?? null,
      currentItemId: currentItem?.id ?? null,
      nextItemId: nextItem && nextItem.id !== currentItem?.id ? nextItem.id : null,
      currentTitle: currentItem ? itemTitle(currentItem) : null,
      nextTitle: nextItem && nextItem.id !== currentItem?.id ? itemTitle(nextItem) : null,
      summary: assigned.setlist ? summarizeSetlist(assigned.setlist.items.map(toSummaryItem)) : null,
      items: projectedItems
    },
    wrapUp: {
      available: wrapAvailable,
      reason: wrapAvailable
        ? "Record attendance, money, and lessons from this show. StoryBoard will not invent a result or close the gig for you."
        : phase === "upcoming"
          ? "After-show facts stay closed until this recorded gig has started."
          : "After-show facts apply to a recorded gig that has started or been closed."
    }
  };
}
