import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (file) => {
  const mod = await import(pathToFileURL(join(dir, "..", "dist", "venues", file)).href);
  return mod.default ?? mod;
};

const { VenueBookingService } = await load("venue-booking.service.js");

const birdiesVenue = {
  id: "venue-bsc",
  artistId: "artist-a",
  name: "Birdie's Social Club",
  city: "Fort Worth",
  region: "TX",
  capacity: null,
  notes: "seed:dfw-venue-pack:birdies-social-club — DFW venue pack target. Apply URL: https://www.birdiessocialclub.com/music-submission"
};

const birdiesContact = {
  id: "contact-bsc",
  artistId: "artist-a",
  venueId: "venue-bsc",
  contactKind: "venue_staff",
  fullName: "Birdie's Social Club booking",
  email: "hiring@birdiessocialclub.com",
  phone: null,
  notes: "seed:dfw-venue-pack:birdies-social-club booking contact. Apply URL: https://www.birdiessocialclub.com/music-submission"
};

function serviceFixture({ venue = birdiesVenue, contacts = [birdiesContact] } = {}) {
  const state = {
    venue,
    contacts,
    prospects: [],
    tasks: [],
    opportunities: []
  };
  const prospectsService = {
    create: async (artistId, data) => {
      const row = {
        id: "prospect-1",
        artistId,
        ...data,
        contactId: data.contactId ?? null,
        venue: state.venue,
        contact: state.contacts.find((contact) => contact.id === data.contactId) ?? null,
        opportunity: null
      };
      state.prospects.push(row);
      return row;
    }
  };
  const tasksService = {
    create: async (artistId, data) => {
      const row = { id: `task-${state.tasks.length + 1}`, artistId, ...data };
      state.tasks.push(row);
      return row;
    }
  };
  const prisma = {
    client: {
      venue: {
        findFirst: async ({ where }) =>
          where.id === state.venue.id && where.artistId === state.venue.artistId
            ? state.venue
            : null
      },
      contact: {
        findFirst: async ({ where }) =>
          where.artistId === "artist-a" && where.venueId === state.venue.id
            ? state.contacts[0]
            : null,
        findMany: async ({ where }) =>
          where.artistId === "artist-a" && where.venueId === state.venue.id
            ? state.contacts
            : []
      },
      bookingProspect: {
        findFirst: async ({ where }) =>
          state.prospects.find(
            (p) =>
              p.artistId === where.artistId &&
              p.sourceSystem === where.sourceSystem &&
              p.sourceRef === where.sourceRef
          ) ?? null
      },
      bookingOpportunity: {
        findFirst: async ({ where }) => {
          if (where.venueId !== state.venue.id || where.artistId !== state.venue.artistId) {
            return null;
          }
          return (
            state.opportunities.find(
              (row) => row.venueId === where.venueId && row.stage !== "closed"
            ) ?? null
          );
        },
        create: async ({ data }) => {
          const row = { id: "opp-1", ...data, venue: state.venue };
          state.opportunities.push(row);
          return row;
        }
      },
      task: {
        findFirst: async () => null
      }
    }
  };
  const service = new VenueBookingService(
    prisma,
    { log: async () => {} },
    prospectsService,
    tasksService
  );
  return { service, state };
}

function applicationFixture(applyUrl, { email = null, notesSource = "venue" } = {}) {
  const notes = `Apply URL: ${applyUrl}`;
  return serviceFixture({
    venue: {
      ...birdiesVenue,
      name: "Test application venue",
      notes: notesSource === "venue" ? notes : null
    },
    contacts: [{
      ...birdiesContact,
      email,
      notes: notesSource === "contact" ? notes : null
    }]
  });
}

test("getPackDetail surfaces booking email, apply URL, and web-application flag", async () => {
  const { service } = serviceFixture();
  const detail = await service.getPackDetail("artist-a", "venue-bsc");
  assert.equal(detail.pack.bookingEmail, "hiring@birdiessocialclub.com");
  assert.match(detail.pack.applyUrl ?? "", /music-submission/);
  assert.equal(detail.pack.webApplicationFirst, true);
});

test("createProspectFromVenue links contact and creates application task for web-form venues", async () => {
  const { service, state } = serviceFixture();
  const result = await service.createProspectFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
  assert.equal(result.created, true);
  assert.equal(result.contactLinked, true);
  assert.equal(result.prospect.contactId, "contact-bsc");
  assert.equal(result.prospect.status, "qualified");
  assert.equal(state.tasks.length, 1);
  assert.match(state.tasks[0].title, /Submit application at/);
  assert.match(result.travisNote, /Travis owns the send/);
});

test("createProspectFromVenue is idempotent per venue", async () => {
  const { service, state } = serviceFixture();
  await service.createProspectFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
  state.contacts = [];
  const second = await service.createProspectFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
  assert.equal(second.created, false);
  assert.equal(second.contactLinked, true);
  assert.equal(state.prospects.length, 1);
  assert.equal(state.tasks.length, 1);
});

const unsafeApplyUrls = [
  ["credentialed HTTPS", "https://user:secret@venue.example.test/apply"],
  ["credentialed HTTP", "http://user:secret@venue.example.test/apply"],
  ["malformed HTTPS", "https://[invalid]/apply"],
  ["oversized HTTPS", `https://venue.example.test/${"a".repeat(2000)}`],
  ["JavaScript", "javascript:alert(1)"],
  ["data", "data:text/html,application"],
  ["file", "file:///tmp/application.html"]
];

for (const notesSource of ["venue", "contact"]) {
  for (const [label, applyUrl] of unsafeApplyUrls) {
    test(`createProspectFromVenue rejects ${label} in ${notesSource} notes without an email`, async () => {
      const { service, state } = applicationFixture(applyUrl, { notesSource });
      await assert.rejects(
        service.createProspectFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1"),
        (error) => error.getStatus() === 400 && /booking contact email or.*apply URL/.test(error.message)
      );
      assert.equal(state.prospects.length, 0);
      assert.equal(state.tasks.length, 0);
    });

    test(`createProspectFromVenue ignores ${label} in ${notesSource} notes when an email exists`, async () => {
      const { service, state } = applicationFixture(applyUrl, {
        email: "buyer@example.test",
        notesSource
      });
      const result = await service.createProspectFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
      assert.equal(result.created, true);
      assert.equal(result.contactLinked, true);
      assert.equal(result.prospect.status, "qualified");
      assert.equal(result.prospect.contactId, "contact-bsc");
      assert.equal(result.prospect.notes ?? null, null);
      assert.equal(result.applicationTask, null);
      assert.equal(state.prospects.length, 1);
      assert.equal(state.tasks.length, 0);
    });
  }
}

for (const protocol of ["http", "https"]) {
  test(`createProspectFromVenue preserves safe ${protocol} application links without a contact`, async () => {
    const applyUrl = `${protocol}://venue.example.test/apply`;
    const { service, state } = applicationFixture(applyUrl);
    state.contacts = [];
    const result = await service.createProspectFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
    assert.equal(result.created, true);
    assert.equal(result.contactLinked, false);
    assert.equal(result.prospect.status, "discovered");
    assert.equal(result.prospect.contactId, null);
    assert.equal(result.prospect.notes, `Venue pack apply URL: ${applyUrl}`);
    assert.equal(result.applicationTask.title, `Submit application at ${applyUrl}`);
    state.contacts = [birdiesContact];
    const second = await service.createProspectFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
    assert.equal(second.created, false);
    assert.equal(second.contactLinked, false);
    assert.equal(state.prospects.length, 1);
    assert.equal(state.tasks.length, 1);
  });
}

test("createProspectFromVenue reports a linked contact even without an email", async () => {
  const { service } = applicationFixture("https://venue.example.test/apply");
  const result = await service.createProspectFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
  assert.equal(result.contactLinked, true);
  assert.equal(result.prospect.contactId, "contact-bsc");
  assert.equal(result.prospect.status, "discovered");
});

test("createOpportunityFromVenue links venue and defaults title", async () => {
  const { service, state } = serviceFixture();
  const opp = await service.createOpportunityFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
  assert.equal(opp.venueId, "venue-bsc");
  assert.equal(opp.title, "Birdie's Social Club — booking");
  assert.equal(opp.created, true);
  assert.equal(state.opportunities.length, 1);
});

test("createOpportunityFromVenue is idempotent while an open opportunity exists", async () => {
  const { service, state } = serviceFixture();
  const first = await service.createOpportunityFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
  const second = await service.createOpportunityFromVenue("artist-a", "venue-bsc", {}, "owner", "op-1");
  assert.equal(first.id, second.id);
  assert.equal(second.created, false);
  assert.equal(state.opportunities.length, 1);
});
