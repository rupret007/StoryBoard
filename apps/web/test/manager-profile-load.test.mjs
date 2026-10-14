import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/app/(app)/manager/page.tsx"), "utf8");
const client = readFileSync(join(root, "src/app/(app)/manager/manager-client.tsx"), "utf8");

test("a failed manager profile fetch is tracked instead of treated as missing intake", () => {
  assert.match(page, /let profileLoadError = false/);
  assert.match(page, /catch \{ profileLoadError = true; \}/);
  assert.match(page, /profileLoadError=\{profileLoadError\}/);
  assert.doesNotMatch(page, /intake remains usable/);
});

test("Manager shows a reloadable alert when the profile fetch fails, not guided intake", () => {
  assert.match(client, /if \(profileLoadError\) return/);
  assert.match(client, /role="alert"/);
  assert.match(client, /The operating profile could not be loaded/);
  assert.match(client, /A failed load is not incomplete setup/);
  assert.match(client, /Reload Manager/);
  assert.match(client, /onClick=\{\(\) => router\.refresh\(\)\}/);
  const intakeGate = client.slice(client.indexOf("if (!profile?.intakeCompletedAt)"));
  assert.match(intakeGate, /<Intake /);
  assert.ok(
    client.indexOf("if (profileLoadError)") < client.indexOf("if (!profile?.intakeCompletedAt)"),
    "profile load error must be distinguished before the incomplete-intake gate"
  );
});
