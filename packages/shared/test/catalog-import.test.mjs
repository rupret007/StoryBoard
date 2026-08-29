import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
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

const emptyPublishedVault = {
  schema_version: 3,
  songs: [
    { id: "JS-0001", title: "Harbor Lights", project: "Jeff Story", import_scope: "not_live_band", is_original: true, key: "G", bpm: 118, played_live: ["Rad Dad (2026-05)"] },
    { id: "JS-0002", title: "Sidewalk Radio", project: "Something Dirty / Stalemate / Rad Dad", import_scope: "not_live_band", is_original: true, played_live: ["Rad Dad (2026-05)"] },
    { id: "ST-0001", title: "Parked Demo", project: "Stalemate", import_scope: "parked_catalog", is_original: true }
  ],
  setlist_ready: [
    { id: "JS-0001", title: "Harbor Lights", project: "Jeff Story" },
    { id: "ST-0001", title: "Parked Demo", project: "Stalemate" }
  ],
  setlist_ready_default_import: []
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
  assert.deepEqual(plan.songs.map((song) => song.title).sort(), ["Harbor Lights"]);
  assert.equal(plan.setlists.length, 2);
  assert.equal(plan.setlists[0]?.name, "Vault setlist-ready");
  assert.deepEqual(plan.setlists[0]?.items.map((item) => item.label), ["Harbor Lights"]);
  assert.equal(plan.setlists[1]?.name, "Rad Dad — official set");
  assert.deepEqual(plan.setlists[1]?.items.map((item) => item.label), ["Harbor Lights"]);
  assert.equal(plan.counts.parkedSkipped, 1);
  assert.equal(plan.counts.guestSetsSkipped, 1);
  assert.ok(plan.skipped.some((row) => row.reason === "flex_pool_skipped"));
  assert.ok(plan.skipped.some((row) => row.reason === "setlist_ready_not_live" && row.title === "Parked Demo"));
  assert.ok(plan.skipped.some((row) => (row.reason === "parked_catalog" || row.reason === "not_setlist_ready") && row.title === "Dirty Sketch"));
  assert.ok(plan.skipped.some((row) => row.reason === "not_setlist_ready" && row.title === "Solo Sketch"));
  assert.ok(plan.skipped.some((row) => row.reason === "show_night_not_in_vault" && row.title === "Cover Example"));
  assert.ok(!plan.songs.some((song) => /cover example|parked demo|trailer|solo|dirty sketch|travis/i.test(song.title)));

  const reconciliation = shared.reconcileCatalogImport(plan, { songs: [], setlists: [] });
  assert.equal(reconciliation.createSongs.length, 1);
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

test("master_catalog.json and raw song arrays are rejected while app_api.json stays valid", () => {
  const masterCatalog = {
    version: "1.6",
    songs: [
      { song_id: "RD-0001", canonical_title: "Harbor Lights", artist_project: "Rad Dad", classification: "original", key: "G", bpm: "118" },
      { song_id: "ST-0001", canonical_title: "Parked Demo", artist_project: "Stalemate", classification: "original", key: "Am" }
    ]
  };
  const fromMaster = shared.planCatalogImport({ vault: masterCatalog });
  assert.deepEqual(fromMaster.songs, []);
  assert.deepEqual(fromMaster.setlists, []);
  assert.equal(fromMaster.counts.vaultSongsSeen, 0);
  assert.ok(fromMaster.warnings.includes(shared.VAULT_SPINE_IMPORT_ERROR));

  const masterRequest = shared.catalogImportRequestSchema.safeParse({ vault: masterCatalog });
  assert.equal(masterRequest.success, false);
  assert.match(masterRequest.error?.issues.map((issue) => issue.message).join(" ") ?? "", /master_catalog\.json is the Vault spine, not the StoryBoard import feed; export data\/app_api\.json/);

  const fromArray = shared.planCatalogImport({ vault: masterCatalog.songs });
  assert.deepEqual(fromArray.songs, []);
  assert.ok(fromArray.warnings.includes(shared.VAULT_SPINE_IMPORT_ERROR));
  assert.equal(shared.catalogImportRequestSchema.safeParse({ vault: masterCatalog.songs }).success, false);

  const appApiRowsWithoutEnvelope = shared.planCatalogImport({ vault: [{ id: "RD-0001", title: "Harbor Lights" }] });
  assert.deepEqual(appApiRowsWithoutEnvelope.songs, []);
  assert.deepEqual(appApiRowsWithoutEnvelope.warnings, [shared.VAULT_FEED_IMPORT_ERROR]);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ vault: [{ id: "RD-0001", title: "Harbor Lights" }] }).success, false);

  const withShowNight = shared.planCatalogImport({ vault: masterCatalog, showNight: showNightFixture });
  assert.deepEqual(withShowNight.songs, []);
  assert.deepEqual(withShowNight.setlists, []);
  assert.equal(withShowNight.counts.showNightSongsSeen, 0);
  assert.ok(withShowNight.warnings.includes(shared.VAULT_SPINE_IMPORT_ERROR));

  const fromApi = shared.planCatalogImport({
    vault: {
      songs: [
        { id: "RD-0001", title: "Harbor Lights", project: "Rad Dad", is_original: true, key: "G", bpm: 118 },
        { id: "ST-0001", title: "Parked Demo", project: "Stalemate", is_original: true, key: "Am" }
      ]
    }
  });
  assert.deepEqual(fromApi.songs.map((song) => song.title), ["Harbor Lights"]);
  assert.equal(fromApi.songs[0]?.sourceKey, "vault:catalog_import_v1:RD-0001");
  assert.equal(fromApi.counts.parkedSkipped, 1);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ vault: vaultFixture }).success, true);
});

test("invalid or empty catalog payloads fail closed without inventing rows", () => {
  const empty = shared.planCatalogImport({});
  assert.equal(empty.songs.length, 0);
  assert.ok(empty.warnings.some((warning) => /no catalog payload/i.test(warning)));

  const invalid = shared.planCatalogImport({ vault: { generated: "today" }, showNight: { radDadSet: "nope" } });
  assert.equal(invalid.songs.length, 0);
  assert.equal(invalid.setlists.length, 0);
  assert.deepEqual(invalid.warnings, [shared.VAULT_FEED_IMPORT_ERROR]);
  assert.equal(invalid.counts.showNightSongsSeen, 0);

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

test("published default-live setlist is labeled as the slice and keeps parked-named projects on the current artist", () => {
  const plan = shared.planCatalogImport({ vault: vaultFixture });
  assert.equal(plan.setlists[0]?.name, shared.VAULT_DEFAULT_LIVE_SETLIST_NAME);
  assert.match(plan.setlists[0]?.notes ?? "", /setlist_ready_default_import|default_live/i);
  assert.match(plan.setlists[0]?.notes ?? "", /not a fourth live band/i);
  assert.ok(plan.songs.some((song) => song.title === "Everyday" && song.project === "Stalemate"));
  assert.ok(plan.warnings.some((warning) => /parked catalog name/i.test(warning) && /not a fourth live band/i.test(warning)));
  assert.ok(!plan.songs.some((song) => song.title === "Parked Demo"));

  const fallback = shared.planCatalogImport({ vault: radDadOnlyVault });
  assert.equal(fallback.setlists[0]?.name, shared.VAULT_SETLIST_READY_SETLIST_NAME);
  assert.ok(!fallback.warnings.some((warning) => /parked catalog name/i.test(warning)));
});

test("published empty setlist_ready_default_import stays empty without inventing a catalog", () => {
  const plan = shared.planCatalogImport({ vault: emptyPublishedVault });
  assert.deepEqual(plan.songs, []);
  assert.deepEqual(plan.setlists, []);
  assert.equal(plan.counts.vaultSongsSeen, 3);
  assert.equal(plan.counts.liveSelected, 0);
  assert.ok(plan.skipped.some((row) => row.reason === "not_live_band" && row.title === "Harbor Lights"));
  assert.ok(plan.skipped.some((row) => row.reason === "parked_catalog" && row.title === "Parked Demo"));
  assert.ok(plan.warnings.some((warning) => /published default-live slice/i.test(warning)));
});

test("Show Night does not mint Vault-excluded or unknown titles when a Vault catalog is present", () => {
  const withSample = shared.planCatalogImport({ vault: vaultFixture, showNight: showNightFixture });
  assert.deepEqual(withSample.songs.map((song) => song.title), ["Harbor Lights", "Sidewalk Radio", "Everyday"]);
  assert.equal(withSample.songs.every((song) => song.origin === "vault"), true);
  assert.ok(!withSample.songs.some((song) => song.title === "Cover Example"));
  assert.ok(withSample.skipped.some((row) => row.reason === "cover_not_active" && row.title === "Cover Example" && row.source === "show_night"));
  const official = withSample.setlists.find((setlist) => setlist.sourceKey.endsWith(":set:rad-dad"));
  assert.ok(official);
  assert.deepEqual(official.items.map((item) => item.label), ["Harbor Lights"]);

  const emptySlicePlusNight = shared.planCatalogImport({ vault: emptyPublishedVault, showNight: showNightFixture });
  assert.deepEqual(emptySlicePlusNight.songs, []);
  assert.deepEqual(emptySlicePlusNight.setlists, []);
  assert.ok(emptySlicePlusNight.skipped.some((row) => row.reason === "not_live_band" && row.title === "Harbor Lights" && row.source === "show_night"));
  assert.ok(emptySlicePlusNight.skipped.some((row) => row.reason === "show_night_not_in_vault" && row.title === "Cover Example"));
  assert.ok(!emptySlicePlusNight.songs.some((song) => /harbor lights|cover example|parked demo/i.test(song.title)));

  const showNightOnly = shared.planCatalogImport({ showNight: showNightFixture });
  assert.deepEqual(showNightOnly.songs.map((song) => song.title).sort(), ["Cover Example", "Harbor Lights"]);
  assert.equal(showNightOnly.songs.every((song) => song.origin === "show_night"), true);
  assert.equal(showNightOnly.setlists[0]?.name, "Rad Dad — official set");
  assert.deepEqual(showNightOnly.setlists[0]?.items.map((item) => item.label), ["Harbor Lights", "Cover Example"]);
});

test("live Vault schema 3 sample uses the published default-live slice and field map", () => {
  assert.deepEqual(shared.LIVE_CATALOG_PROJECTS, ["rad dad", "jeff story"]);
  assert.equal(shared.catalogImportScope("Jeff Story"), "default_live");
  assert.equal(shared.catalogImportScope("Something Dirty / Stalemate / Rad Dad"), "default_live");
  assert.equal(shared.catalogImportScope("Jeff Story", "not_live_band"), "not_live_band");
  assert.equal(shared.catalogImportScope("Rad Dad"), "default_live");
  assert.equal(shared.VAULT_STORYBOARD_FIELD_MAP.bpm, "bpm_int");
  assert.equal(shared.VAULT_STORYBOARD_FIELD_MAP.notes, "vault_ref");
  assert.equal(shared.VAULT_STORYBOARD_FIELD_MAP.active, "is_original !== false");

  const plan = shared.planCatalogImport({ vault: vaultFixture });
  assert.deepEqual(plan.songs.map((song) => song.title), ["Harbor Lights", "Sidewalk Radio", "Everyday"]);
  assert.equal(plan.setlists.length, 1);
  assert.equal(plan.setlists[0]?.name, "Vault default-live");
  assert.deepEqual(plan.setlists[0]?.items.map((item) => item.label), ["Harbor Lights", "Sidewalk Radio", "Everyday"]);
  assert.equal(plan.counts.vaultSongsSeen, 8);
  assert.equal(plan.counts.liveSelected, 3);
  assert.equal(plan.counts.parkedSkipped, 2);
  assert.ok(plan.warnings.some((warning) => /lanes are WIP slots/i.test(warning)));
  assert.ok(!plan.warnings.some((warning) => /none are labeled Rad Dad/i.test(warning)));
  assert.ok(plan.skipped.some((row) => row.reason === "not_setlist_ready" && row.title === "It's Alright"));
  assert.ok(plan.skipped.some((row) => row.reason === "parked_catalog" && row.title === "Parked Demo"));
  assert.ok(plan.skipped.some((row) => row.reason === "travis_books" && row.title === "Booking Calendar Blues"));
  assert.ok(plan.skipped.some((row) => row.reason === "cover_not_active" && row.title === "Cover Example"));
  assert.ok(!plan.songs.some((song) => /parked demo|trailer|booking calendar|cover example|it's alright/i.test(song.title)));

  const harbor = plan.songs.find((song) => song.title === "Harbor Lights");
  assert.equal(harbor?.bpm, 118);
  assert.equal(harbor?.notes, "vault:JS-0001");
  assert.equal(harbor?.active, true);
  assert.equal(harbor?.project, "Jeff Story");
  assert.equal(plan.songs.find((song) => song.title === "Sidewalk Radio")?.bpm, null);
  assert.equal(plan.songs.find((song) => song.title === "Everyday")?.notes, "vault:ST-0014");

  const optedIn = shared.planCatalogImport({ vault: vaultFixture, includeAllProjects: true });
  assert.deepEqual(optedIn.songs.map((song) => song.title).sort(), ["Cover Example", "Everyday", "Harbor Lights", "It's Alright", "Parked Demo", "Sidewalk Radio", "Trailer Sketch"]);
  assert.equal(optedIn.songs.find((song) => song.title === "Cover Example")?.active, false);
  assert.equal(optedIn.songs.find((song) => song.title === "Cover Example")?.bpm, 214);
  assert.ok(!optedIn.songs.some((song) => /booking calendar/i.test(song.title)));
  assert.ok(optedIn.setlists[0]?.items.some((item) => item.label === "Harbor Lights"));
  assert.ok(optedIn.setlists[0]?.items.some((item) => item.label === "Parked Demo"));

  const emptyStatus = shared.describeSongCatalogStatus({ songs: [], setlists: [] });
  assert.equal(emptyStatus.empty, true);
  assert.equal(emptyStatus.source, "none");
  assert.match(emptyStatus.message, /not a second catalog/i);
  assert.match(emptyStatus.message, /setlist_ready_default_import|default_live/i);
  assert.match(emptyStatus.message, /Band operations/i);
  assert.match(emptyStatus.message, /Music & setlists/i);

  const importedStatus = shared.describeSongCatalogStatus({
    songs: plan.songs.map((song) => ({ sourceKey: song.sourceKey })),
    setlists: plan.setlists.map((setlist) => ({ sourceKey: setlist.sourceKey }))
  });
  assert.equal(importedStatus.empty, false);
  assert.equal(importedStatus.source, "vault");
  assert.match(importedStatus.message, /3 songs recorded \(3 from Vault\)/i);
  assert.match(importedStatus.message, /setlist_ready_default_import|default_live/i);
  assert.match(importedStatus.message, /not a fourth live band/i);

  const annotatedBpm = shared.planCatalogImport({
    vault: { songs: [{ id: "RD-0099", title: "Cut Tempo", project: "Rad Dad", is_original: true, key: "E", bpm: "214 (cut)" }] }
  });
  assert.equal(annotatedBpm.songs[0]?.bpm, 214);
  assert.equal(annotatedBpm.songs[0]?.notes, "vault:RD-0099");

  const compatBpm = shared.planCatalogImport({
    vault: { songs: [{ id: "RD-0098", title: "Compat Tempo", project: "Rad Dad", is_original: true, key: "E", bpm: "214 (cut)", bpm_int: 214 }] }
  });
  assert.equal(compatBpm.songs[0]?.bpm, 214);

  const nullBpm = shared.planCatalogImport({
    vault: { songs: [{ id: "RD-0100", title: "No Tempo Yet", project: "Rad Dad", is_original: true, key: "G", bpm: null, bpm_int: null }] }
  });
  assert.equal(nullBpm.songs.length, 1);
  assert.equal(nullBpm.songs[0]?.title, "No Tempo Yet");
  assert.equal(nullBpm.songs[0]?.bpm, null);
  assert.equal(nullBpm.songs[0]?.active, true);
  assert.ok(!nullBpm.warnings.some((warning) => /not a valid app_api/i.test(warning)));
});

test("catalog status names Vault, Show Night, demo, and manual rows without calling non-Vault songs a Vault import", () => {
  assert.equal(shared.catalogSourceKind("vault:catalog_import_v1:JS-0001"), "vault");
  assert.equal(shared.catalogSourceKind("shownight:catalog_import_v1:song:rad-dad:harbor-lights"), "show_night");
  assert.equal(shared.catalogSourceKind("seed:demo:opener"), "demo");
  assert.equal(shared.catalogSourceKind(null), "manual");
  assert.equal(shared.catalogSourceLabel("vault:catalog_import_v1:JS-0001"), "Vault import");
  assert.equal(shared.catalogSourceLabel("shownight:catalog_import_v1:set:rad-dad"), "Show Night");
  assert.equal(shared.catalogSourceLabel("seed:demo:setlist"), "Practice data");
  assert.equal(shared.catalogSourceLabel(null), "Band operations");
  assert.match(shared.CATALOG_BAND_OPS_IMPORT_HINT, /Band operations/i);
  assert.match(shared.CATALOG_BAND_OPS_IMPORT_HINT, /Music & setlists/i);

  assert.deepEqual(shared.parseLocalCatalogJson('{"songs":[]}'), { songs: [] });
  assert.equal(shared.parseLocalCatalogJson("  "), undefined);
  assert.throws(() => shared.parseLocalCatalogJson("https://example.invalid/app_api.json", "Vault"), /local JSON, not a URL/i);
  assert.throws(() => shared.parseLocalCatalogJson('{"url":"https://example.invalid/app_api.json"}', "Vault"), /local JSON, not a URL/i);
  assert.throws(() => shared.parseLocalCatalogJson("{not-json", "Vault"), /valid JSON/i);

  const leftoverSpine = {
    version: "1.6",
    songs: [
      { song_id: "RD-0001", canonical_title: "Harbor Lights", artist_project: "Rad Dad", classification: "original" }
    ]
  };
  assert.deepEqual(shared.parseLocalCatalogJson(JSON.stringify(leftoverSpine), "Vault"), leftoverSpine);
  assert.equal(shared.vaultCatalogPayloadError(leftoverSpine), shared.VAULT_SPINE_IMPORT_ERROR);
  assert.throws(() => shared.parseLocalVaultFeedJson(JSON.stringify(leftoverSpine)), (error) => (
    error instanceof Error
    && error.message === shared.VAULT_SPINE_IMPORT_ERROR
    && !error.message.startsWith("{")
  ));
  assert.equal(shared.parseLocalVaultFeedJson("  "), undefined);
  assert.deepEqual(shared.parseLocalVaultFeedJson(JSON.stringify(vaultFixture)), vaultFixture);
  assert.throws(() => shared.parseLocalVaultFeedJson(JSON.stringify([{ id: "RD-0001", title: "Harbor Lights" }])), (error) => (
    error instanceof Error && error.message === shared.VAULT_FEED_IMPORT_ERROR
  ));

  const leftoverRequest = shared.catalogImportRequestSchema.safeParse({ vault: leftoverSpine });
  assert.equal(leftoverRequest.success, false);
  const flattenDump = JSON.stringify({
    message: leftoverRequest.success ? null : leftoverRequest.error.flatten(),
    error: "Bad Request",
    statusCode: 400
  });
  assert.match(flattenDump, /fieldErrors/);
  assert.equal(shared.catalogImportOperatorMessage(new Error(flattenDump)), shared.VAULT_SPINE_IMPORT_ERROR);
  assert.equal(shared.catalogImportOperatorMessage(new Error(shared.VAULT_SPINE_IMPORT_ERROR)), shared.VAULT_SPINE_IMPORT_ERROR);
  assert.equal(shared.catalogImportOperatorMessage(new Error(JSON.stringify({
    message: { message: "Catalog payload could not be read", warnings: [shared.VAULT_SPINE_IMPORT_ERROR] },
    error: "Bad Request",
    statusCode: 400
  }))), shared.VAULT_SPINE_IMPORT_ERROR);

  const previewPlan = shared.planCatalogImport({ vault: vaultFixture });
  const previewReconciliation = shared.reconcileCatalogImport(previewPlan, { songs: [], setlists: [] });
  const dryPreview = shared.describeCatalogImportPreview({
    dryRun: true,
    plan: previewPlan,
    reconciliation: previewReconciliation,
    created: { songs: 0, setlists: 0 }
  });
  assert.match(dryPreview.headline, /Dry-run: would create 3 songs and 1 setlist/i);
  assert.deepEqual(dryPreview.songTitles, ["Harbor Lights", "Sidewalk Radio", "Everyday"]);
  assert.equal(dryPreview.moreSongCount, 0);
  assert.equal(dryPreview.setlists[0]?.name, "Vault default-live");
  assert.match(dryPreview.skipLines.join(" "), /Travis books/i);
  assert.match(dryPreview.skipLines.join(" "), /Booking Calendar Blues/);
  assert.match(dryPreview.skipLines.join(" "), /not a fourth live band/i);
  assert.match(dryPreview.skipLines.join(" "), /Cover Example/);
  assert.ok(!dryPreview.songTitles.some((title) => /parked demo|booking calendar|cover example/i.test(title)));
  const appliedPreview = shared.describeCatalogImportPreview({
    dryRun: false,
    plan: previewPlan,
    reconciliation: previewReconciliation,
    created: { songs: 3, setlists: 1 }
  });
  assert.match(appliedPreview.headline, /Applied: wrote 3 songs and 1 setlist/i);
  assert.doesNotMatch(appliedPreview.headline, /would create/i);
  const existingPreview = shared.describeCatalogImportPreview({
    dryRun: true,
    plan: previewPlan,
    reconciliation: shared.reconcileCatalogImport(previewPlan, {
      songs: [{ id: "song-harbor", title: "Harbor Lights", sourceKey: "vault:catalog_import_v1:JS-0001" }],
      setlists: [{
        id: "setlist-existing",
        name: previewPlan.setlists[0].name,
        sourceKey: previewPlan.setlists[0].sourceKey
      }]
    }),
    created: { songs: 0, setlists: 0 }
  });
  assert.match(existingPreview.headline, /would create 2 songs and 0 setlists/);
  assert.match(existingPreview.existingSkipLine ?? "", /Harbor Lights/);
  assert.match(existingPreview.existingSkipLine ?? "", /Vault default-live/);
  assert.deepEqual(existingPreview.songTitles, ["Sidewalk Radio", "Everyday"]);
  assert.equal(existingPreview.moreSongCount, 0);
  assert.deepEqual(existingPreview.setlists, []);
  assert.doesNotMatch(existingPreview.songTitles.join(" "), /Harbor Lights/);

  const emptySlicePreview = shared.describeCatalogImportPreview({
    dryRun: true,
    plan: shared.planCatalogImport({ vault: emptyPublishedVault }),
    reconciliation: shared.reconcileCatalogImport(shared.planCatalogImport({ vault: emptyPublishedVault }), { songs: [], setlists: [] }),
    created: { songs: 0, setlists: 0 }
  });
  assert.match(emptySlicePreview.headline, /would create 0 songs and 0 setlists/i);
  assert.deepEqual(emptySlicePreview.songTitles, []);
  assert.match(emptySlicePreview.skipLines.join(" "), /not a fourth live band|not-live/i);
  assert.ok(!emptySlicePreview.songTitles.includes("Harbor Lights"));

  const demoStatus = shared.describeSongCatalogStatus({
    songs: [{ sourceKey: "seed:demo:opener" }, { sourceKey: "seed:demo:closer" }],
    setlists: [{ sourceKey: "seed:demo:setlist" }]
  });
  assert.equal(demoStatus.source, "demo");
  assert.equal(demoStatus.demoSongCount, 2);
  assert.match(demoStatus.message, /SEED_DEMO_OPS|practice/i);
  assert.match(demoStatus.message, /not a live catalog/i);
  assert.match(demoStatus.message, /not a Vault import/i);
  assert.doesNotMatch(demoStatus.message, /usually from a local Vault/i);
  assert.equal(shared.catalogWorkspaceUsesVaultFraming(demoStatus), false);

  const showNightStatus = shared.describeSongCatalogStatus({
    songs: [{ sourceKey: "shownight:catalog_import_v1:song:rad-dad:harbor-lights" }],
    setlists: [{ sourceKey: "shownight:catalog_import_v1:set:rad-dad" }]
  });
  assert.equal(showNightStatus.source, "show_night");
  assert.match(showNightStatus.message, /Show Night/i);
  assert.match(showNightStatus.message, /not a fourth live band/i);
  assert.match(showNightStatus.message, /not a second catalog/i);
  assert.equal(shared.catalogWorkspaceUsesVaultFraming(showNightStatus), false);

  const manualStatus = shared.describeSongCatalogStatus({
    songs: [{ sourceKey: null }],
    setlists: []
  });
  assert.equal(manualStatus.source, "manual");
  assert.match(manualStatus.message, /Band operations/i);
  assert.match(manualStatus.message, /not a Vault import/i);
  assert.equal(shared.catalogWorkspaceUsesVaultFraming(manualStatus), false);

  const mixedStatus = shared.describeSongCatalogStatus({
    songs: [{ sourceKey: "vault:catalog_import_v1:JS-0001" }, { sourceKey: "seed:demo:opener" }],
    setlists: []
  });
  assert.equal(mixedStatus.source, "mixed");
  assert.equal(mixedStatus.vaultSongCount, 1);
  assert.equal(mixedStatus.demoSongCount, 1);
  assert.match(mixedStatus.message, /1 from Vault/i);
  assert.match(mixedStatus.message, /1 practice\/demo/i);
  assert.match(mixedStatus.message, /not a live catalog or a fourth live band/i);
  assert.equal(shared.catalogWorkspaceUsesVaultFraming(mixedStatus), false);

  const vaultSongsManualSetlist = shared.describeSongCatalogStatus({
    songs: [{ sourceKey: "vault:catalog_import_v1:JS-0001" }],
    setlists: [{ sourceKey: null }]
  });
  assert.equal(vaultSongsManualSetlist.source, "vault");
  assert.equal(vaultSongsManualSetlist.manualSetlistCount, 1);
  assert.equal(shared.catalogWorkspaceUsesVaultFraming(vaultSongsManualSetlist), true);

  const overlappingShowNight = {
    event: { name: "Rad Dad + Friends", venue: "Example Room", dateLong: "Saturday, September 19, 2026" },
    radDadSet: [
      { number: 1, song: "Harbor Lights →", transition: true, special: false },
      { number: 2, song: "Everyday", transition: false, special: false }
    ]
  };
  const overlapPlan = shared.planCatalogImport({ vault: vaultFixture, showNight: overlappingShowNight });
  assert.deepEqual(overlapPlan.songs.map((song) => song.title), ["Harbor Lights", "Sidewalk Radio", "Everyday"]);
  assert.equal(overlapPlan.songs.every((song) => song.origin === "vault"), true);
  assert.equal(overlapPlan.setlists.length, 2);
  assert.equal(overlapPlan.setlists[0]?.name, "Vault default-live");
  assert.equal(overlapPlan.setlists[1]?.name, "Rad Dad — official set");
  const overlapStatus = shared.describeSongCatalogStatus({
    songs: overlapPlan.songs.map((song) => ({ sourceKey: song.sourceKey })),
    setlists: overlapPlan.setlists.map((setlist) => ({ sourceKey: setlist.sourceKey }))
  });
  assert.equal(overlapStatus.source, "mixed");
  assert.equal(overlapStatus.vaultSongCount, 3);
  assert.equal(overlapStatus.showNightSongCount, 0);
  assert.equal(overlapStatus.showNightSetlistCount, 1);
  assert.match(overlapStatus.message, /3 from Vault/i);
  assert.match(overlapStatus.message, /1 Show Night running-order setlist/i);
  assert.match(overlapStatus.message, /not a live catalog or a fourth live band/i);
  assert.equal(shared.catalogWorkspaceUsesVaultFraming(overlapStatus), true);
  assert.match(shared.CATALOG_NON_VAULT_LIBRARY_INTRO, /not a Vault import/i);
  assert.doesNotMatch(shared.CATALOG_NON_VAULT_LIBRARY_INTRO, /Stalemate or hybrid row in that slice stays here/i);

  const demoLibrary = shared.describeSongCatalogStatus({
    songs: [{ sourceKey: "seed:demo:opener" }],
    setlists: [{ sourceKey: "seed:demo:setlist" }]
  });
  assert.equal(shared.catalogWorkspaceUsesVaultFraming(demoLibrary), false);
  assert.match(shared.CATALOG_NON_VAULT_EMPTY_SETLIST_HINT, /not a Vault import/i);
});

const officialSetDump = {
  show: { title: "Rad Dad + Friends", venue: "Example Room", date: "Saturday, September 19, 2026" },
  sets: [
    { slug: "stalemate", title: "Stalemate" },
    { slug: "rad-dad", title: "Rad Dad" }
  ],
  songs: [
    { setSlug: "stalemate", position: 1, title: "Parked Demo", isOriginal: true },
    { setSlug: "rad-dad", position: 1, title: "Harbor Lights →", isOriginal: true, transition: true },
    { setSlug: "rad-dad", position: 2, title: "Cover Example", isOriginal: false }
  ],
  updatedAt: "2026-08-27T00:00:00.000Z"
};

const suggestionDump = {
  suggestions: [{ title: "Cover Example", artist: "Example Artist", notes: "please add this" }]
};

test("live Show Night official-set dump binds rad-dad and refuses suggestion rows", () => {
  assert.equal(shared.showNightPayloadLooksLikeOfficialSetDump(officialSetDump), true);
  assert.equal(shared.showNightPayloadLooksLikeOfficialSetDump(showNightFixture), false);
  assert.equal(shared.showNightPayloadLooksLikeSuggestion(suggestionDump), true);
  assert.equal(shared.showNightCatalogPayloadError(officialSetDump), null);
  assert.equal(shared.showNightCatalogPayloadError(suggestionDump), shared.SHOW_NIGHT_OFFICIAL_SET_IMPORT_ERROR);
  assert.equal(shared.showNightCatalogPayloadError({
    version: "1.6",
    songs: [{ song_id: "RD-0001", canonical_title: "Harbor Lights", artist_project: "Rad Dad", classification: "original" }]
  }), shared.VAULT_SPINE_IMPORT_ERROR);

  const leftover = shared.planCatalogImport({ showNight: officialSetDump });
  assert.equal(leftover.setlists[0]?.name, "Rad Dad — official set");
  assert.deepEqual(leftover.setlists[0]?.items.map((item) => item.label), ["Harbor Lights", "Cover Example"]);
  assert.equal(leftover.songs.find((song) => song.title === "Harbor Lights")?.active, true);
  assert.equal(leftover.songs.find((song) => song.title === "Cover Example")?.active, false);
  assert.ok(leftover.skipped.some((row) => row.reason === "guest_set_skipped" && row.title === "Stalemate"));
  assert.ok(!leftover.songs.some((song) => song.title === "Parked Demo"));
  assert.ok(!leftover.setlists.some((setlist) => /stalemate/i.test(setlist.name) && !/guest/i.test(setlist.name)));

  const withVault = shared.planCatalogImport({ vault: vaultFixture, showNight: officialSetDump });
  const official = withVault.setlists.find((setlist) => setlist.sourceKey.endsWith(":set:rad-dad"));
  assert.ok(official);
  assert.deepEqual(official.items.map((item) => item.label), ["Harbor Lights"]);
  assert.equal(withVault.songs.every((song) => song.origin === "vault"), true);
  assert.ok(withVault.skipped.some((row) => row.reason === "cover_not_active" && row.title === "Cover Example" && row.source === "show_night"));
  assert.ok(withVault.skipped.some((row) => row.reason === "guest_set_skipped" && row.title === "Stalemate"));
  assert.ok(!withVault.songs.some((song) => /cover example|parked demo/i.test(song.title)));
  const leftoverStatus = shared.describeSongCatalogStatus({
    songs: withVault.songs.map((song) => ({ sourceKey: song.sourceKey })),
    setlists: withVault.setlists.map((setlist) => ({ sourceKey: setlist.sourceKey }))
  });
  assert.equal(leftoverStatus.source, "mixed");
  assert.equal(leftoverStatus.vaultSongCount, 3);
  assert.equal(leftoverStatus.showNightSongCount, 0);
  assert.equal(leftoverStatus.showNightSetlistCount, 1);
  assert.equal(shared.catalogWorkspaceUsesVaultFraming(leftoverStatus), true);

  const guests = shared.planCatalogImport({ showNight: officialSetDump, includeGuestSets: true });
  assert.ok(guests.setlists.some((setlist) => setlist.name === "Stalemate — guest set"));
  assert.match(guests.setlists.find((setlist) => setlist.name.startsWith("Stalemate"))?.notes ?? "", /not a new live band|current artist only/i);

  const suggestionPlan = shared.planCatalogImport({ showNight: suggestionDump });
  assert.deepEqual(suggestionPlan.songs, []);
  assert.deepEqual(suggestionPlan.setlists, []);
  assert.equal(suggestionPlan.counts.showNightSongsSeen, 0);
  assert.ok(suggestionPlan.warnings.includes(shared.SHOW_NIGHT_OFFICIAL_SET_IMPORT_ERROR));

  assert.throws(() => shared.parseLocalShowNightJson(JSON.stringify(suggestionDump)), (error) => (
    error instanceof Error && error.message === shared.SHOW_NIGHT_OFFICIAL_SET_IMPORT_ERROR
  ));
  assert.deepEqual(shared.parseLocalShowNightJson(JSON.stringify(officialSetDump)), officialSetDump);
  assert.deepEqual(shared.parseLocalShowNightJson(JSON.stringify(showNightFixture)), showNightFixture);
  assert.equal(shared.parseLocalShowNightJson("  "), undefined);

  const suggestionRequest = shared.catalogImportRequestSchema.safeParse({ showNight: suggestionDump });
  assert.equal(suggestionRequest.success, false);
  const flattenDump = JSON.stringify({
    message: suggestionRequest.success ? null : suggestionRequest.error.flatten(),
    error: "Bad Request",
    statusCode: 400
  });
  assert.equal(shared.catalogImportOperatorMessage(new Error(flattenDump)), shared.SHOW_NIGHT_OFFICIAL_SET_IMPORT_ERROR);
  assert.equal(shared.catalogImportRequestSchema.safeParse({ showNight: officialSetDump }).success, true);
});

test("catalog:import CLI dry-runs app_api and refuses the Vault spine and remote URLs", async () => {
  const script = join(dir, "../../../scripts/import-catalog.mjs");
  const sample = join(dir, "fixtures/vault-app-api.sample.json");
  const dryRun = spawnSync(process.execPath, [script, "--source", sample], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /Catalog import dry-run/);
  assert.match(dryRun.stdout, /planned songs 3/);
  assert.match(dryRun.stdout, /setlist Vault default-live/);
  assert.match(dryRun.stdout, /not a fourth live band/);
  assert.match(dryRun.stdout, /song Harbor Lights/);
  assert.match(dryRun.stdout, /song Sidewalk Radio/);
  assert.match(dryRun.stdout, /song Everyday/);
  assert.doesNotMatch(dryRun.stdout, /Parked Demo|Trailer Sketch|Booking Calendar Blues|Cover Example|It's Alright/);

  const defaultSample = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.equal(defaultSample.status, 0, defaultSample.stderr);
  assert.match(defaultSample.stdout, /planned songs 3/);

  const remote = spawnSync(process.execPath, [script, "--source", "https://example.invalid/app_api.json"], { encoding: "utf8" });
  assert.notEqual(remote.status, 0);
  assert.match(remote.stderr, /local file path, not a URL/);

  const temporary = await mkdtemp(join(tmpdir(), "storyboard-vault-spine-"));
  try {
    const spine = join(temporary, "master_catalog.json");
    await writeFile(spine, JSON.stringify({
      version: "1.6",
      songs: [{ song_id: "TEST-0001", canonical_title: "Synthetic Test", artist_project: "Rad Dad", classification: "original" }]
    }));
    const rejected = spawnSync(process.execPath, [script, "--source", spine], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /master_catalog\.json is the Vault spine, not the StoryBoard import feed; export data\/app_api\.json/);
    const official = join(temporary, "official-set.json");
    await writeFile(official, JSON.stringify(officialSetDump));
    const officialDryRun = spawnSync(process.execPath, [script, "--show-night", official], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
    assert.equal(officialDryRun.status, 0, officialDryRun.stderr);
    assert.match(officialDryRun.stdout, /setlist Rad Dad — official set/);
    assert.match(officialDryRun.stdout, /song Harbor Lights/);
    assert.doesNotMatch(officialDryRun.stdout, /Parked Demo/);

    const suggestions = join(temporary, "suggestions.json");
    await writeFile(suggestions, JSON.stringify(suggestionDump));
    const refusedSuggestions = spawnSync(process.execPath, [script, "--show-night", suggestions], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
    assert.notEqual(refusedSuggestions.status, 0);
    assert.match(refusedSuggestions.stderr, /public suggestions are not the official set/i);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
