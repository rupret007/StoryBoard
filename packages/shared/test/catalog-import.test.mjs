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
  const plan = shared.planCatalogImport({ vault: vaultFixture, showNight: showNightFixture });
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
  assert.ok(plan.skipped.some((row) => row.reason === "parked_catalog" && row.title === "Dirty Sketch"));
  assert.ok(!plan.songs.some((song) => /parked demo|trailer|solo|dirty sketch|travis/i.test(song.title)));

  const reconciliation = shared.reconcileCatalogImport(plan, { songs: [], setlists: [] });
  assert.equal(reconciliation.createSongs.length, 2);
  assert.equal(reconciliation.createSetlists.length, 2);
  assert.equal(reconciliation.skipSongs.length, 0);
});

test("Vault setlist_ready only includes already selected live-band songs", () => {
  const plan = shared.planCatalogImport({ vault: vaultFixture });
  const ready = plan.setlists.find((setlist) => setlist.sourceKey.endsWith(":set:setlist-ready"));
  assert.ok(ready);
  assert.deepEqual(ready.items.map((item) => item.label), ["Harbor Lights"]);
  assert.ok(!ready.items.some((item) => /parked|trailer|solo|dirty|travis/i.test(item.label)));
});

test("catalog import does not invent songs and skips existing source keys or titles", () => {
  const plan = shared.planCatalogImport({ vault: vaultFixture });
  const reconciliation = shared.reconcileCatalogImport(plan, {
    songs: [{ id: "song-existing", title: "Harbor Lights", sourceKey: null }],
    setlists: []
  });
  assert.equal(reconciliation.createSongs.length, 0);
  assert.equal(reconciliation.skipSongs[0]?.reason, "title_exists");
});

test("parked catalog and guest sets stay opt-in and stay on the current artist", () => {
  const plan = shared.planCatalogImport({
    vault: vaultFixture,
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
  const fromApi = shared.planCatalogImport({ vault: vaultFixture });
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
  assert.equal(shared.assertLocalCatalogPath("/tmp/app_api.json", "--source"), "/tmp/app_api.json");
  assert.equal(shared.catalogLocatorLooksRemote("https://private.example/vault.json"), true);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ vault: "https://example.invalid/app_api.json" }).success, false);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ vault: vaultFixture, sourceUrl: "https://example.invalid/app_api.json" }).success, false);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ showNight: { url: "https://example.invalid/show.json" } }).success, false);
});

test("Manager records from a Vault plan stay live-band only", () => {
  const records = shared.managerRecordsFromCatalogPlan(shared.planCatalogImport({ vault: vaultFixture }));
  assert.deepEqual(records.songs.map((song) => song.title), ["Harbor Lights"]);
  assert.equal(records.setlists[0]?.name, "Vault setlist-ready");
  assert.equal(records.setlists[0]?.itemCount, 1);
  assert.ok(!records.songs.some((song) => /parked|trailer|dirty|solo|travis/i.test(song.title)));
});

test("catalog:import CLI dry-runs the local sample and refuses remote URLs", () => {
  const script = join(dir, "../../../scripts/import-catalog.mjs");
  const sample = join(dir, "fixtures/vault-app-api.sample.json");
  const dryRun = spawnSync(process.execPath, [script, "--source", sample], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Catalog import dry-run/);
  assert.match(dryRun.stdout, /Harbor Lights/);
  assert.match(dryRun.stdout, /Vault setlist-ready/);
  assert.doesNotMatch(dryRun.stdout, /Parked Demo|Trailer Sketch|Dirty Sketch|Solo Sketch|travis/i);

  const remote = spawnSync(process.execPath, [script, "--source", "https://example.invalid/app_api.json"], { encoding: "utf8" });
  assert.notEqual(remote.status, 0);
  assert.match(remote.stderr, /local file path, not a URL/);
});
