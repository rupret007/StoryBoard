import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/manager/manager-client.tsx"), "utf8");

test("confirmed memory facts do not repeat the confirmation date without an assessment", () => {
  const editor = client.slice(client.indexOf("function MemoryFactEditor"));
  assert.match(
    editor,
    /fact\.confirmedAt \? `Confirmed \$\{new Date\(fact\.confirmedAt\)\.toLocaleDateString\(\)\}` : "Needs confirmation"/
  );
  assert.match(
    editor,
    /\{!profileManaged && assessment && fact\.confirmedAt \? ` · \$\{new Date\(fact\.confirmedAt\)\.toLocaleDateString\(\)\}` : ""\}/
  );
  assert.doesNotMatch(editor, /\{!profileManaged && fact\.confirmedAt \? ` · /);
});
