export const bookingStages = [
  "target", "outreach", "conversation", "offer", "hold", "confirmed", "closed"
] as const;

export type BookingStageValue = (typeof bookingStages)[number];

const transitions: Record<BookingStageValue, readonly BookingStageValue[]> = {
  target: ["outreach", "conversation", "offer", "hold", "confirmed", "closed"],
  outreach: ["conversation", "offer", "hold", "confirmed", "closed"],
  conversation: ["offer", "hold", "confirmed", "closed"],
  offer: ["hold", "confirmed", "closed"],
  hold: ["offer", "confirmed", "closed"],
  confirmed: ["closed"],
  closed: []
};

/** The same recorded-stage policy is used by the pipeline and its write boundary. */
export function nextBookingStages(stage: string): readonly BookingStageValue[] {
  return Object.hasOwn(transitions, stage) ? transitions[stage as BookingStageValue] : [];
}

export const BOOKING_STAGE_STALE_MESSAGE =
  "This opportunity changed after you reviewed it. Load the latest details and review the stage change again.";
