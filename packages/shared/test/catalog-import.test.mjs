import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);
const vaultFixture = JSON.parse(await readFile(join(dir, "fixtures/vault-app-api.sample.json"), "utf8"));

const radDadOnlyVault = {
  schema_version: 1,
  generated: "2026-08-23",
  songs: [
    { id: "RD-0001", title: "Harbor Lights", project: "Rad Dad", is_original: true, key: "G", bpm: 118 },
    { id: "ST-0001", title: "Parked Demo", project: "Stalemate", is_original: true, key: "Am", bpm: "96" },
    { id: "TS-0001", title: "Trailer Sketch", project: "Trailer Swift", is_original: true, key: "D" },
    { id: "SD-0001", title: "Dirty Sketch", project: "Something Dirty", is_original: true, key: "E" },
    { id: "JS-0001", title: "Solo Sketch", project: "Jeff Story", is_original: true, key: "C" }
  ],
  setlist_ready: [
    { id: "RD-0001", title: "Harbor Lights", key: "G", project: "Rad Dad" },
    { id: "ST-0001", title: "Parked Demo", key: "Am", project: "Stalemate" }
  ]
};

const showNightFixture = {
  event: { name: "Rad Dad + Friends", venue: "Example Room", dateLong: "Saturday, September 19, 2026" },
  radDadSet: [
    { number: 1, song: "Harbor Lights →", transition: true, special: false },
    { number: 2, song: "Cover Example", transition: false, special: false }
  ],
  guestSets: [
    { name: "Stalemate", songs: [{ number: 1, song: "Parked Demo", cue: "" }] }
  ],
  flexSongs: ["Maybe Later"]
};

test("catalog import defaults to the live band and dry-run reconcile creates nothing against an empty table", () => {
  const plan = shared.planCatalogImport({ vault: radDadOnlyVault, showNight: showNightFixture });
  assert.equal(plan.policyVersion, "catalog_import_v1");
  assert.deepEqual(plan.songs.map((song) => song.title).sort(), ["Cover Example", "Harbor Lights"]);
  assert.equal(plan.setlists.length, 2);
  assert.equal(plan.setlists[0]?.name, "Vault setlist-ready");
  assert.deepEqual(plan.setlists[0]?.items.map((item) => item.label), ["Harbor Lights"]);
  assert.equal(plan.setlists[1]?.name, "Rad Dad — official set");
  assert.equal(plan.setlists[1]?.items[0]?.label, "Harbor Lights");
  assert.equal(plan.counts.parkedSkipped, 3);
  assert.equal(plan.counts.guestSetsSkipped, 1);
  assert.ok(plan.skipped.some((row) => row.reason === "flex_pool_skipped"));
  assert.ok(plan.skipped.some((row) => row.reason === "setlist_ready_not_live" && row.title === "Parked Demo"));
  assert.ok(plan.skipped.some((row) => (row.reason === "parked_catalog" || row.reason === "not_setlist_ready") && row.title === "Dirty Sketch"));
  assert.ok(plan.skipped.some((row) => row.reason === "not_setlist_ready" && row.title === "Solo Sketch"));
  assert.ok(!plan.songs.some((song) => /parked demo|trailer|solo|dirty sketch|travis/i.test(song.title)));

  const reconciliation = shared.reconcileCatalogImport(plan, { songs: [], setlists: [] });
  assert.equal(reconciliation.createSongs.length, 2);
  assert.equal(reconciliation.createSetlists.length, 2);
  assert.equal(reconciliation.skipSongs.length, 0);
});

test("Vault setlist_ready only includes already selected live-band songs", () => {
  const plan = shared.planCatalogImport({ vault: radDadOnlyVault });
  const ready = plan.setlists.find((setlist) => setlist.sourceKey.endsWith(":set:setlist-ready"));
  assert.ok(ready);
  assert.deepEqual(ready.items.map((item) => item.label), ["Harbor Lights"]);
  assert.ok(!ready.items.some((item) => /parked|trailer|solo|dirty|travis/i.test(item.label)));
});

test("catalog import does not invent songs and skips existing source keys or titles", () => {
  const plan = shared.planCatalogImport({ vault: radDadOnlyVault });
  const reconciliation = shared.reconcileCatalogImport(plan, {
    songs: [{ id: "song-existing", title: "Harbor Lights", sourceKey: null }],
    setlists: []
  });
  assert.equal(reconciliation.createSongs.length, 0);
  assert.equal(reconciliation.skipSongs[0]?.reason, "title_exists");
});

test("parked catalog and guest sets stay opt-in and stay on the current artist", () => {
  const plan = shared.planCatalogImport({
    vault: radDadOnlyVault,
    showNight: showNightFixture,
    includeParked: true,
    includeGuestSets: true
  });
  assert.ok(plan.songs.some((song) => song.title === "Parked Demo"));
  assert.ok(plan.songs.some((song) => song.title === "Trailer Sketch"));
  assert.ok(plan.songs.some((song) => song.title === "Dirty Sketch"));
  assert.ok(!plan.songs.some((song) => song.title === "Solo Sketch"));
  assert.ok(plan.setlists.some((setlist) => setlist.name === "Stalemate — guest set"));
  assert.match(plan.setlists.find((setlist) => setlist.name.startsWith("Stalemate"))?.notes ?? "", /current artist only/i);
});

test("master_catalog.json field names normalize to the same live-band plan as app_api.json", () => {
  const masterCatalog = {
    version: "1.6",
    songs: [
      { song_id: "RD-0001", canonical_title: "Harbor Lights", artist_project: "Rad Dad", classification: "original", key: "G", bpm: "118" },
      { song_id: "ST-0001", canonical_title: "Parked Demo", artist_project: "Stalemate", classification: "original", key: "Am" }
    ]
  };
  const fromMaster = shared.planCatalogImport({ vault: masterCatalog });
  const fromApi = shared.planCatalogImport({
    vault: {
      songs: [
        { id: "RD-0001", title: "Harbor Lights", project: "Rad Dad", is_original: true, key: "G", bpm: 118 },
        { id: "ST-0001", title: "Parked Demo", project: "Stalemate", is_original: true, key: "Am" }
      ]
    }
  });
  assert.deepEqual(fromMaster.songs.map((song) => song.title), fromApi.songs.map((song) => song.title));
  assert.equal(fromMaster.songs[0]?.sourceKey, "vault:catalog_import_v1:RD-0001");
  assert.equal(fromMaster.counts.parkedSkipped, 1);

  const fromArray = shared.planCatalogImport({ vault: masterCatalog.songs });
  assert.deepEqual(fromArray.songs.map((song) => song.title), ["Harbor Lights"]);
});

test("invalid or empty catalog payloads fail closed without inventing rows", () => {
  const empty = shared.planCatalogImport({});
  assert.equal(empty.songs.length, 0);
  assert.ok(empty.warnings.some((warning) => /no catalog payload/i.test(warning)));

  const invalid = shared.planCatalogImport({ vault: { generated: "today" }, showNight: { radDadSet: "nope" } });
  assert.equal(invalid.songs.length, 0);
  assert.equal(invalid.setlists.length, 0);
  assert.ok(invalid.warnings.length >= 2);

  assert.equal(shared.catalogImportRequestSchema.safeParse({}).success, false);
  assert.equal(shared.catalogImportRequestSchema.parse({ vault: vaultFixture }).dryRun, true);
});

test("catalog import rejects remote URL locators and accepts only local paths", () => {
  assert.throws(() => shared.assertLocalCatalogPath("https://example.invalid/app_api.json", "--source"), /local file path, not a URL/);
  assert.throws(() => shared.assertLocalCatalogPath("file:///tmp/master_catalog.json", "VAULT_CATALOG_PATH"), /local file path, not a URL/);
  assert.throws(() => shared.assertLocalCatalogPath("//private.example/vault.json", "--source"), /local file path, not a URL/);
  assert.equal(shared.assertLocalCatalogPath("/tmp/app_api.json", "--source"), "/tmp/app_api.json");
  assert.equal(shared.catalogLocatorLooksRemote("https://private.example/vault.json"), true);
  assert.equal(shared.catalogLocatorLooksRemote("//private.example/vault.json"), true);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ vault: "https://example.invalid/app_api.json" }).success, false);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ vault: vaultFixture, sourceUrl: "https://example.invalid/app_api.json" }).success, false);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ showNight: { url: "https://example.invalid/show.json" } }).success, false);
});

test("Manager records from a Vault plan stay live-band only", () => {
  const records = shared.managerRecordsFromCatalogPlan(shared.planCatalogImport({ vault: radDadOnlyVault }));
  assert.deepEqual(records.songs.map((song) => song.title), ["Harbor Lights"]);
  assert.equal(records.setlists[0]?.name, "Vault setlist-ready");
  assert.equal(records.setlists[0]?.itemCount, 1);
  assert.ok(!records.songs.some((song) => /parked|trailer|dirty|solo|travis/i.test(song.title)));
});

test("real Vault app_api.json shape seeds setlist_ready live-band rows and honors the StoryBoard field map", () => {
  const plan = shared.planCatalogImport({ vault: vaultFixture });
  assert.deepEqual(plan.songs.map((song) => song.title).sort(), ["Harbor Lights", "Sidewalk Radio"]);
  assert.equal(plan.songs.find((song) => song.title === "Harbor Lights")?.bpm, 118);
  assert.equal(plan.songs.find((song) => song.title === "Harbor Lights")?.notes, "vault:JS-0001");
  assert.equal(plan.songs.find((song) => song.title === "Harbor Lights")?.active, true);
  assert.equal(plan.songs.find((song) => song.title === "Sidewalk Radio")?.bpm, null);
  assert.equal(plan.setlists[0]?.name, "Vault setlist-ready");
  assert.deepEqual(plan.setlists[0]?.items.map((item) => item.label), ["Harbor Lights", "Sidewalk Radio"]);
  assert.ok(plan.warnings.some((warning) => /lanes are WIP slots/i.test(warning)));
  assert.ok(plan.skipped.some((row) => row.reason === "parked_catalog" && row.title === "Parked Demo"));
  assert.ok(plan.skipped.some((row) => row.reason === "travis_books" && row.title === "Booking Calendar Blues"));
  assert.ok(plan.skipped.some((row) => row.reason === "cover_not_active" && row.title === "Cover Example"));
  assert.ok(!plan.songs.some((song) => /parked|trailer|booking calendar|cover example/i.test(song.title)));
  assert.ok(plan.songs.every((song) => song.notes?.startsWith("vault:")));

  const emptyStatus = shared.describeSongCatalogStatus({ songs: [], setlists: [] });
  assert.equal(emptyStatus.empty, true);
  assert.equal(emptyStatus.source, "none");
  assert.match(emptyStatus.message, /not a second catalog/i);

  const parsedBpm = shared.planCatalogImport({
    vault: { songs: [{ id: "JS-0099", title: "Cut Tempo", project: "Jeff Story", is_original: true, key: "E", bpm: "214 (cut)", bpm_int: 214, vault_ref: "vault:JS-0099" }] }
  });
  assert.equal(parsedBpm.songs[0]?.bpm, 214);
  assert.equal(parsedBpm.songs[0]?.notes, "vault:JS-0099");
});

test("catalog:import CLI dry-runs the local sample and refuses remote URLs", () => {
  const script = join(dir, "../../../scripts/import-catalog.mjs");
  const sample = join(dir, "fixtures/vault-app-api.sample.json");
  const dryRun = spawnSync(process.execPath, [script, "--source", sample], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Catalog import dry-run/);
  assert.match(dryRun.stdout, /Harbor Lights/);
  assert.match(dryRun.stdout, /Sidewalk Radio/);
  assert.match(dryRun.stdout, /Vault setlist-ready/);
  assert.doesNotMatch(dryRun.stdout, /Parked Demo|Trailer Sketch|Booking Calendar Blues|Cover Example/i);

  const defaultSample = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.equal(defaultSample.status, 0, defaultSample.stderr);
  assert.match(defaultSample.stdout, /Harbor Lights/);

  const remote = spawnSync(process.execPath, [script, "--source", "https://example.invalid/app_api.json"], { encoding: "utf8" });
  assert.notEqual(remote.status, 0);
  assert.match(remote.stderr, /local file path, not a URL/);
});
