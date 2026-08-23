import "dotenv/config";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
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

    const demoOps = /^(1|true|yes)$/i.test(process.env.SEED_DEMO_OPS ?? "");
    let demo = null;
    if (demoOps) {
      demo = await seedGenericDemoOps(client, artistId);
    }

    const vaultImport = importLocalVaultCatalog();
    if (vaultImport.skipped) {
      console.log("Song table left empty. The catalog lives in AI-Music-Vault. Set VAULT_CATALOG_PATH or run pnpm catalog:import.");
    }

    console.log("Seed OK:", { artistId, operatorId, email: seedEmail, demoOps: demo, vaultImport });
  } finally {
    await client.end();
  }
}

function importLocalVaultCatalog() {
  const source = process.env.VAULT_CATALOG_PATH?.trim();
  if (!source) return { skipped: true, reason: "VAULT_CATALOG_PATH unset" };
  if (/^[a-z]+:\/\//i.test(source)) {
    throw new Error("VAULT_CATALOG_PATH must be a local file path, not a URL");
  }
  const apply = /^(1|true|yes)$/i.test(process.env.VAULT_CATALOG_APPLY ?? "");
  const args = [resolve("scripts/import-catalog.mjs"), "--source", resolve(source)];
  if (apply) args.push("--apply");
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) throw new Error("Vault catalog import failed");
  return { skipped: false, applied: apply, source: resolve(source) };
}

async function seedGenericDemoOps(client, artistId) {
  const now = new Date();
  const openerId = cuidLike();
  const closerId = cuidLike();
  const setlistId = cuidLike();
  const invoiceId = cuidLike();
  await client.query(
    `INSERT INTO "Song" ("id","artistId","title","durationSeconds","musicalKey","bpm","notes","sourceKey","active","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)
     ON CONFLICT ("artistId","sourceKey") DO NOTHING`,
    [openerId, artistId, "Demo Opener", 210, "G", 110, "Generic demo song for local setlist practice.", "seed:demo:opener", now, now]
  );
  await client.query(
    `INSERT INTO "Song" ("id","artistId","title","durationSeconds","musicalKey","bpm","notes","sourceKey","active","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10)
     ON CONFLICT ("artistId","sourceKey") DO NOTHING`,
    [closerId, artistId, "Demo Closer", 240, "C", 102, "Generic demo song for local setlist practice.", "seed:demo:closer", now, now]
  );
  const opener = await client.query(`SELECT id FROM "Song" WHERE "artistId" = $1 AND "sourceKey" = $2`, [artistId, "seed:demo:opener"]);
  const closer = await client.query(`SELECT id FROM "Song" WHERE "artistId" = $1 AND "sourceKey" = $2`, [artistId, "seed:demo:closer"]);
  await client.query(
    `INSERT INTO "Setlist" ("id","artistId","name","status","notes","sourceKey","createdAt","updatedAt")
     VALUES ($1,$2,$3,'draft',$4,$5,$6,$7)
     ON CONFLICT ("artistId","sourceKey") DO NOTHING`,
    [setlistId, artistId, "Demo set", "Generic practice setlist. Not a live band catalog.", "seed:demo:setlist", now, now]
  );
  const setlist = await client.query(`SELECT id FROM "Setlist" WHERE "artistId" = $1 AND "sourceKey" = $2`, [artistId, "seed:demo:setlist"]);
  const itemCount = await client.query(`SELECT count(*)::int AS count FROM "SetlistItem" WHERE "setlistId" = $1`, [setlist.rows[0].id]);
  if (itemCount.rows[0].count === 0) {
    await client.query(
      `INSERT INTO "SetlistItem" ("id","setlistId","songId","itemType","label","sortOrder") VALUES ($1,$2,$3,'song',$4,0), ($5,$6,$7,'song',$8,1)`,
      [cuidLike(), setlist.rows[0].id, opener.rows[0].id, "Demo Opener", cuidLike(), setlist.rows[0].id, closer.rows[0].id, "Demo Closer"]
    );
  }
  await client.query(
    `INSERT INTO "Invoice" ("id","artistId","number","status","recipientName","recipientEmail","currency","subtotalMinor","taxMinor","totalMinor","paidMinor","notes","createdAt","updatedAt")
     VALUES ($1,$2,'DEMO-001','draft','Example Buyer','example@localhost','USD',50000,0,50000,0,$3,$4,$5)
     ON CONFLICT ("artistId","number") DO NOTHING`,
    [invoiceId, artistId, "Generic demo invoice for local payment practice. Not a live buyer.", now, now]
  );
  return { songs: ["Demo Opener", "Demo Closer"], setlist: "Demo set", invoice: "DEMO-001" };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
