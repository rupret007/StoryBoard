import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const loadShared = async () =>
  import(pathToFileURL(join(dir, "..", "..", "..", "packages", "shared", "dist", "index.js")).href);

const [tasksMod, eventDayOf, workflowMod, shared] = await Promise.all([
  loadApi("tasks/tasks.service.js"),
  loadApi("operations/event-day-of.js"),
  loadApi("workflow-automation/workflow-job-processor.service.js"),
  loadShared()
]);

const now = new Date("2026-10-11T18:00:00.000Z");
const dueTodayMidnight = new Date("2026-10-11T00:00:00.000Z");
const dueTodayNoon = new Date("2026-10-11T12:00:00.000Z");
const dueYesterdayMidnight = new Date("2026-10-10T00:00:00.000Z");
const dueYesterdayNoon = new Date("2026-10-10T12:00:00.000Z");
const dueTomorrow = new Date("2026-10-12T00:00:00.000Z");

function tasksServiceCapturingWhere() {
  let where = null;
  const service = new tasksMod.TasksService(
    {
      client: {
        task: {
          findMany: async (args) => {
            where = args.where;
            return [];
          }
        }
      }
    },
    { log: async () => undefined }
  );
  return {
    service,
    captured: () => where
  };
}

function dayEvent(tasks) {
  return {
    id: "event-day",
    status: "confirmed",
    startsAt: new Date("2026-10-12T21:00:00.000Z"),
    endsAt: null,
    loadInAt: new Date("2026-10-12T17:00:00.000Z"),
    soundcheckAt: null,
    doorsAt: null,
    setAt: null,
    curfewAt: null,
    guaranteeMinor: null,
    depositMinor: 0,
    currency: "USD",
    participants: [],
    tasks,
    schedule: [],
    deals: [],
    invoices: []
  };
}

const readinessStub = {
  eventId: "event-day",
  title: "Show",
  startsAt: "2026-10-12T21:00:00.000Z",
  daysUntil: 1,
  score: 80,
  status: "attention",
  confidence: 1,
  confidenceLabel: "high",
  observedAt: now.toISOString(),
  headline: "Open.",
  nextAction: null,
  categories: [],
  gaps: [],
  evidenceIds: ["event-day"]
};

test("S15 overdue query uses start of current UTC day and excludes due-today, tomorrow, and done", async () => {
  assert.equal(dueTodayMidnight < now, true);
  const { service, captured } = tasksServiceCapturingWhere();
  await service.overdueByDueDate("artist-a", null, now);
  assert.deepEqual(captured().dueAt, { lt: new Date("2026-10-11T00:00:00.000Z") });
  assert.notDeepEqual(captured().dueAt, { lt: now });
  assert.notDeepEqual(captured().dueAt, { lt: new Date("2026-10-12T00:00:00.000Z") });
  assert.equal(captured().status.not, "done");
  assert.equal(dueTodayMidnight < captured().dueAt.lt, false);
  assert.equal(dueTodayNoon < captured().dueAt.lt, false);
  assert.equal(dueYesterdayMidnight < captured().dueAt.lt, true);
  assert.equal(dueYesterdayNoon < captured().dueAt.lt, true);
  assert.equal(dueTomorrow < captured().dueAt.lt, false);
});

test("S15 grace-day query cutoff is today minus whole UTC days", async () => {
  const { service, captured } = tasksServiceCapturingWhere();
  await service.overdueByDueDate("artist-a", 0, now);
  assert.deepEqual(captured().dueAt, { lt: new Date("2026-10-11T00:00:00.000Z") });
  await service.overdueByDueDate("artist-a", 1, now);
  assert.deepEqual(captured().dueAt, { lt: new Date("2026-10-10T00:00:00.000Z") });
  assert.equal(dueYesterdayNoon < captured().dueAt.lt, false);
  await service.overdueByDueDate("artist-a", 2, now);
  assert.deepEqual(captured().dueAt, { lt: new Date("2026-10-09T00:00:00.000Z") });
  assert.equal(dueYesterdayNoon < captured().dueAt.lt, false);
  assert.equal(new Date("2026-10-08T12:00:00.000Z") < captured().dueAt.lt, true);
});

test("S15 day-of overdue count matches UTC-day policy: due today is never overdue", () => {
  const view = eventDayOf.deterministicEventDayOf(
    dayEvent([
      { id: "today-midnight", title: "Confirm parking", status: "todo", dueAt: dueTodayMidnight },
      { id: "today-noon", title: "Soundcheck later today", status: "todo", dueAt: dueTodayNoon },
      { id: "yesterday-midnight", title: "Send the rider", status: "todo", dueAt: dueYesterdayMidnight },
      { id: "yesterday-noon", title: "Book the van", status: "in_progress", dueAt: dueYesterdayNoon },
      { id: "tomorrow", title: "Call the promoter", status: "todo", dueAt: dueTomorrow },
      { id: "done-yesterday", title: "Already finished", status: "done", dueAt: dueYesterdayMidnight }
    ]),
    readinessStub,
    [],
    now
  );
  assert.equal(shared.describeTaskDueDate(dueTodayMidnight, now)?.timing, "today");
  assert.equal(view.openTaskCount, 5);
  assert.equal(view.overdueTaskCount, 2);
  assert.match(view.nextAction, /Send the rider/);
  assert.doesNotMatch(view.nextAction, /Confirm parking|Soundcheck later today|Call the promoter|Already finished/);
});

test("S15 overdue scan groupBy and overdueByDueDate share one UTC-day now", async () => {
  let groupWhere = null;
  let queryArgs = null;
  const unused = {};
  const processor = new workflowMod.WorkflowJobProcessorService(
    {
      client: {
        task: {
          groupBy: async ({ where }) => {
            groupWhere = where;
            return [{ artistId: "artist-a" }];
          }
        },
        artist: {
          findUnique: async () => ({ workflowOverdueGraceDays: null })
        }
      }
    },
    { log: async () => undefined },
    unused,
    unused,
    {
      overdueByDueDate: async (artistId, graceDays, queryNow) => {
        queryArgs = { artistId, graceDays, queryNow };
        return [];
      }
    },
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused
  );
  await processor.process({ name: "task.check-overdue", data: {} });
  assert.equal(groupWhere.status.not, "done");
  assert.equal(groupWhere.dueAt.lt.toISOString().slice(11), "00:00:00.000Z");
  assert.deepEqual(groupWhere.dueAt.lt, shared.taskOverdueUtcCutoff(queryArgs.queryNow));
  assert.equal(queryArgs.artistId, "artist-a");
  assert.equal(queryArgs.graceDays, null);
  assert.ok(queryArgs.queryNow instanceof Date);
});
