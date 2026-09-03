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

function setlistServiceFixture() {
  const version = new Date("2026-09-03T18:00:00.000Z");
  const writes = { created: null, patched: null, patchWhere: null, auditFields: null, auditClient: null };
  const client = {
    song: { count: async () => 0 },
    setlist: {
      findFirst: async () => ({ id: "setlist-a", artistId: "artist-a", sourceKey: "vault:catalog_import_v1:set:setlist-ready", updatedAt: version }),
      create: async ({ data }) => {
        writes.created = data;
        return { id: "setlist-a", ...data, items: data.items?.create ?? [] };
      },
      updateMany: async ({ where, data }) => {
        writes.patchWhere = where;
        writes.patched = data;
        return { count: where.updatedAt.getTime() === version.getTime() ? 1 : 0 };
      },
      findUniqueOrThrow: async () => ({ id: "setlist-a", artistId: "artist-a", items: [], updatedAt: writes.patched?.updatedAt ?? version })
    },
    setlistItem: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 })
    },
    $transaction: async (fn) => fn(client)
  };
  const service = new OperationsService(
    { client },
    { log: async (entry, auditClient) => { writes.auditFields = entry.metadata?.fields ?? null; writes.auditClient = auditClient; } },
    {}
  );
  return { service, writes, client };
}

test("manual setlist creation cannot mint catalog provenance through an internal caller", async () => {
  const { service, writes } = setlistServiceFixture();

  await service.createSetlist(
    "artist-a",
    {
      name: "Manual running order",
      status: "draft",
      items: [],
      sourceKey: "vault:catalog_import_v1:set:forged"
    },
    "owner",
    "operator-a"
  );

  assert.equal(writes.created.name, "Manual running order");
  assert.equal(writes.created.sourceKey, null);
  assert.equal(Object.hasOwn(writes.created.items.create[0] ?? {}, "sourceKey"), false);
});

test("manual setlist updates preserve importer-owned catalog provenance", async () => {
  const { service, writes, client } = setlistServiceFixture();

  await service.patchSetlist(
    "artist-a",
    "setlist-a",
    {
      name: "Corrected running order",
      expectedUpdatedAt: "2026-09-03T18:00:00.000Z",
      sourceKey: "shownight:catalog_import_v1:set:forged"
    },
    "owner",
    "operator-a"
  );

  assert.equal(writes.patched.name, "Corrected running order");
  assert.equal(Object.hasOwn(writes.patched, "sourceKey"), false);
  assert.equal(Object.hasOwn(writes.patched, "expectedUpdatedAt"), false);
  assert.equal(writes.patchWhere.updatedAt.toISOString(), "2026-09-03T18:00:00.000Z");
  assert.deepEqual(writes.auditFields, ["name"]);
  assert.equal(writes.auditClient, client);
});

test("stale setlist updates fail before replacing the running order or writing audit", async () => {
  const { service, writes } = setlistServiceFixture();

  await assert.rejects(
    () => service.patchSetlist(
      "artist-a",
      "setlist-a",
      { name: "Stale running order", expectedUpdatedAt: "2026-09-03T17:59:59.000Z" },
      "owner",
      "operator-a"
    ),
    (error) => error?.getStatus?.() === 409 && /changed since you opened it/i.test(error.message)
  );

  assert.equal(writes.patched, null);
  assert.equal(writes.auditFields, null);
});
