import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dashboard = readFileSync(join(root, "src/app/(app)/dashboard/page.tsx"), "utf8");

test("dashboard loads command-center reads independently instead of all-or-nothing", () => {
  assert.match(dashboard, /let statsLoadError = false/);
  assert.match(dashboard, /let tasksLoadError = false/);
  assert.match(dashboard, /let summaryLoadError = false/);
  assert.match(dashboard, /Promise\.allSettled\(/);
  assert.match(dashboard, /statsResult\.status === "fulfilled"/);
  assert.match(dashboard, /tasksResult\.status === "fulfilled"/);
  assert.match(dashboard, /summaryResult\.status === "fulfilled"/);
  assert.match(dashboard, /commandCenterUnavailable/);
  assert.doesNotMatch(dashboard, /\[stats, tasks, summary, insights\] = await Promise\.all\(/);
});

test("a failed command-center fetch does not claim a quiet or empty workspace", () => {
  assert.match(dashboard, /missing counts are not a quiet band/);
  assert.match(dashboard, /a missing briefing is not a quiet week/);
  assert.match(dashboard, /a missing list is not a clear desk/);
  assert.match(dashboard, /isNewWorkspace = Boolean\(\s*stats &&/);
  const briefingError = dashboard.indexOf("a missing briefing is not a quiet week");
  const quietWeek = dashboard.indexOf("data looks quiet");
  assert.ok(briefingError > 0, "briefing error copy should exist");
  assert.ok(quietWeek > briefingError, "quiet-week copy must stay behind a successful summary read");
  assert.match(dashboard, /summaryLoadError \?/);
  assert.match(dashboard, /tasksLoadError \?/);
  assert.match(dashboard, /statsLoadError \?/);
});
