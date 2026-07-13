export const SETLIST_SUMMARY_POLICY_VERSION = "setlist_summary_v1" as const;

export type SetlistSummaryItem = {
  id?: string;
  itemType?: string;
  label?: string | null;
  song?: {
    id?: string;
    title?: string;
    durationSeconds?: number | null;
  } | null;
};

export type SetlistSummary = {
  policyVersion: typeof SETLIST_SUMMARY_POLICY_VERSION;
  itemCount: number;
  songCount: number;
  breakCount: number;
  noteCount: number;
  knownDurationSongCount: number;
  unknownDurationSongCount: number;
  totalSongDurationSeconds: number;
  timingStatus: "empty" | "incomplete" | "timed";
  durationLabel: string;
};

export function formatSetlistDuration(totalSeconds: number) {
  const bounded = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(bounded / 3600);
  const minutes = Math.floor((bounded % 3600) / 60);
  const seconds = bounded % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function summarizeSetlist(items: SetlistSummaryItem[]): SetlistSummary {
  const songItems = items.filter((item) => !["break", "note"].includes(item.itemType ?? "song"));
  const breakCount = items.filter((item) => item.itemType === "break").length;
  const noteCount = items.filter((item) => item.itemType === "note").length;
  const knownDurationSongCount = songItems.filter((item) => Number.isInteger(item.song?.durationSeconds) && (item.song?.durationSeconds ?? 0) > 0).length;
  const unknownDurationSongCount = songItems.length - knownDurationSongCount;
  const totalSongDurationSeconds = songItems.reduce((total, item) => {
    const duration = item.song?.durationSeconds;
    return total + (Number.isInteger(duration) && (duration ?? 0) > 0 ? duration! : 0);
  }, 0);
  const timingStatus = !songItems.length ? "empty" : unknownDurationSongCount ? "incomplete" : "timed";
  const knownDuration = formatSetlistDuration(totalSongDurationSeconds);
  const durationLabel = timingStatus === "empty"
    ? "No songs"
    : timingStatus === "timed"
      ? `${knownDuration} song time`
      : `${knownDuration} known + ${unknownDurationSongCount} song duration${unknownDurationSongCount === 1 ? "" : "s"} missing`;
  return {
    policyVersion: SETLIST_SUMMARY_POLICY_VERSION,
    itemCount: items.length,
    songCount: songItems.length,
    breakCount,
    noteCount,
    knownDurationSongCount,
    unknownDurationSongCount,
    totalSongDurationSeconds,
    timingStatus,
    durationLabel
  };
}
