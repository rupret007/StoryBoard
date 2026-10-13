import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const summary = readFileSync(join(root, "src/app/(app)/summary/page.tsx"), "utf8");

test("weekly briefing overdue rows show the UTC calendar due day, matching dashboard", () => {
  assert.match(summary, /describeTaskDueDate/);
  assert.match(summary, /data-testid=\{`summary-overdue-due-\$\{t\.id\}`\}/);
  assert.match(summary, /\$\{due\.label\} \(overdue\)/);
  const overdueBlock = summary.slice(summary.indexOf("Overdue (due date)"));
  assert.doesNotMatch(overdueBlock, /toLocaleDateString/);
  assert.doesNotMatch(overdueBlock, /new Date\(t\.dueAt\)\.toLocale/);
});
