import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const strip = readFileSync(join(root, "src/components/workflow-notifications-strip.tsx"), "utf8");

test("workflow strip shows a retryable alert when unread notifications fail to load", () => {
  assert.match(strip, /if \(err\) \{/);
  assert.match(strip, /role="alert"/);
  assert.match(strip, /Workflow notifications unavailable/);
  assert.match(strip, /Retry/);
  assert.match(strip, /href="\/notifications"/);
  assert.match(strip, /async function retry/);
  assert.doesNotMatch(strip, /if \(err\) \{\s*return null;/);
});
