import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = async (path) => {
  const module = await import(
    pathToFileURL(join(dir, "..", "dist", path)).href
  );
  return module.default ?? module;
};
const loadShared = (path) =>
  import(
    pathToFileURL(
      join(dir, "..", "..", "..", "packages", "shared", "dist", path)
    ).href
  );

const [commandsMod, commandSchemaMod] = await Promise.all([
  loadApi("commands/commands.service.js"),
  loadShared("schemas/command-execute.js")
]);

function makeAdapters(calls) {
  const passive = { mode: "mock" };
  return {
    gmail: passive,
    calendar: passive,
    drive: passive,
    youtube: passive,
    spotify: passive,
    bandsintown: {
      mode: "real",
      resolveArtist: async (name) => {
        calls.resolved.push(name);
        return { id: "bit-owned", name };
      },
      listUpcomingEvents: async (name) => {
        calls.events.push(name);
        return [];
      }
    },
    ticketmaster: {
      mode: "mock",
      searchVenues: async (city) => {
        calls.venueCities.push(city);
        return [];
      },
      searchEvents: async (city) => {
        calls.eventCities.push(city);
        return [];
      }
    }
  };
}

function makeService(calls) {
  const adapters = makeAdapters(calls);
  return new commandsMod.CommandsService(
    {
      client: {
        artist: {
          findUniqueOrThrow: async ({ where }) => {
            assert.equal(where.id, "artist-a");
            return { id: "artist-a", name: "Owned Band" };
          }
        },
        commandRun: {
          create: async ({ data }) => {
            calls.commandRuns += 1;
            return { id: "command-a", ...data };
          }
        }
      }
    },
    {
      log: async () => {
        calls.audits += 1;
      }
    },
    {},
    {},
    { resolveForArtist: async () => adapters },
    {}
  );
}

test("booking-intel payload rejects arbitrary artist lookup", async () => {
  assert.equal(
    commandSchemaMod.researchBookingIntelPayloadSchema.safeParse({
      artistName: "Another Artist"
    }).success,
    false
  );
  assert.equal(
    commandSchemaMod.researchBookingIntelPayloadSchema.safeParse({
      radiusKm: 100
    }).success,
    false
  );

  const calls = {
    resolved: [],
    events: [],
    venueCities: [],
    eventCities: [],
    commandRuns: 0,
    audits: 0
  };
  const service = makeService(calls);
  await assert.rejects(
    () =>
      service.execute(
        "artist-a",
        {
          intent: "research_booking_intel",
          payload: { artistName: "Another Artist" }
        },
        "operator@test.invalid",
        "operator-a"
      ),
    (error) => error?.getStatus?.() === 400
  );
  assert.deepEqual(calls.resolved, []);
  assert.deepEqual(calls.events, []);
  assert.equal(calls.commandRuns, 0);
  assert.equal(calls.audits, 0);
});

test("booking intel uses only the active artist for Bandsintown context", async () => {
  const calls = {
    resolved: [],
    events: [],
    venueCities: [],
    eventCities: [],
    commandRuns: 0,
    audits: 0
  };
  const service = makeService(calls);
  const result = await service.execute(
    "artist-a",
    {
      intent: "research_booking_intel",
      payload: { city: "Austin" }
    },
    "operator@test.invalid",
    "operator-a"
  );

  assert.deepEqual(calls.resolved, ["Owned Band"]);
  assert.deepEqual(calls.events, ["Owned Band"]);
  assert.deepEqual(calls.venueCities, ["Austin"]);
  assert.deepEqual(calls.eventCities, ["Austin"]);
  assert.equal(result.result.city, "Austin");
  assert.match(result.result.note, /active StoryBoard artist/i);
  assert.equal(calls.commandRuns, 1);
  assert.equal(calls.audits, 1);
});
