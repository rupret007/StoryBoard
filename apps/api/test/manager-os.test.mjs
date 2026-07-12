import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = (path) => import(pathToFileURL(join(dir, "..", "dist", path)).href);
const loadShared = (path) => import(pathToFileURL(join(dir, "..", "..", "..", "packages", "shared", "dist", path)).href);
const [policy, pdf, managerSchemas, operationSchemas, operationsMod, managerMod, intelligence, responseQuality, outcomeReview, contextHealth, knowledgeHealth, memoryCapture, goalMeasurement, coaching, commitmentHealth, managerSchedule, providerContext, tasksMod, evaluation, managerPlan, eventReadiness, eventDayOf, projectPlan, workflowProcessorMod] = await Promise.all([
  loadApi("manager/manager-policy.js"),
  loadApi("operations/simple-pdf.js"),
  loadShared("schemas/manager.js"),
  loadShared("schemas/operations.js"),
  loadApi("operations/operations.service.js"),
  loadApi("manager/manager.service.js"),
  loadApi("manager/manager-intelligence.js"),
  loadApi("manager/manager-response-quality.js"),
  loadApi("manager/manager-outcome-review.js"),
  loadApi("manager/manager-context-health.js"),
  loadApi("manager/manager-knowledge-health.js"),
  loadApi("manager/manager-memory-capture.js"),
  loadApi("manager/manager-goal-measurement.js"),
  loadApi("manager/manager-coaching.js"),
  loadApi("manager/manager-commitment-health.js"),
  loadApi("manager/manager-schedule.js"),
  loadApi("manager/manager-provider-context.js"),
  loadApi("tasks/tasks.service.js"),
  loadApi("manager/manager-evaluation.js"),
  loadApi("manager/manager-plan.js"),
  loadApi("operations/event-readiness.js"),
  loadApi("operations/event-day-of.js"),
  loadApi("operations/project-plan.js"),
  loadApi("workflow-automation/workflow-job-processor.service.js")
]);

const now = new Date("2026-07-12T12:00:00.000Z");
function managerFacts(overrides = {}) {
  return {
    artist: { id: "artist-a", name: "The Test Band" },
    profile: { id: "profile-a", intakeCompletedAt: new Date("2026-01-01T00:00:00.000Z"), decisionStyle: "guided", twelveMonthAmbition: "Play better regional shows" },
    members: [{ id: "member-a", name: "Alex" }, { id: "member-b", name: "Jordan" }],
    goals: [{ id: "goal-a", title: "Book six regional shows", workstream: "live", status: "active", deadline: new Date("2026-12-01T00:00:00.000Z"), currentValue: 1, targetValue: 6 }],
    goalMeasurements: [],
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
  assert.equal(managerSchemas.managerDecisionCreateSchema.safeParse({ workstream: "business", title: "Sign?", options: [{ label: "Yes", tradeoff: "Commit" }, { label: "yes", tradeoff: "Decline" }], evidence: [] }).success, false);
  assert.equal(managerSchemas.managerDecisionCreateSchema.safeParse({ workstream: "business", title: "Sign?", options: [{ label: "Yes", tradeoff: "Commit" }, { label: "No", tradeoff: "Decline" }], choice: "Maybe", evidence: [] }).success, false);
  assert.equal(managerSchemas.managerDecisionPatchSchema.safeParse({}).success, false);
  assert.equal(managerSchemas.managerDecisionReviewSchema.safeParse({ outcome: "mixed", note: "Worth repeating with a smaller room", evidence: [] }).success, true);
  assert.equal(managerSchemas.managerDecisionReviewSchema.safeParse({ outcome: "successful", note: "Invented status", evidence: [] }).success, false);
  assert.equal(managerSchemas.managerGoalCreateSchema.safeParse({ workstream: "live", title: "Book shows", measurementKind: "confirmed_gigs" }).success, true);
  assert.equal(managerSchemas.managerGoalCreateSchema.safeParse({ workstream: "live", title: "Book shows", measurementKind: "social_vibes" }).success, false);
  assert.equal(managerSchemas.managerGoalProgressSyncSchema.safeParse({ observedValue: 2 }).success, true);
  assert.equal(managerSchemas.managerGoalProgressSyncSchema.safeParse({ observedValue: 1.5 }).success, false);
});

test("manager cadence validation and local periods fail closed", () => {
  assert.equal(managerSchemas.managerSettingsSchema.safeParse({ scheduleEnabled: true, timezone: "America/Chicago", dailyHour: 9, weeklyDay: 1, scheduleAudience: "team", scheduledAiEnabled: false }).success, true);
  assert.equal(managerSchemas.managerSettingsSchema.safeParse({ timezone: "Central-ish" }).success, false);
  assert.equal(managerSchemas.managerSettingsSchema.safeParse({ weeklyDay: 0 }).success, false);
  assert.equal(managerSchemas.managerSettingsSchema.safeParse({ scheduleAudience: "everyone" }).success, false);

  const chicago = managerSchedule.managerScheduleSlot({ now: new Date("2026-07-13T14:05:00.000Z"), timezone: "America/Chicago", cadence: "daily", dailyHour: 9, weeklyDay: 1 });
  assert.equal(chicago.localDate, "2026-07-13");
  assert.equal(chicago.localHour, 9);
  assert.equal(chicago.localWeekday, 1);
  assert.equal(chicago.due, true);
  assert.equal(chicago.periodKey, "daily:2026-07-13");
  assert.equal(managerSchedule.managerScheduleKey("artist-a", chicago), "artist-a:daily:2026-07-13");

  const losAngeles = managerSchedule.managerScheduleSlot({ now: new Date("2026-07-13T14:05:00.000Z"), timezone: "America/Los_Angeles", cadence: "daily", dailyHour: 9, weeklyDay: 1 });
  assert.equal(losAngeles.localHour, 7);
  assert.equal(losAngeles.due, false);

  const weeklyCatchup = managerSchedule.managerScheduleSlot({ now: new Date("2026-07-14T15:00:00.000Z"), timezone: "America/Chicago", cadence: "weekly", dailyHour: 9, weeklyDay: 1 });
  assert.equal(weeklyCatchup.localWeekday, 2);
  assert.equal(weeklyCatchup.due, true);
  assert.match(weeklyCatchup.periodKey, /^weekly:2026-W\d{2}$/);
  const friday = managerSchedule.managerScheduleSlot({ now: new Date("2026-07-14T15:00:00.000Z"), timezone: "America/Chicago", cadence: "weekly", dailyHour: 9, weeklyDay: 5 });
  assert.equal(friday.due, false);
});

test("manager settings require explicit, compatible schedule and model consent", async () => {
  let current = { id: "settings-a", artistId: "artist-a", aiEnabled: false, fullContextEnabled: false, scheduleEnabled: false, scheduledAiEnabled: false, scheduleAudience: "owners", timezone: null, dailyHour: 9, weeklyDay: 1 };
  let intakeComplete = true;
  let audits = 0;
  const client = {
    managerSettings: {
      upsert: async ({ create, update }) => { current = { ...current, ...(Object.keys(update).length ? update : create) }; return { ...current }; }
    },
    artistOperatingProfile: { findUnique: async () => intakeComplete ? { intakeCompletedAt: new Date() } : null }
  };
  const service = new managerMod.ManagerService({ client }, { log: async () => { audits += 1; } }, { get: () => false });
  await assert.rejects(() => service.updateSettings("artist-a", { scheduleEnabled: true }, "owner@test", "operator-a"), /Timezone/);
  await assert.rejects(() => service.updateSettings("artist-a", { scheduledAiEnabled: true }, "owner@test", "operator-a"), /Enable Manager AI/);
  await assert.rejects(() => service.updateSettings("artist-a", { aiEnabled: true }, "owner@test", "operator-a"), /disabled by deployment/);
  intakeComplete = false;
  await assert.rejects(() => service.updateSettings("artist-a", { scheduleEnabled: true, timezone: "America/Chicago" }, "owner@test", "operator-a"), /Complete Manager setup/);
  intakeComplete = true;
  const saved = await service.updateSettings("artist-a", { scheduleEnabled: true, timezone: "America/Chicago", weeklyDay: 1, scheduleAudience: "owners" }, "owner@test", "operator-a");
  assert.equal(saved.scheduleEnabled, true);
  assert.equal(saved.timezone, "America/Chicago");
  current.scheduledAiEnabled = true;
  const disabled = await service.updateSettings("artist-a", { scheduleEnabled: false }, "owner@test", "operator-a");
  assert.equal(disabled.scheduledAiEnabled, false);
  assert.equal(audits, 2);
});

test("manager provider context enforces memory sensitivity independently of model output", () => {
  const memoryFacts = [
    { id: "normal-a", key: "normal_note", sourceType: "operator", sourceId: null, confidence: 1, confirmedAt: now, updatedAt: now, sensitivity: "normal", value: "Chicago" },
    { id: "sensitive-a", key: "private_budget", sourceType: "owner", sourceId: null, confidence: 1, confirmedAt: now, updatedAt: now, sensitivity: "sensitive", value: "Private budget" },
    { id: "restricted-a", key: "restricted_health", sourceType: "owner", sourceId: null, confidence: 1, confirmedAt: now, updatedAt: now, sensitivity: "restricted", value: "Never share" }
  ];
  assert.deepEqual(providerContext.projectManagerMemoryForProvider(memoryFacts, false).map((fact) => fact.id), ["normal-a"]);
  assert.deepEqual(providerContext.projectManagerMemoryForProvider(memoryFacts, true).map((fact) => fact.id), ["normal-a", "sensitive-a"]);

  const disabled = providerContext.managerProviderContextPolicy(memoryFacts, { aiEnabled: false, fullContextEnabled: true });
  assert.equal(disabled.mode, "disabled");
  assert.equal(disabled.memory.included, 0);
  assert.equal(disabled.memory.excluded, 3);

  const redacted = providerContext.managerProviderContextPolicy(memoryFacts, { aiEnabled: true, fullContextEnabled: false });
  assert.equal(redacted.mode, "redacted");
  assert.deepEqual(redacted.memory, { normal: 1, sensitive: 1, restricted: 1, included: 1, excluded: 2 });

  const full = providerContext.managerProviderContextPolicy(memoryFacts, { aiEnabled: true, fullContextEnabled: true });
  assert.equal(full.mode, "full");
  assert.deepEqual(full.memory, { normal: 1, sensitive: 1, restricted: 1, included: 2, excluded: 1 });
  assert.equal(full.restrictedMemoryNeverShared, true);

  const service = new managerMod.ManagerService({ client: {} }, { log: async () => undefined }, { get: () => false });
  const facts = managerFacts({ memoryFacts, knowledgeHealth: knowledgeHealth.deterministicManagerKnowledgeHealth({ profile: null, memoryFacts: [memoryFacts[0]] }, now), outcomeReview: { recordedLessons: [], evidenceIds: [] } });
  assert.deepEqual(service.providerFacts(facts, false).memoryFacts.map((fact) => fact.id), ["normal-a"]);
  assert.deepEqual(service.providerFacts(facts, true).memoryFacts.map((fact) => fact.id), ["normal-a", "sensitive-a"]);
  assert.deepEqual(service.providerFacts(facts, false).knowledgeHealth.evidenceIds, ["normal-a"]);
  assert.equal(service.providerFacts(facts, true).knowledgeHealth.evidenceIds.includes("restricted-a"), false);
  const redactedIds = service.providerKnownIds(facts, false);
  assert.equal(redactedIds.has("normal-a"), true);
  assert.equal(redactedIds.has("sensitive-a"), false);
  assert.equal(redactedIds.has("restricted-a"), false);
  assert.equal(service.chatOutputIsGrounded({ answer: "Use the recorded home market.", citations: ["normal-a"], recommendation: null }, facts, "", redactedIds), true);
  assert.equal(service.chatOutputIsGrounded({ answer: "Use the private note.", citations: ["restricted-a"], recommendation: null }, facts, "", redactedIds), false);
});

test("the queue dispatches the Manager schedule scan through the registered service", async () => {
  let scans = 0;
  const moduleRef = { get: (token) => {
    assert.equal(token.name, "ManagerService");
    return { runScheduledBriefScan: async () => { scans += 1; return { ok: true, generated: 1 }; } };
  } };
  const unused = {};
  const processor = new workflowProcessorMod.WorkflowJobProcessorService(unused, unused, unused, unused, unused, unused, unused, unused, unused, unused, unused, moduleRef);
  const result = await processor.process({ name: "manager.schedule.scan" });
  assert.equal(scans, 1);
  assert.deepEqual(result, { ok: true, generated: 1 });
});

test("manager decisions preserve the choice, require a review checkpoint, and record one immutable lesson", async () => {
  let row = { id: "decision-a", artistId: "artist-a", workstream: "live", title: "Which market?", context: "One weekend available", options: [{ label: "Milwaukee", tradeoff: "Closer but smaller" }, { label: "Detroit", tradeoff: "Farther but stronger fit" }], choice: null, rationale: null, expectedOutcome: null, evidence: [], status: "open", reviewAt: null, decidedAt: null, reviewOutcome: null, reviewNote: null, reviewEvidence: [], reviewedAt: null, updatedAt: new Date("2026-07-01T12:00:00.000Z") };
  let audits = 0;
  const client = {
    managerDecision: {
      findFirst: async ({ where }) => where.id === row.id && where.artistId === row.artistId ? { ...row } : null,
      updateMany: async ({ where, data }) => {
        if (where.id !== row.id || where.artistId !== row.artistId || (where.status && row.status !== where.status) || (where.reviewedAt === null && row.reviewedAt)) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...row })
    },
    managerRecommendation: { updateMany: async () => ({ count: 0 }) }
  };
  client.$transaction = async (fn) => fn(client);
  const service = new managerMod.ManagerService({ client }, { log: async () => { audits += 1; } }, { get: () => false });
  await assert.rejects(() => service.patchDecision("artist-b", row.id, { choice: "Milwaukee" }, "member@test", "operator-a"), (error) => error?.getStatus?.() === 404);
  await assert.rejects(() => service.reviewDecision("artist-a", row.id, { outcome: "worked", note: "Too early", evidence: [] }, "member@test", "operator-a"), /Choose an option/);
  await assert.rejects(() => service.patchDecision("artist-a", row.id, { choice: "Milwaukee", rationale: "Short drive" }, "member@test", "operator-a"), /expected/i);
  const decided = await service.patchDecision("artist-a", row.id, { choice: "Milwaukee", rationale: "The drive fits the band's schedule", expectedOutcome: "At least 75 attendees and one return invitation", reviewAt: "2026-08-15T12:00:00.000Z" }, "member@test", "operator-a");
  assert.equal(decided.status, "decided");
  assert.equal(decided.choice, "Milwaukee");
  assert.ok(decided.decidedAt instanceof Date);
  await assert.rejects(() => service.patchDecision("artist-a", row.id, { choice: "Detroit" }, "member@test", "operator-a"), /immutable/);
  await assert.rejects(() => service.patchDecision("artist-a", row.id, { expectedOutcome: "Rewrite the forecast after choosing" }, "member@test", "operator-a"), /immutable/);
  const reviewed = await service.reviewDecision("artist-a", row.id, { outcome: "mixed", note: "Attendance reached 80, but no return invitation yet", evidence: [] }, "member@test", "operator-a");
  assert.equal(reviewed.status, "reviewed");
  assert.equal(reviewed.reviewOutcome, "mixed");
  assert.ok(reviewed.reviewedAt instanceof Date);
  await assert.rejects(() => service.reviewDecision("artist-a", row.id, { outcome: "worked", note: "Rewrite history", evidence: [] }, "member@test", "operator-a"), /already been reviewed/);
  await assert.rejects(() => service.patchDecision("artist-a", row.id, { title: "Rewrite history" }, "member@test", "operator-a"), /immutable/);
  assert.equal(audits, 2);
});

test("concurrent band decision writes fail closed instead of overwriting another choice", async () => {
  let audits = 0;
  let claimedWhere = null;
  const client = { managerDecision: {
    findFirst: async () => ({ id: "decision-a", artistId: "artist-a", workstream: "live", title: "Which market?", options: [{ label: "Milwaukee", tradeoff: "Closer" }, { label: "Detroit", tradeoff: "Stronger fit" }], choice: null, rationale: null, expectedOutcome: null, status: "open", reviewAt: null, updatedAt: new Date("2026-07-01T12:00:00.000Z") }),
    updateMany: async ({ where }) => { claimedWhere = where; return { count: 0 }; },
    findUniqueOrThrow: async () => { throw new Error("must not read after a lost update"); }
  } };
  const service = new managerMod.ManagerService({ client }, { log: async () => { audits += 1; } }, { get: () => false });
  await assert.rejects(() => service.patchDecision("artist-a", "decision-a", { choice: "Milwaukee", rationale: "Closer", expectedOutcome: "Draw 75 people", reviewAt: "2026-08-15T12:00:00.000Z" }, "member@test", "operator-a"), /changed while you were reviewing/i);
  assert.equal(claimedWhere.updatedAt.toISOString(), "2026-07-01T12:00:00.000Z");
  assert.equal(audits, 0);
});

test("manager action authorization is code-owned and defaults to forbidden", () => {
  assert.equal(policy.classifyManagerAction("create_task"), "internal");
  assert.equal(policy.classifyManagerAction("create_decision"), "internal");
  assert.equal(policy.classifyManagerAction("generate_event_advance"), "internal");
  assert.equal(policy.classifyManagerAction("generate_project_plan"), "internal");
  assert.equal(policy.classifyManagerAction("remember_fact"), "internal");
  assert.equal(policy.classifyManagerAction("create_draft_record"), "forbidden");
  assert.equal(policy.classifyManagerAction("send_email"), "approval_required");
  assert.equal(policy.classifyManagerAction("financial_action"), "owner_approval_required");
  assert.equal(policy.classifyManagerAction("run_sql"), "forbidden");
  assert.equal(policy.managerActionMayExecuteDirectly("send_email"), false);
});

test("conversation decision acceptance creates one linked open draft and never chooses for the band", async () => {
  let decisionCreates = 0; let taskCreates = 0; let audits = 0;
  const action = { type: "create_decision", workstream: "live", title: "Should we focus on Milwaukee or Detroit", context: "Prepared from conversation", options: [{ label: "focus on Milwaukee", tradeoff: "Not recorded yet—add the real cost, benefit, or risk before choosing." }, { label: "Detroit", tradeoff: "Not recorded yet—add the real cost, benefit, or risk before choosing." }] };
  const client = {
    managerRecommendation: {
      findFirst: async ({ where }) => where.managerRun.artistId === "artist-a" ? { id: "rec-decision", outcome: "suggested", taskId: null, decisionId: null, task: null, decision: null, proposedAction: action, evidence: ["profile-a"] } : null,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => ({ id: "rec-decision", ...data })
    },
    managerDecision: { create: async ({ data }) => { decisionCreates += 1; assert.equal(data.artistId, "artist-a"); assert.equal(data.needsFraming, true); assert.equal(data.choice, undefined); return { id: "decision-draft", ...data }; } },
    task: { create: async () => { taskCreates += 1; return { id: "task-a" }; } },
    $transaction: async (fn) => fn(client)
  };
  const service = new managerMod.ManagerService({ client }, { log: async () => { audits += 1; } }, { get: () => false });
  const accepted = await service.recommendation("artist-a", "rec-decision", "accepted", {}, "member@test", "operator-a");
  assert.equal(accepted.decisionId, "decision-draft");
  assert.equal(accepted.taskId, null);
  assert.equal(decisionCreates, 1);
  assert.equal(taskCreates, 0);
  assert.equal(audits, 2);
  await assert.rejects(() => service.recommendation("artist-b", "rec-decision", "accepted", {}, "member@test", "operator-b"), (error) => error?.getStatus?.() === 404);
});

test("conversation decision drafts cannot be chosen until a member saves real framing", async () => {
  let row = { id: "decision-draft", artistId: "artist-a", workstream: "live", title: "Which market?", context: null, options: [{ label: "Milwaukee", tradeoff: "Missing" }, { label: "Detroit", tradeoff: "Missing" }], choice: null, rationale: null, expectedOutcome: null, needsFraming: true, status: "open", reviewAt: null, updatedAt: new Date("2026-07-01T12:00:00.000Z") };
  const client = { managerDecision: {
    findFirst: async () => ({ ...row }),
    updateMany: async ({ data }) => { row = { ...row, ...data, updatedAt: new Date(row.updatedAt.getTime() + 1) }; return { count: 1 }; },
    findUniqueOrThrow: async () => ({ ...row })
  } };
  const service = new managerMod.ManagerService({ client }, { log: async () => undefined }, { get: () => false });
  await assert.rejects(() => service.patchDecision("artist-a", row.id, { choice: "Milwaukee", rationale: "Closer", expectedOutcome: "Draw 75 people", reviewAt: "2026-08-15T12:00:00.000Z" }, "member@test", "operator-a"), /Review and save/);
  const framed = await service.patchDecision("artist-a", row.id, { options: [{ label: "Milwaukee", tradeoff: "Lower travel cost but a smaller venue list" }, { label: "Detroit", tradeoff: "Higher travel cost but stronger genre fit" }] }, "member@test", "operator-a");
  assert.equal(framed.needsFraming, false);
  const decided = await service.patchDecision("artist-a", row.id, { choice: "Milwaukee", rationale: "The date fits the lineup", expectedOutcome: "Draw 75 people", reviewAt: "2026-08-15T12:00:00.000Z" }, "member@test", "operator-a");
  assert.equal(decided.status, "decided");
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

test("accepted conversational memory is exact, normal-sensitivity, idempotent, linked, and audited", async () => {
  const capture = memoryCapture.assessManagerMemoryCapture("Remember that Morgan handles production advances");
  assert.equal(capture.status, "ready");
  let outcome = "suggested"; let upserts = 0; const audits = [];
  const client = {
    managerRecommendation: {
      findFirst: async ({ where }) => where.managerRun.artistId === "artist-a" ? { id: "rec-memory", outcome, taskId: null, decisionId: null, memoryFactId: null, task: null, decision: null, memoryFact: null, proposedAction: { type: "remember_fact", key: capture.key, label: capture.label, value: capture.value }, evidence: [] } : null,
      updateMany: async ({ data }) => { if (outcome !== "suggested") return { count: 0 }; outcome = data.outcome; return { count: 1 }; },
      update: async ({ data }) => ({ id: "rec-memory", outcome, taskId: null, decisionId: null, ...data })
    },
    managerMemoryFact: { upsert: async ({ create, update }) => { upserts += 1; assert.equal(create.sensitivity, "normal"); assert.equal(create.sourceType, "operator_confirmation"); assert.equal(create.value, capture.value); assert.equal(update.archivedAt, null); return { id: "memory-a", ...create }; } }
  };
  client.$transaction = async (fn) => fn(client);
  const service = new managerMod.ManagerService({ client }, { log: async (entry) => audits.push(entry) }, { get: () => false });
  const accepted = await service.recommendation("artist-a", "rec-memory", "accepted", {}, "member@test", "operator-a");
  assert.equal(accepted.outcome, "completed");
  assert.equal(accepted.memoryFactId, "memory-a");
  assert.equal(upserts, 1);
  assert.equal(audits.some((entry) => entry.action === "manager.memory_confirmed" && entry.aggregateId === "memory-a"), true);
  await assert.rejects(() => service.recommendation("artist-a", "rec-memory", "accepted", {}, "member@test", "operator-a"), /already been decided/);
  await assert.rejects(() => service.recommendation("artist-b", "rec-memory", "accepted", {}, "member@test", "operator-b"), (error) => error?.getStatus?.() === 404);
  assert.equal(upserts, 1);
});

test("manager recommendations execute existing event and project generators atomically and once", async () => {
  async function exercise(action) {
    let recommendationOutcome = "suggested";
    let recommendationReason = null;
    let taskCreates = 0;
    const audits = [];
    const client = {
      managerRecommendation: {
        findFirst: async ({ where }) => where.managerRun.artistId === "artist-a" ? { id: "rec-action", outcome: recommendationOutcome, taskId: null, decisionId: null, task: null, decision: null, proposedAction: action, evidence: [action.eventId ?? action.projectId] } : null,
        updateMany: async ({ where, data }) => {
          if (!where.outcome.in.includes(recommendationOutcome)) return { count: 0 };
          recommendationOutcome = data.outcome;
          recommendationReason = data.outcomeReason;
          return { count: 1 };
        },
        update: async () => ({ id: "rec-action", outcome: recommendationOutcome, outcomeReason: recommendationReason, taskId: null, decisionId: null })
      },
      bandEvent: { findFirst: async ({ where }) => where.id === "event-a" && where.artistId === "artist-a" ? { id: "event-a", startsAt: new Date("2026-08-01T01:00:00.000Z"), opportunityId: "opp-a" } : null },
      artistProject: { findFirst: async ({ where }) => where.id === "project-a" && where.artistId === "artist-a" ? { id: "project-a", type: "release", dueAt: new Date("2026-10-01T00:00:00.000Z") } : null },
      task: {
        findMany: async () => [],
        createMany: async ({ data }) => { taskCreates += data.length; return { count: data.length }; }
      }
    };
    client.$transaction = async (fn) => fn(client);
    const service = new managerMod.ManagerService({ client }, { log: async (entry) => audits.push(entry) }, { get: () => false });
    const accepted = await service.recommendation("artist-a", "rec-action", "accepted", {}, "member@test", "operator-a");
    assert.equal(accepted.outcome, "completed");
    assert.equal(accepted.outcomeReason, "action_executed");
    await assert.rejects(() => service.recommendation("artist-a", "rec-action", "accepted", {}, "member@test", "operator-a"), /already been decided/);
    return { taskCreates, audits };
  }

  const advance = await exercise({ type: "generate_event_advance", eventId: "event-a" });
  assert.equal(advance.taskCreates, 4);
  assert.equal(advance.audits.some((entry) => entry.action === "event.advance_generated" && entry.aggregateId === "event-a"), true);
  const project = await exercise({ type: "generate_project_plan", projectId: "project-a" });
  assert.equal(project.taskCreates, 6);
  assert.equal(project.audits.some((entry) => entry.action === "project.plan_generated" && entry.aggregateId === "project-a"), true);
});

test("manager action targets are tenant-bound and revalidated before any write", async () => {
  let writes = 0;
  const client = {
    managerRecommendation: { findFirst: async () => ({ id: "rec-action", outcome: "suggested", taskId: null, decisionId: null, task: null, decision: null, proposedAction: { type: "generate_event_advance", eventId: "foreign-event" }, evidence: ["foreign-event"] }) },
    bandEvent: { findFirst: async () => null },
    task: { createMany: async () => { writes += 1; return { count: 0 }; } }
  };
  const service = new managerMod.ManagerService({ client }, { log: async () => undefined }, { get: () => false });
  await assert.rejects(() => service.recommendation("artist-a", "rec-action", "accepted", {}, "member@test", "operator-a"), (error) => error?.getStatus?.() === 404);
  assert.equal(writes, 0);
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
  assert.equal(managerSchemas.managerResponseEvalPromotionSchema.safeParse({ label: "useful" }).success, true);
  assert.equal(managerSchemas.managerResponseEvalPromotionSchema.safeParse({ label: "needs_revision", expectedBehavior: "Lead with the recorded balance." }).success, true);
  assert.equal(managerSchemas.managerResponseEvalPromotionSchema.safeParse({ label: "needs_revision" }).success, false);
  assert.equal(managerSchemas.managerResponseEvalResolutionSchema.safeParse({ candidateVersion: "manager_os_v14", note: "Reviewed the corrected behavior against this case." }).success, true);
  assert.equal(managerSchemas.managerResponseEvalResolutionSchema.safeParse({ candidateVersion: "latest", note: "Too vague" }).success, false);
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

test("goal measurements reconcile only explicit StoryBoard outcomes and explain drift", () => {
  const baseGoal = { id: "goal-a", title: "Book regional shows", measurementKind: "confirmed_gigs", currentValue: 0, createdAt: new Date("2026-07-01T00:00:00.000Z"), deadline: new Date("2026-09-30T23:59:59.000Z") };
  const measurement = goalMeasurement.deterministicManagerGoalMeasurement({
    goal: baseGoal,
    prospects: [],
    events: [
      { id: "event-counted", type: "gig", status: "confirmed", startsAt: new Date("2026-08-01T01:00:00.000Z") },
      { id: "event-completed", type: "gig", status: "completed", startsAt: new Date("2026-09-01T01:00:00.000Z") },
      { id: "event-too-late", type: "gig", status: "confirmed", startsAt: new Date("2026-10-01T01:00:00.000Z") },
      { id: "rehearsal", type: "rehearsal", status: "confirmed", startsAt: new Date("2026-08-02T01:00:00.000Z") }
    ],
    projects: []
  }, now);
  assert.equal(measurement.policyVersion, "manager_goal_measurement_v1");
  assert.equal(measurement.observedValue, 2);
  assert.equal(measurement.status, "records_ahead");
  assert.deepEqual(measurement.evidenceIds, ["goal-a", "event-counted", "event-completed"]);

  const prospects = goalMeasurement.deterministicManagerGoalMeasurement({ goal: { ...baseGoal, measurementKind: "qualified_prospects", currentValue: 2 }, prospects: [{ id: "prospect-a", status: "qualified" }, { id: "prospect-b", status: "converted" }, { id: "prospect-c", status: "disqualified" }], events: [], projects: [] }, now);
  assert.equal(prospects.status, "in_sync");
  const projects = goalMeasurement.deterministicManagerGoalMeasurement({ goal: { ...baseGoal, measurementKind: "completed_projects", currentValue: 2 }, prospects: [], events: [], projects: [{ id: "project-a", goalId: "goal-a", status: "completed" }, { id: "project-b", goalId: "goal-b", status: "completed" }] }, now);
  assert.equal(projects.status, "recorded_ahead");
  assert.match(projects.nextAction, /outside StoryBoard/i);
  const manual = goalMeasurement.deterministicManagerGoalMeasurement({ goal: { ...baseGoal, measurementKind: "manual", currentValue: 4 }, prospects: [], events: [], projects: [] }, now);
  assert.equal(manual.observedValue, null);
  assert.equal(manual.status, "manual");

  const driftFacts = managerFacts({
    goals: [{ id: "goal-a", title: "Book regional shows", workstream: "live", status: "active", createdAt: baseGoal.createdAt, deadline: baseGoal.deadline, currentValue: 0, targetValue: 6 }],
    goalMeasurements: [measurement],
    initiatives: [{ id: "initiative-a", goalId: "goal-a", title: "Regional sprint", status: "active", dueAt: new Date("2026-09-01T00:00:00.000Z") }],
    tasks: [{ id: "task-a", title: "Pitch rooms", status: "in_progress", ownerLabel: "Alex", dueAt: new Date("2026-07-20T00:00:00.000Z"), initiativeId: "initiative-a" }]
  });
  const health = intelligence.deterministicManagerPlanHealth(driftFacts, now);
  assert.equal(health.goals[0].status, "needs_measurement");
  assert.ok(health.gaps.some((gap) => gap.code === "goal_measurement_drift"));
  const brief = intelligence.deterministicManagerBrief(driftFacts, now);
  assert.ok(brief.thisWeek.some((item) => item.stableKey === "goal-measurement-goal-a"));
  const answer = intelligence.deterministicManagerChat(driftFacts, "Are we on track with the plan?", now);
  assert.match(answer.answer, /reconcile it/i);
  assert.match(answer.answer, /verify 2/i);
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
      assert.ok(["manual", "qualified_prospects", "completed_projects"].includes(goal.measurementKind));
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
  const service = new managerMod.ManagerService({ client: { task: { findFirst: async () => null } } }, { log: async () => undefined }, { get: () => false });
  let generations = 0;
  service.latestBrief = async () => ({ id: "old-brief", promptVersion: "manager_os_v14", createdAt: new Date("2026-07-12T10:00:00.000Z") });
  service.profile = async () => ({ intakeCompletedAt: new Date("2026-07-12T11:00:00.000Z") });
  service.latestManagerFactChange = async () => null;
  service.generateBrief = async () => { generations += 1; return { id: "new-brief" }; };
  const result = await service.currentBrief("artist-a", "daily", "member@test", "operator-a");
  assert.equal(result.id, "new-brief");
  assert.equal(generations, 1);
});

test("a cached brief is invalidated when commitment facts change", async () => {
  const service = new managerMod.ManagerService({ client: { task: { findFirst: async () => ({ updatedAt: new Date("2026-07-12T11:00:00.000Z") }) } } }, { log: async () => undefined }, { get: () => false });
  let generations = 0;
  service.latestBrief = async () => ({ id: "old-brief", promptVersion: "manager_os_v14", createdAt: new Date("2026-07-12T10:00:00.000Z") });
  service.profile = async () => ({ intakeCompletedAt: new Date("2026-07-01T00:00:00.000Z") });
  service.latestManagerFactChange = async () => null;
  service.generateBrief = async () => { generations += 1; return { id: "new-brief" }; };
  const result = await service.currentBrief("artist-a", "daily", "member@test", "operator-a");
  assert.equal(result.id, "new-brief");
  assert.equal(generations, 1);
});

test("a cached brief is invalidated when the Manager priority policy changes", async () => {
  const service = new managerMod.ManagerService({ client: { task: { findFirst: async () => null } } }, { log: async () => undefined }, { get: () => false });
  let generations = 0;
  service.latestBrief = async () => ({ id: "v13-brief", promptVersion: "manager_os_v13", createdAt: new Date() });
  service.profile = async () => ({ intakeCompletedAt: new Date("2026-01-01T00:00:00.000Z") });
  service.latestManagerFactChange = async () => null;
  service.generateBrief = async () => { generations += 1; return { id: "v14-brief" }; };
  const result = await service.currentBrief("artist-a", "daily", "member@test", "operator-a");
  assert.equal(result.id, "v14-brief");
  assert.equal(generations, 1);
});

test("a cached brief is invalidated when an audited operating fact changes", async () => {
  const service = new managerMod.ManagerService({ client: { task: { findFirst: async () => null } } }, { log: async () => undefined }, { get: () => false });
  let generations = 0;
  const createdAt = new Date(Date.now() - 60_000);
  service.latestBrief = async () => ({ id: "stale-brief", promptVersion: "manager_os_v14", createdAt });
  service.profile = async () => ({ intakeCompletedAt: new Date("2026-01-01T00:00:00.000Z") });
  service.latestManagerFactChange = async () => ({ createdAt: new Date(createdAt.getTime() + 1_000) });
  service.generateBrief = async () => { generations += 1; return { id: "fresh-brief" }; };
  const result = await service.currentBrief("artist-a", "daily", "member@test", "operator-a");
  assert.equal(result.id, "fresh-brief");
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

test("goal progress synchronization is evidence-bound, idempotent, tenant-scoped, and audited", async () => {
  let currentValue = 0; let progressCreates = 0; let audits = 0;
  const goal = { id: "goal-a", artistId: "artist-a", title: "Qualify buyers", measurementKind: "qualified_prospects", currentValue, createdAt: new Date("2026-07-01T00:00:00.000Z"), deadline: new Date("2026-10-01T00:00:00.000Z") };
  const client = {
    managerGoal: {
      findFirst: async ({ where }) => where.artistId === "artist-a" ? { ...goal, currentValue } : null,
      update: async ({ data }) => { currentValue = data.currentValue; return { ...goal, currentValue }; }
    },
    bookingProspect: { findMany: async () => [{ id: "prospect-a", status: "qualified" }, { id: "prospect-b", status: "converted" }] },
    bandEvent: { findMany: async () => [] },
    artistProject: { findMany: async () => [] },
    managerGoalProgressEvent: { create: async ({ data }) => { progressCreates += 1; return { id: `progress-${progressCreates}`, createdAt: now, ...data }; } }
  };
  client.$transaction = async (fn) => fn(client);
  const service = new managerMod.ManagerService({ client }, { log: async () => { audits += 1; } }, { get: () => false });
  const synced = await service.syncGoalProgress("artist-a", "goal-a", { observedValue: 2 }, "member@test", "operator-a");
  assert.equal(synced.measurement.status, "in_sync");
  assert.equal(synced.progressEvent.previousValue, 0);
  assert.equal(synced.progressEvent.value, 2);
  assert.equal(synced.progressEvent.sourceType, "manager_goal_measurement_v1");
  assert.equal(progressCreates, 1);
  assert.equal(audits, 1);
  const replay = await service.syncGoalProgress("artist-a", "goal-a", { observedValue: 2 }, "member@test", "operator-a");
  assert.equal(replay.progressEvent, null);
  assert.equal(progressCreates, 1);
  assert.equal(audits, 1);
  await assert.rejects(() => service.syncGoalProgress("artist-a", "goal-a", { observedValue: 1 }, "member@test", "operator-a"), (error) => error?.getStatus?.() === 409);
  await assert.rejects(() => service.syncGoalProgress("artist-b", "goal-a", { observedValue: 2 }, "member@test", "operator-a"), (error) => error?.getStatus?.() === 404);
  assert.equal(progressCreates, 1);
});

test("offline manager evaluation gates the current policy and honors owner revision labels", () => {
  const clean = evaluation.runManagerEvaluation("manager_os_v14", []);
  assert.equal(clean.passed, true);
  assert.equal(clean.metrics.goldenPassRate, 1);
  assert.equal(clean.metrics.safetyPassRate, 1);
  const blocked = evaluation.runManagerEvaluation("manager_os_v14", [{ id: "review-a", label: "needs_revision", promptVersion: "manager_os_v14", snapshot: { stableKey: "goal-goal-a", workstream: "live" } }]);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.metrics.ownerReviewedPassRate, 0);
  const responseSnapshot = { question: "What should we do next?", answer: "Start with the overdue venue follow-up today. Alex owns the next step.", responseStyle: "guided", citations: ["task-a"], feedback: { helpful: true, reason: null, note: null } };
  const usefulResponse = { id: "response-useful", label: "useful", promptVersion: "manager_os_v14", expectedBehavior: null, resolutionVersion: null, resolvedAt: null, snapshot: responseSnapshot, inputFacts: { tasks: [{ id: "task-a" }] } };
  const withUsefulResponse = evaluation.runManagerEvaluation("manager_os_v14", [], [usefulResponse]);
  assert.equal(withUsefulResponse.passed, true);
  assert.equal(withUsefulResponse.metrics.ownerReviewedResponseCount, 1);
  const unresolvedResponse = { ...usefulResponse, id: "response-revision", label: "needs_revision", expectedBehavior: "Lead with the recorded balance and name one next step.", snapshot: { ...responseSnapshot, feedback: { helpful: false, reason: "too_vague", note: "Lead with the balance" } } };
  assert.equal(evaluation.runManagerEvaluation("manager_os_v14", [], [unresolvedResponse]).passed, false);
  const resolvedResponse = { ...unresolvedResponse, promptVersion: "manager_os_v13", resolutionVersion: "manager_os_v14", resolvedAt: new Date("2026-07-12T12:00:00.000Z") };
  assert.equal(evaluation.runManagerEvaluation("manager_os_v14", [], [resolvedResponse]).passed, true);
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

test("operating-profile facts are synchronized atomically and cannot drift through memory edits", async () => {
  const upserts = [];
  const profile = { id: "profile-a", artistId: "artist-a", bandMode: "hybrid", homeCity: "Chicago", homeRegion: "IL", homeCountry: "US", twelveMonthAmbition: "Release an EP", constraints: ["Two weekends per month"], updatedAt: now };
  const client = {
    artistOperatingProfile: { upsert: async () => profile },
    managerMemoryFact: {
      upsert: async (input) => { upserts.push(input); return input.create; },
      findFirst: async () => ({ id: "memory-market", artistId: "artist-a", key: "home_market", value: { city: "Detroit" }, sensitivity: "normal" })
    }
  };
  client.$transaction = async (fn) => fn(client);
  let audits = 0;
  const service = new managerMod.ManagerService({ client }, { log: async () => { audits += 1; } }, { get: () => false });
  await service.putProfile("artist-a", { bandMode: "hybrid" }, "member@test", "operator-a");
  assert.equal(upserts.length, 4);
  assert.deepEqual(upserts.find((row) => row.create.key === "home_market").create.value, { city: "Chicago", region: "IL", country: "US" });
  assert.ok(upserts.every((row) => row.create.sourceType === "operating_profile" && row.create.sourceId === "profile-a"));
  assert.equal(audits, 1);
  await assert.rejects(() => service.patchMemory("artist-a", "memory-market", { value: { city: "Detroit" } }, true, "owner@test", "operator-owner"), /operating profile/);
  const migration = await readFile(join(dir, "..", "..", "..", "prisma", "migrations", "20260713210000_manager_profile_memory_source", "migration.sql"), "utf8");
  assert.match(migration, /memory\."sourceType" = 'manager_intake'/);
  const measurementMigration = await readFile(join(dir, "..", "..", "..", "prisma", "migrations", "20260713220000_manager_goal_measurements", "migration.sql"), "utf8");
  assert.match(measurementMigration, /ADD COLUMN "measurementKind"/);
  assert.match(measurementMigration, /manager_plan_v1:goal:live_pipeline/);
  assert.match(measurementMigration, /manager_plan_v1:goal:release_cycle/);
  const conversationalMemoryMigration = await readFile(join(dir, "..", "..", "..", "prisma", "migrations", "20260713230000_manager_conversational_memory", "migration.sql"), "utf8");
  assert.match(conversationalMemoryMigration, /ADD COLUMN "memoryFactId"/);
  assert.match(conversationalMemoryMigration, /REFERENCES "ManagerMemoryFact"\("id"\)/);
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
    tasks: [{ id: "task-a", title: "Confirm backline", status: "todo", dueAt: new Date("2026-07-10T00:00:00.000Z") }],
    decisions: [{ id: "decision-a", workstream: "live", title: "Which market next?", context: null, options: [], choice: "Milwaukee", rationale: "Lower travel cost", expectedOutcome: "One return invitation", evidence: [], status: "decided", reviewAt: new Date("2026-07-01T00:00:00.000Z"), decidedAt: new Date("2026-06-01T00:00:00.000Z") }],
    campaignRecipients: [{ id: "recipient-a", status: "sent", followUpDueAt: new Date("2026-07-01T00:00:00.000Z"), followUpTaskId: null }]
  });
  const brief = intelligence.deterministicManagerBrief(facts, now);
  assert.equal(brief.today.length, 5);
  assert.equal(brief.today[0].stableKey, "event-event-a");
  assert.ok(brief.today.some((item) => item.stableKey === "approval-approval-a"));
  assert.ok(brief.today.some((item) => item.stableKey === "booking-reply-reply-a"));
  assert.ok(brief.today.some((item) => item.stableKey === "invoice-invoice-a"));
  assert.ok(brief.today.some((item) => item.stableKey === "campaign-follow-ups"));
  assert.ok(brief.today.flatMap((item) => item.evidenceIds).every((id) => ["reply-a", "approval-a", "event-a", "invoice-a", "recipient-a"].includes(id)));
  const candidates = intelligence.deterministicManagerBriefCandidates(facts, now);
  assert.ok(candidates.today.length > 5);
  const prioritized = intelligence.prioritizeManagerBrief(candidates, facts, now);
  assert.ok(prioritized.trace.today[0].factors.some((factor) => factor.code === "member_unavailable"));
  assert.ok(prioritized.trace.omittedToday.some((item) => item.stableKey === "overdue-work"));
  const merged = intelligence.mergeManagerBriefCandidates(candidates, { ...candidates, today: [{ ...candidates.today.find((item) => item.stableKey === "event-event-a"), stableKey: "model-show-focus", title: "Handle the show first", priority: "low" }] });
  assert.equal(merged.today.filter((item) => item.evidenceIds.includes("event-a")).length, 1);
  assert.equal(merged.today.find((item) => item.evidenceIds.includes("event-a")).stableKey, "event-event-a");
  assert.equal(merged.today.find((item) => item.evidenceIds.includes("event-a")).priority, "high");
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

test("due decisions become manager work and conversation preserves the recorded tradeoff", () => {
  const openDecision = { id: "decision-open", workstream: "live", title: "Which market next?", context: "Only one travel weekend is available", options: [{ label: "Milwaukee", tradeoff: "Lower travel cost, smaller room list" }, { label: "Detroit", tradeoff: "Higher travel cost, stronger genre fit" }], choice: null, rationale: null, expectedOutcome: null, evidence: [], status: "open", reviewAt: null, decidedAt: null };
  const openAnswer = intelligence.deterministicManagerChat(managerFacts({ decisions: [openDecision] }), "Help us decide between the options", now);
  assert.match(openAnswer.answer, /Milwaukee/);
  assert.match(openAnswer.answer, /Detroit/);
  assert.match(openAnswer.answer, /expected result/i);
  assert.deepEqual(openAnswer.citations, ["decision-open"]);

  const dueDecision = { ...openDecision, id: "decision-due", status: "decided", choice: "Milwaukee", rationale: "It fits the band's work schedules", expectedOutcome: "Draw at least 75 people and earn a return invitation", reviewAt: new Date("2026-07-01T12:00:00.000Z"), decidedAt: new Date("2026-06-01T12:00:00.000Z") };
  const brief = intelligence.deterministicManagerBrief(managerFacts({ decisions: [dueDecision] }), now);
  assert.ok(brief.today.some((item) => item.stableKey === "decision-review-decision-due"));
  assert.ok(brief.decisionsNeeded.some((item) => item.title === "Review: Which market next?"));
  const dueAnswer = intelligence.deterministicManagerChat(managerFacts({ decisions: [dueDecision] }), "What did we decide and should we review that choice?", now);
  assert.match(dueAnswer.answer, /chose “Milwaukee”/);
  assert.match(dueAnswer.answer, /review date has arrived/i);
  assert.deepEqual(dueAnswer.citations, ["decision-due"]);
  assert.equal(dueAnswer.recommendation, null);
  const reviewedDecision = { ...dueDecision, status: "reviewed", reviewOutcome: "mixed", reviewNote: "Attendance reached 80, but there was no return invitation", reviewedAt: now };
  const reviewedAnswer = intelligence.deterministicManagerChat(managerFacts({ decisions: [reviewedDecision] }), "What did we learn from that decision?", now);
  assert.match(reviewedAnswer.answer, /recorded result is mixed/i);
  assert.match(reviewedAnswer.answer, /Attendance reached 80/);
  assert.match(reviewedAnswer.answer, /not a universal rule/i);
});

test("a two-option conversation creates a reviewable decision proposal without inventing tradeoffs", () => {
  const answer = intelligence.deterministicManagerChat(managerFacts(), "Should we book Milwaukee or Detroit?", now);
  assert.match(answer.answer, /real decision/i);
  assert.match(answer.answer, /tradeoffs are still unknown/i);
  assert.deepEqual(answer.citations, []);
  assert.equal(answer.recommendation?.proposedAction?.type, "create_decision");
  assert.equal(answer.recommendation?.workstream, "live");
  assert.deepEqual(answer.recommendation?.proposedAction?.options.map((option) => option.label), ["book Milwaukee", "Detroit"]);
  assert.ok(answer.recommendation?.proposedAction?.options.every((option) => /Not recorded yet/.test(option.tradeoff)));

  const generic = intelligence.deterministicManagerChat(managerFacts({ prospects: [{ id: "prospect-a", name: "Good Room", status: "qualified", kind: "venue", city: "Madison" }] }), "What should we do about booking?", now);
  assert.match(generic.answer, /qualified prospect/i);
  assert.equal(generic.recommendation?.proposedAction?.type === "create_decision", false);
});

test("manager context health asks for missing authoritative facts and reaches full coverage only from recorded context", () => {
  const thin = contextHealth.deterministicManagerContextHealth({
    profile: { id: "profile-a", bandMode: "hybrid", careerStage: "Local working band", homeCity: "Chicago", genres: ["rock"], twelveMonthAmbition: "Release an EP and play regionally", constraints: ["Weeknight jobs"], availabilityExpectations: null, revenueSources: [], currentAssets: [], budgetToleranceMinor: null, businessName: null, currency: "USD" },
    members: [{ id: "member-a", name: "Alex", roles: [], instruments: [] }], goals: [{ id: "goal-a" }], events: [], projects: [], opportunities: []
  });
  assert.equal(thin.status, "thin");
  assert.equal(thin.score, 45);
  assert.equal(thin.gaps[0].code, "member_responsibilities");
  assert.match(thin.nextQuestion, /Alex/);
  assert.ok(thin.evidenceIds.includes("profile-a"));
  assert.ok(thin.evidenceIds.includes("member-a"));

  const strong = contextHealth.deterministicManagerContextHealth({
    profile: { id: "profile-a", bandMode: "hybrid", careerStage: "Regional working band", homeCity: "Chicago", genres: ["rock", "soul"], twelveMonthAmbition: "Release an EP and play six profitable regional shows", constraints: ["Two weekends per month"], availabilityExpectations: "Respond to holds within 48 hours", revenueSources: ["private events", "ticketed shows"], currentAssets: ["EP masters", "live video"], budgetToleranceMinor: 100000, businessName: "Example Band LLC", currency: "USD" },
    members: [{ id: "member-a", name: "Alex", roles: ["bandleader"], instruments: ["guitar"] }], goals: [{ id: "goal-a" }], events: [{ id: "event-a" }], projects: [{ id: "project-a" }], opportunities: [{ id: "opp-a" }]
  });
  assert.equal(strong.score, 100);
  assert.equal(strong.status, "strong");
  assert.equal(strong.nextQuestion, null);
  assert.deepEqual(strong.gaps, []);
});

test("manager knowledge health detects conflict and staleness while enforcing profile precedence", () => {
  const empty = knowledgeHealth.deterministicManagerKnowledgeHealth({ profile: null, memoryFacts: [] }, now);
  assert.equal(empty.status, "attention");
  assert.match(empty.nextAction, /operating profile/i);
  const profile = { id: "profile-a", bandMode: "hybrid", homeCity: "Chicago", homeRegion: "IL", homeCountry: "US", twelveMonthAmbition: "Release an EP", constraints: ["Two weekends per month"], updatedAt: now };
  const memoryFacts = [
    { id: "memory-market", key: "home_market", value: { city: "Detroit", region: "MI", country: "US" }, sourceType: "manager_intake", sourceId: "operator-a", confidence: 1, sensitivity: "normal", confirmedAt: now, updatedAt: now },
    { id: "memory-contact-style", key: "buyer_contact_style", value: "Short and direct", sourceType: "operator_correction", sourceId: "operator-a", confidence: 1, sensitivity: "normal", confirmedAt: new Date("2025-01-01T00:00:00.000Z"), updatedAt: new Date("2025-01-01T00:00:00.000Z") }
  ];
  const health = knowledgeHealth.deterministicManagerKnowledgeHealth({ profile, memoryFacts }, now);
  assert.equal(health.status, "conflicted");
  assert.equal(health.counts.conflicted, 1);
  assert.equal(health.counts.stale, 1);
  assert.match(health.nextAction, /home market/i);
  const projected = knowledgeHealth.projectManagerMemoryForReasoning(profile, memoryFacts);
  assert.deepEqual(projected[0].value, { city: "Chicago", region: "IL", country: "US" });
  assert.equal(projected[0].sourceType, "operating_profile");
  const facts = managerFacts({ knowledgeHealth: health });
  assert.ok(intelligence.deterministicManagerBrief(facts, now).today.some((item) => item.stableKey === "knowledge-refresh"));
  const answer = intelligence.deterministicManagerChat(facts, "Can we trust your saved memory, or is it stale?", now);
  assert.match(answer.answer, /conflicts with the operating profile/i);
  assert.doesNotMatch(answer.answer, /Detroit/);
  assert.equal(answer.recommendation, null);
});

test("conversational memory requires an explicit safe request and exact reviewable confirmation", () => {
  const ready = memoryCapture.assessManagerMemoryCapture("Remember that Morgan handles production advances");
  assert.equal(ready.status, "ready");
  assert.match(ready.key, /^operator_note_/);
  assert.equal(ready.value, "Morgan handles production advances");
  assert.equal(memoryCapture.managerMemoryCaptureMatches("Remember that Morgan handles production advances", ready), true);
  assert.equal(memoryCapture.managerMemoryCaptureMatches("Remember that Morgan handles production advances", { ...ready, value: "Morgan handles all finances" }), false);
  assert.equal(memoryCapture.assessManagerMemoryCapture("Morgan handles production advances").status, "not_requested");
  assert.equal(memoryCapture.assessManagerMemoryCapture("Remember that our API key is secret-123").status, "blocked_sensitive");
  assert.equal(memoryCapture.assessManagerMemoryCapture("Remember that our home market is Chicago").status, "profile_owned");

  const proposal = intelligence.deterministicManagerChat(managerFacts(), "Remember that Morgan handles production advances", now);
  assert.equal(proposal.recommendation?.proposedAction?.type, "remember_fact");
  assert.equal(proposal.recommendation?.proposedAction?.value, "Morgan handles production advances");
  assert.match(proposal.answer, /after you review it/i);
  const blocked = intelligence.deterministicManagerChat(managerFacts(), "Remember that our bank account password is hunter2", now);
  assert.equal(blocked.recommendation, null);
  assert.match(blocked.answer, /cannot be saved/i);
  assert.doesNotMatch(blocked.answer, /hunter2/);
  const profile = intelligence.deterministicManagerChat(managerFacts(), "Remember that our home market is Chicago", now);
  assert.equal(profile.recommendation, null);
  assert.match(profile.answer, /Band context/i);
});

test("manager coaching explains vetted band-business concepts in context without adding authority", () => {
  assert.ok(coaching.managerCoachingConceptIds().length >= 20);
  const facts = managerFacts({ settlements: [{ id: "settlement-a", status: "draft", currency: "USD", grossMinor: 100000, expenseMinor: 20000, netMinor: 80000, event: { title: "Saturday show" } }] });
  const settlement = intelligence.deterministicManagerChat(facts, "How does a show settlement work?", now);
  assert.match(settlement.answer, /post-show money check/i);
  assert.match(settlement.answer, /Why it matters:/);
  assert.match(settlement.answer, /In StoryBoard:/);
  assert.match(settlement.answer, /1 draft settlement/i);
  assert.deepEqual(settlement.citations, ["settlement-a"]);
  assert.equal(settlement.recommendation, null);

  const comparison = intelligence.deterministicManagerChat(managerFacts(), "Guarantee vs. door deal: what is the difference?", now);
  assert.match(comparison.answer, /guarantee sets a minimum fee/i);
  assert.match(comparison.answer, /door deal makes pay depend on ticket results/i);
  assert.equal(comparison.recommendation, null);

  const publishing = intelligence.deterministicManagerChat(managerFacts(), "Explain music publishing in plain language", now);
  assert.match(publishing.answer, /composition/i);
  assert.match(publishing.answer, /does not determine legal ownership/i);
  const unknown = intelligence.deterministicManagerChat(managerFacts(), "Explain neighboring rights in plain language", now);
  assert.match(unknown.answer, /do not have a reviewed StoryBoard explainer/i);
  assert.match(unknown.answer, /Where did the term come up/i);
  assert.equal(unknown.recommendation, null);
  assert.equal(coaching.managerUnrecognizedCoachingTopic("Explain our next priority in plain language"), null);
  assert.equal(coaching.managerCoachingTopics("What is blocked or slipping?").length, 0);

  const external = intelligence.deterministicManagerChat(facts, "Explain settlement and pay it now", now);
  assert.match(external.answer, /won't send, sign, pay, publish, or execute/i);
  assert.doesNotMatch(external.answer, /post-show money check/i);
});

test("manager briefs and conversation expose context gaps without judging the band", () => {
  const health = contextHealth.deterministicManagerContextHealth({ profile: { id: "profile-a", bandMode: "original", careerStage: "Local", homeCity: "Chicago", genres: ["rock"], twelveMonthAmbition: "Build a regional audience", constraints: ["Weeknight work"], availabilityExpectations: null, revenueSources: [], currentAssets: [], budgetToleranceMinor: null, businessName: null, currency: "USD" }, members: [{ id: "member-a", name: "Alex", roles: [], instruments: [] }], goals: [{ id: "goal-a" }], events: [], projects: [], opportunities: [] });
  const facts = managerFacts({ contextHealth: health });
  const brief = intelligence.deterministicManagerBrief(facts, now);
  assert.ok(brief.today.some((item) => item.stableKey === "context-member_responsibilities"));
  const answer = intelligence.deterministicManagerChat(facts, "What do you still need to know about our band?", now);
  assert.match(answer.answer, /45\/100/);
  assert.match(answer.answer, /Alex/);
  assert.match(answer.answer, /not the band's quality or potential/i);
  assert.ok(answer.citations.includes("profile-a"));
  assert.equal(answer.recommendation, null);
});

test("commitment health ranks recorded blockers, waits, deferrals, ownership, and dates without inventing causes", () => {
  const tasks = [
    { id: "task-blocked", title: "Confirm stage dimensions", status: "blocked", ownerLabel: "Alex", dueAt: new Date("2026-07-11T12:00:00.000Z"), blockedReason: "Promoter has not supplied the stage plot", waitingOn: "Promoter", deferralCount: 0, lastDeferredAt: null },
    { id: "task-overdue", title: "Send input list", status: "in_progress", ownerLabel: "Jordan", dueAt: new Date("2026-07-10T12:00:00.000Z"), blockedReason: null, waitingOn: null, deferralCount: 0, lastDeferredAt: null },
    { id: "task-slip", title: "Finish release artwork", status: "todo", ownerLabel: null, dueAt: new Date("2026-07-30T12:00:00.000Z"), blockedReason: null, waitingOn: null, deferralCount: 2, lastDeferredAt: new Date("2026-07-11T12:00:00.000Z") }
  ];
  const health = commitmentHealth.deterministicManagerCommitmentHealth(tasks, now);
  assert.equal(health.items[0].taskId, "task-blocked");
  assert.equal(health.items[0].state, "blocked");
  assert.match(health.items[0].reasons.join(" "), /Promoter has not supplied/);
  assert.equal(health.counts.blocked, 1);
  assert.equal(health.counts.overdue, 2);
  assert.equal(health.counts.waiting, 1);
  assert.equal(health.counts.repeatedlyDeferred, 1);
  assert.equal(health.counts.unassigned, 1);
  assert.match(health.nextAction, /waiting on Promoter/i);
  assert.match(health.summary, /^2 open commitments need intervention/);

  const facts = managerFacts({ tasks, commitmentHealth: health });
  const brief = intelligence.deterministicManagerBrief(facts, now);
  assert.match(brief.today[0].title, /Unblock Confirm stage dimensions/);
  assert.ok(brief.waitingOn.some((item) => /waiting on Promoter/.test(item.title)));
  assert.ok(brief.risksAndOpportunities.some((item) => item.title === "Blocked commitments"));
  const answer = intelligence.deterministicManagerChat(facts, "What is blocked or slipping?", now);
  assert.match(answer.answer, /Promoter has not supplied/);
  assert.match(answer.answer, /Finish release artwork/);
  assert.deepEqual(answer.citations, ["task-blocked", "task-overdue", "task-slip"]);
});

test("task follow-through requires a blocker, counts deferrals, clears resolved state, and fails stale writes closed", async () => {
  let row = { id: "task-a", artistId: "artist-a", title: "Confirm stage dimensions", status: "in_progress", ownerLabel: "Alex", dueAt: new Date("2026-07-15T12:00:00.000Z"), blockedReason: null, waitingOn: null, deferralCount: 0, lastDeferredAt: null, updatedAt: new Date("2026-07-01T12:00:00.000Z") };
  let audits = 0;
  let loseNextWrite = false;
  const client = {
    task: {
      findFirst: async ({ where }) => where.id === row.id && where.artistId === row.artistId ? { ...row } : null,
      updateMany: async ({ where, data }) => {
        if (loseNextWrite || where.updatedAt.getTime() !== row.updatedAt.getTime()) { loseNextWrite = false; return { count: 0 }; }
        const deferralCount = typeof data.deferralCount === "object" && data.deferralCount?.increment ? row.deferralCount + data.deferralCount.increment : data.deferralCount ?? row.deferralCount;
        row = { ...row, ...data, deferralCount, updatedAt: new Date(row.updatedAt.getTime() + 1) };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...row })
    },
    managerRecommendation: { updateMany: async () => ({ count: 0 }) }
  };
  client.$transaction = async (fn) => fn(client);
  const service = new tasksMod.TasksService({ client }, { log: async () => { audits += 1; } });
  await assert.rejects(() => service.patch("artist-a", row.id, { status: "blocked" }, "member@test", "operator-a"), /requires a reason/);
  assert.equal(audits, 0);
  const blocked = await service.patch("artist-a", row.id, { status: "blocked", blockedReason: "Promoter has not sent the stage plot", waitingOn: "Promoter", dueAt: "2026-07-20" }, "member@test", "operator-a");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.deferralCount, 1);
  assert.ok(blocked.lastDeferredAt instanceof Date);
  const deferredAgain = await service.patch("artist-a", row.id, { dueAt: "2026-07-27" }, "member@test", "operator-a");
  assert.equal(deferredAgain.deferralCount, 2);
  const resumed = await service.patch("artist-a", row.id, { status: "in_progress" }, "member@test", "operator-a");
  assert.equal(resumed.blockedReason, null);
  assert.equal(resumed.waitingOn, "Promoter");
  loseNextWrite = true;
  await assert.rejects(() => service.patch("artist-a", row.id, { ownerLabel: "Jordan" }, "member@test", "operator-a"), /changed while you were editing/i);
  assert.equal(audits, 3);
  await assert.rejects(() => service.patch("artist-b", row.id, { ownerLabel: "Jordan" }, "member@test", "operator-b"), (error) => error?.getStatus?.() === 404);
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
  let row = { id: "task-a", artistId: "artist-a", status: "in_progress", ownerLabel: "Alex", dueAt: null, blockedReason: null, waitingOn: null, deferralCount: 0, updatedAt: new Date("2026-07-01T00:00:00.000Z") };
  const client = {
    task: { findFirst: async () => ({ ...row }), updateMany: async ({ data }) => { row = { ...row, ...data }; return { count: 1 }; }, findUniqueOrThrow: async () => ({ ...row }) },
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

test("manager bridges recorded show and project planning gaps to the existing internal generators", () => {
  const showInput = {
    id: "event-a", title: "Saturday show", startsAt: new Date("2026-07-18T01:00:00.000Z"), participants: [], tasks: [], deals: [], invoices: []
  };
  const show = {
    id: showInput.id, title: showInput.title, type: "gig", status: "confirmed", startsAt: showInput.startsAt, participants: [],
    readiness: eventReadiness.deterministicShowReadiness(showInput, [{ id: "member-a" }, { id: "member-b" }], now)
  };
  const projectInput = { id: "project-a", name: "Autumn EP", type: "release", status: "active", dueAt: new Date("2026-10-01T00:00:00.000Z"), budgetMinor: null, currency: "USD", successMetrics: [], assets: [], tasks: [], expenses: [], events: [] };
  const project = { id: projectInput.id, name: projectInput.name, type: projectInput.type, status: projectInput.status, dueAt: projectInput.dueAt, readiness: projectPlan.deterministicProjectReadiness(projectInput, now) };
  const facts = managerFacts({ events: [show], projects: [project] });
  const brief = intelligence.deterministicManagerBrief(facts, now);
  assert.deepEqual(brief.today.find((item) => item.stableKey === "event-event-a")?.proposedAction, { type: "generate_event_advance", eventId: "event-a" });
  assert.deepEqual(brief.thisWeek.find((item) => item.stableKey === "project-project-a")?.proposedAction, { type: "generate_project_plan", projectId: "project-a" });
  assert.equal(intelligence.deterministicManagerChat(facts, "Are we ready for Saturday?", now).recommendation?.proposedAction?.type, "generate_event_advance");
  assert.equal(intelligence.deterministicManagerChat(facts, "How is the EP project going?", now).recommendation?.proposedAction?.type, "generate_project_plan");
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
  assert.equal(service.chatOutputIsGrounded({ answer: "Decision", citations: [], recommendation: { stableKey: "decision-a", title: "Choose", reason: "Tradeoff", nextAction: "Review", workstream: "live", priority: "med", evidenceIds: [], proposedAction: { type: "create_decision", workstream: "live", title: "Which market?", context: null, options: [{ label: "Milwaukee", tradeoff: "Closer" }] } } }, facts), false);
  assert.equal(service.chatOutputIsGrounded({ answer: "Decision", citations: [], recommendation: { stableKey: "decision-a", title: "Choose", reason: "Tradeoff", nextAction: "Review", workstream: "live", priority: "med", evidenceIds: [], proposedAction: { type: "create_decision", workstream: "live", title: "Which market?", context: null, options: [{ label: "Milwaukee", tradeoff: "Closer" }, { label: "Detroit", tradeoff: "Stronger fit" }] } } }, facts), true);
  const emptyBrief = { summary: "Brief", today: [], thisWeek: [], decisionsNeeded: [], waitingOn: [], risksAndOpportunities: [] };
  assert.equal(service.briefIsGrounded({ ...emptyBrief, today: [{ stableKey: "decision-a", title: "Choose", reason: "Tradeoff", nextAction: "Review", workstream: "live", priority: "med", evidenceIds: [], proposedAction: { type: "create_decision", workstream: "live", title: "Which market?", context: null, options: [{ label: "Milwaukee", tradeoff: "Closer" }, { label: "Detroit", tradeoff: "Stronger fit" }] } }] }, facts), false);
  const advanceReadiness = eventReadiness.deterministicShowReadiness({ id: "event-a", title: "Saturday show", startsAt: new Date("2026-07-18T01:00:00.000Z"), participants: [], tasks: [], deals: [], invoices: [] }, facts.members, now);
  const actionFacts = managerFacts({ events: [{ id: "event-a", title: "Saturday show", type: "gig", status: "confirmed", startsAt: new Date("2026-07-18T01:00:00.000Z"), participants: [], tasks: [], deals: [], invoices: [], setlist: null, readiness: advanceReadiness }] });
  const advanceItem = { stableKey: "advance-event-a", title: "Build advance", reason: "Missing", nextAction: "Generate it", workstream: "live", priority: "high", evidenceIds: ["event-a"], proposedAction: { type: "generate_event_advance", eventId: "event-a" } };
  assert.equal(service.chatOutputIsGrounded({ answer: "Build it", citations: ["event-a"], recommendation: advanceItem }, actionFacts), true);
  assert.equal(service.briefIsGrounded({ ...emptyBrief, today: [advanceItem] }, actionFacts), true);
  assert.equal(service.chatOutputIsGrounded({ answer: "Wrong tenant", citations: ["event-a"], recommendation: { ...advanceItem, proposedAction: { type: "generate_event_advance", eventId: "foreign-event" } } }, actionFacts), false);
  const commitmentTasks = [{ id: "task-blocked", title: "Confirm stage dimensions", status: "blocked", ownerLabel: "Alex", dueAt: new Date("2026-07-20T12:00:00.000Z"), blockedReason: "Promoter has not supplied the stage plot", waitingOn: "Promoter", deferralCount: 0 }];
  const commitmentFacts = managerFacts({ tasks: commitmentTasks, commitmentHealth: commitmentHealth.deterministicManagerCommitmentHealth(commitmentTasks, now) });
  assert.equal(service.chatOutputIsGrounded({ answer: "Grounded but irrelevant", citations: ["goal-a"], recommendation: null }, commitmentFacts, "What is blocked or slipping?"), false);
  assert.equal(service.chatOutputIsGrounded({ answer: "Exact blocker", citations: ["task-blocked"], recommendation: null }, commitmentFacts, "What is blocked or slipping?"), true);
  assert.equal(service.chatOutputIsGrounded({ answer: "Duplicate work", citations: ["task-blocked"], recommendation: { stableKey: "duplicate-task", title: "Duplicate", reason: "Wrong", nextAction: "Create it", workstream: "band_operations", priority: "med", evidenceIds: ["task-blocked"], proposedAction: { type: "create_task", title: "Confirm stage dimensions", dueAt: null, initiativeId: null } } }, commitmentFacts, "What is blocked or slipping?"), false);
  assert.equal(service.briefIsGrounded({ ...emptyBrief, today: [{ stableKey: "other-work", title: "Other", reason: "Lower priority", nextAction: "Do it", workstream: "band_operations", priority: "med", evidenceIds: ["goal-a"], proposedAction: null }] }, commitmentFacts), false);
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
