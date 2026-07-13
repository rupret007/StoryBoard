import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};

const [managerMod, intelligence, followThrough, contextHealth, knowledgeHealth, commitmentHealth, teamLoad, evidenceHealth, workSequence, goalPath] = await Promise.all([
  load("manager/manager.service.js"),
  load("manager/manager-intelligence.js"),
  load("manager/manager-follow-through.js"),
  load("manager/manager-context-health.js"),
  load("manager/manager-knowledge-health.js"),
  load("manager/manager-commitment-health.js"),
  load("manager/manager-team-load.js"),
  load("manager/manager-evidence-health.js"),
  load("manager/manager-work-sequence.js"),
  load("manager/manager-goal-path.js")
]);

const now = new Date("2026-07-13T18:00:00.000Z");

function run({ visibility = "team", fullContext = false } = {}) {
  return {
    message: { visibility },
    trace: fullContext ? {
      providerContext: {
        fullContextEnabled: true,
        outputUsed: true,
        sourceMessageId: "owner-question",
        sourceMessageCreatedAt: "2026-07-13T17:59:00.000Z"
      }
    } : {}
  };
}

function history(overrides = {}) {
  return {
    id: "recommendation-private",
    stableKey: "weekly-focus",
    outcome: "dismissed",
    outcomeReason: "private_do_not_repeat_this_reason",
    outcomeAt: now,
    updatedAt: now,
    proposedAction: null,
    memoryFact: null,
    task: null,
    managerRun: run({ visibility: "owner_only", fullContext: true }),
    hasTrackedWork: false,
    followThroughState: null,
    ...overrides
  };
}

function baseFacts(overrides = {}) {
  const profile = null;
  const members = [];
  const goals = [];
  const initiatives = [];
  const tasks = [];
  const opportunities = [];
  const events = [];
  const projects = [];
  const deals = [];
  const invoices = [];
  const prospects = [];
  const settlements = [];
  const bookingReplies = [];
  const goalMeasurements = [];
  const sequence = workSequence.deterministicManagerWorkSequence(tasks, now);
  return {
    artist: { id: "artist-a", name: "The Test Band" },
    profile,
    members,
    goals,
    goalMeasurements,
    initiatives,
    tasks,
    opportunities,
    events,
    projects,
    deals,
    invoices,
    decisions: [],
    memoryFacts: [],
    approvals: [],
    bookingReplies,
    campaignRecipients: [],
    prospects,
    settlements,
    outcomeReview: { windowDays: 90, through: now.toISOString(), headline: "No reviewed outcomes are recorded.", attention: [], recordedLessons: [], evidenceIds: [] },
    contextHealth: contextHealth.deterministicManagerContextHealth({ profile, members, goals, events, projects, opportunities }),
    knowledgeHealth: knowledgeHealth.deterministicManagerKnowledgeHealth({ profile, memoryFacts: [] }, now),
    commitmentHealth: commitmentHealth.deterministicManagerCommitmentHealth(tasks, now),
    teamLoad: teamLoad.deterministicManagerTeamLoad({ members, tasks, now }),
    evidenceHealth: evidenceHealth.deterministicManagerEvidenceHealth({ members, goals, goalMeasurements, events, projects, opportunities, deals, invoices, settlements, bookingReplies, prospects }, now),
    workSequence: sequence,
    goalPath: goalPath.deterministicManagerGoalPath({ goals, measurements: goalMeasurements, initiatives, tasks, workSequence: sequence }, now),
    recommendationHistory: [],
    followThrough: followThrough.summarizeManagerFollowThrough([], now),
    generatedAt: now.toISOString(),
    ...overrides
  };
}

function service(client = {}) {
  return new managerMod.ManagerService({ client }, { log: async () => undefined }, { get: () => false });
}

test("owner-only recommendation history cannot suppress or enter shared deterministic brief/chat/provider facts", () => {
  const expectedRecommendation = intelligence.deterministicManagerBrief(baseFacts(), now).today[0];
  assert.ok(expectedRecommendation);
  const privateHistory = history({ stableKey: expectedRecommendation.stableKey });
  const rawFacts = baseFacts({ recommendationHistory: [privateHistory] });
  const manager = service();
  const sharedFacts = manager.sharedFacts(rawFacts);
  const redactedProviderFacts = manager.providerFacts(rawFacts, false);

  assert.equal(sharedFacts.recommendationHistory.length, 0);
  assert.equal(redactedProviderFacts.recommendationHistory.length, 0);
  assert.doesNotMatch(JSON.stringify(redactedProviderFacts), /private_do_not_repeat_this_reason|recommendation-private/);

  const rawBrief = intelligence.deterministicManagerBrief(rawFacts, now);
  const sharedBrief = intelligence.deterministicManagerBrief(sharedFacts, now);
  assert.equal(rawBrief.today.some((item) => item.stableKey === expectedRecommendation.stableKey), false, "the fixture proves raw private history would suppress shared advice");
  assert.equal(sharedBrief.today.some((item) => item.stableKey === expectedRecommendation.stableKey), true);

  const chat = intelligence.deterministicManagerChat(sharedFacts, "What should we do today?", now);
  assert.doesNotMatch(JSON.stringify(chat), /private_do_not_repeat_this_reason|recommendation-private/);
  assert.ok(chat.answer.length > 0);
});

test("a private recommendation may leave only a sanitized shared receipt backed by its authoritative task", () => {
  const source = {
    id: "recommendation-private-task",
    title: "Secret model-authored title",
    workstream: "business",
    priority: "high",
    outcome: "accepted",
    outcomeReason: "private model outcome",
    nextAction: "Secret model-authored next action",
    proposedAction: { type: "create_task", title: "Secret model-authored title", dueAt: null, initiativeId: null },
    createdAt: now,
    updatedAt: now,
    outcomeAt: now,
    task: { id: "task-shared", title: "Confirm the public show plan", status: "todo", dueAt: null, updatedAt: now, blockedReason: null, waitingOn: null },
    decision: null,
    project: null,
    event: null,
    memoryFact: null,
    approvals: [],
    managerRun: run({ visibility: "owner_only", fullContext: true })
  };
  const receipt = followThrough.summarizeManagerFollowThrough([source], now, "normal");
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0].target.id, "task-shared");
  assert.equal(receipt.items[0].title, "Confirm the public show plan");
  assert.doesNotMatch(JSON.stringify(receipt), /Secret model-authored|private model outcome/);

  const provider = service().providerFacts(baseFacts({
    tasks: [{ id: "task-shared", title: "Confirm the public show plan", status: "todo", ownerLabel: null, bandMemberId: null, dueAt: null, updatedAt: now, blockedReason: null, waitingOn: null, deferralCount: 0, lastDeferredAt: null, opportunityId: null, eventId: null, projectId: null, initiativeId: null, prerequisites: [], dependents: [] }],
    recommendationHistory: [history({ id: source.id, stableKey: "private-task-key", outcome: "accepted", outcomeReason: source.outcomeReason, task: { status: "todo" }, hasTrackedWork: true, followThroughState: "in_motion" })],
    followThrough: receipt
  }), false);
  assert.equal(provider.followThrough.items[0].target.id, "task-shared");
  assert.doesNotMatch(JSON.stringify(provider), /private-task-key|private model outcome|Secret model-authored/);
});

test("member-readable learning excludes owner-only recommendation, feedback, and review outcomes", async () => {
  const normalRun = run();
  const privateRun = run({ visibility: "owner_only", fullContext: true });
  const client = {
    managerRecommendation: {
      findMany: async () => [
        { outcome: "accepted", outcomeReason: "accepted", outcomeAt: now, proposedAction: null, memoryFact: null, task: { status: "todo" }, managerRun: normalRun },
        { outcome: "dismissed", outcomeReason: "private_do_not_repeat_this_reason", outcomeAt: now, proposedAction: null, memoryFact: null, task: null, managerRun: privateRun }
      ]
    },
    managerMessageFeedback: {
      findMany: async () => [
        { helpful: true, reason: null, managerMessage: { visibility: "team", managerRun: normalRun } },
        { helpful: false, reason: "private_feedback_reason", managerMessage: { visibility: "owner_only", managerRun: privateRun } }
      ]
    },
    managerEvalExample: {
      findMany: async () => [
        { label: "useful", recommendation: { outcome: "accepted", proposedAction: null, memoryFact: null, managerRun: normalRun } },
        { label: "not_useful", recommendation: { outcome: "dismissed", proposedAction: null, memoryFact: null, managerRun: privateRun } }
      ]
    }
  };

  const manager = service(client);
  const member = await manager.learningSummary("artist-a", false);
  assert.equal(member.total, 1);
  assert.equal(member.accepted, 1);
  assert.equal(member.dismissed, 0);
  assert.equal(member.openAcceptedTasks, 1);
  assert.deepEqual(member.dismissalReasons, []);
  assert.equal(member.responseFeedback.total, 1);
  assert.equal(member.responseFeedback.notHelpful, 0);
  assert.equal(member.recommendationReviews.total, 1);
  assert.equal(member.recommendationReviews.notUseful, 0);
  assert.doesNotMatch(JSON.stringify(member), /private_do_not_repeat_this_reason|private_feedback_reason/);

  const owner = await manager.learningSummary("artist-a", true);
  assert.equal(owner.total, 2);
  assert.equal(owner.dismissed, 1);
  assert.deepEqual(owner.dismissalReasons, [{ reason: "private_do_not_repeat_this_reason", count: 1 }]);
  assert.equal(owner.responseFeedback.total, 2);
  assert.equal(owner.recommendationReviews.total, 2);
});
