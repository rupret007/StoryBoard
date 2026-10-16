import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const service = readFileSync(join(dir, "../src/social/social.service.ts"), "utf8");
const require = createRequire(import.meta.url);
const { SocialService } = require("../dist/social/social.service.js");

test("social drops resolve show facts from a recorded event only", () => {
  assert.match(service, /resolveRecordedSocialShow/);
  assert.match(service, /SOCIAL_SHOW_NOT_RECORDED/);
  assert.doesNotMatch(service, /input\.show/);
  assert.doesNotMatch(service, /ticketUrl/);
});

function dropHarness(events) {
  const queries = [];
  const drafts = [];
  const stopAfterDraft = new Error("caption input captured");
  const instance = new SocialService({ client: {
    artist: { findUniqueOrThrow: async () => ({ id: "band-a", name: "Stalemate" }) },
    socialVoiceProfile: { findUnique: async () => ({ confirmedFacts: [] }) },
    socialAccount: { upsert: async () => ({}) },
    bandEvent: { findFirst: async (query) => {
      queries.push(query);
      return events.find((event) => event.id === query.where.id && event.artistId === query.where.artistId) ?? null;
    } },
    $transaction: async () => assert.fail("must not persist before valid captions exist")
  } }, {}, {}, { env: () => ({ SOCIAL_ADAPTER: "mock" }) }, {
    draft: async (input) => {
      drafts.push(input);
      throw stopAfterDraft;
    }
  });
  return { instance, queries, drafts, stopAfterDraft };
}

const actor = { label: "Test operator", operatorId: "operator-a" };

test("createDrop drafts only the selected band's recorded show fields", async () => {
  const harness = dropHarness([{
    id: "event-a", artistId: "band-a", title: " Recorded show ",
    startsAt: new Date("2030-06-16T00:30:00Z"), locationName: " Recorded venue ",
    ticketUrl: "https://example.invalid/unrecorded"
  }]);
  await assert.rejects(() => harness.instance.createDrop("band-a", {
    note: "Live clip", eventId: "event-a"
  }, actor), (error) => error === harness.stopAfterDraft);
  assert.deepEqual(harness.queries, [{
    where: { id: "event-a", artistId: "band-a" },
    select: { title: true, startsAt: true, locationName: true }
  }]);
  assert.equal(harness.drafts.length, 1);
  assert.deepEqual(harness.drafts[0].show, {
    name: "Recorded show", startsAt: "2030-06-16T00:30:00.000Z", place: "Recorded venue"
  });
});

for (const eventId of ["event-foreign", "event-missing"]) {
  test(`createDrop refuses ${eventId} before drafting or persisting`, async () => {
    const harness = dropHarness([{ id: "event-foreign", artistId: "band-b", title: "Other band" }]);
    await assert.rejects(() => harness.instance.createDrop("band-a", {
      note: "Live clip", eventId
    }, actor), (error) => error.getStatus?.() === 400 && /not on this band/.test(error.message));
    assert.deepEqual(harness.queries[0].where, { id: eventId, artistId: "band-a" });
    assert.equal(harness.drafts.length, 0);
  });
}

test("createDrop rejects a supplied show and leaves an unselected show empty", async () => {
  const harness = dropHarness([]);
  await assert.rejects(() => harness.instance.createDrop("band-a", {
    note: "Live clip", show: { name: "Invented show" }
  }, actor), /Unrecognized key/);
  assert.equal(harness.queries.length, 0);
  assert.equal(harness.drafts.length, 0);
  await assert.rejects(() => harness.instance.createDrop("band-a", {
    note: "Live clip"
  }, actor), (error) => error === harness.stopAfterDraft);
  assert.equal(harness.queries.length, 0);
  assert.equal(harness.drafts.length, 1);
  assert.equal(harness.drafts[0].show, null);
});
