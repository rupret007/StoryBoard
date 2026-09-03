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
    title: "Bluebird",
    startsAt: "2026-09-03T17:00:00.000Z",
    endsAt: "2026-09-03T20:00:00.000Z",
    timezone: "America/Chicago",
    locationName: "Bluebird Cafe",
    setlistId: "set-a",
    liveSetlistItemId: null,
    ...overrides
  };
}

function setlist(overrides = {}) {
  return {
    id: "set-a",
    name: "Friday set",
    sourceKey: "vault:default_live",
    items: [
      { id: "item-1", itemType: "song", song: { title: "Opener", durationSeconds: 180, musicalKey: "G", leadVocalist: "Morgan" } },
      { id: "item-2", itemType: "break", label: "Tune" },
      { id: "item-3", itemType: "song", song: { title: "Closer", durationSeconds: null, musicalKey: "A", leadVocalist: "Alex" }, transitionNotes: "Hold the last hit" }
    ],
    ...overrides
  };
}

test("live phase requires a recorded end; started-with-no-end is overdue", () => {
  assert.equal(shared.opsLivePhaseForEvent(gig(), now), "live");
  assert.equal(shared.opsLivePhaseForEvent(gig({ endsAt: null }), now), "overdue");
  assert.equal(shared.opsLivePhaseForEvent(gig({ startsAt: "2026-09-10T01:00:00.000Z" }), now), "upcoming");
  assert.equal(shared.opsLivePhaseForEvent(gig({ status: "completed" }), now), "closed");
  assert.equal(shared.opsLivePhaseForEvent(gig({ type: "rehearsal" }), now), "none");
});

test("does not substitute another set or invent the current song from time", () => {
  const missing = shared.projectOpsLiveRun({
    event: gig({ setlistId: "set-missing" }),
    setlist: setlist(),
    now
  });
  assert.equal(missing.policyVersion, "ops_live_run_v1");
  assert.equal(missing.set.availability, "missing_record");
  assert.equal(missing.set.name, null);
  assert.equal(missing.set.items.length, 0);
  assert.equal(missing.set.currentItemId, null);

  const other = shared.projectOpsLiveRun({
    event: gig({ liveSetlistItemId: "item-other" }),
    setlist: setlist(),
    now
  });
  assert.equal(other.set.availability, "ok");
  assert.equal(other.set.currentItemId, null);
  assert.equal(other.set.nextItemId, "item-1");
  assert.equal(other.set.items.every((item) => item.state === "unstarted"), true);
});

test("explicit cursor marks played, current, and later without guessing duration", () => {
  const run = shared.projectOpsLiveRun({
    event: gig({ liveSetlistItemId: "item-1" }),
    setlist: setlist(),
    now
  });

  assert.equal(run.phase, "live");
  assert.equal(run.set.currentItemId, "item-1");
  assert.equal(run.set.currentTitle, "Opener");
  assert.equal(run.set.nextItemId, "item-2");
  assert.equal(run.set.nextTitle, "Tune");
  assert.equal(run.set.items[0].state, "current");
  assert.equal(run.set.items[0].musicalKey, "G");
  assert.equal(run.set.items[0].durationLabel, "3:00");
  assert.equal(run.set.items[1].state, "later");
  assert.equal(run.set.items[2].durationLabel, null);
  assert.equal(run.wrapUp.available, true);
});

test("assigned empty set is empty, not a substitute, and Prisma dates still resolve live", () => {
  const empty = shared.projectOpsLiveRun({
    event: gig(),
    setlist: setlist({ items: [] }),
    now
  });
  assert.equal(empty.set.availability, "empty");
  assert.equal(empty.set.currentItemId, null);
  assert.equal(empty.set.items.length, 0);

  const fromDates = shared.projectOpsLiveRun({
    event: gig({
      startsAt: new Date("2026-09-03T17:00:00.000Z"),
      endsAt: new Date("2026-09-03T20:00:00.000Z")
    }),
    setlist: setlist(),
    now
  });
  assert.equal(fromDates.phase, "live");
  assert.equal(fromDates.startsAt, "2026-09-03T17:00:00.000Z");
  assert.equal(fromDates.wrapUp.available, true);
});

test("upcoming gigs keep after-show facts closed until the recorded start", () => {
  const upcoming = shared.projectOpsLiveRun({
    event: gig({ startsAt: "2026-09-10T01:00:00.000Z", endsAt: "2026-09-10T04:00:00.000Z", liveSetlistItemId: null }),
    setlist: setlist(),
    now
  });
  assert.equal(upcoming.phase, "upcoming");
  assert.equal(upcoming.wrapUp.available, false);
  assert.match(upcoming.wrapUp.reason, /until this recorded gig has started/i);
  assert.equal(upcoming.set.nextItemId, "item-1");
});
