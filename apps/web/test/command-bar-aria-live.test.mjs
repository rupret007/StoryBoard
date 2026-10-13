import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bar = readFileSync(join(root, "src/components/command-bar.tsx"), "utf8");

test("command results are announced to assistive tech when they appear", () => {
  assert.match(bar, /aria-busy=\{loading\}/);
  const resultBlock = bar.slice(bar.indexOf("{result !== null ?"));
  assert.match(resultBlock, /aria-live="polite"/);
  assert.match(resultBlock, /aria-atomic="true"/);
  assert.match(resultBlock, /role=\{hasError \? "alert" : "status"\}/);
});
