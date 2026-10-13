import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ops = readFileSync(join(root, "src/app/(app)/operations/operations-client.tsx"), "utf8");
const dayOf = readFileSync(join(root, "src/app/(app)/operations/events/[id]/day-of-client.tsx"), "utf8");

test("after-show attendance is parsed as a whole count instead of Number()", () => {
  assert.match(ops, /parseCount\(attendance\)/);
  assert.doesNotMatch(ops, /attendance === "" \? null : Number\(attendance\)/);
  assert.match(dayOf, /parseCount\(attendance\)/);
  assert.doesNotMatch(dayOf, /attendance\.trim\(\) === "" \? null : Number\(attendance\)/);
});
