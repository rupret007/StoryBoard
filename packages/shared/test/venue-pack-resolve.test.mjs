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
