import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("ops next action never auto-pitches Travis and names the existing workspace", () => {
  const target = shared.bookingStageNextAction("target");
  assert.equal(target.policyVersion, "ops_next_action_v1");
  assert.match(target.nextAction, /Travis books/i);
  assert.match(target.nextAction, /will not pitch/i);
  assert.equal(target.href, "/booking");

  const outreach = shared.bookingStageNextAction("outreach");
  assert.match(outreach.nextAction, /will not auto-pitch/i);
  assert.equal(outreach.href, "/booking-campaigns");

  const hold = shared.bookingStageNextAction("hold");
  assert.match(hold.nextAction, /Confirming creates a gig/);
});

test("event readiness next action points at the existing attach or duration surface", () => {
  const missing = shared.eventReadinessNextAction("event-a", [
    { code: "setlist_missing", nextAction: "Attach a practical setlist and confirm its total duration." }
  ]);
  assert.equal(missing?.tab, "events");
  assert.equal(missing?.focus, "setlist");
  assert.equal(missing?.href, "/operations?tab=events&event=event-a&focus=setlist");

  const timing = shared.eventReadinessNextAction("event-a", [
    { code: "setlist_duration_incomplete", nextAction: "Record every song duration before relying on the set length." }
  ]);
  assert.equal(timing?.tab, "music");
  assert.equal(timing?.href, "/operations?tab=music");

  const deposit = shared.eventReadinessNextAction("event-a", [
    { code: "deposit_unpaid", nextAction: "Verify payment, record it, or prepare a reviewed reminder." }
  ]);
  assert.equal(deposit?.tab, "deals");
  assert.equal(deposit?.focus, "money");
});

test("invoice payment next action refuses voided rows and uses recorded balance", () => {
  const voided = shared.invoicePaymentNextAction({
    id: "inv-a",
    status: "voided",
    totalMinor: 10000,
    paidMinor: 0
  });
  assert.equal(voided.canRecordPayment, false);
  assert.match(voided.nextAction, /immutable/i);

  const open = shared.invoicePaymentNextAction({
    id: "inv-b",
    status: "issued",
    totalMinor: 50000,
    paidMinor: 10000
  });
  assert.equal(open.canRecordPayment, true);
  assert.equal(open.balanceMinor, 40000);
  assert.match(open.nextAction, /remaining balance/);

  const paid = shared.invoicePaymentNextAction({
    id: "inv-c",
    status: "paid",
    totalMinor: 50000,
    paidMinor: 50000
  });
  assert.equal(paid.canRecordPayment, false);
  assert.match(paid.nextAction, /No further payment action/);
});

test("settlement next action distinguishes draft finalize from a missing completed-show draft", () => {
  const finalize = shared.settlementWorkspaceNextAction({
    events: [{ id: "show-a", type: "gig", status: "completed", title: "Friday" }],
    settlements: [{ id: "set-a", status: "draft", event: { id: "show-a", title: "Friday" } }]
  });
  assert.equal(finalize?.code, "finalize_settlement");
  assert.match(finalize?.nextAction ?? "", /freezes matching event expenses/);

  const create = shared.settlementWorkspaceNextAction({
    events: [{ id: "show-b", type: "gig", status: "completed", title: "Saturday", settlement: null }],
    settlements: []
  });
  assert.equal(create?.code, "create_settlement");
  assert.match(create?.nextAction ?? "", /does not finalize/);

  const rehearsal = shared.settlementWorkspaceNextAction({
    events: [{ id: "reh", type: "rehearsal", status: "completed", title: "Practice" }],
    settlements: []
  });
  assert.equal(rehearsal, null);
});

test("booking reply next action keeps apply-then-confirm order without pitching", () => {
  const apply = shared.bookingReplyNextAction({
    analyzedAt: "2026-09-03T00:00:00.000Z",
    termsAppliedAt: null,
    recommendedNextAction: "Send the hold confirmation after Travis reviews the fee.",
    recipient: { opportunity: { id: "opp-a" } }
  });
  assert.equal(apply.code, "apply_terms");
  assert.match(apply.nextAction, /Travis reviews the fee/);

  const confirm = shared.bookingReplyNextAction({
    analyzedAt: "2026-09-03T00:00:00.000Z",
    termsAppliedAt: "2026-09-03T00:01:00.000Z",
    recommendedNextAction: "Confirm it",
    recipient: { opportunity: { id: "opp-a" } }
  });
  assert.equal(confirm.code, "confirm_booking");
  assert.equal(confirm.href, "/approvals");
  assert.match(confirm.nextAction, /will not pitch/);
});
