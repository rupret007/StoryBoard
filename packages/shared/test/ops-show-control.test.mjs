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
    startsAt: "2026-09-10T01:00:00.000Z",
    endsAt: "2026-09-10T04:00:00.000Z",
    locationName: "Bluebird Cafe",
    setlistId: null,
    ...overrides
  };
}

function project(overrides = {}) {
  return shared.projectOpsShowControl({
    eventsAvailable: true,
    readinessAvailable: true,
    setlistsAvailable: true,
    bookingsAvailable: true,
    events: [],
    readiness: [],
    setlists: [],
    bookings: [],
    invoices: [],
    settlements: [],
    now,
    ...overrides
  });
}

test("selects a live recorded gig only when the end still covers now", () => {
  const live = shared.selectLiveOrNextOpsGig(
    [
      gig({
        id: "upcoming",
        title: "Later",
        startsAt: "2026-09-20T01:00:00.000Z",
        endsAt: "2026-09-20T04:00:00.000Z"
      }),
      gig({
        id: "on-stage",
        title: "Now",
        startsAt: "2026-09-03T17:00:00.000Z",
        endsAt: "2026-09-03T20:00:00.000Z"
      })
    ],
    now
  );

  assert.equal(live?.event.id, "on-stage");
  assert.equal(live?.phase, "live");
});

test("does not invent live from a started gig that has no recorded end", () => {
  const result = shared.selectLiveOrNextOpsGig(
    [
      gig({
        id: "open-ended",
        startsAt: "2026-09-03T17:00:00.000Z",
        endsAt: null
      })
    ],
    now
  );

  assert.equal(result?.event.id, "open-ended");
  assert.equal(result?.phase, "overdue");
});

test("rejects rehearsals, terminal rows, undated, and invalid supposed shows", () => {
  const result = shared.selectLiveOrNextOpsGig(
    [
      { id: "reh", type: "rehearsal", status: "confirmed", title: "Practice", startsAt: "2026-09-04T01:00:00.000Z", endsAt: "2026-09-04T03:00:00.000Z" },
      gig({ id: "done", status: "completed", startsAt: "2026-09-20T01:00:00.000Z" }),
      gig({ id: "cancelled", status: "cancelled", startsAt: "2026-09-20T01:00:00.000Z" }),
      gig({ id: "undated", startsAt: null, endsAt: null }),
      gig({ id: "invalid", startsAt: "not-a-date", endsAt: "also-bad" })
    ],
    now
  );

  assert.equal(result, null);
});

test("breaks equal-time upcoming ties by stable id without mutating input", () => {
  const events = [
    gig({ id: "show-b", status: "draft", startsAt: "2026-09-05T01:00:00.000Z" }),
    gig({ id: "show-a", status: "hold", startsAt: "2026-09-05T01:00:00.000Z" })
  ];

  assert.equal(shared.selectLiveOrNextOpsGig(events, now)?.event.id, "show-a");
  assert.deepEqual(events.map((event) => event.id), ["show-b", "show-a"]);
});

test("distinguishes unavailable show records from an empty calendar", () => {
  const unavailable = project({ eventsAvailable: false, events: [gig()] });
  assert.equal(unavailable.policyVersion, "ops_show_control_v1");
  assert.equal(unavailable.show.availability, "unavailable");
  assert.equal(unavailable.show.eventId, null);
  assert.equal(unavailable.nextAction?.code, "refresh_ops");
  assert.equal(unavailable.nextAction?.kind, "navigate");
  assert.match(unavailable.nextAction?.nextAction ?? "", /will not guess/i);

  const empty = project();
  assert.equal(empty.show.availability, "empty");
  assert.equal(empty.nextAction?.code, "record_gig");
  assert.match(empty.nextAction?.nextAction ?? "", /will not invent a live schedule/i);
});

test("does not substitute another setlist when the assigned record is missing or unverified", () => {
  const show = gig({ setlistId: "set-missing" });
  const other = {
    id: "set-other",
    name: "Wrong set",
    sourceKey: "vault:default_live",
    items: [{ itemType: "song", song: { title: "Other", durationSeconds: 180 } }]
  };

  const missing = project({
    events: [show],
    setlists: [other]
  });
  assert.equal(missing.set.availability, "missing_record");
  assert.equal(missing.set.setlistId, "set-missing");
  assert.equal(missing.set.name, null);

  const unverified = project({
    events: [show],
    setlistsAvailable: false,
    setlists: [other]
  });
  assert.equal(unverified.set.availability, "unavailable");
  assert.equal(unverified.set.name, null);
  assert.equal(unverified.set.setlistId, "set-missing");
});

test("names assigned set timing from recorded songs only", () => {
  const control = project({
    events: [gig({ setlistId: "set-a" })],
    setlists: [{
      id: "set-a",
      name: "Friday set",
      sourceKey: "vault:default_live",
      items: [
        { itemType: "song", song: { title: "One", durationSeconds: 180 } },
        { itemType: "song", song: { title: "Two", durationSeconds: null } }
      ]
    }]
  });

  assert.equal(control.set.availability, "ok");
  assert.equal(control.set.name, "Friday set");
  assert.equal(control.set.timingStatus, "incomplete");
  assert.equal(control.set.songCount, 2);
});

test("booking posture never auto-pitches and ignores confirmed or closed rows as open work", () => {
  const emptyOpen = project({
    bookings: [
      { id: "booked", title: "Already booked", stage: "confirmed" },
      { id: "done", title: "Closed", stage: "closed" }
    ]
  });
  assert.equal(emptyOpen.booking.availability, "empty");
  assert.equal(emptyOpen.booking.openCount, 0);
  assert.match(emptyOpen.booking.nextAction, /Travis books/i);
  assert.match(emptyOpen.booking.nextAction, /will not pitch/i);

  const holdWins = project({
    events: [gig()],
    bookings: [
      { id: "target-a", title: "Maybe later", stage: "target" },
      { id: "hold-a", title: "Room on hold", stage: "hold", targetDate: "2026-10-01" }
    ]
  });
  assert.equal(holdWins.booking.stage, "hold");
  assert.equal(holdWins.booking.title, "Room on hold");
  assert.match(holdWins.booking.nextAction, /Confirming creates a gig/);
  assert.match(holdWins.booking.nextAction, /Travis is ready|Confirm the date/i);
  assert.equal(holdWins.booking.href, "/booking");

  const unavailable = project({ bookingsAvailable: false, bookings: [{ id: "hidden", title: "Hidden", stage: "hold" }] });
  assert.equal(unavailable.booking.availability, "unavailable");
  assert.equal(unavailable.booking.opportunityId, null);
  assert.match(unavailable.booking.nextAction, /will not invent Travis's next step or auto-pitch/i);
});

test("one next action is navigation-only and prefers live day-of over buried editors", () => {
  const live = project({
    events: [gig({
      id: "live-a",
      title: "Tonight",
      startsAt: "2026-09-03T17:00:00.000Z",
      endsAt: "2026-09-03T20:00:00.000Z",
      setlistId: null
    })],
    readiness: [{
      eventId: "live-a",
      status: "not_ready",
      score: 20,
      confidenceLabel: "medium",
      headline: "Set missing",
      gaps: [{ code: "setlist_missing", nextAction: "Attach a practical setlist and confirm its total duration." }]
    }],
    bookings: [{ id: "hold-a", title: "Later room", stage: "hold" }]
  });

  assert.equal(live.show.phase, "live");
  assert.equal(live.nextAction?.kind, "navigate");
  assert.equal(live.nextAction?.code, "open_day_of");
  assert.equal(live.nextAction?.href, "/operations/events/live-a");
  assert.equal(live.nextAction?.label, "Open live day-of");
});

test("upcoming readiness next action deep-links the existing workspace without a write", () => {
  const upcoming = project({
    events: [gig({ id: "next-a", setlistId: null })],
    readiness: [{
      eventId: "next-a",
      status: "not_ready",
      score: 40,
      confidenceLabel: "medium",
      headline: "Needs a set",
      gaps: [{ code: "setlist_missing", nextAction: "Attach a practical setlist and confirm its total duration." }]
    }]
  });

  assert.equal(upcoming.show.phase, "upcoming");
  assert.equal(upcoming.set.availability, "unassigned");
  assert.equal(upcoming.nextAction?.kind, "navigate");
  assert.equal(upcoming.nextAction?.code, "setlist_missing");
  assert.equal(upcoming.nextAction?.tab, "events");
  assert.equal(upcoming.nextAction?.focus, "setlist");
  assert.equal(upcoming.nextAction?.label, "Open setlist assignment");
  assert.equal(upcoming.nextAction?.href, "/operations?tab=events&event=next-a&focus=setlist");
});

test("overdue open gigs stay human-closed and do not auto-complete", () => {
  const overdue = project({
    events: [gig({
      id: "late-a",
      title: "Last Friday",
      startsAt: "2026-08-28T01:00:00.000Z",
      endsAt: "2026-08-28T04:00:00.000Z"
    })]
  });

  assert.equal(overdue.show.phase, "overdue");
  assert.equal(overdue.nextAction?.code, "review_overdue_gig");
  assert.match(overdue.nextAction?.nextAction ?? "", /will not close a gig automatically/i);
  assert.equal(overdue.nextAction?.kind, "navigate");
});

test("settlement leftover is offered only after show readiness, still as a draft path", () => {
  const money = project({
    events: [
      gig({ id: "next-a" }),
      { id: "done-a", type: "gig", status: "completed", title: "Saturday", startsAt: "2026-08-01T01:00:00.000Z", settlement: null }
    ],
    readiness: [{
      eventId: "next-a",
      status: "ready",
      score: 100,
      confidenceLabel: "high",
      headline: "Ready",
      gaps: []
    }],
    settlements: []
  });

  assert.equal(money.nextAction?.code, "create_settlement");
  assert.match(money.nextAction?.nextAction ?? "", /does not finalize/);
  assert.equal(money.nextAction?.kind, "navigate");
});

test("every projected action stays navigate-only and never invents outreach", () => {
  const control = project({
    events: [gig()],
    bookings: [{ id: "target-a", title: "New room", stage: "target" }]
  });

  assert.equal(control.nextAction?.kind, "navigate");
  assert.match(JSON.stringify(control), /Travis|will not pitch|will not auto-pitch|will not invent/i);
  assert.doesNotMatch(JSON.stringify(control), /auto-pitch now|send outreach|post to/i);
});
