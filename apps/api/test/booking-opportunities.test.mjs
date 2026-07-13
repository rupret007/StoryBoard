import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const pathToURL = (...parts) => pathToFileURL(join(dir, ...parts)).href;
const mod = await import(pathToURL("..", "dist", "booking", "booking-opportunities.service.js"));

function loadModule() {
  return mod.default?.BookingOpportunitiesService ?? mod.BookingOpportunitiesService;
}

function serviceFixture() {
  const row = {
    id: "opp-a",
    artistId: "artist-a",
    title: "Studio room booking",
    stage: "target",
    venueId: null,
    targetDate: null
  };

  const calls = {
    lookup: 0,
    updated: 0,
    upserted: 0,
    audits: 0
  };

  const client = {
    bookingOpportunity: {
      findFirst: async ({ where }) => {
        calls.lookup += 1;
        if (where?.id === row.id && (!where.artistId || where.artistId === row.artistId)) {
          return { ...row };
        }
        return null;
      },
      update: async ({ data }) => {
        calls.updated += 1;
        Object.assign(row, data);
        return { ...row };
      }
    },
    bandEvent: {
      upsert: async () => {
        calls.upserted += 1;
        return { id: "event-a" };
      }
    },
    auditEvent: {
      create: async () => {
        calls.audits += 1;
      }
    },
    $transaction: async (fn) => fn(client)
  };

  const service = new (loadModule())(
    { client },
    { log: async () => { calls.audits += 1; } }
  );

  return { service, row, calls };
}

test("booking opportunity stage transitions are validated", async () => {
  const { service, row, calls } = serviceFixture();

  const initial = await service.updateStage("artist-a", "opp-a", "outreach", "owner", "operator-a");
  assert.equal(initial.stage, "outreach");
  assert.equal(calls.updated, 1);

  await service.updateStage("artist-a", "opp-a", "confirmed", "owner", "operator-a");
  assert.equal(row.stage, "confirmed");
  assert.equal(calls.updated, 2);
  assert.equal(calls.upserted, 1);

  await assert.rejects(
    () => service.updateStage("artist-a", "opp-a", "offer", "owner", "operator-a"),
    /Invalid booking stage transition/
  );
});

test("booking opportunity confirmed stage can close and not re-open", async () => {
  const { service, row, calls } = serviceFixture();

  row.stage = "confirmed";
  const closed = await service.updateStage("artist-a", "opp-a", "closed", "owner", "operator-a");
  assert.equal(closed.stage, "closed");
  assert.equal(calls.updated, 1);
  assert.equal(calls.upserted, 0);

  await assert.rejects(
    () => service.updateStage("artist-a", "opp-a", "target", "owner", "operator-a"),
    /Invalid booking stage transition/
  );
});

test("booking opportunity idempotent same-stage updates skip writes and audit", async () => {
  const { service, row, calls } = serviceFixture();

  row.stage = "hold";
  const result = await service.updateStage("artist-a", "opp-a", "hold", "owner", "operator-a");
  assert.equal(result.stage, "hold");
  assert.equal(calls.updated, 0);
  assert.equal(calls.upserted, 0);
  assert.equal(calls.audits, 0);
});
