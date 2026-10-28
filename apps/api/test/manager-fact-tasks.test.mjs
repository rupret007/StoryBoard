import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { MANAGER_FACT_TASK_LIMIT, managerFactTaskOrderBy, managerFactTaskRowIncluded, managerFactTaskWhere, selectManagerFactTasks } = require("../dist/manager/manager-fact-tasks.js");
const { ManagerService } = require("../dist/manager/manager.service.js");

function row(id, extras = {}) {
  return { id, artistId: "band-a", status: "todo", dueAt: null, initiativeId: null, campaignFollowUp: false, ...extras };
}

function matchesWhere(task, where) {
  if (task.artistId !== where.artistId) return false;
  return where.OR.some((clause) => {
    if (clause.status?.not) return task.status !== clause.status.not;
    const initiativeOk = clause.initiativeId?.not === null && task.initiativeId != null;
    const notFollowUp = clause.bookingCampaignFollowUpFor?.is === null && task.campaignFollowUp === false;
    return Boolean(initiativeOk && notFollowUp);
  });
}

test("manager fact task query excludes completed follow-ups and keeps the open-work window", async () => {
  const queries = new Map();
  const client = new Proxy({}, { get: (_, model) => model === "artist" ? { findUniqueOrThrow: async () => ({ id: "band-a", name: "Fixture band" }) } : { findMany: async (input) => { queries.set(model, input); return []; } } });
  const service = new ManagerService({ client }, { log: async () => {} }, {});
  service.profile = async () => null;
  service.outcomeReview = async () => ({ recordedLessons: [] });
  service.measurementsForGoals = async () => [];
  service.followThrough = async () => ({ items: [] });
  await service.facts("band-a");
  const query = queries.get("task");
  assert.deepEqual(query.where, managerFactTaskWhere("band-a"));
  assert.deepEqual(query.where, {
    artistId: "band-a",
    OR: [
      { status: { not: "done" } },
      { initiativeId: { not: null }, bookingCampaignFollowUpFor: { is: null } }
    ]
  });
  assert.equal(JSON.stringify(query.where).includes("isNot"), false);
  assert.deepEqual(query.orderBy, managerFactTaskOrderBy());
  assert.deepEqual(query.orderBy, [{ dueAt: "asc" }, { id: "asc" }]);
  assert.equal(query.take, MANAGER_FACT_TASK_LIMIT);
  assert.equal(query.take, 100);
  assert.equal(query.include.bandMember.select.name, true);

  const matrix = [
    row("open"),
    row("open-follow-up", { status: "in_progress", campaignFollowUp: true, dueAt: new Date("2026-01-01T00:00:00Z") }),
    row("blocked-follow-up", { status: "blocked", campaignFollowUp: true, initiativeId: "initiative" }),
    row("done-plain", { status: "done" }),
    row("done-initiative", { status: "done", initiativeId: "initiative", dueAt: new Date("2020-01-01T00:00:00Z") }),
    row("done-follow-up", { status: "done", campaignFollowUp: true, dueAt: new Date("2019-01-01T00:00:00Z") }),
    row("done-follow-up-initiative", { status: "done", campaignFollowUp: true, initiativeId: "initiative", dueAt: new Date("2018-01-01T00:00:00Z") }),
    row("done-follow-up-undated", { status: "done", campaignFollowUp: true }),
    row("done-follow-up-future", { status: "done", campaignFollowUp: true, dueAt: new Date("2099-01-01T00:00:00Z") }),
    row("done-follow-up-invalid", { status: "done", campaignFollowUp: true, dueAt: new Date("bad") }),
    row("other-band", { artistId: "band-b", status: "todo" })
  ];
  const where = managerFactTaskWhere("band-a");
  for (const task of matrix) {
    assert.equal(managerFactTaskRowIncluded(task, "band-a"), matchesWhere(task, where), task.id);
  }
  assert.equal(managerFactTaskRowIncluded(matrix.find((task) => task.id === "open"), "band-a"), true);
  assert.equal(managerFactTaskRowIncluded(matrix.find((task) => task.id === "done-follow-up-initiative"), "band-a"), false);
  assert.equal(managerFactTaskRowIncluded(matrix.find((task) => task.id === "done-initiative"), "band-a"), true);
});

test("completed follow-ups cannot fill the 100-row manager task window", () => {
  const past = new Date("2019-06-01T00:00:00Z");
  const later = new Date("2026-10-01T00:00:00Z");
  const doneFollowUps = Array.from({ length: 100 }, (_, index) => row(`done-${String(index).padStart(3, "0")}`, { status: "done", campaignFollowUp: true, dueAt: past, initiativeId: index % 2 === 0 ? "initiative" : null }));
  const openLater = row("open-later", { dueAt: later });
  const openUndated = row("open-undated");
  const crowded = selectManagerFactTasks([...doneFollowUps, openLater, openUndated], "band-a");
  assert.deepEqual(crowded.map((task) => task.id), ["open-later", "open-undated"]);

  const undatedOpens = Array.from({ length: 100 }, (_, index) => row(`open-${String(index).padStart(3, "0")}`));
  const earlyDone = row("aaa-done", { status: "done", campaignFollowUp: true });
  const undatedWindow = selectManagerFactTasks([earlyDone, ...undatedOpens], "band-a");
  assert.equal(undatedWindow.length, 100);
  assert.equal(undatedWindow.some((task) => task.campaignFollowUp), false);
  assert.equal(undatedWindow.at(-1).id, "open-099");

  const datedOpens = Array.from({ length: 100 }, (_, index) => row(`dated-${String(index).padStart(3, "0")}`, { dueAt: new Date(Date.UTC(2026, 0, index + 1)) }));
  assert.equal(selectManagerFactTasks([...doneFollowUps, ...datedOpens], "band-a").length, 100);
  assert.deepEqual(selectManagerFactTasks(datedOpens, "band-a").map((task) => task.id), datedOpens.map((task) => task.id));

  const overflow = Array.from({ length: 101 }, (_, index) => row(`overflow-${String(index).padStart(3, "0")}`, { dueAt: new Date(Date.UTC(2026, 0, index + 1)) }));
  const limited = selectManagerFactTasks(overflow, "band-a");
  assert.equal(limited.length, 100);
  assert.equal(limited[0].id, "overflow-000");
  assert.equal(limited.some((task) => task.id === "overflow-100"), false);

  const tied = Array.from({ length: 101 }, (_, index) => row(`tie-${String(index).padStart(3, "0")}`, { dueAt: later }));
  const tiedWindow = selectManagerFactTasks([...doneFollowUps, ...tied], "band-a");
  assert.equal(tiedWindow.length, 100);
  assert.equal(tiedWindow[0].id, "tie-000");
  assert.equal(tiedWindow.some((task) => task.id === "tie-100"), false);
  assert.equal(tiedWindow.some((task) => task.status === "done"), false);

  assert.deepEqual(selectManagerFactTasks([], "band-a"), []);
  assert.deepEqual(selectManagerFactTasks([row("only-done", { status: "done", campaignFollowUp: true, dueAt: past }), row("kept", { dueAt: null })], "band-a").map((task) => task.id), ["kept"]);
  const ordered = selectManagerFactTasks([
    row("undated"),
    row("late", { dueAt: new Date("2026-12-01T00:00:00Z") }),
    row("early-b", { dueAt: new Date("2026-01-02T00:00:00Z") }),
    row("early-a", { dueAt: new Date("2026-01-02T00:00:00Z") }),
    row("invalid", { dueAt: new Date("bad") }),
    row("done-first", { status: "done", campaignFollowUp: true, dueAt: new Date("2000-01-01T00:00:00Z") })
  ], "band-a");
  assert.deepEqual(ordered.map((task) => task.id), ["early-a", "early-b", "late", "invalid", "undated"]);
});
