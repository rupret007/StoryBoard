import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = (path) => import(pathToFileURL(join(dir, "..", "dist", path)).href);
const loadShared = (path) => import(pathToFileURL(join(dir, "..", "..", "..", "packages", "shared", "dist", path)).href);
const [policy, pdf, managerSchemas, operationSchemas, operationsMod, managerMod] = await Promise.all([
  loadApi("manager/manager-policy.js"),
  loadApi("operations/simple-pdf.js"),
  loadShared("schemas/manager.js"),
  loadShared("schemas/operations.js"),
  loadApi("operations/operations.service.js"),
  loadApi("manager/manager.service.js")
]);

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
      findFirst: async ({ where }) => where.managerRun.artistId === "artist-a" ? { id: "rec-a", outcome: "suggested", taskId: null, proposedAction: action } : null,
      update: async ({ data }) => ({ id: "rec-a", ...data })
    },
    task: { create: async ({ data }) => { taskCreates += 1; return { id: "task-a", ...data }; } }
  };
  const service = new managerMod.ManagerService({ client }, { log: async () => undefined }, { get: () => false });
  const accepted = await service.recommendation("artist-a", "rec-a", "accepted", "member@test", "operator-a");
  assert.equal(accepted.taskId, "task-a");
  assert.equal(taskCreates, 1);
  action = { type: "send_email", title: "Bypass approval" };
  await assert.rejects(() => service.recommendation("artist-a", "rec-a", "accepted", "member@test", "operator-a"), /Unsupported manager action/);
  assert.equal(taskCreates, 1);
  await assert.rejects(() => service.recommendation("artist-b", "rec-a", "accepted", "member@test", "operator-b"), (error) => error?.getStatus?.() === 404);
});

test("manager golden scenarios cover original, cover, hybrid, and adversarial inputs", async () => {
  const scenarios = JSON.parse(await readFile(join(dir, "fixtures", "manager-evals-v1.json"), "utf8"));
  assert.deepEqual(new Set(scenarios.map((scenario) => scenario.bandMode)), new Set(["original", "cover_event", "hybrid"]));
  assert.ok(scenarios.some((scenario) => scenario.name.includes("adversarial")));
  for (const scenario of scenarios) {
    const parsed = managerSchemas.managerProfileSchema.safeParse({ bandMode: scenario.bandMode, twelveMonthAmbition: scenario.ambition });
    assert.equal(parsed.success, true, scenario.name);
  }
});

test("operations validation rejects unknown fields, invalid money, and bad settlement splits", () => {
  assert.equal(operationSchemas.eventCreateSchema.safeParse({ type: "gig", title: "Show", surprise: true }).success, false);
  assert.equal(operationSchemas.invoiceCreateSchema.safeParse({ number: "1", recipientName: "Buyer", subtotalMinor: -1 }).success, false);
  assert.equal(operationSchemas.settlementCreateSchema.safeParse({ eventId: "event-a", splits: [{ bandMemberId: "a", basisPoints: 4000 }, { bandMemberId: "b", basisPoints: 4000 }] }).success, false);
  assert.equal(operationSchemas.paymentRecordSchema.safeParse({ idempotencyKey: "payment-a", amountMinor: 100, method: "check", receivedAt: "2026-07-11T12:00:00.000Z" }).success, true);
  assert.equal(operationSchemas.expenseCreateSchema.safeParse({ category: "travel", description: "Fuel", amountMinor: 100, incurredAt: "2026-07-11T12:00:00.000Z" }).success, false);
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
