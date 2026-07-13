import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const [approvalsMod, logisticsMod] = await Promise.all([
  load("approvals/approvals.service.js"),
  load("operations/event-logistics.js")
]);

function fakeHarness({ approval, event = null, recommendation = null, failSuccessAudit = false } = {}) {
  const approvals = new Map(approval ? [[approval.id, approval]] : []);
  const events = new Map(event ? [[event.id, event]] : []);
  const recommendations = new Map(
    recommendation ? [[recommendation.id, recommendation]] : []
  );
  const auditEvents = [];
  const notifications = [];
  const providerCalls = { calendar: 0, drive: 0 };
  const matches = (row, where = {}) => {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.artistId !== undefined && row.artistId !== where.artistId) return false;
    if (where.managerRecommendationId !== undefined && row.managerRecommendationId !== where.managerRecommendationId) return false;
    if (where.executionAttemptedAt === null && row.executionAttemptedAt !== null) return false;
    if (where.status !== undefined) {
      if (typeof where.status === "string" && row.status !== where.status) return false;
      if (where.status?.in && !where.status.in.includes(row.status)) return false;
    }
    if (where.updatedAt && row.updatedAt?.getTime() !== where.updatedAt.getTime()) return false;
    for (const key of ["type", "title", "startsAt", "endsAt", "timezone"]) {
      if (where[key] === undefined) continue;
      const left = row[key];
      const right = where[key];
      if (left instanceof Date && right instanceof Date) {
        if (left.getTime() !== right.getTime()) return false;
      } else if (left !== right) return false;
    }
    if (where.calendarEventId === null && row.calendarEventId !== null) return false;
    if (where.driveFolderUrl === null && row.driveFolderUrl !== null) return false;
    return true;
  };
  const approvalDelegate = {
    findFirst: async ({ where }) => [...approvals.values()].find((row) => matches(row, where)) ?? null,
    findMany: async ({ where }) => [...approvals.values()].filter((row) => matches(row, where)),
    findUniqueOrThrow: async ({ where }) => {
      const row = approvals.get(where.id);
      if (!row) throw new Error("missing approval");
      return row;
    },
    create: async ({ data }) => {
      const row = { id: `approval-${approvals.size + 1}`, executionAttemptedAt: null, approvedAt: null, approvedBy: null, createdAt: new Date(), updatedAt: new Date(), ...data };
      approvals.set(row.id, row);
      return row;
    },
    upsert: async ({ where, create }) => {
      const key = where.artistId_sourceKey;
      const existing = [...approvals.values()].find((row) => row.artistId === key.artistId && row.sourceKey === key.sourceKey);
      if (existing) return existing;
      const row = { executionAttemptedAt: null, approvedAt: null, approvedBy: null, createdAt: new Date(), updatedAt: new Date(), ...create };
      approvals.set(row.id, row);
      return row;
    },
    updateMany: async ({ where, data }) => {
      const rows = [...approvals.values()].filter((row) => matches(row, where));
      for (const row of rows) Object.assign(row, data, { updatedAt: new Date() });
      return { count: rows.length };
    },
    update: async ({ where, data }) => {
      const row = approvals.get(where.id);
      if (!row) throw new Error("missing approval");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }
  };
  const bandEventDelegate = {
    count: async ({ where }) => [...events.values()].filter((row) => matches(row, where)).length,
    findFirst: async ({ where }) => {
      const row = [...events.values()].find((candidate) => matches(candidate, where));
      return row ? { ...row } : null;
    },
    updateMany: async ({ where, data }) => {
      const rows = [...events.values()].filter((row) => matches(row, where));
      for (const row of rows) Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
      return { count: rows.length };
    }
  };
  const managerRecommendationDelegate = {
    count: async ({ where }) => [...recommendations.values()].filter((row) => row.id && where.id.in.includes(row.id) && row.artistId === where.managerRun.artistId).length,
    findFirst: async ({ where }) => {
      const row = recommendations.get(where.id);
      return row?.artistId === where.managerRun.artistId ? row : null;
    },
    update: async ({ where, data }) => {
      const row = recommendations.get(where.id);
      if (!row) throw new Error("missing recommendation");
      Object.assign(row, data);
      return row;
    }
  };
  const client = {
    approvalRequest: approvalDelegate,
    auditEvent: { create: async ({ data }) => (auditEvents.push(data), data) },
    bandEvent: bandEventDelegate,
    bookingOpportunity: { count: async () => 0 },
    managerRecommendation: managerRecommendationDelegate,
    $transaction: async (callback) => callback(client)
  };
  const adapters = {
    gmail: { mode: "mock", draftMessage: async () => { throw new Error("unused"); }, sendMessage: async () => { throw new Error("unused"); } },
    calendar: { mode: "mock", proposeHold: async () => (providerCalls.calendar += 1, { eventId: "calendar-1", htmlLink: "https://calendar.test/1" }) },
    drive: { mode: "mock", ensureStoryboardFolder: async () => (providerCalls.drive += 1, { folderId: "folder-1", webViewLink: "https://drive.test/folder-1" }) }
  };
  const service = new approvalsMod.ApprovalsService(
    { client },
    { log: async (input) => {
      if (failSuccessAudit && input.action === "approval.execution.succeeded") throw new Error("audit unavailable");
      auditEvents.push(input);
      return input;
    } },
    { resolveForArtist: async () => adapters },
    { enqueueApprovalNotify: async (input) => notifications.push(input) }
  );
  return { service, approvals, events, recommendations, auditEvents, notifications, providerCalls };
}

function approvalRow(overrides = {}) {
  return {
    id: "approval-1",
    artistId: "artist-1",
    opportunityId: null,
    eventId: null,
    managerRecommendationId: null,
    sourceKey: null,
    title: "External work",
    status: "pending",
    actionType: "drive_ensure_folder",
    payload: { folderName: "Band files" },
    proposedBy: "owner@test.invalid",
    approvedBy: null,
    approvedAt: null,
    executionAttemptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function recommendationRow(overrides = {}) {
  return { id: "recommendation-1", artistId: "artist-1", outcome: "suggested", outcomeReason: null, ...overrides };
}

test("idempotent approval creation reuses intent, attaches only an unlinked recommendation, and notifies once", async () => {
  const recommendation = recommendationRow();
  const harness = fakeHarness({ recommendation });
  const spec = { title: "Create folder", actionType: "drive_ensure_folder", payload: { folderName: "Show" }, sourceKey: "source-1", proposedBy: "owner@test.invalid" };
  const first = await harness.service.createMany("artist-1", [spec]);
  first[0].payload = { ...first[0].payload, dryRunPreview: { at: new Date().toISOString() } };
  const second = await harness.service.createMany("artist-1", [{ ...spec, managerRecommendationId: recommendation.id }]);
  assert.equal(second[0].id, first[0].id);
  assert.equal(second[0].managerRecommendationId, recommendation.id);
  assert.equal(recommendation.outcome, "accepted");
  assert.equal(recommendation.outcomeReason, "approval_prepared");
  assert.equal(harness.auditEvents.filter((row) => row.action === "approval.created").length, 1);
  assert.equal(harness.notifications.filter((row) => row.event === "created").length, 1);
  await assert.rejects(
    () => harness.service.createMany("artist-1", [{ ...spec, title: "Different work" }]),
    /different work/i
  );
});

test("reject is compare-and-set and reconciles a linked recommendation once", async () => {
  const recommendation = recommendationRow({ outcome: "accepted", outcomeReason: "approval_prepared" });
  const approval = approvalRow({ managerRecommendationId: recommendation.id });
  const harness = fakeHarness({ approval, recommendation });
  await harness.service.reject("artist-1", approval.id, "owner@test.invalid", "Not now", "operator-1");
  await assert.rejects(
    () => harness.service.reject("artist-1", approval.id, "owner@test.invalid"),
    /not pending/i
  );
  assert.equal(approval.status, "rejected");
  assert.equal(recommendation.outcome, "dismissed");
  assert.equal(recommendation.outcomeReason, "approval_rejected");
  assert.equal(harness.notifications.filter((row) => row.event === "rejected").length, 1);
});

test("dry run does not consume the execution claim and a real execution remains one-shot", async () => {
  const recommendation = recommendationRow({ outcome: "accepted", outcomeReason: "approval_prepared" });
  const approval = approvalRow({ status: "approved", managerRecommendationId: recommendation.id });
  const harness = fakeHarness({ approval, recommendation });
  await harness.service.executeApproved("artist-1", approval.id, "owner@test.invalid", { dryRun: true });
  assert.equal(approval.executionAttemptedAt, null);
  assert.equal(harness.providerCalls.drive, 0);
  await harness.service.executeApproved("artist-1", approval.id, "owner@test.invalid");
  assert.equal(harness.providerCalls.drive, 1);
  assert.equal(approval.status, "executed");
  assert.equal(recommendation.outcome, "completed");
  assert.equal(recommendation.outcomeReason, "action_executed");
  await assert.rejects(
    () => harness.service.executeApproved("artist-1", approval.id, "owner@test.invalid"),
    /already executed/i
  );
  assert.equal(harness.providerCalls.drive, 1);
});

test("event logistics rejects a stale fingerprint before provider work", async () => {
  const event = {
    id: "event-1", artistId: "artist-1", opportunityId: null, type: "gig", title: "Friday show", status: "confirmed",
    startsAt: new Date("2027-01-02T01:00:00.000Z"), endsAt: new Date("2027-01-02T03:00:00.000Z"), timezone: "America/Chicago",
    calendarEventId: null, driveFolderUrl: null, updatedAt: new Date()
  };
  const fingerprint = logisticsMod.eventLogisticsFingerprint(event);
  const sourceKey = logisticsMod.eventLogisticsApprovalSourceKey(event.id, fingerprint, "calendar", 1);
  const recommendation = recommendationRow({ outcome: "accepted", outcomeReason: "approval_prepared" });
  const approval = approvalRow({
    status: "approved", eventId: event.id, managerRecommendationId: recommendation.id, sourceKey,
    actionType: "calendar_hold_batch",
    payload: { holds: [{ title: event.title, start: event.startsAt.toISOString(), end: event.endsAt.toISOString(), timeZone: event.timezone }] }
  });
  const harness = fakeHarness({ approval, event, recommendation });
  event.title = "Changed show";
  const result = await harness.service.executeApproved("artist-1", approval.id, "owner@test.invalid");
  assert.equal(result.status, "failed");
  assert.equal(harness.providerCalls.calendar, 0);
  assert.equal(recommendation.outcome, "blocked");
  assert.equal(recommendation.outcomeReason, "approval_failed");
});

test("event logistics rejects a type change before provider work", async () => {
  const event = {
    id: "event-1", artistId: "artist-1", opportunityId: null, type: "gig", title: "Friday show", status: "confirmed",
    startsAt: new Date("2027-01-02T01:00:00.000Z"), endsAt: new Date("2027-01-02T03:00:00.000Z"), timezone: "America/Chicago",
    calendarEventId: null, driveFolderUrl: null, updatedAt: new Date()
  };
  const approval = approvalRow({
    status: "approved", eventId: event.id,
    sourceKey: logisticsMod.eventLogisticsApprovalSourceKey(event.id, logisticsMod.eventLogisticsFingerprint(event), "calendar", 1),
    actionType: "calendar_hold_batch",
    payload: { holds: [{ title: event.title, start: event.startsAt.toISOString(), end: event.endsAt.toISOString(), timeZone: event.timezone }] }
  });
  const harness = fakeHarness({ approval, event });
  event.type = "rehearsal";
  const result = await harness.service.executeApproved("artist-1", approval.id, "owner@test.invalid");
  assert.equal(result.status, "failed");
  assert.equal(harness.providerCalls.calendar, 0);
});

test("successful event logistics persists provider result and event link together", async () => {
  const event = {
    id: "event-1", artistId: "artist-1", opportunityId: null, type: "gig", title: "Friday show", status: "confirmed",
    startsAt: new Date("2027-01-02T01:00:00.000Z"), endsAt: new Date("2027-01-02T03:00:00.000Z"), timezone: "America/Chicago",
    calendarEventId: null, driveFolderUrl: null, updatedAt: new Date()
  };
  const sourceKey = logisticsMod.eventLogisticsApprovalSourceKey(event.id, logisticsMod.eventLogisticsFingerprint(event), "calendar", 1);
  const approval = approvalRow({
    status: "approved", eventId: event.id, sourceKey, actionType: "calendar_hold_batch",
    payload: { holds: [{ title: event.title, start: event.startsAt.toISOString(), end: event.endsAt.toISOString(), timeZone: event.timezone }] }
  });
  const harness = fakeHarness({ approval, event });
  const result = await harness.service.executeApproved("artist-1", approval.id, "owner@test.invalid");
  assert.equal(result.status, "executed");
  assert.equal(event.calendarEventId, "calendar-1");
  assert.equal(result.payload.executionResult.holds[0].eventId, "calendar-1");
  assert.equal(harness.providerCalls.calendar, 1);
});

test("a replacement approval may replace only the exact link created by a reviewed simulation", async () => {
  const event = {
    id: "event-1", artistId: "artist-1", opportunityId: null, type: "gig", title: "Friday show", status: "confirmed",
    startsAt: new Date("2027-01-02T01:00:00.000Z"), endsAt: new Date("2027-01-02T03:00:00.000Z"), timezone: "America/Chicago",
    calendarEventId: "mock-cal-1", driveFolderUrl: null, updatedAt: new Date()
  };
  const fingerprint = logisticsMod.eventLogisticsFingerprint(event);
  const approval = approvalRow({
    status: "approved", eventId: event.id,
    sourceKey: logisticsMod.eventLogisticsApprovalSourceKey(event.id, fingerprint, "calendar", 2),
    actionType: "calendar_hold_batch",
    payload: { holds: [{ title: event.title, start: event.startsAt.toISOString(), end: event.endsAt.toISOString(), timeZone: event.timezone, kind: "confirmed" }] }
  });
  const priorSimulation = approvalRow({
    id: "approval-simulation", status: "executed", eventId: event.id,
    sourceKey: logisticsMod.eventLogisticsApprovalSourceKey(event.id, fingerprint, "calendar", 1),
    actionType: "calendar_hold_batch",
    payload: { executionResult: { calendarMode: "mock", holds: [{ eventId: "mock-cal-1" }] } }
  });
  const harness = fakeHarness({ approval, event });
  harness.approvals.set(priorSimulation.id, priorSimulation);
  const result = await harness.service.executeApproved("artist-1", approval.id, "owner@test.invalid");
  assert.equal(result.status, "executed");
  assert.equal(event.calendarEventId, "calendar-1");
  assert.equal(harness.providerCalls.calendar, 1);
});

test("calendar and Drive executions can finalize concurrently without conflicting on provider-only event fields", async () => {
  const event = {
    id: "event-1", artistId: "artist-1", opportunityId: null, type: "gig", title: "Friday show", status: "confirmed",
    startsAt: new Date("2027-01-02T01:00:00.000Z"), endsAt: new Date("2027-01-02T03:00:00.000Z"), timezone: "America/Chicago",
    calendarEventId: null, driveFolderUrl: null, updatedAt: new Date()
  };
  const fingerprint = logisticsMod.eventLogisticsFingerprint(event);
  const calendarApproval = approvalRow({
    status: "approved", eventId: event.id,
    sourceKey: logisticsMod.eventLogisticsApprovalSourceKey(event.id, fingerprint, "calendar", 1),
    actionType: "calendar_hold_batch",
    payload: { holds: [{ title: event.title, start: event.startsAt.toISOString(), end: event.endsAt.toISOString(), timeZone: event.timezone }] }
  });
  const driveApproval = approvalRow({
    id: "approval-2", status: "approved", eventId: event.id,
    sourceKey: logisticsMod.eventLogisticsApprovalSourceKey(event.id, fingerprint, "drive", 1),
    actionType: "drive_ensure_folder",
    payload: { folderName: "2027-01-01 Friday show" }
  });
  const harness = fakeHarness({ approval: calendarApproval, event });
  harness.approvals.set(driveApproval.id, driveApproval);
  const [calendarResult, driveResult] = await Promise.all([
    harness.service.executeApproved("artist-1", calendarApproval.id, "owner@test.invalid"),
    harness.service.executeApproved("artist-1", driveApproval.id, "owner@test.invalid")
  ]);
  assert.equal(calendarResult.status, "executed");
  assert.equal(driveResult.status, "executed");
  assert.equal(event.calendarEventId, "calendar-1");
  assert.equal(event.driveFolderUrl, "https://drive.test/folder-1");
  assert.deepEqual(harness.providerCalls, { calendar: 1, drive: 1 });
});

test("an audit failure after event finalization never reverses executed provider work", async () => {
  const event = {
    id: "event-1", artistId: "artist-1", opportunityId: null, type: "gig", title: "Friday show", status: "confirmed",
    startsAt: new Date("2027-01-02T01:00:00.000Z"), endsAt: new Date("2027-01-02T03:00:00.000Z"), timezone: "America/Chicago",
    calendarEventId: null, driveFolderUrl: null, updatedAt: new Date()
  };
  const recommendation = recommendationRow({ outcome: "accepted", outcomeReason: "approval_prepared" });
  const approval = approvalRow({
    status: "approved", eventId: event.id, managerRecommendationId: recommendation.id,
    sourceKey: logisticsMod.eventLogisticsApprovalSourceKey(event.id, logisticsMod.eventLogisticsFingerprint(event), "calendar", 1),
    actionType: "calendar_hold_batch",
    payload: { holds: [{ title: event.title, start: event.startsAt.toISOString(), end: event.endsAt.toISOString(), timeZone: event.timezone }] }
  });
  const harness = fakeHarness({ approval, event, recommendation, failSuccessAudit: true });
  const result = await harness.service.executeApproved("artist-1", approval.id, "owner@test.invalid");
  assert.equal(result.status, "executed");
  assert.equal(event.calendarEventId, "calendar-1");
  assert.equal(recommendation.outcome, "blocked");
  assert.equal(recommendation.outcomeReason, "approval_simulated");
  assert.equal(harness.providerCalls.calendar, 1);
  assert.ok(harness.auditEvents.some((row) => row.action === "approval.execution.started"));
  assert.ok(harness.auditEvents.some((row) => row.action === "event.calendar_linked"));
  assert.equal(harness.notifications.some((row) => row.event === "failed"), false);
});
