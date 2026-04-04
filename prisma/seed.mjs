import "dotenv/config";
import pg from "pg";
import { randomBytes } from "crypto";

function cuidLike() {
  const t = Date.now().toString(36);
  const r = randomBytes(8).toString("hex");
  return `c${t}${r}`.slice(0, 25);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required for seed");
  process.exit(1);
}

const seedEmail = process.env.SEED_OPERATOR_EMAIL?.trim() || "dev@localhost";
const seedName = process.env.SEED_OPERATOR_NAME?.trim() || "Local Dev";

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    let artistRes = await client.query(
      `SELECT id FROM "Artist" WHERE slug = $1`,
      ["default"]
    );
    let artistId;
    if (artistRes.rows.length === 0) {
      artistId = cuidLike();
      const now = new Date();
      await client.query(
        `INSERT INTO "Artist" ("id","name","slug","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5)`,
        [artistId, "My Artist", "default", now, now]
      );
    } else {
      artistId = artistRes.rows[0].id;
    }

    let opRes = await client.query(
      `SELECT id FROM "Operator" WHERE email = $1`,
      [seedEmail]
    );
    let operatorId;
    if (opRes.rows.length === 0) {
      operatorId = cuidLike();
      const now = new Date();
      await client.query(
        `INSERT INTO "Operator" ("id","email","name","googleSub","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [operatorId, seedEmail, seedName, null, now, now]
      );
    } else {
      operatorId = opRes.rows[0].id;
    }

    const memRes = await client.query(
      `SELECT id FROM "ArtistMembership" WHERE "operatorId" = $1 AND "artistId" = $2`,
      [operatorId, artistId]
    );
    if (memRes.rows.length === 0) {
      const memId = cuidLike();
      await client.query(
        `INSERT INTO "ArtistMembership" ("id","operatorId","artistId","role","createdAt")
         VALUES ($1,$2,$3,'owner', NOW())`,
        [memId, operatorId, artistId]
      );
    } else {
      await client.query(
        `UPDATE "ArtistMembership" SET role = 'owner' WHERE "operatorId" = $1 AND "artistId" = $2`,
        [operatorId, artistId]
      );
    }

    console.log("Seed OK:", { artistId, operatorId, email: seedEmail });
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
