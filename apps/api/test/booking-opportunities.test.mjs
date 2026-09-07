import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (file) => { const mod = await import(pathToFileURL(join(dir, "..", "dist", "booking", file)).href); return mod.default ?? mod; };
const { BookingOpportunitiesService } = await load("booking-opportunities.service.js");
const { bookingOpportunityStageSchema } = await load("booking-opportunity.schema.js");

function serviceFixture() {
  const row = { id: "opp-a", artistId: "artist-a", title: "Studio room booking", stage: "target", venueId: null, targetDate: null, updatedAt: new Date("2026-09-06T18:00:00Z") };
  const calls = { updated: 0, created: 0, audits: [], isolation: null, beforeWrite: null, transactionError: null };
  let event = null;
  const tx = {
    bookingOpportunity: {
      findFirst: async ({ where }) => where.id === row.id && where.artistId === row.artistId ? { ...row } : null,
      findFirstOrThrow: async () => ({ ...row }),
      updateMany: async ({ where, data }) => {
        calls.beforeWrite?.();
        if (where.id !== row.id || where.artistId !== row.artistId || where.updatedAt.getTime() !== row.updatedAt.getTime() || where.stage !== row.stage) return { count: 0 };
        calls.updated += 1;
        Object.assign(row, data);
        return { count: 1 };
      }
    },
    bandEvent: {
      findUnique: async () => event,
      create: async ({ data }) => { calls.created += 1; event = { id: "event-a", ...data }; return event; }
    }
  };
  const service = new BookingOpportunitiesService({ client: {
    $transaction: async (fn, options) => {
      calls.isolation = options.isolationLevel;
      if (calls.transactionError) throw calls.transactionError;
      return fn(tx);
    }
  } }, { log: async (input, client) => { assert.equal(client, tx, "audits must use the write transaction"); calls.audits.push(input); } });
  const input = (stage) => ({ stage, expectedUpdatedAt: row.updatedAt.toISOString() });
  return { service, row, calls, input, setEvent: (value) => { event = value; }, getEvent: () => event };
}

test("reviewed booking stages follow the legal policy and confirmation creates one internal gig", async () => {
  const { service, row, calls, input } = serviceFixture();
  assert.equal((await service.updateStage("artist-a", "opp-a", input("outreach"), "owner", "operator-a")).stage, "outreach");
  await service.updateStage("artist-a", "opp-a", input("confirmed"), "owner", "operator-a");
  assert.equal(row.stage, "confirmed");
  assert.equal(calls.updated, 2);
  assert.equal(calls.created, 1);
  assert.equal(calls.isolation, "Serializable");
  assert.deepEqual(calls.audits.map((audit) => audit.action), ["booking.stage_changed", "event.confirmed_from_opportunity", "booking.stage_changed"]);
  await assert.rejects(() => service.updateStage("artist-a", "opp-a", input("offer")), /Invalid booking stage transition/);
  await service.updateStage("artist-a", "opp-a", input("closed"));
  await assert.rejects(() => service.updateStage("artist-a", "opp-a", input("target")), /Invalid booking stage transition/);
});

test("fresh same-stage review is read-only, but a stale same-stage retry is refused", async () => {
  const { service, row, calls, input } = serviceFixture();
  row.stage = "hold";
  await service.updateStage("artist-a", "opp-a", input("hold"));
  assert.equal(calls.updated, 0);
  assert.equal(calls.created, 0);
  assert.equal(calls.audits.length, 0);
  const stale = input("confirmed");
  await service.updateStage("artist-a", "opp-a", stale);
  await assert.rejects(() => service.updateStage("artist-a", "opp-a", stale), (error) => error.getStatus() === 409);
  assert.equal(calls.created, 1);
  assert.equal(calls.audits.length, 2);
});

test("review refuses stale details, missing versions, and foreign opportunities without writes", async () => {
  const { service, row, calls, input } = serviceFixture();
  const reviewed = input("confirmed");
  row.updatedAt = new Date(row.updatedAt.getTime() + 1);
  row.title = "Teammate revised this booking";
  await assert.rejects(() => service.updateStage("artist-a", "opp-a", reviewed), (error) => error.getStatus() === 409);
  await assert.rejects(() => service.updateStage("artist-b", "opp-a", input("confirmed")), (error) => error.getStatus() === 404);
  await assert.rejects(() => service.updateStage("artist-a", "opp-a", { stage: "confirmed" }), (error) => error.getStatus() === 400);
  assert.equal(calls.updated + calls.created + calls.audits.length, 0);
});

test("a competing close after transaction read cannot be overwritten by confirmation", async () => {
  const { service, row, calls, input } = serviceFixture();
  calls.beforeWrite = () => { row.stage = "closed"; row.updatedAt = new Date(row.updatedAt.getTime() + 1); };
  await assert.rejects(() => service.updateStage("artist-a", "opp-a", input("confirmed")), (error) => error.getStatus() === 409);
  assert.equal(row.stage, "closed");
  assert.equal(calls.updated + calls.created + calls.audits.length, 0);
});

test("confirmation preserves independently advanced linked gig details", async () => {
  const { service, calls, input, setEvent, getEvent } = serviceFixture();
  const event = { id: "event-a", artistId: "artist-a", title: "Advanced show title", status: "cancelled", startsAt: new Date("2026-10-01T20:00:00Z") };
  setEvent(event);
  await service.updateStage("artist-a", "opp-a", input("confirmed"));
  assert.deepEqual(getEvent(), event);
  assert.equal(calls.created, 0);
  assert.deepEqual(calls.audits.map((audit) => audit.action), ["booking.stage_changed"]);
});

test("serialization and concurrent linked-gig creation errors require a fresh review", async () => {
  const { service, calls, input } = serviceFixture();
  for (const code of ["P2034", "P2002"]) {
    calls.transactionError = { code };
    await assert.rejects(() => service.updateStage("artist-a", "opp-a", input("confirmed")), (error) => error.getStatus() === 409);
  }
  assert.equal(calls.updated + calls.created + calls.audits.length, 0);
});

test("stage HTTP input requires a precise version and rejects unknown data", () => {
  const valid = { stage: "confirmed", expectedUpdatedAt: "2026-09-06T18:00:00.123Z" };
  assert.equal(bookingOpportunityStageSchema.safeParse(valid).success, true);
  for (const invalid of [{ stage: "confirmed" }, { ...valid, expectedUpdatedAt: "2026-09-06" }, { ...valid, expectedUpdatedAt: "2026-09-06T18:00:00" }, { ...valid, expectedUpdatedAt: "not-a-date" }, { ...valid, stage: "pitch" }, { ...valid, artistId: "artist-b" }]) {
    assert.equal(bookingOpportunityStageSchema.safeParse(invalid).success, false);
  }
});
