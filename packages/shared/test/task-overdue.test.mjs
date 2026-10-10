import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "../../..");
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const now = new Date("2026-09-15T18:00:00.000Z");
const dueToday = new Date("2026-09-15T00:00:00.000Z");
const dueYesterday = new Date("2026-09-14T00:00:00.000Z");

test("S09 a task due later today is never overdue by UTC calendar day", () => {
  assert.equal(shared.isTaskOverdueByUtcDay(dueToday, now), false);
  assert.equal(shared.isTaskOverdueByUtcDay("2026-09-15T00:00:00.000Z", now), false);
  assert.equal(shared.describeTaskDueDate(dueToday, now)?.timing, "today");
  assert.deepEqual(shared.taskOverdueUtcCutoff(now), new Date("2026-09-15T00:00:00.000Z"));
  assert.equal(dueToday < now, true);
});

test("S09 a past UTC calendar day is still overdue", () => {
  assert.equal(shared.isTaskOverdueByUtcDay(dueYesterday, now), true);
  assert.equal(shared.isTaskOverdueByUtcDay(null, now), false);
  assert.deepEqual(shared.taskOverdueUtcCutoff(now, 1), new Date("2026-09-14T00:00:00.000Z"));
});

test("S09 day-of, readiness, project readiness, insights, team-load, and escalation use the UTC helper", () => {
  const dayOf = source("apps/api/src/operations/event-day-of.ts");
  assert.match(dayOf, /isTaskOverdueByUtcDay\(task\.dueAt, now\)/);
  assert.doesNotMatch(dayOf, /dueAt < now/);

  const readiness = source("apps/api/src/operations/event-readiness.ts");
  assert.match(readiness, /isTaskOverdueByUtcDay\(task\.dueAt, now\)/);

  const project = source("apps/api/src/operations/project-plan.ts");
  assert.match(project, /isTaskOverdueByUtcDay\(task\.dueAt, now\)/);

  const teamLoad = source("apps/api/src/manager/manager-team-load.ts");
  assert.match(teamLoad, /isTaskOverdueByUtcDay\(task\.dueAt, now\)/);

  const tasks = source("apps/api/src/tasks/tasks.service.ts");
  assert.match(tasks, /taskOverdueUtcCutoff\(now, graceDays\)/);

  const insights = source("apps/api/src/operational-intelligence/operational-intelligence.service.ts");
  assert.match(insights, /overdueByDueDate/);

  const escalation = source("apps/api/src/workflow-automation/workflow-job-processor.service.ts");
  assert.match(escalation, /overdueByDueDate/);
  assert.match(escalation, /taskOverdueUtcCutoff/);
});
