import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const store = await load("social/social-media.store.js");

test("default media root is the repo data directory when the API cwd is apps/api", () => {
  const previous = process.cwd();
  process.chdir(join(dir, ".."));
  try {
    assert.equal(store.socialMediaRoot(), join(dir, "..", "..", "..", "data", "social-media"));
  } finally {
    process.chdir(previous);
  }
});

test("appended chunks stay sequential on disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-social-"));
  const key = store.socialMediaStorageKey("artist-1", "asset-1");
  const path = store.socialMediaAbsolutePath(root, key);
  await store.createSocialMediaFile(path);
  assert.equal(await store.appendSocialMediaChunk(path, Buffer.from("abcd"), 0), 4);
  assert.equal(await store.appendSocialMediaChunk(path, Buffer.from("ef"), 4), 6);
  assert.equal(await readFile(path, "utf8"), "abcdef");
  await assert.rejects(() => store.appendSocialMediaChunk(path, Buffer.from("x"), 2), /expected offset/);
});
