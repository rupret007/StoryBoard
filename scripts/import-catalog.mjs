#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(here, "../packages/shared/dist/index.js")).href);

function cuidLike() {
  const t = Date.now().toString(36);
  const r = randomBytes(8).toString("hex");
  return `c${t}${r}`.slice(0, 25);
}

function usage() {
  return `Import a local Vault app_api.json and/or Show Night show.json into the current artist's song library.

Dry-run is the default. This command never fetches a remote catalog and never
creates booking pitches, contacts, or a second artist.

Usage:
  pnpm catalog:import -- --source ./app_api.json
  pnpm catalog:import -- --source ./app_api.json --show-night ./show.json
  pnpm catalog:import -- --source ./app_api.json --apply --artist default

Options:
  --source <path>          Local Vault data/app_api.json
  --show-night <path>      Local Show Night content/show.json
  --artist <slug>          Artist slug (default: default)
  --include-parked         Also import Stalemate / Trailer Swift / Something Dirty
  --include-guest-sets     Import Show Night guest sets onto the same artist
  --include-all-projects   Import every vault project onto the same artist
  --apply                  Write songs/setlists (requires DATABASE_URL)
  --dry-run                Explicit preview (default)
`;
}

function parseArgs(argv) {
  const options = {
    source: null,
    showNight: null,
    artist: "default",
    includeParked: false,
    includeGuestSets: false,
    includeAllProjects: false,
    apply: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--include-parked") options.includeParked = true;
    else if (arg === "--include-guest-sets") options.includeGuestSets = true;
    else if (arg === "--include-all-projects") options.includeAllProjects = true;
    else if (arg === "--source" || arg === "--show-night" || arg === "--artist") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--source") options.source = value;
      if (arg === "--show-night") options.showNight = value;
      if (arg === "--artist") options.artist = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function assertLocalPath(value, label) {
  if (!value) return;
  if (/^[a-z]+:\/\//i.test(value)) {
    throw new Error(`${label} must be a local file path, not a URL`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function printPlan(plan, reconciliation, dryRun) {
  console.log(dryRun ? "Catalog import dry-run (no writes)" : "Catalog import apply");
  console.log(`policy ${plan.policyVersion}`);
  console.log(`planned songs ${plan.songs.length} · setlists ${plan.setlists.length}`);
  console.log(`vault seen ${plan.counts.vaultSongsSeen} · show-night seen ${plan.counts.showNightSongsSeen}`);
  console.log(`parked skipped ${plan.counts.parkedSkipped} · guest sets skipped ${plan.counts.guestSetsSkipped}`);
  if (plan.warnings.length) console.log(`warnings: ${plan.warnings.join("; ")}`);
  for (const song of plan.songs.slice(0, 20)) console.log(`  song ${song.title} (${song.sourceKey})`);
  if (plan.songs.length > 20) console.log(`  … ${plan.songs.length - 20} more songs`);
  for (const setlist of plan.setlists) console.log(`  setlist ${setlist.name} (${setlist.items.length} items)`);
  if (reconciliation) {
    console.log(`would create songs ${reconciliation.createSongs.length} · skip ${reconciliation.skipSongs.length}`);
    console.log(`would create setlists ${reconciliation.createSetlists.length} · skip ${reconciliation.skipSetlists.length}`);
  }
}

async function applyPlan(artistSlug, reconciliation) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for --apply");
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const artist = await client.query(`SELECT id FROM "Artist" WHERE slug = $1`, [artistSlug]);
    if (!artist.rows.length) throw new Error(`Artist slug not found: ${artistSlug}`);
    const artistId = artist.rows[0].id;
    const existingSongs = await client.query(`SELECT id, title, "sourceKey" FROM "Song" WHERE "artistId" = $1`, [artistId]);
    const existingSetlists = await client.query(`SELECT id, "sourceKey" FROM "Setlist" WHERE "artistId" = $1`, [artistId]);
    const idBySourceKey = new Map(existingSongs.rows.filter((row) => row.sourceKey).map((row) => [row.sourceKey, row.id]));
    const idByTitle = new Map(existingSongs.rows.map((row) => [row.title.toLocaleLowerCase(), row.id]));
    await client.query("BEGIN");
    try {
      for (const song of reconciliation.createSongs) {
        const id = cuidLike();
        const now = new Date();
        await client.query(
          `INSERT INTO "Song" ("id","artistId","title","musicalKey","bpm","notes","sourceKey","active","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)`,
          [id, artistId, song.title, song.musicalKey, song.bpm, song.notes, song.sourceKey, now, now]
        );
        idBySourceKey.set(song.sourceKey, id);
        idByTitle.set(song.title.toLocaleLowerCase(), id);
      }
      for (const skipped of reconciliation.skipSongs) {
        const existing = existingSongs.rows.find((row) => row.sourceKey === skipped.sourceKey)
          ?? existingSongs.rows.find((row) => row.title.toLocaleLowerCase() === (skipped.title ?? "").toLocaleLowerCase());
        if (existing) idBySourceKey.set(skipped.sourceKey, existing.id);
      }
      for (const setlist of reconciliation.createSetlists) {
        const setlistId = cuidLike();
        const now = new Date();
        await client.query(
          `INSERT INTO "Setlist" ("id","artistId","name","status","notes","sourceKey","createdAt","updatedAt")
           VALUES ($1,$2,$3,'draft',$4,$5,$6,$7)`,
          [setlistId, artistId, setlist.name, setlist.notes, setlist.sourceKey, now, now]
        );
        let sortOrder = 0;
        for (const item of setlist.items) {
          const songId = idBySourceKey.get(item.songSourceKey) ?? idByTitle.get(item.label.toLocaleLowerCase());
          if (!songId) continue;
          await client.query(
            `INSERT INTO "SetlistItem" ("id","setlistId","songId","itemType","label","sortOrder","transitionNotes")
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [cuidLike(), setlistId, songId, item.itemType, item.label, sortOrder, item.transitionNotes]
          );
          sortOrder += 1;
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log(`Applied to artist ${artistSlug}: created ${reconciliation.createSongs.length} songs and ${reconciliation.createSetlists.length} setlists.`);
  } finally {
    await client.end();
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(usage());
    process.exit(1);
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  try {
    assertLocalPath(options.source, "--source");
    assertLocalPath(options.showNight, "--show-night");
    if (!options.source && !options.showNight) throw new Error("Provide --source and/or --show-night");
    const vault = options.source ? await readJson(resolve(options.source)) : undefined;
    const showNight = options.showNight ? await readJson(resolve(options.showNight)) : undefined;
    const plan = shared.planCatalogImport({
      vault,
      showNight,
      includeParked: options.includeParked,
      includeGuestSets: options.includeGuestSets,
      includeAllProjects: options.includeAllProjects
    });
    let existing = { songs: [], setlists: [] };
    if (process.env.DATABASE_URL) {
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        const artist = await client.query(`SELECT id FROM "Artist" WHERE slug = $1`, [options.artist]);
        if (artist.rows.length) {
          const existingSongs = await client.query(`SELECT id, title, "sourceKey" FROM "Song" WHERE "artistId" = $1`, [artist.rows[0].id]);
          const existingSetlists = await client.query(`SELECT id, "sourceKey" FROM "Setlist" WHERE "artistId" = $1`, [artist.rows[0].id]);
          existing = { songs: existingSongs.rows, setlists: existingSetlists.rows };
        } else if (options.apply) {
          throw new Error(`Artist slug not found: ${options.artist}`);
        }
      } finally {
        await client.end();
      }
    } else if (options.apply) {
      throw new Error("DATABASE_URL is required for --apply");
    }
    const reconciliation = shared.reconcileCatalogImport(plan, existing);
    printPlan(plan, reconciliation, !options.apply);
    if (options.apply) {
      await applyPlan(options.artist, reconciliation);
    } else {
      console.log("Re-run with --apply to write these rows. Existing titles/source keys are skipped.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
