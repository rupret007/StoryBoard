import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { deterministicManagerChat, managerQuestionNeedsRecordedDeskAnswer } = require("../dist/manager/manager-intelligence.js");
const empty = { artist: { id: "fixture", name: "Fixture band" }, profile: null, members: [], goals: [], goalMeasurements: [], initiatives: [], tasks: [], opportunities: [], events: [], projects: [], deals: [], invoices: [], decisions: [], approvals: [], bookingReplies: [], campaignRecipients: [], prospects: [], settlements: [], recommendationHistory: [], songs: [], setlists: [] };
const now = new Date("2026-09-24T20:00:00Z");
const pitch = "Draft a venue pitch pack from records only";
const decision = "What needs a Travis decision next?";

test("pitch-pack-missing-booking-fails-closed", () => {
  const result = deterministicManagerChat(empty, pitch, now);
  assert.match(result.answer, /Pitch pack blocked: no open booking opportunity/);
  assert.equal(result.recommendation, null);
  assert.deepEqual(result.citations, []);
  assert.equal(managerQuestionNeedsRecordedDeskAnswer(pitch), true);
});

test("travis-decision-missing-records-does-not-invent-work", () => {
  const result = deterministicManagerChat(empty, decision, now);
  assert.match(result.answer, /No open booking or follow-up decision is supported/);
  assert.match(result.answer, /Travis owns booking/);
  assert.equal(result.recommendation, null);
  assert.equal(managerQuestionNeedsRecordedDeskAnswer(decision), true);
});

const song = { id: "song", title: "Fixture Vault title", active: true, sourceKey: "vault:catalog_import_v1:fixture" };
const opportunity = { id: "booking", title: "Fixture booking", stage: "hold", targetDate: new Date("2026-09-25T00:00:00Z"), packRecords: { venue: { id: "venue", name: "Fixture venue", city: "Fixture city" }, setlist: { id: "set", name: "Fixture set", status: "draft", items: [{ itemType: "song", song }] } } };
const factsFor = (record) => ({ ...empty, opportunities: [record] });
for (const [name, patch, expected] of [
  ["missing-venue", { packRecords: { ...opportunity.packRecords, venue: null } }, /missing linked venue name\/city/],
  ["missing-date", { targetDate: null }, /missing booking target date/],
  ["invalid-date", { targetDate: new Date("bad") }, /missing booking target date/],
  ["missing-setlist", { packRecords: { ...opportunity.packRecords, setlist: null } }, /missing linked nonempty setlist/],
  ["empty-setlist", { packRecords: { ...opportunity.packRecords, setlist: { ...opportunity.packRecords.setlist, items: [] } } }, /missing linked nonempty setlist/],
  ["non-vault-song", { packRecords: { ...opportunity.packRecords, setlist: { ...opportunity.packRecords.setlist, items: [{ itemType: "song", song: { ...song, sourceKey: "manual" } }] } } }, /active Vault provenance/],
  ["inactive-vault-song", { packRecords: { ...opportunity.packRecords, setlist: { ...opportunity.packRecords.setlist, items: [{ itemType: "song", song: { ...song, active: false } }] } } }, /active Vault provenance/],
  ["deleted-song", { packRecords: { ...opportunity.packRecords, setlist: { ...opportunity.packRecords.setlist, items: [{ itemType: "song", song: null }] } } }, /active Vault provenance/]
]) test(`pitch-pack-${name}-blocks-without-borrowing-catalog`, () => {
  const result = deterministicManagerChat({ ...factsFor({ ...opportunity, ...patch }), songs: [song], setlists: [{ id: "unrelated", name: "Unrelated ready set", itemCount: 3 }] }, pitch, now);
  assert.match(result.answer, /Pitch pack blocked/);
  assert.match(result.answer, expected);
  assert.doesNotMatch(result.answer, /Fixture Vault title|Unrelated ready set/);
  assert.equal(result.recommendation, null);
});

test("pitch-pack-recorded-running-order-without-invented-times-or-write", () => {
  const facts = factsFor(opportunity);
  const before = JSON.stringify(facts);
  const result = deterministicManagerChat(facts, pitch, now);
  assert.match(result.answer, /Venue pitch pack — draft for Travis review/);
  for (const value of ["Fixture booking", "Fixture venue", "Fixture city", "Fixture set", "Fixture Vault title", "UTC calendar day"]) assert.ok(result.answer.includes(value));
  assert.match(result.answer, /not a confirmed show time/);
  assert.equal(result.recommendation, null);
  assert.deepEqual(result.citations, ["booking", "venue", "set", "song"]);
  assert.equal(JSON.stringify(facts), before);
});

test("pitch-pack-ambiguous-and-unknown-target-never-substitute", () => {
  const facts = { ...empty, opportunities: [opportunity, { ...opportunity, id: "other", title: "Other booking" }] };
  assert.match(deterministicManagerChat(facts, pitch, now).answer, /multiple open opportunities/);
  assert.match(deterministicManagerChat(facts, "Draft a venue pitch pack for Missing venue from records only", now).answer, /requested booking\/venue is not uniquely recorded/);
  assert.match(deterministicManagerChat(facts, "Draft a venue pitch pack for Fixture booking from records only", now).answer, /Venue pitch pack — draft/);
});

test("travis-follow-up-missing-link-blocks-and-does-not-borrow-booking", () => {
  const facts = { ...factsFor(opportunity), campaignRecipients: [{ id: "recipient", status: "sent", opportunityId: "missing", followUpDueAt: null, followUpTaskId: null }] };
  const result = deterministicManagerChat(facts, decision, now);
  assert.match(result.answer, /due not recorded/);
  assert.match(result.answer, /linked open booking opportunity is missing/);
  assert.doesNotMatch(result.answer, /Fixture booking/);
  assert.equal(result.recommendation, null);
});

test("travis-follow-up-calendar-today-is-not-overdue-and-remains-human-owned", () => {
  const facts = { ...factsFor(opportunity), campaignRecipients: [{ id: "recipient", status: "sent", opportunityId: opportunity.id, followUpDueAt: new Date("2026-09-24T00:00:00Z"), followUpTaskId: null }] };
  const result = deterministicManagerChat(facts, decision, now);
  assert.match(result.answer, /today/);
  assert.doesNotMatch(result.answer, /overdue/);
  assert.match(result.answer, /Travis owns booking and follow-ups/);
  assert.deepEqual(result.citations, ["recipient", "booking"]);
  assert.equal(result.recommendation, null);
});

test("travis-follow-up-missing-deadline-blocks-preparation", () => {
  const result = deterministicManagerChat({ ...factsFor(opportunity), campaignRecipients: [{ id: "recipient", status: "sent", opportunityId: opportunity.id, followUpDueAt: null, followUpTaskId: null }] }, decision, now);
  assert.match(result.answer, /Preparation blocked: missing follow-up due date/);
});

test("pitch-pack-confirmed-booking-retains-recorded-stage", () => {
  const result = deterministicManagerChat(factsFor({ ...opportunity, stage: "confirmed" }), pitch, now);
  assert.match(result.answer, /Venue pitch pack — draft/);
  assert.match(result.answer, /\(confirmed\)/);
});

const { bookingPackRecordsForArtist, recordedBookingDesk } = require("../dist/manager/manager-booking-desk.js");
const linked = { venueId: "venue", venue: { ...opportunity.packRecords.venue, artistId: "fixture" }, event: { artistId: "fixture", venueId: "venue", status: "confirmed", setlist: { ...opportunity.packRecords.setlist, artistId: "fixture", items: [{ itemType: "song", song: { ...song, artistId: "fixture" } }] } } };
for (const path of ["venue", "event", "setlist", "song", "event-venue", "cancelled-event"]) test(`pitch-pack-${path}-link-isolation-fails-closed`, () => {
  const record = structuredClone(linked);
  if (path === "venue") record.venue.artistId = "other";
  if (path === "event") record.event.artistId = "other";
  if (path === "setlist") record.event.setlist.artistId = "other";
  if (path === "song") record.event.setlist.items[0].song.artistId = "other";
  if (path === "event-venue") record.event.venueId = "other";
  if (path === "cancelled-event") record.event.status = "cancelled";
  const packRecords = bookingPackRecordsForArtist("fixture", record);
  const result = deterministicManagerChat(factsFor({ ...opportunity, packRecords }), pitch, now);
  assert.match(result.answer, /Pitch pack blocked/);
  assert.doesNotMatch(result.answer, /Fixture Vault title/);
});
test("pitch-pack-same-artist-projection-preserves-only-recorded-fields", () => {
  assert.deepEqual(bookingPackRecordsForArtist("fixture", linked), opportunity.packRecords);
});

test("pitch-pack-null-venue-id-does-not-link-venue-less-event-setlist", () => {
  const record = structuredClone(linked);
  record.venueId = null;
  record.venue = null;
  record.event.venueId = null;
  const packRecords = bookingPackRecordsForArtist("fixture", record);
  assert.equal(packRecords.venue, null);
  assert.equal(packRecords.setlist, null);
  const result = deterministicManagerChat(factsFor({ ...opportunity, packRecords }), pitch, now);
  assert.match(result.answer, /Pitch pack blocked/);
  assert.match(result.answer, /missing linked venue name\/city/);
});

test("travis-decision-earliest-target-date-and-tie-break-ordering", () => {
  const datedEarly = { ...opportunity, id: "booking-early", title: "Early dated", targetDate: new Date("2026-09-20T00:00:00Z") };
  const datedLate = { ...opportunity, id: "booking-late", title: "Late dated", targetDate: new Date("2026-09-30T00:00:00Z") };
  const invalidDate = { ...opportunity, id: "booking-invalid", title: "Invalid date", targetDate: new Date("bad") };
  const undatedA = { ...opportunity, id: "booking-a", title: "Undated A", targetDate: null };
  const undatedB = { ...opportunity, id: "booking-b", title: "Undated B", targetDate: null };
  const byTarget = deterministicManagerChat({ ...empty, opportunities: [datedLate, datedEarly, invalidDate, undatedB, undatedA] }, decision, now);
  assert.match(byTarget.answer, /Next Travis review by earliest recorded target date/);
  assert.match(byTarget.answer, /Early dated/);
  assert.equal(byTarget.citations[0], "booking-early");

  const followUps = [
    { id: "recipient-late", status: "sent", opportunityId: datedEarly.id, followUpDueAt: new Date("2026-10-01T00:00:00Z"), followUpTaskId: null },
    { id: "recipient-early", status: "sent", opportunityId: datedLate.id, followUpDueAt: new Date("2026-09-15T00:00:00Z"), followUpTaskId: null },
    { id: "recipient-undated-b", status: "sent", opportunityId: undatedA.id, followUpDueAt: null, followUpTaskId: null },
    { id: "recipient-undated-a", status: "sent", opportunityId: undatedB.id, followUpDueAt: null, followUpTaskId: null }
  ];
  const byFollowUp = deterministicManagerChat({ ...empty, opportunities: [datedEarly, datedLate, undatedA, undatedB], campaignRecipients: followUps }, decision, now);
  assert.match(byFollowUp.answer, /Next Travis decision/);
  assert.match(byFollowUp.answer, /Late dated/);
  assert.deepEqual(byFollowUp.citations.slice(0, 2), ["recipient-early", "booking-late"]);

  const invalidFollowUpFacts = {
    ...empty,
    opportunities: [datedEarly],
    campaignRecipients: [
      { id: "recipient-invalid", status: "sent", opportunityId: datedEarly.id, followUpDueAt: new Date("bad"), followUpTaskId: null },
      { id: "recipient-dated", status: "sent", opportunityId: datedEarly.id, followUpDueAt: new Date("2026-09-18T00:00:00Z"), followUpTaskId: null }
    ]
  };
  const invalidFollowUp = recordedBookingDesk(invalidFollowUpFacts, decision, now);
  assert.match(invalidFollowUp.answer, /Next Travis decision/);
  assert.equal(invalidFollowUp.citations[0], "recipient-dated");
});

test("travis-follow-up-completed-task-excluded", () => {
  const facts = {
    ...factsFor(opportunity),
    tasks: [{ id: "follow-task", title: "Follow up", status: "done", dueAt: null, initiativeId: null }],
    campaignRecipients: [
      { id: "open-recipient", status: "sent", opportunityId: opportunity.id, followUpDueAt: new Date("2026-10-01T00:00:00Z"), followUpTaskId: null },
      { id: "done-recipient", status: "sent", opportunityId: opportunity.id, followUpDueAt: new Date("2026-09-10T00:00:00Z"), followUpTaskId: "follow-task" }
    ]
  };
  const result = deterministicManagerChat(facts, decision, now);
  assert.match(result.answer, /Next Travis decision/);
  assert.match(result.answer, /open-recipient|Fixture booking/);
  assert.doesNotMatch(result.answer, /done-recipient/);
});

test("pitch-pack-external-action-and-write-claim-refusal", () => {
  const facts = factsFor(opportunity);
  for (const question of [
    "Email the venue pitch pack for Fixture booking",
    "Send the venue pitch pack now",
    "Confirm the booking for Travis next"
  ]) {
    const result = deterministicManagerChat(facts, question, now);
    assert.doesNotMatch(result.answer, /Venue pitch pack — draft for Travis review/);
    assert.doesNotMatch(result.answer, /Next Travis decision/);
    assert.ok(/won't send|did not book anyone/i.test(result.answer));
    assert.equal(result.recommendation, null);
  }
});

test("pitch-pack-unknown-target-prefix-and-reviewer-suffix", () => {
  const facts = factsFor(opportunity);
  assert.match(deterministicManagerChat(facts, "Draft a Missing venue pitch pack", now).answer, /requested booking\/venue is not uniquely recorded/);
  assert.match(deterministicManagerChat(facts, "Draft a venue pitch pack for Travis review", now).answer, /Venue pitch pack — draft for Travis review/);
});

test("pitch-pack-target-with-travis-review-suffix-preserves-target", () => {
  const facts = factsFor(opportunity);
  const result = deterministicManagerChat(
    facts,
    "Draft a venue pitch pack for Fixture booking for Travis review",
    now
  );
  assert.match(result.answer, /Venue pitch pack — draft for Travis review/);
  assert.match(result.answer, /Fixture booking/);
  assert.match(result.answer, /Fixture Vault title/);
});

test("pitch-pack-prefix-target-with-travis-review-suffix-preserves-target", () => {
  const facts = factsFor(opportunity);
  assert.match(
    deterministicManagerChat(facts, "Draft a Missing venue pitch pack for Travis review", now).answer,
    /requested booking\/venue is not uniquely recorded/
  );
  const multi = {
    ...empty,
    opportunities: [opportunity, { ...opportunity, id: "other", title: "Other booking" }]
  };
  const result = deterministicManagerChat(
    multi,
    "Draft a Fixture booking venue pitch pack for Travis review",
    now
  );
  assert.match(result.answer, /Venue pitch pack — draft for Travis review/);
  assert.match(result.answer, /Fixture booking/);
  assert.doesNotMatch(result.answer, /multiple open opportunities/);
});

test("venue-pack-vs-recorded-pitch-pack-routing", () => {
  const herman = {
    id: "opp-hm",
    title: "Herman Marshall Tasting Room (Wylie)",
    stage: "target",
    targetDate: null,
    packRecords: { venue: null, setlist: null }
  };
  const facts = { ...empty, opportunities: [herman] };
  const venuePack = deterministicManagerChat(facts, "Venue pack for Herman Marshall", now);
  assert.match(venuePack.answer, /Package summary for Herman Marshall Tasting Room/);
  assert.match(venuePack.answer, /info@hmwhiskey\.com/);
  assert.doesNotMatch(venuePack.answer, /Pitch pack blocked/);

  const pitchPack = deterministicManagerChat(
    facts,
    "Draft a venue pitch pack for Herman Marshall from records only",
    now
  );
  assert.match(pitchPack.answer, /Pitch pack blocked/);
  assert.doesNotMatch(pitchPack.answer, /Package summary/);
});

test("pitch-pack-named-unparsed-and-conflicting-targets-never-substitute", () => {
  const threeLinks = {
    ...opportunity,
    id: "three-links",
    title: "Three Links",
    packRecords: { ...opportunity.packRecords, venue: { id: "three-venue", name: "Three Links", city: "Fixture city" } }
  };
  const other = { ...opportunity, id: "other", title: "Other booking", packRecords: { ...opportunity.packRecords, venue: { id: "other-venue", name: "Other venue", city: "Fixture city" } } };
  const onlyOther = factsFor(other);
  const both = { ...empty, opportunities: [threeLinks, other] };
  const blocked = /Pitch pack blocked/;
  const packaged = /Venue pitch pack — draft/;
  for (const [question, facts] of [
    ["Draft a Three Links pitch pack", onlyOther],
    ["Draft a Three Links pitch package from records only", onlyOther],
    ["Show me the Three Links pitch pack", onlyOther],
    ["Pitch pack about Three Links", onlyOther],
    ["Draft a Three Links venue pitch pack at Other venue", both],
    ["Draft a Three Links venue pitch pack at Other venue", onlyOther],
    ["Draft a Fixture booking venue pitch pack at Fixture venue", factsFor(opportunity)],
    ["Draft a venue pitch pack for", onlyOther],
    ["Draft a venue pitch pack at", onlyOther],
    ["Draft a \"\" pitch pack", onlyOther],
    ["Draft a venue pitch pack for \"\"", onlyOther],
    ["Draft a venue pitch pack for ...", onlyOther],
    ["Draft a !!! pitch pack", onlyOther]
  ]) {
    const result = deterministicManagerChat(facts, question, now);
    assert.match(result.answer, blocked, question);
    assert.doesNotMatch(result.answer, packaged, question);
    assert.doesNotMatch(result.answer, /Other booking/, question);
    assert.equal(result.recommendation, null, question);
    assert.deepEqual(result.citations, [], question);
  }

  for (const question of [
    "Draft a Three Links pitch pack",
    "Draft a Three Links pitch pack for Travis review",
    "Draft a Three Links pitch package from records only",
    "Draft a venue pitch pack for Three Links from records only",
    "Show me the Three Links pitch pack"
  ]) {
    const named = deterministicManagerChat(both, question, now);
    assert.match(named.answer, packaged, question);
    assert.match(named.answer, /Booking: “Three Links”/, question);
    assert.doesNotMatch(named.answer, /Other booking/, question);
    assert.equal(named.citations[0], "three-links", question);
  }

  const byVenue = deterministicManagerChat(both, "Draft a venue pitch pack for Other venue", now);
  assert.match(byVenue.answer, /Other booking/);
  assert.doesNotMatch(byVenue.answer, /Three Links/);

  const byId = deterministicManagerChat(both, "Draft a venue pitch pack for three-links", now);
  assert.match(byId.answer, /Booking: “Three Links”/);
  assert.doesNotMatch(byId.answer, /Other booking/);

  const agreed = deterministicManagerChat(factsFor(opportunity), "Draft a Fixture booking venue pitch pack for Fixture booking", now);
  assert.match(agreed.answer, packaged);
  assert.match(agreed.answer, /Fixture booking/);

  const polite = deterministicManagerChat(factsFor(opportunity), "Can you draft a venue pitch pack", now);
  assert.match(polite.answer, packaged);
  assert.match(polite.answer, /Fixture booking/);

  const shared = { ...opportunity, id: "shared-b", title: "Second shared", packRecords: { ...opportunity.packRecords, venue: { ...opportunity.packRecords.venue, id: "shared-venue-b", name: "Shared Room" } } };
  const firstShared = { ...opportunity, id: "shared-a", title: "First shared", packRecords: { ...opportunity.packRecords, venue: { ...opportunity.packRecords.venue, id: "shared-venue-a", name: "Shared Room" } } };
  const ambiguous = deterministicManagerChat({ ...empty, opportunities: [firstShared, shared] }, "Draft a venue pitch pack for Shared Room", now);
  assert.match(ambiguous.answer, /multiple open opportunities/);
  assert.doesNotMatch(ambiguous.answer, packaged);
  assert.doesNotMatch(ambiguous.answer, /First shared|Second shared/);

  const theRoom = { ...opportunity, id: "the-room", title: "The Room" };
  const article = deterministicManagerChat(factsFor(theRoom), "Draft a venue pitch pack for The Room", now);
  assert.match(article.answer, /The Room/);
  const collapsed = deterministicManagerChat(factsFor(opportunity), "Draft a venue pitch pack for   Fixture    booking  ", now);
  assert.match(collapsed.answer, packaged);

  const exactTitle = "N".repeat(240);
  const longBooking = { ...opportunity, id: "long-booking", title: exactTitle };
  const atLimit = deterministicManagerChat(factsFor(longBooking), `Draft a venue pitch pack for ${exactTitle}`, now);
  assert.match(atLimit.answer, packaged);
  assert.ok(atLimit.answer.includes(exactTitle));
  const overLimit = deterministicManagerChat({ ...empty, opportunities: [longBooking, other] }, `Draft a venue pitch pack for ${"N".repeat(241)}`, now);
  assert.match(overLimit.answer, /malformed|not a single exact name/);
  assert.doesNotMatch(overLimit.answer, packaged);
  assert.doesNotMatch(overLimit.answer, /Other booking/);
  assert.equal(overLimit.answer.includes(exactTitle), false);
});

test("pitch-pack-citations-capped-at-ten", () => {
  const songs = Array.from({ length: 10 }, (_, index) => ({
    id: `song-${index}`,
    title: `Vault song ${index}`,
    active: true,
    sourceKey: "vault:catalog_import_v1:fixture"
  }));
  const setlist = {
    id: "large-set",
    name: "Large set",
    status: "draft",
    items: songs.map((item) => ({ itemType: "song", song: item }))
  };
  const facts = factsFor({ ...opportunity, packRecords: { ...opportunity.packRecords, setlist } });
  const result = deterministicManagerChat(facts, pitch, now);
  assert.equal(result.citations.length, 10);
  assert.ok(result.citations.includes("booking"));
  assert.ok(result.citations.includes("venue"));
  assert.ok(result.citations.includes("large-set"));
});
