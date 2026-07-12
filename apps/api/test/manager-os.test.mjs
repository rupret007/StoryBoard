import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = (path) => import(pathToFileURL(join(dir, "..", "dist", path)).href);
const loadShared = (path) => import(pathToFileURL(join(dir, "..", "..", "..", "packages", "shared", "dist", path)).href);
const [policy, pdf, managerSchemas, operationSchemas, operationsMod, managerMod, intelligence, tasksMod, evaluation, managerPlan, eventReadiness] = await Promise.all([
  loadApi("manager/manager-policy.js"),
  loadApi("operations/simple-pdf.js"),
  loadShared("schemas/manager.js"),
  loadShared("schemas/operations.js"),
  loadApi("operations/operations.service.js"),
  loadApi("manager/manager.service.js"),
  loadApi("manager/manager-intelligence.js"),
  loadApi("tasks/tasks.service.js"),
  loadApi("manager/manager-evaluation.js"),
  loadApi("manager/manager-plan.js"),
  loadApi("operations/event-readiness.js")
]);

const now = new Date("2026-07-12T12:00:00.000Z");
function managerFacts(overrides = {}) {
  return {
    artist: { id: "artist-a", name: "The Test Band" },
    profile: { id: "profile-a", intakeCompletedAt: new Date("2026-01-01T00:00:00.000Z"), decisionStyle: "guided", twelveMonthAmbition: "Play better regional shows" },
    members: [{ id: "member-a", name: "Alex" }, { id: "member-b", name: "Jordan" }],
    goals: [{ id: "goal-a", title: "Book six regional shows", workstream: "live", status: "active", deadline: new Date("2026-12-01T00:00:00.000Z"), currentValue: 1, targetValue: 6 }],
    initiatives: [],
    tasks: [],
    opportunities: [{ id: "opp-a", title: "The Room", stage: "target", updatedAt: now, targetDate: null }],
    events: [],
    projects: [],
    deals: [],
    invoices: [],
    decisions: [],
    memoryFacts: [],
    approvals: [],
    bookingReplies: [],
    campaignRecipients: [],
    prospects: [],
    settlements: [],
    recommendationHistory: [],
    ...overrides
  };
}

test("manager intake is strict, supports every band mode, and preserves unknowns as unknown", () => {
  for (const bandMode of ["original", "cover_event", "hybrid"]) {
    assert.equal(managerSchemas.managerProfileSchema.safeParse({ bandMode }).success, true);
  }
  assert.equal(managerSchemas.managerProfileSchema.safeParse({ bandMode: "original", inventedAudienceSize: 10000 }).success, false);
  assert.equal(managerSchemas.managerDecisionCreateSchema.safeParse({ workstream: "business", title: "Sign?", options: [{ label: "Yes", tradeoff: "Commit" }, { label: "No", tradeoff: "Decline" }], evidence: [] }).success, true);
});

test("manager action authorization is code-owned and defaults to forbidden", () => {
  assert.equal(policy.classifyManagerAction("create_task"), "internal");
  assert.equal(policy.classifyManagerAction("send_email"), "approval_required");
  assert.equal(policy.classifyManagerAction("financial_action"), "owner_approval_required");
  assert.equal(policy.classifyManagerAction("run_sql"), "forbidden");
  assert.equal(policy.managerActionMayExecuteDirectly("send_email"), false);
});

test("recommendation acceptance can create a tenant task but cannot execute provider actions", async () => {
  let action = { type: "create_task", title: "Confirm rehearsal", dueAt: null, initiativeId: null };
  let taskCreates = 0;
  const client = {
    managerRecommendation: {
      findFirst: async ({ where }) => where.managerRun.artistId === "artist-a" ? { id: "rec-a", outcome: "suggested", taskId: null, task: null, proposedAction: action } : null,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => ({ id: "rec-a", ...data })
    },
    task: { create: async ({ data }) => { taskCreates += 1; return { id: "task-a", ...data }; } },
    $transaction: async (fn) => fn(client)
  };
  const service = new managerMod.ManagerService({ client }, { log: async () => undefined }, { get: () => false });
  await assert.rejects(() => service.recommendation("artist-a", "rec-a", "accepted", { reason: "wrong_priority" }, "member@test", "operator-a"), /Invalid reason/);
  assert.equal(taskCreates, 0);
  const accepted = await service.recommendation("artist-a", "rec-a", "accepted", {}, "member@test", "operator-a");
  assert.equal(accepted.taskId, "task-a");
  assert.equal(taskCreates, 1);
  action = { type: "send_email", title: "Bypass approval" };
  await assert.rejects(() => service.recommendation("artist-a", "rec-a", "accepted", {}, "member@test", "operator-a"), /Unsupported manager action/);
  assert.equal(taskCreates, 1);
  await assert.rejects(() => service.recommendation("artist-b", "rec-a", "accepted", {}, "member@test", "operator-b"), (error) => error?.getStatus?.() === 404);
});

test("concurrent recommendation acceptance cannot create duplicate tasks", async () => {
  let taskCreates = 0;
  const client = {
    managerRecommendation: {
      findFirst: async () => ({ id: "rec-a", outcome: "suggested", taskId: null, task: null, proposedAction: { type: "create_task", title: "One task", dueAt: null, initiativeId: null } }),
      updateMany: async () => ({ count: 0 }),
      update: async () => { throw new Error("must not update"); }
    },
    task: { create: async () => { taskCreates += 1; return { id: "task-a" }; } },
    $transaction: async (fn) => fn(client)
  };
  const service = new managerMod.ManagerService({ client }, { log: async () => undefined }, { get: () => false });
  await assert.rejects(() => service.recommendation("artist-a", "rec-a", "accepted", {}, "member@test", "operator-a"), /already been decided/);
  assert.equal(taskCreates, 0);
});

test("manager feedback and memory correction payloads are strict", () => {
  assert.equal(managerSchemas.managerRecommendationFeedbackSchema.safeParse({ reason: "wrong_priority", note: "Release comes first" }).success, true);
  assert.equal(managerSchemas.managerRecommendationFeedbackSchema.safeParse({ reason: "invented" }).success, false);
  assert.equal(managerSchemas.managerMemoryPatchSchema.safeParse({ value: ["weeknight schedule"] }).success, true);
  assert.equal(managerSchemas.managerMemoryPatchSchema.safeParse({}).success, false);
  assert.equal(managerSchemas.managerMemoryPatchSchema.safeParse({ value: undefined, unknown: true }).success, false);
  assert.equal(managerSchemas.managerEvalPromotionSchema.safeParse({ label: "useful", notes: "Good prioritization" }).success, true);
  assert.equal(managerSchemas.managerEvalPromotionSchema.safeParse({ label: "ship_it" }).success, false);
  assert.equal(managerSchemas.managerGoalProgressSchema.safeParse({ value: 3, note: "Booked another show" }).success, true);
  assert.equal(managerSchemas.managerGoalProgressSchema.safeParse({ delta: 1 }).success, true);
  assert.equal(managerSchemas.managerGoalProgressSchema.safeParse({ value: 3, delta: 1 }).success, false);
  assert.equal(managerSchemas.managerGoalProgressSchema.safeParse({}).success, false);
});

test("plan health is transparent about measurement, deadlines, blockers, and linked work", () => {
  const healthy = intelligence.deterministicManagerPlanHealth(managerFacts({
    initiatives: [{ id: "initiative-a", goalId: "goal-a", title: "Regional sprint", status: "active", dueAt: new Date("2026-09-01T00:00:00.000Z") }],
    tasks: [{ id: "task-a", title: "Pitch rooms", status: "in_progress", ownerLabel: "Alex", dueAt: new Date("2026-07-20T00:00:00.000Z"), initiativeId: "initiative-a" }]
  }), now);
  assert.equal(healthy.status, "on_track");
  assert.equal(healthy.goals[0].progressRatio, 1 / 6);
  const blocked = intelligence.deterministicManagerPlanHealth(managerFacts({
    initiatives: [{ id: "initiative-a", goalId: "goal-a", title: "Regional sprint", status: "blocked", dueAt: now }],
    tasks: [{ id: "task-a", title: "Pitch rooms", status: "todo", ownerLabel: "Alex", dueAt: new Date("2026-07-01T00:00:00.000Z"), initiativeId: "initiative-a" }]
  }), now);
  assert.equal(blocked.status, "at_risk");
  assert.match(blocked.goals[0].reasons.join(" "), /blocked|overdue/i);
  assert.ok(blocked.goals[0].evidenceIds.includes("initiative-a"));
  const unassigned = intelligence.deterministicManagerPlanHealth(managerFacts({
    initiatives: [{ id: "initiative-a", goalId: "goal-a", title: "Regional sprint", status: "active", dueAt: new Date("2026-09-01T00:00:00.000Z") }],
    tasks: [{ id: "task-a", title: "Pitch rooms", status: "todo", ownerLabel: null, dueAt: new Date("2026-07-20T00:00:00.000Z"), initiativeId: "initiative-a" }]
  }), now);
  assert.equal(unassigned.status, "at_risk");
  assert.ok(unassigned.gaps.some((gap) => gap.code === "task_without_owner"));
  const behindPace = intelligence.deterministicManagerPlanHealth(managerFacts({
    goals: [{ id: "goal-a", title: "Book ten shows", workstream: "live", status: "active", createdAt: new Date("2026-01-01T00:00:00.000Z"), deadline: new Date("2026-10-01T00:00:00.000Z"), currentValue: 1, targetValue: 10 }],
    initiatives: [{ id: "initiative-a", goalId: "goal-a", title: "Regional sprint", status: "active", dueAt: new Date("2026-09-01T00:00:00.000Z") }],
    tasks: [{ id: "task-a", title: "Pitch rooms", status: "todo", ownerLabel: "Alex", dueAt: new Date("2026-07-20T00:00:00.000Z"), initiativeId: "initiative-a" }]
  }), now);
  assert.match(behindPace.goals[0].reasons.join(" "), /behind the elapsed share/i);
  const noPlan = intelligence.deterministicManagerPlanHealth(managerFacts({ goals: [] }), now);
  assert.equal(noPlan.status, "needs_plan");
});

test("90-day starter plans are concrete, bounded, and tailored to every band mode", () => {
  for (const bandMode of ["original", "cover_event", "hybrid"]) {
    const plan = managerPlan.managerPlanTemplate(bandMode, now);
    assert.equal(plan.version, "manager_plan_v1");
    assert.equal(plan.goals.length, 2);
    assert.equal(plan.endsAt.getTime(), now.getTime() + 90 * 86400000);
    assert.equal(new Set(plan.goals.map((goal) => goal.sourceKey)).size, 2);
    for (const goal of plan.goals) {
      assert.equal(goal.currentValue, 0);
      assert.ok(goal.targetValue > 0);
      assert.equal(goal.initiative.tasks.length, 3);
      assert.ok(goal.initiative.tasks.every((task) => task.dueAt > now && task.dueAt <= plan.endsAt));
      assert.ok(goal.initiative.tasks.every((task) => task.ownerLabel === null));
    }
  }
});

test("brief and plan conversation advance an existing linked step instead of inventing duplicate work", () => {
  const planFacts = managerFacts({
    initiatives: [{ id: "initiative-a", goalId: "goal-a", title: "Regional sprint", status: "active", dueAt: new Date("2026-09-01T00:00:00.000Z") }],
    tasks: [{ id: "task-a", title: "Choose one target market", status: "todo", dueAt: new Date("2026-07-19T00:00:00.000Z"), initiativeId: "initiative-a" }]
  });
  const brief = intelligence.deterministicManagerBrief(planFacts, now);
  assert.equal(brief.today[0].stableKey, "planned-task-task-a");
  assert.equal(brief.today[0].proposedAction, null);
  assert.ok(brief.today[0].evidenceIds.includes("task-a"));
  const answer = intelligence.deterministicManagerChat(planFacts, "Are we on track with the plan?", now);
  assert.match(answer.answer, /real owner/);
  assert.ok(answer.citations.includes("task-a"));
});

test("a pre-intake cached brief is invalidated when setup completes", async () => {
  const service = new managerMod.ManagerService({ client: {} }, { log: async () => undefined }, { get: () => false });
  let generations = 0;
  service.latestBrief = async () => ({ id: "old-brief", createdAt: new Date("2026-07-12T10:00:00.000Z") });
  service.profile = async () => ({ intakeCompletedAt: new Date("2026-07-12T11:00:00.000Z") });
  service.generateBrief = async () => { generations += 1; return { id: "new-brief" }; };
  const result = await service.currentBrief("artist-a", "daily", "member@test", "operator-a");
  assert.equal(result.id, "new-brief");
  assert.equal(generations, 1);
});

test("goal progress is append-only, artist-scoped, and audited", async () => {
  let currentValue = 1; let progressCreates = 0; let audits = 0;
  const client = {
    managerGoal: {
      findFirst: async ({ where }) => where.artistId === "artist-a" ? { id: "goal-a", artistId: "artist-a", currentValue } : null,
      update: async ({ data }) => { currentValue = data.currentValue; return { id: "goal-a", currentValue }; }
    },
    managerGoalProgressEvent: { create: async ({ data }) => { progressCreates += 1; return { id: "progress-a", ...data }; } }
  };
  client.$transaction = async (fn) => fn(client);
  const service = new managerMod.ManagerService({ client }, { log: async () => { audits += 1; } }, { get: () => false });
  const event = await service.recordGoalProgress("artist-a", "goal-a", { delta: 2, note: "Two shows booked" }, "member@test", "operator-a");
  assert.equal(event.previousValue, 1);
  assert.equal(event.value, 3);
  assert.equal(progressCreates, 1);
  assert.equal(audits, 1);
  await assert.rejects(() => service.recordGoalProgress("artist-b", "goal-a", { value: 4 }, "member@test", "operator-b"), (error) => error?.getStatus?.() === 404);
  assert.equal(progressCreates, 1);
});

test("offline manager evaluation gates the current policy and honors owner revision labels", () => {
  const clean = evaluation.runManagerEvaluation("manager_os_v3", []);
  assert.equal(clean.passed, true);
  assert.equal(clean.metrics.goldenPassRate, 1);
  assert.equal(clean.metrics.safetyPassRate, 1);
  const blocked = evaluation.runManagerEvaluation("manager_os_v3", [{ id: "review-a", label: "needs_revision", promptVersion: "manager_os_v3", snapshot: { stableKey: "goal-goal-a", workstream: "live" } }]);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.metrics.ownerReviewedPassRate, 0);
  assert.throws(() => evaluation.runManagerEvaluation("manager_os_future", []), /Unknown manager candidate version/);
});

test("sensitive manager memory stays owner-controlled and corrections are auditable", async () => {
  let updates = 0; let audits = 0;
  const current = { id: "memory-a", artistId: "artist-a", key: "business_identity", value: "Old LLC", sensitivity: "sensitive" };
  const service = new managerMod.ManagerService({ client: { managerMemoryFact: {
    findFirst: async ({ where }) => where.artistId === "artist-a" ? current : null,
    update: async ({ data }) => { updates += 1; return { ...current, ...data }; }
  } } }, { log: async () => { audits += 1; } }, { get: () => false });
  await assert.rejects(() => service.patchMemory("artist-a", "memory-a", { value: "New LLC" }, false, "member@test", "operator-a"), (error) => error?.getStatus?.() === 404);
  assert.equal(updates, 0);
  const updated = await service.patchMemory("artist-a", "memory-a", { value: "New LLC" }, true, "owner@test", "operator-owner");
  assert.equal(updated.value, "New LLC");
  assert.equal(updated.sourceType, "operator_correction");
  assert.equal(updates, 1);
  assert.equal(audits, 1);
});

test("manager golden scenarios cover original, cover, hybrid, and adversarial inputs", async () => {
  const scenarios = JSON.parse(await readFile(join(dir, "fixtures", "manager-evals-v1.json"), "utf8"));
  assert.deepEqual(new Set(scenarios.map((scenario) => scenario.bandMode)), new Set(["original", "cover_event", "hybrid"]));
  assert.ok(scenarios.some((scenario) => scenario.name.includes("adversarial")));
  for (const scenario of scenarios) {
    const parsed = managerSchemas.managerProfileSchema.safeParse({ bandMode: scenario.bandMode, twelveMonthAmbition: scenario.ambition });
    assert.equal(parsed.success, true, scenario.name);
    assert.equal(typeof scenario.question, "string", scenario.name);
    if (scenario.expected === "approval-boundary") {
      assert.match(intelligence.deterministicManagerChat(managerFacts(), scenario.question, now).answer, /approval/i, scenario.name);
    }
  }
});

test("deterministic manager brief ranks real workflow pressure and keeps evidence attached", () => {
  const facts = managerFacts({
    bookingReplies: [{ id: "reply-a", subject: "September date", fromName: "Sam Buyer", fromEmail: "sam@example.test", processingStatus: "unread", receivedAt: now }],
    approvals: [{ id: "approval-a", title: "Draft reply", status: "pending", actionType: "gmail_draft", updatedAt: now }],
    events: [{ id: "event-a", title: "Friday show", type: "gig", status: "confirmed", startsAt: new Date("2026-07-18T01:00:00.000Z"), participants: [{ response: "unavailable", bandMemberId: "member-b" }] }],
    invoices: [{ id: "invoice-a", number: "1042", status: "overdue", currency: "USD", totalMinor: 100000, paidMinor: 25000, dueAt: new Date("2026-07-01T00:00:00.000Z") }],
    tasks: [{ id: "task-a", title: "Confirm backline", status: "todo", dueAt: new Date("2026-07-10T00:00:00.000Z") }]
  });
  const brief = intelligence.deterministicManagerBrief(facts, now);
  assert.equal(brief.today.length, 5);
  assert.match(brief.today[0].title, /booking repl/i);
  assert.ok(brief.today.some((item) => item.stableKey === "approval-approval-a"));
  assert.ok(brief.today.some((item) => item.stableKey === "event-event-a"));
  assert.ok(brief.today.some((item) => item.stableKey === "invoice-invoice-a"));
  assert.ok(brief.today.flatMap((item) => item.evidenceIds).every((id) => ["reply-a", "approval-a", "event-a", "invoice-a", "task-a"].includes(id)));
  assert.ok(brief.risksAndOpportunities.some((item) => item.title === "Member availability conflict"));
});

test("deterministic manager chat answers the question asked instead of repeating a generic brief", () => {
  const facts = managerFacts({
    events: [{ id: "event-a", title: "Festival set", type: "gig", status: "confirmed", startsAt: new Date("2026-07-19T01:00:00.000Z"), participants: [{ response: "available", bandMemberId: "member-a" }] }],
    invoices: [{ id: "invoice-a", number: "1042", status: "partially_paid", currency: "USD", totalMinor: 100000, paidMinor: 40000, dueAt: new Date("2026-07-20T00:00:00.000Z") }],
    prospects: [{ id: "prospect-a", name: "Good Room", status: "qualified", kind: "venue", city: "Madison" }]
  });
  const moneyAnswer = intelligence.deterministicManagerChat(facts, "Where does our money stand?", now);
  assert.match(moneyAnswer.answer, /USD 600\.00/);
  assert.deepEqual(moneyAnswer.citations, ["invoice-a"]);
  const liveAnswer = intelligence.deterministicManagerChat(facts, "Are we ready for the next show?", now);
  assert.match(liveAnswer.answer, /Festival set/);
  assert.ok(liveAnswer.citations.includes("event-a"));
  const bookingAnswer = intelligence.deterministicManagerChat(facts, "What should we do about booking?", now);
  assert.match(bookingAnswer.answer, /1 active opportunity/);
  assert.match(bookingAnswer.answer, /1 qualified prospect/);
});

test("reviewed outcomes suppress repeated advice only for a bounded cooldown", () => {
  const recommendation = intelligence.deterministicManagerBrief(managerFacts(), now).thisWeek.find((item) => item.stableKey === "goal-goal-a");
  assert.ok(recommendation);
  const acceptedOpen = [{ id: "rec-a", stableKey: recommendation.stableKey, outcome: "accepted", outcomeReason: "accepted", outcomeAt: now, updatedAt: now, task: { status: "todo" } }];
  assert.equal(intelligence.managerRecommendationIsSuppressed(recommendation, acceptedOpen, now), true);
  const recentDismissal = [{ id: "rec-b", stableKey: recommendation.stableKey, outcome: "dismissed", outcomeReason: "wrong_priority", outcomeAt: now, updatedAt: now, task: null }];
  assert.equal(intelligence.managerRecommendationIsSuppressed(recommendation, recentDismissal, now), true);
  assert.equal(intelligence.managerRecommendationIsSuppressed(recommendation, recentDismissal, new Date(now.getTime() + 8 * 86400000)), false);
});

test("finishing a linked task attributes completion to the accepted recommendation", async () => {
  let attributed = null;
  const client = {
    task: { findFirst: async () => ({ id: "task-a" }), update: async ({ data }) => ({ id: "task-a", ...data }) },
    managerRecommendation: { updateMany: async (args) => { attributed = args; return { count: 1 }; } }
  };
  client.$transaction = async (fn) => fn(client);
  const service = new tasksMod.TasksService({ client }, { log: async () => undefined });
  await service.patch("artist-a", "task-a", { status: "done" }, "member@test", "operator-a");
  assert.equal(attributed.where.taskId, "task-a");
  assert.equal(attributed.where.outcome, "accepted");
  assert.equal(attributed.data.outcome, "completed");
  assert.equal(attributed.data.outcomeReason, "task_completed");
});

test("manager chat refuses direct outside action and offers only reviewable internal work", () => {
  const result = intelligence.deterministicManagerChat(managerFacts(), "Send every venue an email and pay the deposit", now);
  assert.match(result.answer, /won't send, sign, pay, publish, or execute/i);
  assert.match(result.answer, /Approvals/);
  assert.ok(!result.recommendation || result.recommendation.proposedAction?.type === "create_task");
});

test("snapshot tool continuation retains the operator request", async () => {
  const calls = [];
  const client = { responses: { create: async (input) => { calls.push(input); return { output: [{ type: "function_call", name: "read_manager_snapshot", call_id: "call-a", arguments: "{}" }], usage: { input_tokens: 2, output_tokens: 1 } }; } } };
  const service = new managerMod.ManagerService({ client: {} }, { log: async () => undefined }, { get: () => false });
  const context = await service.readSnapshotTool(client, "test-model", "What should we focus on?", { artist: { id: "artist-a" } });
  assert.equal(calls.length, 1);
  assert.deepEqual(context.input[0], { role: "user", content: "What should we focus on?" });
  assert.equal(context.input[2].type, "function_call_output");
});

test("manager grounding rejects a whole response with invented evidence", () => {
  const service = new managerMod.ManagerService({ client: {} }, { log: async () => undefined }, { get: () => false });
  const facts = managerFacts();
  assert.equal(service.chatOutputIsGrounded({ answer: "Grounded", citations: ["goal-a"], recommendation: null }, facts), true);
  assert.equal(service.chatOutputIsGrounded({ answer: "Invented", citations: ["not-a-real-record"], recommendation: null }, facts), false);
});

test("operations validation rejects unknown fields, invalid money, and bad settlement splits", () => {
  assert.equal(operationSchemas.eventCreateSchema.safeParse({ type: "gig", title: "Show", surprise: true }).success, false);
  assert.equal(operationSchemas.invoiceCreateSchema.safeParse({ number: "1", recipientName: "Buyer", subtotalMinor: -1 }).success, false);
  assert.equal(operationSchemas.settlementCreateSchema.safeParse({ eventId: "event-a", splits: [{ bandMemberId: "a", basisPoints: 4000 }, { bandMemberId: "b", basisPoints: 4000 }] }).success, false);
  assert.equal(operationSchemas.paymentRecordSchema.safeParse({ idempotencyKey: "payment-a", amountMinor: 100, method: "check", receivedAt: "2026-07-11T12:00:00.000Z" }).success, true);
  assert.equal(operationSchemas.expenseCreateSchema.safeParse({ category: "travel", description: "Fuel", amountMinor: 100, incurredAt: "2026-07-11T12:00:00.000Z" }).success, false);
});

test("show readiness is date-aware, evidence-backed, and transparent about incomplete records", () => {
  const event = {
    id: "event-a",
    title: "Saturday show",
    startsAt: new Date("2026-07-18T01:00:00.000Z"),
    locationName: "The Room",
    contactId: "contact-a",
    setAt: new Date("2026-07-18T02:00:00.000Z"),
    participants: [{ id: "participant-a", bandMemberId: "member-a", response: "available" }],
    tasks: [],
    deals: [],
    invoices: [],
    setlist: null,
    currency: "USD"
  };
  const result = eventReadiness.deterministicShowReadiness(event, [{ id: "member-a" }], now);
  assert.equal(result.eventId, "event-a");
  assert.equal(result.status, "not_ready");
  assert.equal(result.confidenceLabel, "medium");
  assert.equal(result.gaps[0].severity, "high");
  assert.ok(result.gaps.some((gap) => gap.code === "advance_missing"));
  assert.ok(result.gaps.every((gap) => gap.evidenceIds.includes("event-a") || gap.evidenceIds.length > 0));
  assert.ok(result.evidenceIds.includes("event-a"));
});

test("show readiness blocks on an unavailable performer and becomes ready only from recorded facts", () => {
  const event = {
    id: "event-b",
    title: "Festival set",
    startsAt: new Date("2026-08-15T01:00:00.000Z"),
    venueId: "venue-a",
    contactId: "contact-a",
    loadInAt: new Date("2026-08-14T22:00:00.000Z"),
    soundcheckAt: new Date("2026-08-14T23:00:00.000Z"),
    doorsAt: new Date("2026-08-15T00:00:00.000Z"),
    setAt: new Date("2026-08-15T01:00:00.000Z"),
    curfewAt: new Date("2026-08-15T03:00:00.000Z"),
    productionNotes: "Use the approved stage plot and input list.",
    guaranteeMinor: 100000,
    depositMinor: 25000,
    currency: "USD",
    participants: [{ id: "participant-a", bandMemberId: "member-a", response: "unavailable" }],
    tasks: [{ id: "task-a", title: "Confirm production", status: "done", dueAt: new Date("2026-08-01T00:00:00.000Z"), ownerLabel: "Show advance" }],
    setlist: { id: "setlist-a", items: [{ id: "item-a" }] },
    deals: [{ id: "deal-a", status: "accepted", offerAmountMinor: 100000, depositMinor: 25000, agreements: [{ id: "agreement-a", status: "signed" }], invoices: [{ id: "invoice-a", totalMinor: 25000, paidMinor: 25000, status: "paid" }] }],
    invoices: []
  };
  const blocked = eventReadiness.deterministicShowReadiness(event, [{ id: "member-a" }], now);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.gaps[0].code, "member_unavailable");
  event.participants[0].response = "available";
  const ready = eventReadiness.deterministicShowReadiness(event, [{ id: "member-a" }], now);
  assert.equal(ready.status, "ready");
  assert.equal(ready.score, 100);
  assert.equal(ready.confidenceLabel, "high");
  assert.deepEqual(ready.gaps, []);
});

test("reviewed document snapshots are real deterministic PDFs with SHA-256", () => {
  const first = pdf.renderTextPdf("Agreement", "Line one\nLine two");
  const second = pdf.renderTextPdf("Agreement", "Line one\nLine two");
  assert.equal(first.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal(first.sha256.length, 64);
  assert.equal(first.sha256, second.sha256);
});

test("event creation rejects a cross-artist relation before write or audit", async () => {
  let creates = 0; let audits = 0;
  const service = new operationsMod.OperationsService({ client: { venue: { findFirst: async () => null }, bandEvent: { create: async () => { creates += 1; } } } }, { log: async () => { audits += 1; } }, {});
  await assert.rejects(() => service.createEvent("artist-a", { type: "gig", status: "draft", title: "Foreign room", venueId: "venue-b", currency: "USD" }, "owner@test", "operator-a"), (error) => error?.getStatus?.() === 404);
  assert.equal(creates, 0);
  assert.equal(audits, 0);
});

test("payment recording is idempotent and never double-applies the balance", async () => {
  let transactions = 0;
  const existing = { id: "payment-a", artistId: "artist-a", invoiceId: "invoice-a", idempotencyKey: "same", amountMinor: 500 };
  const service = new operationsMod.OperationsService({ client: {
    invoice: { findFirst: async () => ({ id: "invoice-a" }) },
    paymentRecord: { findUnique: async () => existing },
    $transaction: async () => { transactions += 1; }
  } }, { log: async () => undefined }, {});
  const result = await service.recordPayment("artist-a", "invoice-a", { idempotencyKey: "same", amountMinor: 500, currency: "USD", method: "check", receivedAt: "2026-07-11T12:00:00.000Z" }, "owner@test", "operator-a");
  assert.equal(result.id, "payment-a");
  assert.equal(transactions, 0);
});
