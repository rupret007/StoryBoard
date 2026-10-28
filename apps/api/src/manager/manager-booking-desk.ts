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
  const packPhrase = /\b(?:pitch|venue)\s+(?:pitch\s+)?pack(?:age)?\b/i.test(question);
  if (!packPhrase) return false;
  const fromRecords = /\bfrom records only\b/i.test(question);
  const hasPitch = /\bpitch\b/i.test(question);
  // Plain "venue pack" targets DFW registry packaging; recorded pitch packs require "pitch" or "from records only".
  if (!hasPitch && !fromRecords && /\bvenue\s+pack\b/i.test(question)) return false;
  return true;
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
function finiteTime(date: Date | null | undefined) {
  return date && Number.isFinite(date.getTime()) ? date.getTime() : Infinity;
}
const MAX_PITCH_TARGET_LENGTH = 240;
const PACK_PHRASE = /\b(?:pitch|venue)\s+(?:pitch\s+)?pack(?:age)?\b/i;

type PitchPackTarget = { kind: "unspecified" } | { kind: "exact"; value: string } | { kind: "rejected" };

// Suffixes are whole whitespace-delimited tokens. A glued tail such as "FooTravis review" must stay intact.
const REVIEWER_SUFFIX = /(?:^|\s)(?:for\s+)?travis(?:['’ʼ]s|['’ʼ])?\s+(?:review|decision)$/i;
const RECORDS_SUFFIX = /(?:^|\s)from\s+records\s+only$/i;

function normalizePitchQuestion(question: string) {
  let value = question.replace(/\s+/g, " ").trim();
  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(/[?.!]+$/g, "").trim();
    value = value.replace(REVIEWER_SUFFIX, "").trim();
    value = value.replace(RECORDS_SUFFIX, "").trim();
  }
  return value;
}

const RESERVED_PITCH_TARGET = /^(?:a|an|the|venue|pitch|pack|package|records|recorded)$/i;
const MATCHING_QUOTE: Readonly<Record<string, string>> = { '"': '"', "'": "'", "“": "”", "‘": "’" };
const QUOTE_CHARS = new Set([...Object.keys(MATCHING_QUOTE), ...Object.values(MATCHING_QUOTE)]);

function isApostropheBetweenAlphanumerics(text: readonly string[], index: number) {
  const ch = text[index] ?? "";
  if (ch !== "'" && ch !== "’" && ch !== "ʼ") return false;
  let previous = index - 1;
  // A combining mark belongs to its preceding base; it is not itself a word.
  while (previous >= 0 && /\p{M}/u.test(text[previous] ?? "")) previous -= 1;
  return /[\p{L}\p{N}]/u.test(text[previous] ?? "") && /[\p{L}\p{N}]/u.test(text[index + 1] ?? "");
}

function hasLooseQuote(text: string, wrapperOpen?: string) {
  const wrapperClose = wrapperOpen ? MATCHING_QUOTE[wrapperOpen] : undefined;
  const characters = [...text];
  return characters.some((ch, index) => {
    if (!QUOTE_CHARS.has(ch)) return false;
    if (wrapperOpen && (ch === wrapperOpen || ch === wrapperClose)) return true;
    return !isApostropheBetweenAlphanumerics(characters, index);
  });
}

// One matching pair may wrap a target. A missing, extra, or mismatched quote is malformed and must not be peeled off.
function unwrapQuotedTarget(raw: string): { kind: "rejected" } | { kind: "text"; value: string } {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return { kind: "rejected" };
  const first = trimmed[0]!;
  const last = trimmed[trimmed.length - 1]!;
  if (QUOTE_CHARS.has(first) || QUOTE_CHARS.has(last)) {
    const expected = MATCHING_QUOTE[first];
    if (!expected || trimmed.length < 2 || last !== expected) return { kind: "rejected" };
    const inner = trimmed.slice(1, -1);
    if (hasLooseQuote(inner, first)) return { kind: "rejected" };
    return { kind: "text", value: inner };
  }
  if (hasLooseQuote(trimmed)) return { kind: "rejected" };
  return { kind: "text", value: trimmed };
}

function classifyPitchTarget(raw: string): { kind: "absent" } | { kind: "rejected" } | { kind: "exact"; value: string } {
  if (!raw.trim()) return { kind: "absent" };
  const unwrapped = unwrapQuotedTarget(raw);
  if (unwrapped.kind === "rejected") return { kind: "rejected" };
  const value = unwrapped.value.trim().replace(/\s+/g, " ");
  // Keep punctuation inside a quoted literal as part of its exact identity.
  // Only the reserved-token guard uses a punctuation-stripped stem.
  const reservedStem = value.replace(/[?.!]+$/g, "").trim();
  // A present unusable slot must never become "no target" and select the sole booking.
  if (!value || !reservedStem || RESERVED_PITCH_TARGET.test(reservedStem)) return { kind: "rejected" };
  if (value.length > MAX_PITCH_TARGET_LENGTH || !/^[\p{L}\p{N}]/u.test(value)) return { kind: "rejected" };
  return { kind: "exact", value };
}

function leadingPitchName(before: string) {
  // trim() removes the space after a lone article ("Draft a "), so the article must also match at end-of-string.
  // Otherwise that article is left behind and a later reserved-token check treats an untargeted request as a target.
  let text = before.trim();
  const command = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:draft|prepare|make|build|create|give|get|show|pack)\s+(?:me\s+)?(?:(?:a|an|the)\b(?:\s+|$))?/i;
  const commandMatch = command.exec(text);
  text = commandMatch?.index === 0 ? text.slice(commandMatch[0].length) : text.replace(/^(?:please\s+)?(?:a|an|the)\b(?:\s+|$)/i, "");
  return text.trim();
}

// A pitch-pack question with no name still means "the one open booking".
// A present slot that is empty, reserved, malformed, conflicting, or not one exact name must not fall through to that booking.
function resolvePitchPackTarget(question: string): PitchPackTarget {
  const working = normalizePitchQuestion(question);
  const pack = PACK_PHRASE.exec(working);
  if (!pack) return { kind: "rejected" };
  const names: string[] = [];
  let rejected = false;
  const add = (raw: string) => {
    const classified = classifyPitchTarget(raw);
    if (classified.kind === "rejected") rejected = true;
    if (classified.kind === "exact") names.push(classified.value);
  };
  add(leadingPitchName(working.slice(0, pack.index)));
  const after = working.slice(pack.index + pack[0].length).trim();
  if (after) {
    const trailing = after.match(/^(?:for|at)\b(?:\s+([\s\S]*))?$/i);
    if (!trailing || !trailing[1]?.trim()) rejected = true;
    else add(trailing[1]);
  }
  if (rejected) return { kind: "rejected" };
  const distinct = [...new Set(names.map((name) => name.toLowerCase()))];
  if (distinct.length > 1) return { kind: "rejected" };
  if (distinct.length === 1) return { kind: "exact", value: names.find((name) => name.toLowerCase() === distinct[0]) ?? names[0]! };
  return { kind: "unspecified" };
}

export function recordedBookingDesk(facts: ManagerFacts, question: string, now: Date): ManagerChatResult | null {
  const pack = managerQuestionAsksForBookingPack(question);
  if (!pack && !managerQuestionAsksForTravisDecision(question)) return null;
  const result = (answer: string, citations: string[] = []): ManagerChatResult => ({ answer: `${answer}\n\n${boundary}`, citations: [...new Set(citations)].slice(0, 10), recommendation: null });
  const opportunities = facts.opportunities.filter((item) => openStages.has(item.stage) || (pack && item.stage === "confirmed"));
  if (pack) {
    // A named target must resolve to one exact recorded booking. An unparsed or conflicting name never falls back to another booking.
    const target = resolvePitchPackTarget(question);
    if (target.kind === "rejected") return result("Pitch pack blocked: the booking or venue target is missing, conflicting, malformed, ambiguous, or not a single exact name. No substitute booking was chosen.");
    const requested = target.kind === "exact" ? target.value : null;
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
    .sort((a, b) => finiteTime(a.followUpDueAt) - finiteTime(b.followUpDueAt) || a.id.localeCompare(b.id));
  if (followUps.length) {
    const followUp = followUps[0]!;
    const opportunity = opportunities.find((item) => item.id === followUp.opportunityId);
    if (!opportunity) return result(`Next Travis review: follow-up ${followUp.id}, due ${targetDate(followUp.followUpDueAt, now)}. Preparation blocked: a linked open booking opportunity is missing from this view. Verify its Booking record before choosing any outreach.`, [followUp.id]);
    const missing = gaps(opportunity);
    if (!describeTaskDueDate(followUp.followUpDueAt, now)) missing.unshift("follow-up due date");
    return result(`Next Travis decision: review the recorded follow-up for “${opportunity.title}”, due ${targetDate(followUp.followUpDueAt, now)}. Decide whether to prepare a reviewed follow-up or defer it in Booking.${missing.length ? ` Preparation blocked: missing ${missing.join("; ")}.` : " The linked venue and Vault setlist support preparing a pitch pack for review."}`, [followUp.id, opportunity.id]);
  }
  const opportunity = [...opportunities].sort((a, b) => finiteTime(a.targetDate) - finiteTime(b.targetDate) || a.id.localeCompare(b.id))[0];
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
    setlist: event?.artistId === artistId && Boolean(opportunity.venueId) && event.venueId === opportunity.venueId && ["draft", "hold", "confirmed"].includes(event.status) && event.setlist?.artistId === artistId
      ? { id: event.setlist.id, name: event.setlist.name, status: event.setlist.status, items: event.setlist.items.map((item) => ({
        itemType: item.itemType,
        song: item.song?.artistId === artistId ? { id: item.song.id, title: item.song.title, active: item.song.active, sourceKey: item.song.sourceKey } : null
      })) } : null
  };
}
