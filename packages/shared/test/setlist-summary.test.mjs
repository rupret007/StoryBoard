import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("setlist summary keeps unknown song time explicit and excludes breaks", () => {
  const result = shared.summarizeSetlist([
    { id: "item-a", itemType: "song", song: { id: "song-a", title: "Opener", durationSeconds: 245 } },
    { id: "item-break", itemType: "break", label: "Set break" },
    { id: "item-b", itemType: "song", song: { id: "song-b", title: "Closer", durationSeconds: null } },
    { id: "item-note", itemType: "note", label: "Thank the venue" }
  ]);

  assert.deepEqual(result, {
    policyVersion: "setlist_summary_v1",
    itemCount: 4,
    songCount: 2,
    breakCount: 1,
    noteCount: 1,
    knownDurationSongCount: 1,
    unknownDurationSongCount: 1,
    totalSongDurationSeconds: 245,
    timingStatus: "incomplete",
    durationLabel: "4:05 known + 1 song duration missing"
  });
});

test("setlist summary formats a complete long set without inventing break time", () => {
  const result = shared.summarizeSetlist([
    { itemType: "song", song: { durationSeconds: 1800 } },
    { itemType: "break", label: "Intermission" },
    { itemType: "song", song: { durationSeconds: 2050 } }
  ]);

  assert.equal(result.timingStatus, "timed");
  assert.equal(result.totalSongDurationSeconds, 3850);
  assert.equal(result.durationLabel, "1:04:10 song time");
});

test("setlist schemas require coherent song, break, and note items", () => {
  assert.equal(shared.setlistCreateSchema.safeParse({ name: "Good set", items: [{ itemType: "song", songId: "song-a" }, { itemType: "break", label: "Set break" }, { itemType: "note", label: "Thank the room" }] }).success, true);
  assert.equal(shared.setlistCreateSchema.safeParse({ name: "Missing song", items: [{ itemType: "song" }] }).success, false);
  assert.equal(shared.setlistCreateSchema.safeParse({ name: "Missing break label", items: [{ itemType: "break" }] }).success, false);
  assert.equal(shared.setlistPatchSchema.safeParse({ items: [{ itemType: "note", songId: "song-a", label: "Invalid" }] }).success, false);
  assert.equal(shared.setlistPatchSchema.safeParse({ items: [{ itemType: "song", label: "Uncatalogued cover" }] }).success, true);
});
