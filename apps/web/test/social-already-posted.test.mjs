import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/social/social-client.tsx"), "utf8");

test("Social approve-and-post is disabled after a drop already posted or failed", () => {
  assert.match(client, /socialApproveAndPostBlockReason/);
  assert.match(client, /data-testid="social-approve-blocked"/);
  assert.match(client, /Boolean\(approveBlockReason\)/);
  assert.match(client, /Already posted/);
  assert.match(client, /!activePost \|\| approveBlockReason\) return/);
});
