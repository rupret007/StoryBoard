import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

const now = new Date("2026-09-03T18:00:00.000Z");

function gig(overrides = {}) {
  return {
    id: "gig-a",
    type: "gig",
    status: "confirmed",
    title: "Last Friday",
    startsAt: "2026-08-28T01:00:00.000Z",
    endsAt: "2026-08-28T04:00:00.000Z",
    attendance: null,
    grossRevenueMinor: null,
    postShowNotes: null,
    relationshipOutcome: null,
    settlement: null,
    ...overrides
  };
}

test("after-show facts stay unknown until at least one recorded value exists", () => {
  assert.equal(shared.afterShowFactsRecorded(gig()), false);
  assert.equal(shared.afterShowFactsRecorded(gig({ postShowNotes: "   " })), false);
  assert.equal(shared.afterShowFactsRecorded(gig({ attendance: 0 })), true);
  assert.equal(shared.afterShowFactsRecorded(gig({ postShowNotes: "Late house" })), true);
  assert.equal(shared.OPS_AFTER_SHOW_POLICY_VERSION, "ops_after_show_v1");
});

test("after-show writes stay closed until a recorded gig has started", () => {
  assert.equal(shared.afterShowWriteAllowed(gig({ type: "rehearsal" }), now).allowed, false);
  assert.equal(shared.afterShowWriteAllowed(gig({ startsAt: null }), now).allowed, false);
  assert.equal(shared.afterShowWriteAllowed(gig({ startsAt: "2026-09-10T01:00:00.000Z" }), now).allowed, false);
  assert.match(shared.afterShowWriteAllowed(gig({ startsAt: "2026-09-10T01:00:00.000Z" }), now).reason, /until this recorded gig has started/i);
  assert.equal(shared.afterShowWriteAllowed(gig(), now).allowed, true);
  assert.equal(shared.afterShowWriteAllowed(gig({ status: "completed", startsAt: null }), now).allowed, true);
});

test("recorded wrap-up hands off to draft settlement without closing the gig", () => {
  const unrecorded = shared.afterShowNextAction({ event: gig(), now });
  assert.equal(unrecorded, null);

  const recorded = shared.afterShowNextAction({
    event: gig({ attendance: 142, grossRevenueMinor: 35000 }),
    now
  });
  assert.equal(recorded?.code, "after_show_settlement");
  assert.equal(recorded?.tab, "deals");
  assert.equal(recorded?.focus, "money");
  assert.equal(recorded?.href, "/operations?tab=deals&event=gig-a&focus=money");
  assert.match(recorded?.nextAction ?? "", /will not invent net or close the gig/i);

  const draft = shared.afterShowNextAction({
    event: gig({ attendance: 142, settlement: { id: "set-a", status: "draft" } }),
    now
  });
  assert.equal(draft?.code, "finalize_settlement");
  assert.match(draft?.nextAction ?? "", /will not close the gig automatically/i);

  const settled = shared.afterShowNextAction({
    event: gig({ attendance: 142, settlement: { id: "set-a", status: "finalized" } }),
    now
  });
  assert.equal(settled?.code, "after_show_recorded");
  assert.equal(settled?.href, "/operations/events/gig-a");
  assert.match(settled?.nextAction ?? "", /will not close it automatically/i);
});

test("event PATCH refuses after-show fields and the dedicated schema requires a version receipt", () => {
  assert.equal(shared.eventPatchSchema.safeParse({ attendance: 140 }).success, false);
  assert.equal(shared.eventPatchSchema.safeParse({ postShowNotes: "Wiped" }).success, false);
  assert.equal(shared.eventAfterShowPatchSchema.safeParse({
    attendance: 140,
    grossRevenueMinor: 100000,
    postShowNotes: "Strong room",
    relationshipOutcome: "Invited back"
  }).success, false);
  assert.equal(shared.eventAfterShowPatchSchema.safeParse({
    expectedUpdatedAt: "2026-09-03T18:00:00.000Z",
    attendance: 140,
    grossRevenueMinor: 100000,
    postShowNotes: "Strong room",
    relationshipOutcome: "Invited back"
  }).success, true);
});
