import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/app/(app)/operations/page.tsx"), "utf8");
const client = readFileSync(join(root, "src/app/(app)/operations/operations-client.tsx"), "utf8");

test("operations tracks whether projects loaded instead of treating a rejected list as empty", () => {
  assert.match(page, /let projectsAvailable = false/);
  assert.match(page, /projectsAvailable = true/);
  assert.match(page, /projectsAvailable=\{projectsAvailable\}/);
});

test("Events and Projects empty states require a successful load", () => {
  assert.match(client, /function Events\(\{ eventsAvailable,/);
  assert.match(client, /eventsAvailable \? <EmptyState title="No events yet"/);
  assert.match(client, /Events could not be loaded/);
  assert.match(client, /function Projects\(\{ projectsAvailable,/);
  assert.match(client, /projectsAvailable \? <EmptyState title="No projects"/);
  assert.match(client, /Projects could not be loaded/);
  assert.doesNotMatch(client, /\{!events\.length \? <EmptyState title="No events yet"/);
  assert.doesNotMatch(client, /\{!projects\.length \? <EmptyState title="No projects"/);
});
