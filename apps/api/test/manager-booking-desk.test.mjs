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

const { bookingPackRecordsForArtist } = require("../dist/manager/manager-booking-desk.js");
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
