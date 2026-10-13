import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/tasks/tasks-client.tsx"), "utf8");

test("creating a follow-up surfaces API failures instead of clearing busy silently", () => {
  const createFn = client.slice(client.indexOf("async function createTask"), client.indexOf("return (", client.indexOf("async function createTask")));
  assert.match(createFn, /setCreateError\(""\)/);
  assert.match(createFn, /catch \(err\) \{/);
  assert.match(createFn, /setCreateError\(err instanceof Error \? err\.message : "Could not create the task"\)/);
  assert.match(createFn, /finally \{\s*setBusy\(false\);/);
  assert.match(client, /\{createError \? <p role="alert"/);
  assert.doesNotMatch(createFn, /router\.refresh\(\);\s*\} finally/);
});
