import { NO_AUTO_PITCH_COPY } from "./operator-copy";

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

/** Person-shaped stage-review chrome. Every branch interpolates NO_AUTO_PITCH_COPY. */
export function bookingStageReviewCopy(stage: string): string {
  if (stage === "confirmed") {
    return `Record confirmed only after the booker has confirmed. This creates a linked internal gig if one is missing, using the recorded title, venue, and target date. Existing gig details stay as saved. Fees and conditions remain booking notes; this does not create a contract, payment, Calendar hold, or message. ${NO_AUTO_PITCH_COPY}.`;
  }
  if (stage === "closed") {
    return `When you are ready, closing ends this opportunity's pipeline history. It does not cancel an existing gig or send a message. ${NO_AUTO_PITCH_COPY}.`;
  }
  return `When you are ready, this records the stage only. ${NO_AUTO_PITCH_COPY}.`;
}
