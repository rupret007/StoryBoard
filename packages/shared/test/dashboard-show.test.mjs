import assert from "node:assert/strict";
import test from "node:test";
import { selectNextRecordedGig } from "../dist/index.js";

const now = new Date("2026-08-27T12:00:00.000Z");

test("selects the nearest active dated gig without inventing a live status", () => {
  const result = selectNextRecordedGig(
    [
      {
        id: "later-confirmed",
        type: "gig",
        status: "confirmed",
        startsAt: "2026-09-20T01:00:00.000Z"
      },
      {
        id: "nearest-hold",
        type: "gig",
        status: "hold",
        startsAt: "2026-09-05T01:00:00.000Z"
      },
      {
        id: "rehearsal",
        type: "rehearsal",
        status: "confirmed",
        startsAt: "2026-08-28T01:00:00.000Z"
      }
    ],
    now
  );

  assert.equal(result?.id, "nearest-hold");
  assert.equal(result?.status, "hold");
});

test("rejects past, terminal, undated, and invalid supposed shows", () => {
  const result = selectNextRecordedGig(
    [
      {
        id: "past",
        type: "gig",
        status: "confirmed",
        startsAt: "2026-08-01T01:00:00.000Z"
      },
      {
        id: "cancelled",
        type: "gig",
        status: "cancelled",
        startsAt: "2026-09-01T01:00:00.000Z"
      },
      {
        id: "completed",
        type: "gig",
        status: "completed",
        startsAt: "2026-09-02T01:00:00.000Z"
      },
      { id: "undated", type: "gig", status: "confirmed", startsAt: null },
      {
        id: "invalid",
        type: "gig",
        status: "confirmed",
        startsAt: "not-a-date"
      }
    ],
    now
  );

  assert.equal(result, null);
});

test("breaks equal-time ties by stable record id without mutating input", () => {
  const events = [
    {
      id: "show-b",
      type: "gig",
      status: "draft",
      startsAt: "2026-09-05T01:00:00.000Z"
    },
    {
      id: "show-a",
      type: "gig",
      status: "confirmed",
      startsAt: "2026-09-05T01:00:00.000Z"
    }
  ];

  assert.equal(selectNextRecordedGig(events, now)?.id, "show-a");
  assert.deepEqual(events.map((event) => event.id), ["show-b", "show-a"]);
});
