import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);
const { describeBookingTarget } = shared;

const now = new Date("2026-09-07T18:00:00.000Z");

test("no recorded target date reads as a plain missing-date phrase", () => {
  for (const targetDate of [null, undefined, "", "   ", "not-a-date"]) {
    const result = describeBookingTarget({ targetDate, stage: "outreach", now });
    assert.equal(result.policyVersion, "booking_target_v1");
    assert.equal(result.timing, "none");
    assert.equal(result.label, "No target date");
    assert.equal(result.note, null);
  }
});

test("a future target date is labelled in UTC with no warning note", () => {
  const result = describeBookingTarget({
    targetDate: "2026-11-14T02:00:00.000Z",
    stage: "conversation",
    now
  });
  assert.equal(result.timing, "upcoming");
  assert.equal(result.label, "Target Sat, Nov 14, 2026 (UTC)");
  assert.equal(result.note, null);
});

test("a passed target date on an open deal is flagged", () => {
  const result = describeBookingTarget({
    targetDate: "2026-08-01T20:00:00.000Z",
    stage: "hold",
    now
  });
  assert.equal(result.timing, "past");
  assert.equal(result.note, "Target date passed");
});

test("a passed target date on a confirmed or closed deal is history, not a flag", () => {
  for (const stage of ["confirmed", "closed"]) {
    const result = describeBookingTarget({
      targetDate: "2026-08-01T20:00:00.000Z",
      stage,
      now
    });
    assert.equal(result.timing, "past");
    assert.equal(result.note, null);
    assert.equal(result.label, "Target Sat, Aug 1, 2026 (UTC)");
  }
});

test("comparison is by UTC calendar day so a show later today is not 'passed'", () => {
  const laterToday = describeBookingTarget({
    targetDate: "2026-09-07T23:30:00.000Z",
    stage: "offer",
    now
  });
  assert.equal(laterToday.timing, "today");
  assert.equal(laterToday.note, "Target date is today");

  const earlierToday = describeBookingTarget({
    targetDate: "2026-09-07T01:00:00.000Z",
    stage: "offer",
    now
  });
  assert.equal(earlierToday.timing, "today");
});

test("accepts a Date instance and an unknown stage (treated as open)", () => {
  const result = describeBookingTarget({
    targetDate: new Date("2026-06-01T00:00:00.000Z"),
    stage: "mystery",
    now
  });
  assert.equal(result.timing, "past");
  assert.equal(result.note, "Target date passed");
});
