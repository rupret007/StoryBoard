import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

function ruleBodyFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*{([^}]*)}`);
  const match = css.match(pattern);
  return match ? match[1] : null;
}

test("--surface-subtle is defined as a real, non-transparent color", () => {
  const rootBlock = ruleBodyFor(":root");
  assert.ok(rootBlock, ":root block must exist in globals.css");
  const match = rootBlock.match(/--surface-subtle:\s*([^;]+);/);
  assert.ok(match, "--surface-subtle must be defined inside :root");
  const value = match[1].trim();
  assert.notEqual(value, "transparent");
  assert.match(value, /^#[0-9a-fA-F]{3,8}$|^rgba?\(/, "--surface-subtle should resolve to a concrete color value");
});

test(".sb-kicker is defined as an uppercase, accent-colored label like .sb-label", () => {
  const kickerBody = ruleBodyFor(".sb-kicker");
  assert.ok(kickerBody, ".sb-kicker rule must exist in globals.css");
  assert.match(kickerBody, /uppercase/, ".sb-kicker should render its text uppercase, matching .sb-label");
  assert.match(kickerBody, /tracking-wide/, ".sb-kicker should share .sb-label's letter-spacing");
  assert.match(kickerBody, /var\(--accent\)/, ".sb-kicker should be accent-colored");

  const labelBody = ruleBodyFor(".sb-label");
  assert.ok(labelBody, ".sb-label rule must exist for comparison");
  assert.match(labelBody, /uppercase/);
});

test("product screens that rely on .sb-kicker and --surface-subtle keep using them", () => {
  const showControl = readFileSync(join(root, "src/app/(app)/operations/operations-show-control.tsx"), "utf8");
  const operationsClient = readFileSync(join(root, "src/app/(app)/operations/operations-client.tsx"), "utf8");
  const managerClient = readFileSync(join(root, "src/app/(app)/manager/manager-client.tsx"), "utf8");
  const dayOfClient = readFileSync(join(root, "src/app/(app)/operations/events/[id]/day-of-client.tsx"), "utf8");

  assert.match(showControl, /sb-kicker/);
  assert.match(operationsClient, /surface-subtle/);
  assert.match(managerClient, /sb-kicker/);
  assert.match(dayOfClient, /sb-kicker/);
  assert.match(dayOfClient, /surface-subtle/);
});
