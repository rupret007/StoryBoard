import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/app/(app)/prospects/page.tsx"), "utf8");
const client = readFileSync(join(root, "src/app/(app)/prospects/prospects-client.tsx"), "utf8");

test("Find shows loads profile and prospects independently of contacts and sprints", () => {
  assert.match(page, /Promise\.allSettled\(/);
  assert.match(page, /let profileAvailable = false/);
  assert.match(page, /let prospectsAvailable = false/);
  assert.match(page, /let contextError = ""/);
  assert.match(page, /profileRows\.status === "fulfilled"/);
  assert.match(page, /prospectRows\.status === "fulfilled"/);
  assert.match(page, /profileAvailable=\{profileAvailable\}/);
  assert.match(page, /prospectsAvailable=\{prospectsAvailable\}/);
  assert.match(page, /contextError=\{contextError\}/);
  assert.doesNotMatch(page, /\[profile, prospects, contacts, sprints\] = await Promise\.all\(/);
});

test("a contact or sprint failure does not hide recorded prospects or claim a missing profile", () => {
  assert.match(client, /contextError/);
  assert.match(client, /Reload context/);
  assert.match(client, /Profile unavailable/);
  assert.match(client, /profileAvailable \? \(initialProfile\.ready \? "Ready to book"/);
  assert.match(client, /!loadError && !prospectsAvailable \? <p role="alert"/);
  assert.match(client, /An unavailable list does not mean this band has no leads/);
  assert.match(client, /!canEditProfile \|\| busy === "profile"/);
  assert.doesNotMatch(client, /\{!loadError && initialProspects\.length === 0 \? <div className="mt-5"><EmptyState title="No prospects yet"/);
});
