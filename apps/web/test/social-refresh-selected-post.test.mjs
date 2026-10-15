import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/social/social-client.tsx"), "utf8");

test("Social refresh keeps the drop that was just drafted or approved", () => {
  assert.match(client, /async function refresh\(preferredPostId\?: string\)/);
  assert.match(client, /const selectedId = preferredPostId \?\? activePost\?\.id/);
  assert.match(client, /await refresh\(created\.id\)/);
  assert.match(client, /await refresh\(posted\.id\)/);
});
