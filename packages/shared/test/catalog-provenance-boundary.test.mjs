import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const operations = await import(
  pathToFileURL(join(dir, "../dist/schemas/operations.js")).href
);

test("manual song writes cannot mint catalog provenance", () => {
  assert.equal(
    operations.songCreateSchema.safeParse({
      title: "Manual song",
      sourceKey: "vault:catalog_import_v1:forged"
    }).success,
    false
  );
  assert.equal(
    operations.songPatchSchema.safeParse({
      sourceKey: "shownight:catalog_import_v1:song:forged"
    }).success,
    false
  );
  assert.deepEqual(
    operations.songCreateSchema.parse({ title: "Manual song" }),
    { title: "Manual song", active: true }
  );
});

test("manual setlist writes cannot mint catalog provenance", () => {
  assert.equal(
    operations.setlistCreateSchema.safeParse({
      name: "Manual running order",
      sourceKey: "vault:catalog_import_v1:set:forged"
    }).success,
    false
  );
  assert.equal(
    operations.setlistPatchSchema.safeParse({
      expectedUpdatedAt: "2026-09-03T18:00:00.000Z",
      sourceKey: "shownight:catalog_import_v1:set:forged"
    }).success,
    false
  );
  assert.deepEqual(
    operations.setlistCreateSchema.parse({ name: "Manual running order" }),
    { name: "Manual running order", status: "draft", items: [] }
  );
});
