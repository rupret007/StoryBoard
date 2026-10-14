import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { requireTestDatabaseUrl } from "../../../../scripts/test-database.mjs";

process.env.DATABASE_URL = requireTestDatabaseUrl();

const dir = dirname(fileURLToPath(import.meta.url));
const sharedSeed = await import(pathToFileURL(join(dir, "..", "..", "..", "..", "packages", "shared", "dist", "dfw-venue-pack-seed.js")).href);
const { seedDfwVenuePacks } = sharedSeed;
const { DFW_VENUE_PACK_CANONICAL } = await import(
  pathToFileURL(join(dir, "..", "..", "..", "..", "packages", "shared", "dist", "dfw-venue-packs.js")).href
);

function cuidLike() {
  const t = Date.now().toString(36);
  const r = randomBytes(8).toString("hex");
  return `c${t}${r}`.slice(0, 25);
}

test("seedDfwVenuePacks creates Venue and Contact rows and re-seed is idempotent", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const artistId = cuidLike();
  const now = new Date();
  try {
    await client.query(
      `INSERT INTO "Artist" ("id","name","slug","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5)`,
      [artistId, "Pack seed artist", `pack-seed-${artistId}`, now, now]
    );

    const first = await seedDfwVenuePacks(client, artistId);
    assert.equal(first.venueCount, DFW_VENUE_PACK_CANONICAL.length);
    assert.equal(first.contactCount, DFW_VENUE_PACK_CANONICAL.length);

    const venueCount = await client.query(
      `SELECT count(*)::int AS count FROM "Venue" WHERE "artistId" = $1 AND notes LIKE 'seed:dfw-venue-pack:%'`,
      [artistId]
    );
    assert.equal(venueCount.rows[0].count, DFW_VENUE_PACK_CANONICAL.length);

    const contactCount = await client.query(
      `SELECT count(*)::int AS count FROM "Contact" WHERE "artistId" = $1 AND notes LIKE 'seed:dfw-venue-pack:%'`,
      [artistId]
    );
    assert.equal(contactCount.rows[0].count, DFW_VENUE_PACK_CANONICAL.length);

    const birdies = await client.query(
      `SELECT v.name, c.email FROM "Venue" v
       JOIN "Contact" c ON c."venueId" = v.id
       WHERE v."artistId" = $1 AND v.name = $2`,
      [artistId, "Birdie's Social Club"]
    );
    assert.equal(birdies.rows.length, 1);
    assert.equal(birdies.rows[0].email, "hiring@birdiessocialclub.com");

    const second = await seedDfwVenuePacks(client, artistId);
    assert.deepEqual(second, first);

    const venueCountAfter = await client.query(
      `SELECT count(*)::int AS count FROM "Venue" WHERE "artistId" = $1 AND notes LIKE 'seed:dfw-venue-pack:%'`,
      [artistId]
    );
    assert.equal(venueCountAfter.rows[0].count, DFW_VENUE_PACK_CANONICAL.length);
  } finally {
    await client.query(`DELETE FROM "Artist" WHERE id = $1`, [artistId]);
    await client.end();
  }
});
