import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/social/social-client.tsx"), "utf8");

test("Social caption UI offers variants, inline edit, and a template fallback notice", () => {
  assert.match(client, /data-testid="social-caption-source"/);
  assert.match(client, /data-testid="social-caption-notice"/);
  assert.match(client, /social-caption-variant-/);
  assert.match(client, /selectedVariantIndex/);
  assert.match(client, /no LLM key is set/);
});
