import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/social/social-client.tsx"), "utf8");

test("Social composer keeps the drop that was just drafted or approved", () => {
  assert.match(client, /function keepPost\(post: SocialPost\)/);
  assert.match(client, /mergeSocialPost\(current, post\)/);
  assert.match(client, /keepPost\(created\)/);
  assert.match(client, /keepPost\(posted\)/);
  assert.doesNotMatch(client, /await refresh\(/);
});
