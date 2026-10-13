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

test("disabled ghost buttons match secondary disabled treatment and stay 44px targets", () => {
  const ghost = ruleBodyFor(".sb-btn-ghost");
  assert.ok(ghost, ".sb-btn-ghost rule must exist");
  assert.match(ghost, /disabled:opacity-45/);
  assert.match(ghost, /disabled:pointer-events-none/);
  assert.match(ghost, /min-h-11/);

  const hover = ruleBodyFor(".sb-btn-ghost:hover:not(:disabled)");
  assert.ok(hover, "ghost hover must ignore disabled controls");
  assert.doesNotMatch(css, /\.sb-btn-ghost:hover\s*{/);
});
