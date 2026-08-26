import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const operationsMod = await import(
  pathToFileURL(join(dir, "..", "dist", "operations", "operations.service.js")).href
);
const OperationsService =
  operationsMod.default?.OperationsService ?? operationsMod.OperationsService;

function serviceFixture() {
  const writes = { created: null, patched: null };
  const client = {
    song: {
      create: async ({ data }) => {
        writes.created = data;
        return { id: "song-a", ...data };
      },
      findFirst: async () => ({
        id: "song-a",
        artistId: "artist-a",
        title: "Existing song",
        sourceKey: "vault:catalog_import_v1:song-a"
      }),
      update: async ({ data }) => {
        writes.patched = data;
        return { id: "song-a", artistId: "artist-a", ...data };
      }
    }
  };
  const service = new OperationsService(
    { client },
    { log: async () => undefined },
    {}
  );
  return { service, writes };
}

test("manual song creation cannot mint catalog provenance through an internal caller", async () => {
  const { service, writes } = serviceFixture();

  await service.createSong(
    "artist-a",
    {
      title: "Manual song",
      active: true,
      sourceKey: "vault:catalog_import_v1:forged"
    },
    "owner",
    "operator-a"
  );

  assert.equal(writes.created.title, "Manual song");
  assert.equal(writes.created.sourceKey, null);
});

test("manual song updates preserve importer-owned catalog provenance", async () => {
  const { service, writes } = serviceFixture();

  await service.patchSong(
    "artist-a",
    "song-a",
    {
      title: "Corrected title",
      sourceKey: "vault:catalog_import_v1:forged"
    },
    "owner",
    "operator-a"
  );

  assert.equal(writes.patched.title, "Corrected title");
  assert.equal(Object.hasOwn(writes.patched, "sourceKey"), false);
});
