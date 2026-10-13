import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/notifications/notifications-client.tsx"), "utf8");

test("notification settings show a recoverable alert after load failure, never an endless spinner", () => {
  assert.match(client, /if \(loading\) \{/);
  assert.match(client, /role="status"/);
  assert.match(client, /Loading notification settings/);
  assert.match(client, /if \(!prefs \|\| !escalation \|\| !telegram\) \{/);
  assert.match(client, /role="alert"/);
  assert.match(client, /Notification settings could not be loaded/);
  assert.match(client, /Reload settings/);
  assert.match(client, /onClick=\{\(\) => void load\(\)\}/);
  assert.doesNotMatch(client, /if \(loading \|\| !prefs \|\| !escalation \|\| !telegram\)/);
});
