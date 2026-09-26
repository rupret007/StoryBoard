import { describeTaskDueDate } from "@storyboard/shared";
import type { ManagerChatResult, ManagerFacts } from "./manager-intelligence";

// Read-only packaging. No action proposal, provider, campaign, or CRM write capability.
export type BookingPackRecords = {
  venue: { id: string; name: string; city: string } | null;
  setlist: { id: string; name: string; status: string; items: {
    itemType: string;
    song: { id: string; title: string; active: boolean; sourceKey: string | null } | null;
  }[] } | null;
};
const boundary = "Travis owns booking and follow-ups. Prepare for Travis review only; no auto-pitch, outbound email/SMS, CRM mutation, or social post.";
const openStages = new Set(["target", "outreach", "conversation", "offer", "hold"]);

export function managerQuestionAsksForBookingPack(question: string) {
  return /\b(?:pitch|venue)\s+(?:pitch\s+)?pack(?:age)?\b/i.test(question);
}
export function managerQuestionAsksForTravisDecision(question: string) {
  return /\btravis\b/i.test(question) && /\b(decisions?|decide|next|follow[- ]?ups?)\b/i.test(question);
}

function gaps(opportunity: ManagerFacts["opportunities"][number]) {
  const records = opportunity.packRecords;
  const missing: string[] = [];
  if (!opportunity.title.trim()) missing.push("booking title");
  if (!records?.venue?.name.trim() || !records.venue.city.trim()) missing.push("linked venue name/city");
  if (!opportunity.targetDate || !Number.isFinite(opportunity.targetDate.getTime())) missing.push("booking target date");
  const setlist = records?.setlist;
  if (!setlist?.name.trim() || !setlist.items.some((item) => item.itemType === "song")) missing.push("linked nonempty setlist");
  else if (setlist.items.some((item) => item.itemType === "song" && (!item.song?.active || !item.song.title.trim() || !item.song.sourceKey?.startsWith("vault:")))) missing.push("active Vault provenance for every setlist song");
  return missing;
}
function targetDate(date: Date | null, now: Date) {
  const due = describeTaskDueDate(date, now);
  return due ? `${due.label}, ${date!.getUTCFullYear()} (UTC calendar day; ${due.timing})` : "not recorded";
}

export function recordedBookingDesk(facts: ManagerFacts, question: string, now: Date): ManagerChatResult | null {
  const pack = managerQuestionAsksForBookingPack(question);
  if (!pack && !managerQuestionAsksForTravisDecision(question)) return null;
  const result = (answer: string, citations: string[] = []): ManagerChatResult => ({ answer: `${answer}\n\n${boundary}`, citations: [...new Set(citations)], recommendation: null });
  const opportunities = facts.opportunities.filter((item) => openStages.has(item.stage) || (pack && item.stage === "confirmed"));
  if (pack) {
    // A target suffix must resolve exactly; never silently replace an unknown venue.
    const requested = question.match(/\b(?:for|at)\s+(.+?)(?:\s+from records only)?[?.!]*$/i)?.[1]?.trim().replace(/^["“]|["”]$/g, "");
    const matches = requested ? opportunities.filter((item) => [item.id, item.title, item.packRecords?.venue?.name].some((value) => value?.toLowerCase() === requested.toLowerCase())) : opportunities;
    if (!matches.length) return result(requested
      ? "Pitch pack blocked: the requested booking/venue is not uniquely recorded in the open booking view. Open Booking and select a recorded opportunity; no substitute was chosen."
      : "Pitch pack blocked: no open booking opportunity is recorded in this view. Record the booking and linked venue in Booking, and a setlist from the existing local Vault catalog in Band operations.");
    if (matches.length !== 1) return result("Pitch pack blocked: multiple open opportunities match. Ask for one exact booking title or ID from Booking; no venue or setlist was chosen.");
    const opportunity = matches[0]!;
    const missing = gaps(opportunity);
    if (missing.length) return result(`Pitch pack blocked for “${opportunity.title}”: missing ${missing.join("; ")}. Record these facts in Booking / Band operations, then ask again. Reuse the local Vault catalog; never substitute another setlist or invent songs.`, [opportunity.id]);
    const records = opportunity.packRecords!;
    const setlist = records.setlist!;
    const songs = setlist.items.filter((item) => item.itemType === "song").map((item) => item.song!);
    return result(`Venue pitch pack — draft for Travis review\nBooking: “${opportunity.title}” (${opportunity.stage}).\nVenue: ${records.venue!.name}, ${records.venue!.city}.\nProposed target: ${targetDate(opportunity.targetDate, now)}; this is not a confirmed show time.\nSetlist: “${setlist.name}” (${setlist.status}), linked through the booking's event.\nRecorded Vault songs in running order: ${songs.map((song) => `“${song.title}”`).join(", ")}.\nReview checkpoint: Travis must review the current booking, venue, target date, and repertoire before using this internal pack. Fees, availability, buyer interest, and performance times are not asserted by this pack.`, [opportunity.id, records.venue!.id, setlist.id, ...songs.map((song) => song.id)]);
  }
  const followUps = facts.campaignRecipients.filter((item) => ["drafted", "sent"].includes(item.status))
    .filter((item) => !item.followUpTaskId || facts.tasks.find((task) => task.id === item.followUpTaskId)?.status !== "done")
    .sort((a, b) => (a.followUpDueAt?.getTime() ?? Infinity) - (b.followUpDueAt?.getTime() ?? Infinity) || a.id.localeCompare(b.id));
  if (followUps.length) {
    const followUp = followUps[0]!;
    const opportunity = opportunities.find((item) => item.id === followUp.opportunityId);
    if (!opportunity) return result(`Next Travis review: follow-up ${followUp.id}, due ${targetDate(followUp.followUpDueAt, now)}. Preparation blocked: a linked open booking opportunity is missing from this view. Verify its Booking record before choosing any outreach.`, [followUp.id]);
    const missing = gaps(opportunity);
    if (!describeTaskDueDate(followUp.followUpDueAt, now)) missing.unshift("follow-up due date");
    return result(`Next Travis decision: review the recorded follow-up for “${opportunity.title}”, due ${targetDate(followUp.followUpDueAt, now)}. Decide whether to prepare a reviewed follow-up or defer it in Booking.${missing.length ? ` Preparation blocked: missing ${missing.join("; ")}.` : " The linked venue and Vault setlist support preparing a pitch pack for review."}`, [followUp.id, opportunity.id]);
  }
  const opportunity = [...opportunities].sort((a, b) => (a.targetDate?.getTime() ?? Infinity) - (b.targetDate?.getTime() ?? Infinity) || a.id.localeCompare(b.id))[0];
  if (!opportunity) return result("No open booking or follow-up decision is supported by the records in this view. Check Booking for missing records; this does not establish that Travis has no work.");
  const missing = gaps(opportunity);
  return result(`Next Travis review by earliest recorded target date: “${opportunity.title}” (${opportunity.stage}), target ${targetDate(opportunity.targetDate, now)}. No follow-up deadline is inferred from that date.${missing.length ? ` Preparation blocked: missing ${missing.join("; ")}.` : " Decide whether to prepare a venue pitch pack from these records."}`, [opportunity.id]);
}

// Reject historical cross-artist or mismatched event links before facts enter chat.
export function bookingPackRecordsForArtist(artistId: string, opportunity: {
  venueId: string | null;
  venue: (NonNullable<BookingPackRecords["venue"]> & { artistId: string }) | null;
  event: { artistId: string; venueId: string | null; status: string; setlist: {
    id: string; artistId: string; name: string; status: string;
    items: { itemType: string; song: (NonNullable<NonNullable<BookingPackRecords["setlist"]>["items"][number]["song"]> & { artistId: string }) | null }[];
  } | null } | null;
}): BookingPackRecords {
  const { venue, event } = opportunity;
  return {
    venue: venue?.artistId === artistId ? { id: venue.id, name: venue.name, city: venue.city } : null,
    setlist: event?.artistId === artistId && event.venueId === opportunity.venueId && ["draft", "hold", "confirmed"].includes(event.status) && event.setlist?.artistId === artistId
      ? { id: event.setlist.id, name: event.setlist.name, status: event.setlist.status, items: event.setlist.items.map((item) => ({
        itemType: item.itemType,
        song: item.song?.artistId === artistId ? { id: item.song.id, title: item.song.title, active: item.song.active, sourceKey: item.song.sourceKey } : null
      })) } : null
  };
}
