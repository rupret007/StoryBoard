const DAY_MS = 24 * 60 * 60 * 1000;

export const SHOW_ADVANCE_VERSION = "show_advance_v1";

const template = [
  { key: "terms_contacts", daysBefore: 30, title: "Confirm agreement, deposit, and primary contacts" },
  { key: "production_travel", daysBefore: 14, title: "Confirm production, hospitality, parking, and travel" },
  { key: "lineup_setlist_schedule", daysBefore: 7, title: "Confirm member availability, setlist, and day-of schedule" },
  { key: "final_readiness", daysBefore: 1, title: "Run final show-day readiness check" }
] as const;

export type ShowAdvanceTaskSpec = {
  key: string;
  title: string;
  dueAt: Date;
};

export function showAdvanceTaskSpecs(startsAt: Date): ShowAdvanceTaskSpec[] {
  return template.map((item) => ({
    key: item.key,
    title: item.title,
    dueAt: new Date(startsAt.getTime() - item.daysBefore * DAY_MS)
  }));
}

export function showAdvanceSourceKey(eventId: string, key: string) {
  return `${SHOW_ADVANCE_VERSION}:${eventId}:${key}`;
}
