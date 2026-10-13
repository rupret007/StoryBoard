import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const summaryMod = await import(
  pathToFileURL(join(dir, "..", "dist", "summary/weekly-summary.service.js")).href
);

function serviceWithTasks(tasks) {
  return new summaryMod.WeeklySummaryService({
    client: {
      bookingOpportunity: { findMany: async () => [] },
      task: { findMany: async () => tasks },
      approvalRequest: { findMany: async () => [] },
      auditEvent: { findMany: async () => [] },
      commandRun: { findMany: async () => [] }
    }
  });
}

test("weekly briefing overdue list uses UTC calendar day, not the clock instant", async () => {
  const now = new Date("2026-09-15T18:00:00.000Z");
  const dueTodayMidnight = new Date("2026-09-15T00:00:00.000Z");
  const dueYesterday = new Date("2026-09-14T12:00:00.000Z");
  assert.equal(dueTodayMidnight < now, true);

  const result = await serviceWithTasks([
    {
      id: "due-today",
      title: "Soundcheck later today",
      status: "todo",
      dueAt: dueTodayMidnight,
      updatedAt: now
    },
    {
      id: "due-yesterday",
      title: "Send the rider",
      status: "in_progress",
      dueAt: dueYesterday,
      updatedAt: now
    },
    {
      id: "done-yesterday",
      title: "Already finished",
      status: "done",
      dueAt: dueYesterday,
      updatedAt: now
    },
    {
      id: "undated",
      title: "No date recorded",
      status: "todo",
      dueAt: null,
      updatedAt: now
    }
  ]).build("artist-a", now);

  assert.deepEqual(
    result.overdueTasks.map((task) => task.id),
    ["due-yesterday"]
  );
  assert.match(result.recommendations.join(" "), /1 task\(s\) are past due/);
  assert.doesNotMatch(result.recommendations.join(" "), /Soundcheck later today/);
});

test("weekly briefing does not invent overdue work when every open task is due today or later", async () => {
  const now = new Date("2026-09-15T18:00:00.000Z");
  const result = await serviceWithTasks([
    {
      id: "due-today-noon",
      title: "Confirm the set",
      status: "todo",
      dueAt: new Date("2026-09-15T12:00:00.000Z"),
      updatedAt: now
    },
    {
      id: "due-tomorrow",
      title: "Call the promoter",
      status: "todo",
      dueAt: new Date("2026-09-16T00:00:00.000Z"),
      updatedAt: now
    }
  ]).build("artist-a", now);

  assert.deepEqual(result.overdueTasks, []);
  assert.doesNotMatch(result.recommendations.join(" "), /past due/);
});
