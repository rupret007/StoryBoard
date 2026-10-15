import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/social/social-client.tsx"), "utf8");

test("Social drop zone accepts phone files and reports chunked upload progress", () => {
  assert.match(client, /data-testid="social-file-dropzone"/);
  assert.match(client, /data-testid="social-file-input"/);
  assert.match(client, /accept="image\/\*,video\/\*/);
  assert.match(client, /onDrop/);
  assert.match(client, /data-testid="social-upload-progress"/);
  assert.match(client, /Content-Range/);
  assert.match(client, /mediaAssetId/);
});
