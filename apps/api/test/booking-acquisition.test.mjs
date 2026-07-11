import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = (path) => import(pathToFileURL(join(dir, "..", "dist", path)).href);
const loadShared = (path) =>
  import(pathToFileURL(join(dir, "..", "..", "..", "packages", "shared", "dist", path)).href);

const [prospectsMod, ticketmasterMod, acquisitionSchemaMod] = await Promise.all([
  loadApi("booking/booking-prospects.service.js"),
  loadApi("integrations/adapters/ticketmaster/real-ticketmaster.adapter.js"),
  loadShared("schemas/booking-acquisition.js")
]);

function auditSpy() {
  const events = [];
  return { events, audit: { log: async (event) => events.push(event) } };
}

test("booking profile and campaign templates reject incomplete ranges and unknown variables", () => {
  assert.equal(
    acquisitionSchemaMod.artistBookingProfileSchema.safeParse({
      targetCapacityMin: 100
    }).success,
    false
  );
  assert.equal(
    acquisitionSchemaMod.bookingCampaignCreateSchema.safeParse({
      name: "Fall outreach",
      subjectTemplate: "Hi {{contactName}} {{unknown}}",
      bodyTemplate: "{{bookingPitch}}"
    }).success,
    false
  );
  assert.equal(
    acquisitionSchemaMod.bookingCampaignPrepareApprovalSchema.safeParse({
      recipientIds: ["recipient-a", "recipient-a"]
    }).success,
    false
  );
  assert.equal(
    acquisitionSchemaMod.renderBookingTemplate("Hi {{contactName}}", {
      artistName: "The Tests",
      contactName: "Morgan",
      prospectName: "The Room",
      market: "Austin, TX",
      bookingPitch: "A sharp live act.",
      pressKitUrl: ""
    }),
    "Hi Morgan"
  );
  assert.equal(
    acquisitionSchemaMod.bookingMarketSprintCreateSchema.safeParse({
      name: "Austin fall rooms",
      city: "Austin",
      targetDateWindowStart: "2026-09-01T00:00:00.000Z",
      targetDateWindowEnd: "2026-08-01T00:00:00.000Z"
    }).success,
    false
  );
  assert.equal(
    acquisitionSchemaMod.bookingCampaignCreateSchema.safeParse({
      name: "Send batch",
      subjectTemplate: "Hi {{contactName}}",
      bodyTemplate: "{{bookingPitch}}",
      deliveryMode: "send_on_execution",
      unexpected: true
    }).success,
    false
  );
});

test("prospects reject cross-artist links and dedupe provider imports", async () => {
  const calls = { creates: 0 };
  const { audit, events } = auditSpy();
  const existing = {
    id: "existing",
    artistId: "artist-a",
    sourceSystem: "ticketmaster",
    sourceRef: "venue:tm-1"
  };
  const service = new prospectsMod.BookingProspectsService(
    {
      client: {
        venue: { findFirst: async ({ where }) => (where.id === "venue-a" ? { id: "venue-a" } : null) },
        contact: { findFirst: async () => null },
        bookingOpportunity: { findFirst: async () => null },
        bookingProspect: {
          findFirst: async ({ where }) =>
            where.sourceSystem === "ticketmaster" && where.sourceRef === "venue:tm-1"
              ? existing
              : null,
          create: async ({ data }) => {
            calls.creates += 1;
            return { id: "new", ...data };
          }
        }
      }
    },
    audit,
    { assertReady: async () => ({}) },
    { resolveForArtist: async () => ({ ticketmaster: { mode: "mock" } }) }
  );

  await assert.rejects(
    () =>
      service.create("artist-a", {
        kind: "venue",
        name: "Foreign room",
        city: "Elsewhere",
        venueId: "venue-b"
      }),
    (error) => error?.getStatus?.() === 404 && error?.message === "Venue not found"
  );
  assert.equal(calls.creates, 0);
  assert.equal(events.length, 0);

  const duplicate = await service.create("artist-a", {
    kind: "venue",
    name: "Imported room",
    city: "Austin",
    sourceSystem: "ticketmaster",
    sourceRef: "venue:tm-1"
  });
  assert.equal(duplicate.id, "existing");
  assert.equal(calls.creates, 0);
  assert.equal(events.length, 0);
});

test("prospect buyer contact action links owned contacts or creates one atomically", async () => {
  const auditEvents = [];
  const calls = { contactCreates: 0, prospectUpdates: 0 };
  const tx = {
    bookingProspect: {
      findFirst: async () => ({ id: "prospect-a", artistId: "artist-a" }),
      update: async ({ data }) => {
        calls.prospectUpdates += 1;
        return {
          id: "prospect-a",
          artistId: "artist-a",
          contactId: data.contactId,
          contact: { id: data.contactId, fullName: "Buyer", email: "buyer@test.invalid" }
        };
      }
    },
    contact: {
      findFirst: async ({ where }) =>
        where.id === "contact-a" && where.artistId === "artist-a"
          ? { id: "contact-a" }
          : null,
      create: async ({ data }) => {
        calls.contactCreates += 1;
        return { id: "contact-new", ...data };
      }
    },
    auditEvent: { create: async ({ data }) => auditEvents.push(data) }
  };
  const service = new prospectsMod.BookingProspectsService(
    { client: { $transaction: async (fn) => fn(tx) } },
    { log: async () => undefined },
    { assertReady: async () => ({}) },
    { resolveForArtist: async () => ({ ticketmaster: { mode: "mock" } }) }
  );

  await assert.rejects(
    () => service.attachContact("artist-a", "prospect-a", { contactId: "contact-b" }),
    (error) => error?.getStatus?.() === 404 && error?.message === "Contact not found"
  );
  assert.equal(calls.prospectUpdates, 0);
  assert.equal(auditEvents.length, 0);

  const existing = await service.attachContact("artist-a", "prospect-a", {
    contactId: "contact-a"
  });
  assert.equal(existing.created, false);
  assert.equal(existing.prospect.contactId, "contact-a");

  const created = await service.attachContact("artist-a", "prospect-a", {
    contact: { fullName: "New Buyer", email: "new@test.invalid" }
  });
  assert.equal(created.created, true);
  assert.equal(created.prospect.contactId, "contact-new");
  assert.equal(calls.contactCreates, 1);
  assert.equal(calls.prospectUpdates, 2);
  assert.equal(
    auditEvents.filter((event) => event.action === "booking_prospect.contact_linked").length,
    2
  );
});

test("discovery is manual-only when Ticketmaster is not configured", async () => {
  const service = new prospectsMod.BookingProspectsService(
    { client: {} },
    { log: async () => undefined },
    { assertReady: async () => ({}) },
    { resolveForArtist: async () => ({ ticketmaster: { mode: "mock" } }) }
  );
  const result = await service.discover("artist-a", { city: "Austin" });
  assert.equal(result.mode, "manual");
  assert.equal(result.signals.length, 0);
  assert.match(result.reason, /no synthetic leads/i);
});

test("Ticketmaster market normalization is bounded and city-first", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(new URL(String(url)));
    const isVenue = String(url).includes("venues.json");
    return new Response(
      JSON.stringify({
        _embedded: isVenue
          ? {
              venues: [
                {
                  id: "v1",
                  name: "The Room",
                  city: { name: "Austin" },
                  state: { stateCode: "TX" },
                  country: { countryCode: "US" },
                  capacity: 450,
                  url: "https://example.test/room"
                }
              ]
            }
          : {
              events: [
                {
                  id: "e1",
                  name: "Useful Festival",
                  dates: { start: { localDate: "2026-09-01" } },
                  _embedded: {
                    venues: [
                      {
                        name: "The Park",
                        city: { name: "Austin" },
                        state: { stateCode: "TX" },
                        country: { countryCode: "US" }
                      }
                    ]
                  }
                }
              ]
            }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  try {
    const adapter = new ticketmasterMod.RealTicketmasterAdapter("test-key");
    const result = await adapter.searchMarket({
      city: "Austin",
      region: "TX",
      country: "US",
      keyword: "indie",
      size: 100
    });
    assert.equal(result.venues[0].capacity, 450);
    assert.equal(result.events[0].venueName, "The Park");
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.searchParams.get("city"), "Austin");
      assert.equal(request.searchParams.get("stateCode"), "TX");
      assert.equal(request.searchParams.get("size"), "20");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
