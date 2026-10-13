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

const s15Now = new Date("2026-10-11T18:00:00.000Z");

test("S15 cutoff is start of the current UTC day, not the clock instant or tomorrow", () => {
  const cutoff = shared.taskOverdueUtcCutoff(s15Now);
  assert.deepEqual(cutoff, new Date("2026-10-11T00:00:00.000Z"));
  assert.notDeepEqual(cutoff, s15Now);
  assert.notDeepEqual(cutoff, new Date("2026-10-12T00:00:00.000Z"));
  assert.equal(new Date("2026-10-11T00:00:00.000Z") < s15Now, true);
});

test("S15 due today at midnight or noon is never overdue; yesterday is; tomorrow is not", () => {
  assert.equal(shared.isTaskOverdueByUtcDay("2026-10-11T00:00:00.000Z", s15Now), false);
  assert.equal(shared.isTaskOverdueByUtcDay("2026-10-11T12:00:00.000Z", s15Now), false);
  assert.equal(shared.describeTaskDueDate("2026-10-11T00:00:00.000Z", s15Now)?.timing, "today");
  assert.equal(shared.describeTaskDueDate("2026-10-11T12:00:00.000Z", s15Now)?.timing, "today");
  assert.equal(shared.isTaskOverdueByUtcDay("2026-10-10T00:00:00.000Z", s15Now), true);
  assert.equal(shared.isTaskOverdueByUtcDay("2026-10-10T12:00:00.000Z", s15Now), true);
  assert.equal(shared.isTaskOverdueByUtcDay("2026-10-12T00:00:00.000Z", s15Now), false);
  assert.equal(shared.isTaskOverdueByUtcDay("2026-10-12T12:00:00.000Z", s15Now), false);
  assert.equal(shared.isTaskOverdueByUtcDay(null, s15Now), false);
});

test("S15 grace days subtract whole UTC calendar days from today's start", () => {
  assert.deepEqual(shared.taskOverdueUtcCutoff(s15Now, 0), new Date("2026-10-11T00:00:00.000Z"));
  assert.deepEqual(shared.taskOverdueUtcCutoff(s15Now, null), new Date("2026-10-11T00:00:00.000Z"));
  assert.deepEqual(shared.taskOverdueUtcCutoff(s15Now, 1), new Date("2026-10-10T00:00:00.000Z"));
  assert.deepEqual(shared.taskOverdueUtcCutoff(s15Now, 2), new Date("2026-10-09T00:00:00.000Z"));
  const yesterdayNoon = new Date("2026-10-10T12:00:00.000Z");
  assert.equal(yesterdayNoon < shared.taskOverdueUtcCutoff(s15Now, 0), true);
  assert.equal(yesterdayNoon < shared.taskOverdueUtcCutoff(s15Now, 1), false);
});

test("S09 day-of, readiness, project readiness, insights, team-load, weekly briefing, and escalation use the UTC helper", () => {
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

  const weeklySummary = source("apps/api/src/summary/weekly-summary.service.ts");
  assert.match(weeklySummary, /isTaskOverdueByUtcDay\(t\.dueAt, now\)/);
  assert.doesNotMatch(weeklySummary, /new Date\(t\.dueAt\) < now/);

  const insights = source("apps/api/src/operational-intelligence/operational-intelligence.service.ts");
  assert.match(insights, /overdueByDueDate/);

  const escalation = source("apps/api/src/workflow-automation/workflow-job-processor.service.ts");
  assert.match(escalation, /overdueByDueDate/);
  assert.match(escalation, /taskOverdueUtcCutoff\(now\)/);
  assert.match(escalation, /dueAt: \{ lt: utcDayStart \}/);
  assert.match(escalation, /overdueByDueDate\(\s*g\.artistId,\s*artist\?\.workflowOverdueGraceDays \?\? null,\s*now\s*\)/);
});
