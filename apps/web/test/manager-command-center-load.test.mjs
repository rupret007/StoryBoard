import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/app/(app)/manager/page.tsx"), "utf8");
const client = readFileSync(join(root, "src/app/(app)/manager/manager-client.tsx"), "utf8");

test("manager command-center records load independently instead of all-or-nothing", () => {
  assert.match(page, /let commandCenterLoadError = false/);
  assert.match(page, /Promise\.allSettled\(/);
  assert.match(page, /commandCenter\.some\(\(result\) => result\.status === "rejected"\)/);
  assert.match(page, /commandCenterLoadError=\{commandCenterLoadError\}/);
  assert.doesNotMatch(page, /setup remains usable/);
  const commandSlice = page.slice(page.indexOf("let commandCenterLoadError"), page.indexOf("try { conversations"));
  assert.match(commandSlice, /Promise\.allSettled/);
  assert.doesNotMatch(commandSlice, /Promise\.all\(/);
});

test("Manager workspace warns that empty lists may be a failed fetch", () => {
  assert.match(client, /commandCenterLoadError/);
  assert.match(client, /Empty lists here may be a failed fetch, not an empty band/);
  assert.match(client, /Reload Manager/);
});
