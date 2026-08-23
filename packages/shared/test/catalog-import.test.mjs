import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

const vaultFixture = {
  schema_version: 1,
  generated: "2026-08-23",
  songs: [
    { id: "RD-0001", title: "Harbor Lights", project: "Rad Dad", is_original: true, key: "G", bpm: 118 },
    { id: "ST-0001", title: "Parked Demo", project: "Stalemate", is_original: true, key: "Am", bpm: "96" },
    { id: "TS-0001", title: "Trailer Sketch", project: "Trailer Swift", is_original: true, key: "D" },
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
  const plan = shared.planCatalogImport({ vault: vaultFixture, showNight: showNightFixture });
  assert.equal(plan.policyVersion, "catalog_import_v1");
  assert.deepEqual(plan.songs.map((song) => song.title).sort(), ["Cover Example", "Harbor Lights"]);
  assert.equal(plan.setlists.length, 2);
  assert.equal(plan.setlists[0]?.name, "Vault setlist-ready");
  assert.deepEqual(plan.setlists[0]?.items.map((item) => item.label), ["Harbor Lights"]);
  assert.equal(plan.setlists[1]?.name, "Rad Dad — official set");
  assert.equal(plan.setlists[1]?.items[0]?.label, "Harbor Lights");
  assert.equal(plan.counts.parkedSkipped, 2);
  assert.equal(plan.counts.guestSetsSkipped, 1);
  assert.ok(plan.skipped.some((row) => row.reason === "flex_pool_skipped"));
  assert.ok(plan.skipped.some((row) => row.reason === "setlist_ready_not_live" && row.title === "Parked Demo"));
  assert.ok(!plan.songs.some((song) => /parked demo|trailer|solo|travis/i.test(song.title)));

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
  assert.ok(!ready.items.some((item) => /parked|trailer|solo|travis/i.test(item.label)));
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
