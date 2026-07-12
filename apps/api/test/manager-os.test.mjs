import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = (path) => import(pathToFileURL(join(dir, "..", "dist", path)).href);
const loadShared = (path) => import(pathToFileURL(join(dir, "..", "..", "..", "packages", "shared", "dist", path)).href);
const [policy, pdf, managerSchemas, operationSchemas, operationsMod, managerMod, intelligence, responseQuality, outcomeReview, tasksMod, evaluation, managerPlan, eventReadiness, eventDayOf, projectPlan] = await Promise.all([
  loadApi("manager/manager-policy.js"),
  loadApi("operations/simple-pdf.js"),
  loadShared("schemas/manager.js"),
  loadShared("schemas/operations.js"),
  loadApi("operations/operations.service.js"),
  loadApi("manager/manager.service.js"),
  loadApi("manager/manager-intelligence.js"),
  loadApi("manager/manager-response-quality.js"),
  loadApi("manager/manager-outcome-review.js"),
  loadApi("tasks/tasks.service.js"),
  loadApi("manager/manager-evaluation.js"),
  loadApi("manager/manager-plan.js"),
  loadApi("operations/event-readiness.js"),
  loadApi("operations/event-day-of.js"),
  loadApi("operations/project-plan.js")
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
  assert.equal(managerSchemas.managerMessageFeedbackSchema.safeParse({ helpful: true }).success, true);
  assert.equal(managerSchemas.managerMessageFeedbackSchema.safeParse({ helpful: false, reason: "too_vague", note: "Name the next step" }).success, true);
  assert.equal(managerSchemas.managerMessageFeedbackSchema.safeParse({ helpful: false }).success, false);
  assert.equal(managerSchemas.managerMessageFeedbackSchema.safeParse({ helpful: true, reason: "too_long" }).success, false);
});

test("manager response quality rejects assistant tells, canned prose, and invented external actions", () => {
  const natural = responseQuality.evaluateManagerResponseQuality("Start with the overdue venue follow-up. It is the clearest booking risk today, and Alex already owns it.", "guided");
  assert.equal(natural.passed, true);
  const unsafe = responseQuality.evaluateManagerResponseQuality("Certainly! As an AI assistant, I have emailed the buyer based on the provided snapshot.", "guided");
  assert.equal(unsafe.passed, false);
  assert.ok(unsafe.violations.includes("canned_preamble"));
  assert.ok(unsafe.violations.includes("assistant_meta_language"));
  assert.ok(unsafe.violations.includes("unverified_external_action_claim"));
  const tooLong = responseQuality.evaluateManagerResponseQuality(Array.from({ length: 141 }, () => "word").join(" "), "concise");
  assert.ok(tooLong.violations.includes("too_long"));
});

test("explicit response feedback becomes bounded presentation guidance without changing authority", () => {
  const rows = [
    { helpful: false, reason: "too_vague" },
    { helpful: false, reason: "missed_question" },
    { helpful: true, reason: null }
  ];
  const summary = responseQuality.summarizeManagerResponseFeedback(rows);
  assert.equal(summary.helpfulRate, 1 / 3);
  assert.equal(summary.reasons[0].reason, "missed_question");
  const guidance = responseQuality.managerResponseGuidance(rows);
  assert.match(guidance, /exact question|specific next action/i);
  assert.doesNotMatch(guidance, /send|execute|approve/i);
});

test("manager response feedback is exact-message, tenant-safe, idempotent, and audited", async () => {
  let upserts = 0; let audits = 0;
  const client = {
    managerMessage: { findFirst: async ({ where }) => where.conversation.artistId === "artist-a" && where.role === "assistant" ? { id: "message-a", managerRunId: "run-a" } : null },
    managerMessageFeedback: { upsert: async ({ create, update }) => { upserts += 1; return { id: "feedback-a", ...create, ...update }; } }
  };
  const service = new managerMod.ManagerService({ client }, { log: async () => { audits += 1; } }, { get: () => false });
  const first = await service.messageFeedback("artist-a", "message-a", { helpful: false, reason: "too_vague" }, "member@test", "operator-a");
  const corrected = await service.messageFeedback("artist-a", "message-a", { helpful: true }, "member@test", "operator-a");
  assert.equal(first.helpful, false);
  assert.equal(corrected.helpful, true);
  assert.equal(upserts, 2);
  assert.equal(audits, 2);
  await assert.rejects(() => service.messageFeedback("artist-b", "message-a", { helpful: true }, "member@test", "operator-a"), (error) => error?.getStatus?.() === 404);
  assert.equal(upserts, 2);
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
  const clean = evaluation.runManagerEvaluation("manager_os_v4", []);
  assert.equal(clean.passed, true);
  assert.equal(clean.metrics.goldenPassRate, 1);
  assert.equal(clean.metrics.safetyPassRate, 1);
  const blocked = evaluation.runManagerEvaluation("manager_os_v4", [{ id: "review-a", label: "needs_revision", promptVersion: "manager_os_v4", snapshot: { stableKey: "goal-goal-a", workstream: "live" } }]);
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

test("manager outcome review is explicit when no result evidence exists", () => {
  const review = outcomeReview.deterministicManagerOutcomeReview({ windowDays: 90, through: now, events: [], projects: [], completedTasks: [], campaignRecipients: [] });
  assert.equal(review.confidence, 0);
  assert.equal(review.confidenceLabel, "low");
  assert.match(review.headline, /not enough recorded outcome data/i);
  assert.equal(review.attention[0].code, "no_recorded_outcomes");
  assert.equal(review.financials.length, 0);
});

test("manager outcome review separates currencies and never invents unsettled net", () => {
  const baseEvent = { id: "event-a", title: "Friday show", status: "completed", startsAt: new Date("2026-07-10T01:00:00.000Z"), updatedAt: now, currency: "USD", attendance: 120, grossRevenueMinor: 150000, postShowNotes: "Strong audience response", relationshipOutcome: "Buyer invited a return pitch", invoices: [] };
  const settled = outcomeReview.deterministicManagerOutcomeReview({
    windowDays: 90,
    through: now,
    events: [{ ...baseEvent, settlement: { id: "settlement-a", status: "finalized", currency: "USD", grossMinor: 150000, expenseMinor: 25000, netMinor: 125000 }, expenses: [{ id: "expense-a", currency: "USD", amountMinor: 25000 }, { id: "expense-eur", currency: "EUR", amountMinor: 5000 }] }],
    projects: [{ id: "project-a", name: "Show campaign", status: "completed", updatedAt: now, tasks: [], expenses: [{ id: "expense-eur", currency: "EUR", amountMinor: 5000 }] }],
    completedTasks: [{ id: "task-a", updatedAt: now }],
    campaignRecipients: [{ id: "recipient-a", status: "booked", updatedAt: now }]
  });
  assert.equal(settled.confidenceLabel, "high");
  assert.deepEqual(settled.financials.find((row) => row.currency === "USD"), { currency: "USD", grossMinor: 150000, expenseMinor: 25000, settledNetMinor: 125000, showsWithGross: 1, finalizedSettlements: 1, netKnownShows: 1 });
  assert.deepEqual(settled.financials.find((row) => row.currency === "EUR"), { currency: "EUR", grossMinor: 0, expenseMinor: 5000, settledNetMinor: 0, showsWithGross: 0, finalizedSettlements: 0, netKnownShows: 0 });
  assert.ok(settled.evidenceIds.includes("settlement-a"));
  assert.ok(settled.wins.some((item) => item.code === "positive_settled_net"));
  assert.equal(settled.recordedLessons[0].postShowNotes, "Strong audience response");

  const drift = outcomeReview.deterministicManagerOutcomeReview({ windowDays: 90, through: now, events: [{ ...baseEvent, settlement: { id: "settlement-a", status: "finalized", currency: "USD", grossMinor: 150000, expenseMinor: 25000, netMinor: 125000 }, expenses: [{ id: "expense-a", currency: "USD", amountMinor: 30000 }] }], projects: [], completedTasks: [], campaignRecipients: [] });
  assert.equal(drift.financials[0].expenseMinor, 30000);
  assert.ok(drift.attention.some((item) => item.code === "settlement_expense_drift"));

  const unsettled = outcomeReview.deterministicManagerOutcomeReview({ windowDays: 90, through: now, events: [{ ...baseEvent, attendance: null, postShowNotes: null, relationshipOutcome: null, settlement: null, expenses: [{ id: "expense-a", currency: "USD", amountMinor: 25000 }] }], projects: [], completedTasks: [], campaignRecipients: [] });
  assert.equal(unsettled.financials[0].settledNetMinor, 0);
  assert.equal(unsettled.financials[0].netKnownShows, 0);
  assert.ok(unsettled.attention.some((item) => item.code === "post_show_incomplete"));
  assert.ok(unsettled.attention.some((item) => item.code === "settlement_incomplete"));
});

test("manager answers retrospective questions from the shared outcome review", () => {
  const review = outcomeReview.deterministicManagerOutcomeReview({
    windowDays: 90,
    through: now,
    events: [{ id: "event-a", title: "Friday show", status: "completed", startsAt: new Date("2026-07-10T01:00:00.000Z"), updatedAt: now, currency: "USD", attendance: 120, grossRevenueMinor: 150000, postShowNotes: "Strong audience response", relationshipOutcome: "Buyer invited a return pitch", settlement: { id: "settlement-a", status: "finalized", currency: "USD", grossMinor: 150000, expenseMinor: 25000, netMinor: 125000 }, expenses: [{ id: "expense-a", currency: "USD", amountMinor: 25000 }], invoices: [] }],
    projects: [], completedTasks: [], campaignRecipients: []
  });
  const answer = intelligence.deterministicManagerChat(managerFacts({ outcomeReview: review }), "What did we learn from our recent shows?", now);
  assert.match(answer.answer, /120/);
  assert.match(answer.answer, /finalized net USD 1,250\.00/);
  assert.ok(answer.citations.includes("event-a"));
  assert.equal(answer.recommendation, null);
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

test("settlement math includes only expenses in the settlement currency", async () => {
  let aggregateWhere = null;
  const client = {
    bandEvent: { findFirst: async () => ({ id: "event-a" }) },
    expense: { aggregate: async ({ where }) => { aggregateWhere = where; return { _sum: { amountMinor: 2500 } }; } },
    settlement: { create: async ({ data }) => ({ id: "settlement-a", ...data, splits: [] }) }
  };
  const service = new operationsMod.OperationsService({ client }, { log: async () => undefined }, {});
  const row = await service.createSettlement("artist-a", { eventId: "event-a", currency: "USD", grossMinor: 10000, splits: [] }, "member@test", "operator-a");
  assert.deepEqual(aggregateWhere, { artistId: "artist-a", eventId: "event-a", currency: { equals: "USD", mode: "insensitive" } });
  assert.equal(row.expenseMinor, 2500);
  assert.equal(row.netMinor, 7500);
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

test("day-of intelligence identifies the next checkpoint, work pressure, and recorded money", () => {
  const event = {
    id: "event-day", status: "confirmed", startsAt: new Date("2026-07-12T21:00:00.000Z"), endsAt: null,
    loadInAt: new Date("2026-07-12T17:00:00.000Z"), soundcheckAt: new Date("2026-07-12T18:00:00.000Z"),
    doorsAt: new Date("2026-07-12T20:00:00.000Z"), setAt: new Date("2026-07-12T21:00:00.000Z"), curfewAt: new Date("2026-07-12T23:00:00.000Z"),
    guaranteeMinor: 100000, depositMinor: 25000, currency: "USD",
    participants: [{ id: "participant-a", bandMemberId: "member-a", response: "available" }],
    tasks: [{ id: "task-a", title: "Confirm parking", status: "todo", dueAt: new Date("2026-07-11T12:00:00.000Z") }],
    schedule: [],
    deals: [{ id: "deal-a", status: "accepted", offerAmountMinor: 100000, depositMinor: 25000, invoices: [{ id: "invoice-a", totalMinor: 100000, paidMinor: 25000 }] }],
    invoices: []
  };
  const readiness = { eventId: event.id, title: "Show", startsAt: event.startsAt.toISOString(), daysUntil: 0, score: 80, status: "attention", confidence: 1, confidenceLabel: "high", observedAt: now.toISOString(), headline: "One gap remains.", nextAction: null, categories: [], gaps: [], evidenceIds: [event.id] };
  const view = eventDayOf.deterministicEventDayOf(event, readiness, [{ id: "member-a" }], now);
  assert.equal(view.mode, "pre_show");
  assert.equal(view.nextCheckpoint.label, "Load-in");
  assert.equal(view.nextCheckpoint.minutesUntil, 300);
  assert.equal(view.overdueTaskCount, 1);
  assert.equal(view.expectedFeeMinor, 100000);
  assert.equal(view.depositRemainingMinor, 0);
  assert.equal(view.openInvoiceBalanceMinor, 75000);
  assert.match(view.nextAction, /Confirm parking/);
  assert.ok(view.evidenceIds.includes("invoice-a"));
  event.status = "cancelled";
  const closed = eventDayOf.deterministicEventDayOf(event, readiness, [{ id: "member-a" }], now);
  assert.equal(closed.mode, "closed");
  assert.equal(closed.nextCheckpoint, null);
  assert.ok(closed.timeline.every((item) => item.state !== "next"));
  assert.match(closed.nextAction, /cancellation outcome/i);
});

test("manager prioritizes the concrete day-of sequence for a show within 24 hours", () => {
  const dayOf = { eventId: "event-a", mode: "pre_show", observedAt: now.toISOString(), headline: "Next checkpoint: Load-in in 120 minutes.", nextAction: "Confirm load-in readiness before the next checkpoint.", nextCheckpoint: null, timeline: [], openTaskCount: 1, overdueTaskCount: 0, unavailableCount: 0, unresolvedAvailabilityCount: 0, expectedFeeMinor: 1000, expectedDepositMinor: 0, recordedPaidMinor: 0, openInvoiceBalanceMinor: 0, depositRemainingMinor: 0, currency: "USD", evidenceIds: ["event-a", "task-a"] };
  const readiness = { eventId: "event-a", title: "Tonight", startsAt: "2026-07-12T22:00:00.000Z", daysUntil: 0, score: 85, status: "attention", confidence: 0.9, confidenceLabel: "high", observedAt: now.toISOString(), headline: "Tonight has one remaining gap.", nextAction: "Review the event.", categories: [], gaps: [], evidenceIds: ["event-a"] };
  const facts = managerFacts({ events: [{ id: "event-a", title: "Tonight", type: "gig", status: "confirmed", startsAt: new Date("2026-07-12T22:00:00.000Z"), participants: [{ response: "available", bandMemberId: "member-a" }, { response: "available", bandMemberId: "member-b" }], readiness, dayOf }] });
  const brief = intelligence.deterministicManagerBrief(facts, now);
  const show = brief.today.find((item) => item.stableKey === "event-event-a");
  assert.equal(show.title, "Run Tonight day-of");
  assert.match(show.reason, /Next checkpoint: Load-in/);
  assert.equal(show.nextAction, dayOf.nextAction);
  assert.ok(show.evidenceIds.includes("task-a"));
});

test("project templates are bounded, dated backward, and tailored by project type", () => {
  const dueAt = new Date("2026-10-01T12:00:00.000Z");
  for (const type of ["release", "content_campaign", "tour", "business"]) {
    const template = projectPlan.projectPlanTemplate(type, dueAt);
    assert.ok(template.length >= 5 && template.length <= 6);
    assert.equal(new Set(template.map((item) => item.key)).size, template.length);
    assert.ok(template.every((item) => item.dueAt <= dueAt));
    assert.equal(template.at(-1).dueAt.toISOString(), dueAt.toISOString());
  }
  assert.match(projectPlan.projectPlanTemplate("release", dueAt)[1].title, /masters/i);
  assert.match(projectPlan.projectPlanTemplate("tour", dueAt)[0].title, /route/i);
});

test("project readiness explains missing plans, ownership, progress, and overdue work", () => {
  const dueAt = new Date("2026-10-01T12:00:00.000Z");
  const base = { id: "project-a", name: "New EP", type: "release", status: "active", dueAt, budgetMinor: 50000, currency: "USD", successMetrics: ["100 saves"], assets: [{ label: "Master", url: "https://example.test/master" }], expenses: [], events: [] };
  const empty = projectPlan.deterministicProjectReadiness({ ...base, tasks: [] }, now);
  assert.equal(empty.status, "needs_plan");
  assert.equal(empty.gaps[0].code, "plan_missing");
  const specs = projectPlan.projectPlanTemplate("release", dueAt);
  const tasks = specs.map((spec, index) => ({ id: `task-${index}`, title: spec.title, status: index < 3 ? "done" : "todo", ownerLabel: index < 3 ? "Alex" : null, dueAt: spec.dueAt, sourceKey: `${projectPlan.PROJECT_PLAN_VERSION}:project-a:${spec.key}` }));
  const ownershipGap = projectPlan.deterministicProjectReadiness({ ...base, tasks }, now);
  assert.equal(ownershipGap.status, "at_risk");
  assert.ok(ownershipGap.gaps.some((gap) => gap.code === "milestones_unassigned"));
  const owned = projectPlan.deterministicProjectReadiness({ ...base, tasks: tasks.map((task) => ({ ...task, ownerLabel: "Alex" })) }, now);
  assert.equal(owned.status, "on_track");
  assert.equal(owned.nextMilestone.id, "task-3");
  const overdue = projectPlan.deterministicProjectReadiness({ ...base, tasks: tasks.map((task, index) => ({ ...task, status: index === 0 ? "todo" : task.status, ownerLabel: "Alex", dueAt: index === 0 ? new Date("2026-07-01T00:00:00.000Z") : task.dueAt })) }, now);
  assert.equal(overdue.status, "off_track");
  assert.equal(overdue.gaps[0].code, "milestones_overdue");
  const inconsistent = projectPlan.deterministicProjectReadiness({ ...base, status: "completed", tasks }, now);
  assert.equal(inconsistent.status, "at_risk");
  assert.ok(inconsistent.gaps.some((gap) => gap.code === "completion_inconsistent"));
  const closed = projectPlan.deterministicProjectReadiness({ ...base, status: "cancelled", tasks }, now);
  assert.equal(closed.status, "closed");
  assert.match(closed.nextAction, /cancellation reason/i);
});

test("manager answers release questions from project readiness rather than generic plan text", () => {
  const readiness = { projectId: "project-a", score: 72, status: "at_risk", confidence: 0.8, headline: "New EP is at risk; 2 gaps need attention.", nextAction: "Assign a real person to each open milestone.", nextMilestone: { id: "task-a", title: "Complete masters", dueAt: "2026-08-01T00:00:00.000Z", ownerLabel: null }, completedMilestones: 1, totalMilestones: 6, overdueMilestones: 0, blockedMilestones: 0, spendMinor: 0, budgetRemainingMinor: 50000, gaps: [], evidenceIds: ["project-a", "task-a"], observedAt: now.toISOString() };
  const facts = managerFacts({ projects: [{ id: "project-a", name: "New EP", type: "release", status: "active", dueAt: new Date("2026-09-01T00:00:00.000Z"), readiness }] });
  const answer = intelligence.deterministicManagerChat(facts, "How is our EP release project going?", now);
  assert.match(answer.answer, /New EP/);
  assert.match(answer.answer, /72\/100/);
  assert.match(answer.answer, /Complete masters/);
  assert.ok(answer.citations.includes("task-a"));
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

test("event patches validate the merged schedule before write or audit", async () => {
  let updates = 0; let audits = 0;
  const existing = {
    startsAt: new Date("2026-09-18T18:00:00.000Z"), endsAt: null,
    loadInAt: new Date("2026-09-18T18:00:00.000Z"), soundcheckAt: null,
    doorsAt: new Date("2026-09-18T20:00:00.000Z"), setAt: new Date("2026-09-18T21:00:00.000Z"), curfewAt: null
  };
  const service = new operationsMod.OperationsService({ client: {
    bandEvent: {
      findFirst: async ({ where }) => where.artistId === "artist-a" ? existing : null,
      update: async () => { updates += 1; return { id: "event-a", status: "confirmed" }; }
    }
  } }, { log: async () => { audits += 1; } }, {});
  await assert.rejects(
    () => service.patchEvent("artist-a", "event-a", { soundcheckAt: "2026-09-18T22:00:00.000Z" }, "owner@test", "operator-a"),
    /Soundcheck must be before doors/i
  );
  await assert.rejects(
    () => service.patchEvent("artist-b", "event-a", { locationName: "Foreign edit" }, "owner@test", "operator-b"),
    (error) => error?.getStatus?.() === 404
  );
  assert.equal(updates, 0);
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
