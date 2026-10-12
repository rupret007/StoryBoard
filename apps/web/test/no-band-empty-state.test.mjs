import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const team = readFileSync(join(root, "src/app/(app)/team/page.tsx"), "utf8");
const notifications = readFileSync(join(root, "src/app/(app)/notifications/page.tsx"), "utf8");

test("Team explains a missing band instead of returning a blank page", () => {
  assert.match(team, /No band on this account/);
  assert.match(team, /EmptyState/);
  assert.match(team, /Team could not verify your session/);
  assert.doesNotMatch(team, /if \(!activeArtistId\) \{\s*return null;/);
});

test("Notifications explains a missing band instead of returning a blank page", () => {
  assert.match(notifications, /No band on this account/);
  assert.match(notifications, /EmptyState/);
  assert.match(notifications, /Notification settings could not verify your session/);
  assert.doesNotMatch(notifications, /if \(!activeArtistId\) \{\s*return null;/);
});
