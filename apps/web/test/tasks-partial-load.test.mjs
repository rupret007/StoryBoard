import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/app/(app)/tasks/page.tsx"), "utf8");
const client = readFileSync(join(root, "src/app/(app)/tasks/tasks-client.tsx"), "utf8");

test("tasks load independently of booking links and lineup", () => {
  assert.match(page, /Promise\.allSettled\(/);
  assert.match(page, /let contextError = ""/);
  assert.match(page, /taskRows\.status === "fulfilled"/);
  assert.match(page, /contextError=\{contextError\}/);
  assert.doesNotMatch(page, /\[tasks, opportunities, members\] = await Promise\.all\(/);
});

test("a lineup or booking-link failure does not hide recorded tasks", () => {
  assert.match(client, /contextError/);
  assert.match(client, /Reload context/);
  assert.match(client, /\{loadError \? null : initialTasks\.length === 0 \?/);
});
