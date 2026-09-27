import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (file) => {
  const mod = await import(pathToFileURL(join(dir, "..", "dist", file)).href);
  return mod.default ?? mod;
};

const {
  lookupDfwVenuePackByVenueName,
  parseDfwVenuePackSlugFromNotes,
  resolveVenueBookingOutreachContext,
  resolveVenuePackOutreachContext,
  venueApplicationTaskTitle
} = await load("venue-pack-resolve.js");

test("lookupDfwVenuePackByVenueName matches canonical and alias keys", () => {
  const birdies = lookupDfwVenuePackByVenueName("Birdie's Social Club");
  assert.equal(birdies?.slug, "birdies-social-club");
  assert.equal(lookupDfwVenuePackByVenueName("Granada Theater")?.slug, "granada-theater");
});

test("parseDfwVenuePackSlugFromNotes reads seeded venue marker", () => {
  const slug = parseDfwVenuePackSlugFromNotes(
    "seed:dfw-venue-pack:birdies-social-club — DFW venue pack target. Apply URL: https://example.com/apply"
  );
  assert.equal(slug, "birdies-social-club");
});

test("resolveVenuePackOutreachContext prefers contact email and flags web-application venues", () => {
  const ctx = resolveVenuePackOutreachContext(
    { name: "Birdie's Social Club", notes: "seed:dfw-venue-pack:birdies-social-club" },
    { email: "buyer@example.com", phone: null, notes: null }
  );
  assert.equal(ctx.bookingEmail, "buyer@example.com");
  assert.equal(ctx.webApplicationFirst, true);
  assert.match(ctx.applyUrl ?? "", /music-submission/);
  assert.equal(venueApplicationTaskTitle(ctx.applyUrl ?? ""), `Submit application at ${ctx.applyUrl}`);
});

for (const contact of [
  { venueId: "venue-other", artistId: "artist-a" },
  { venueId: null, artistId: "artist-a" },
  { venueId: "venue-selected", artistId: "artist-other" }
]) {
  test(`recorded outreach rejects contact identity ${contact.artistId}/${contact.venueId}`, () => {
    const ctx = resolveVenueBookingOutreachContext(
      { id: "venue-selected", artistId: "artist-a", notes: null },
      {
        ...contact,
        email: "other@example.test",
        phone: "555-0100",
        notes: "seed:dfw-venue-pack:birdies-social-club Apply URL: https://other.example.test/apply"
      }
    );
    assert.deepEqual(ctx, {
      slug: null, applyUrl: null, bookingEmail: null, phone: null, webApplicationFirst: false
    });
  });
}
