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

const [memoryCapture, auditProjection, auditEventsMod, weeklySummaryMod] = await Promise.all([
  load("manager/manager-memory-capture.js"),
  load("audit-events/audit-event-projection.js"),
  load("audit-events/audit-events.controller.js"),
  load("summary/weekly-summary.service.js")
]);

test("memory privacy scans the full explicit statement before truncation or persistence", () => {
  const longPrefix = "ordinary band planning detail ".repeat(50);
  const keywordSecret = "do-not-persist-keyword-secret";
  const keywordPolicy = memoryCapture.managerMemoryCapturePolicy(
    `Remember that ${longPrefix} our API key is ${keywordSecret}`
  );
  assert.equal(keywordPolicy.assessment.status, "blocked_sensitive");
  assert.equal(keywordPolicy.persistedMessage, memoryCapture.MANAGER_SENSITIVE_CAPTURE_REDACTION);
  assert.doesNotMatch(keywordPolicy.persistedMessage, new RegExp(keywordSecret));

  const tokenSecret = `sk-proj-${"A1b2".repeat(8)}`;
  const tokenPolicy = memoryCapture.managerMemoryCapturePolicy(
    `Remember that ${longPrefix} the venue lookup value is ${tokenSecret}`
  );
  assert.equal(tokenPolicy.assessment.status, "blocked_sensitive");
  assert.equal(tokenPolicy.persistedMessage, memoryCapture.MANAGER_SENSITIVE_CAPTURE_REDACTION);

  for (const statement of [
    `Remember that the venue lookup value is ghp_${"a1B2".repeat(8)}`,
    `Remember that the calendar header is Bearer ${"Ab12".repeat(8)}`,
    "Remember that the sync address is https://band:private-value@example.invalid/calendar"
  ]) {
    assert.equal(memoryCapture.assessManagerMemoryCapture(statement).status, "blocked_sensitive");
  }
});

test("new conversational memory keys are deterministic opaque hashes", () => {
  const statement = "Remember that Morgan handles production advances";
  const ready = memoryCapture.assessManagerMemoryCapture(statement);
  const repeated = memoryCapture.assessManagerMemoryCapture(statement);
  const different = memoryCapture.assessManagerMemoryCapture("Remember that Riley handles production advances");

  assert.equal(ready.status, "ready");
  assert.equal(repeated.status, "ready");
  assert.equal(different.status, "ready");
  assert.match(ready.key, /^operator_note_[a-f0-9]{32}$/);
  assert.equal(ready.key, repeated.key);
  assert.notEqual(ready.key, different.key);
  assert.doesNotMatch(ready.key, /morgan|production|advance/i);
  assert.equal(memoryCapture.MANAGER_MEMORY_CAPTURE_POLICY_VERSION, "manager_memory_capture_v3");
  assert.equal(memoryCapture.managerMemoryCaptureMatches(statement, ready), true);
});

test("Manager memory audit projection removes legacy key content without mutating stored history", () => {
  const stored = {
    id: "audit-memory",
    aggregateType: "ManagerMemoryFact",
    metadata: {
      key: "operator_note_morgan_handles_production_legacyhash",
      nested: { memoryKey: "operator_note_private_guarantee_legacyhash", sourceType: "operator_confirmation" },
      sensitivity: "normal"
    }
  };
  const original = structuredClone(stored);
  const projected = auditProjection.projectAuditEventForRead(stored);

  assert.deepEqual(stored, original);
  assert.notEqual(projected, stored);
  assert.doesNotMatch(JSON.stringify(projected), /morgan_handles|private_guarantee|legacyhash/);
  assert.equal(projected.metadata.memoryKeyRedacted, true);
  assert.equal(projected.metadata.nested.sourceType, "operator_confirmation");

  const unrelated = { id: "audit-other", aggregateType: "Integration", metadata: { key: "provider-safe-key" } };
  assert.equal(auditProjection.projectAuditEventForRead(unrelated), unrelated);
});

test("activity and weekly summary readers both return redacted historical memory audits", async () => {
  const storedMemoryAudit = {
    id: "audit-memory",
    artistId: "artist-a",
    aggregateType: "ManagerMemoryFact",
    aggregateId: "memory-a",
    action: "manager.memory_confirmed",
    actorLabel: "owner@test.invalid",
    actorOperatorId: "operator-a",
    severity: "info",
    metadata: { key: "operator_note_secret_booking_ceiling_legacyhash", sourceType: "operator_confirmation" },
    createdAt: new Date("2026-07-13T12:00:00.000Z")
  };
  const storedOtherAudit = {
    ...storedMemoryAudit,
    id: "audit-other",
    aggregateType: "Integration",
    aggregateId: "integration-a",
    action: "integration.updated",
    metadata: { key: "non-memory-key" }
  };
  let activityWhere = null;
  const controller = new auditEventsMod.AuditEventsController(
    { client: { auditEvent: { findMany: async ({ where }) => { activityWhere = where; return [storedMemoryAudit, storedOtherAudit]; } } } },
    { resolveArtistId: async () => "artist-a" }
  );
  const activity = await controller.list({ id: "operator-a" }, { storyboardSession: null }, undefined, "80");
  assert.deepEqual(activityWhere, { artistId: "artist-a" });
  assert.doesNotMatch(JSON.stringify(activity[0]), /secret_booking_ceiling|legacyhash/);
  assert.equal(activity[0].metadata.memoryKeyRedacted, true);
  assert.equal(activity[1].metadata.key, "non-memory-key");

  const summary = new weeklySummaryMod.WeeklySummaryService({
    client: {
      bookingOpportunity: { findMany: async () => [] },
      task: { findMany: async () => [] },
      approvalRequest: { findMany: async () => [] },
      auditEvent: { findMany: async () => [storedMemoryAudit] },
      commandRun: { findMany: async () => [] }
    }
  });
  const result = await summary.build("artist-a");
  assert.doesNotMatch(JSON.stringify(result.recentAudit), /secret_booking_ceiling|legacyhash/);
  assert.equal(result.recentAudit[0].metadata.memoryKeyRedacted, true);
  assert.match(JSON.stringify(storedMemoryAudit), /secret_booking_ceiling_legacyhash/);
});
