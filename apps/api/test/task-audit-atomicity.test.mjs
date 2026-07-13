import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};

const [auditMod, tasksMod] = await Promise.all([
  load("audit/audit.service.js"),
  load("tasks/tasks.service.js")
]);

function harness({ failAuditAction = null } = {}) {
  let task = {
    id: "task-a",
    artistId: "artist-a",
    title: "Follow up with the buyer",
    status: "in_progress",
    ownerLabel: "Alex",
    bandMemberId: null,
    dueAt: null,
    blockedReason: null,
    waitingOn: null,
    deferralCount: 0,
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    prerequisites: [],
    dependents: []
  };
  let recommendations = [
    { id: "recommendation-a", taskId: task.id, artistId: task.artistId, outcome: "accepted" },
    { id: "recommendation-b", taskId: task.id, artistId: task.artistId, outcome: "accepted" }
  ];
  let audits = [];
  let inTransaction = false;
  const recommendationUpdates = [];

  const client = {
    task: {
      findFirst: async ({ where }) => where.id === task.id && where.artistId === task.artistId ? { ...task } : null,
      updateMany: async ({ where, data }) => {
        if (where.id !== task.id || where.artistId !== task.artistId || where.updatedAt.getTime() !== task.updatedAt.getTime()) return { count: 0 };
        task = { ...task, ...data, updatedAt: new Date(task.updatedAt.getTime() + 1) };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...task })
    },
    managerRecommendation: {
      updateManyAndReturn: async (args) => {
        recommendationUpdates.push(args);
        const transitioned = recommendations.filter((row) => row.taskId === args.where.taskId && row.artistId === args.where.managerRun.artistId && row.outcome === args.where.outcome);
        const transitionedIds = new Set(transitioned.map((row) => row.id));
        recommendations = recommendations.map((row) => transitionedIds.has(row.id) ? { ...row, ...args.data } : row);
        return transitioned.map(({ id }) => ({ id }));
      }
    },
    auditEvent: {
      create: async ({ data }) => {
        assert.equal(inTransaction, true, `${data.action} must be written inside the transaction`);
        if (data.action === failAuditAction) throw new Error("audit unavailable");
        const row = { id: `audit-${audits.length + 1}`, ...data };
        audits.push(row);
        return row;
      }
    }
  };
  client.$transaction = async (callback) => {
    const taskBefore = { ...task };
    const recommendationsBefore = recommendations.map((row) => ({ ...row }));
    const auditsBefore = audits.map((row) => ({ ...row }));
    inTransaction = true;
    try {
      return await callback(client);
    } catch (error) {
      task = taskBefore;
      recommendations = recommendationsBefore;
      audits = auditsBefore;
      throw error;
    } finally {
      inTransaction = false;
    }
  };

  const audit = new auditMod.AuditService({ client });
  const service = new tasksMod.TasksService({ client }, audit);
  return {
    service,
    get task() { return task; },
    get recommendations() { return recommendations; },
    get audits() { return audits; },
    recommendationUpdates
  };
}

test("task completion atomically attributes and audits each transitioned Manager recommendation", async () => {
  const state = harness();

  await state.service.patch("artist-a", "task-a", { status: "done" }, "member@test", "operator-a");

  assert.equal(state.recommendationUpdates[0].where.managerRun.artistId, "artist-a");
  assert.equal(state.recommendations.filter((row) => row.outcome === "completed").length, 2);
  const recommendationAudits = state.audits.filter((row) => row.action === "manager.recommendation_completed");
  assert.deepEqual(recommendationAudits.map((row) => row.aggregateId).sort(), ["recommendation-a", "recommendation-b"]);
  for (const row of recommendationAudits) {
    assert.equal(row.actorOperatorId, "operator-a");
    assert.deepEqual(row.metadata, { reason: "task_completed", taskId: "task-a", source: "task_status_transition" });
  }
  const taskAudit = state.audits.find((row) => row.action === "task.updated");
  assert.equal(taskAudit.metadata.managerRecommendationsCompleted, 2);

  await state.service.patch("artist-a", "task-a", { status: "done" }, "member@test", "operator-a");
  assert.equal(state.audits.filter((row) => row.action === "manager.recommendation_completed").length, 2);
  assert.equal(state.audits.filter((row) => row.action === "task.updated").at(-1).metadata.managerRecommendationsCompleted, 0);
});

test("a mandatory task audit failure rolls the task and recommendation transitions back", async () => {
  const state = harness({ failAuditAction: "task.updated" });

  await assert.rejects(
    () => state.service.patch("artist-a", "task-a", { status: "done" }, "member@test", "operator-a"),
    /audit unavailable/
  );

  assert.equal(state.task.status, "in_progress");
  assert.equal(state.recommendations.every((row) => row.outcome === "accepted"), true);
  assert.equal(state.audits.length, 0);
});
