import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ops = readFileSync(join(root, "src/app/(app)/operations/operations-client.tsx"), "utf8");
const project = readFileSync(join(root, "src/app/(app)/operations/projects/[id]/project-client.tsx"), "utf8");

test("project create and facts persist date-input days as noon UTC, never local noon", () => {
  assert.match(ops, /calendarDateToNoonUtcIso/);
  assert.match(ops, /dueAt: calendarDateToNoonUtcIso\(dueAt\)/);
  assert.match(project, /calendarDateToNoonUtcIso/);
  assert.match(project, /dueAt: calendarDateToNoonUtcIso\(dueAt\)/);
  assert.match(project, /utcCalendarDateInputValue/);
  for (const source of [ops, project]) {
    assert.doesNotMatch(source, /new Date\(`\$\{dueAt\}T12:00:00`\)/);
    assert.doesNotMatch(source, /T12:00:00`\)\.toISOString\(\)/);
  }
});
