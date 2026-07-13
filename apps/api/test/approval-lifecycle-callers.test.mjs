import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(
    pathToFileURL(join(dir, "..", "dist", path)).href
  );
  return module.default ?? module;
};

const [dashboardMod, intelligenceMod, summaryMod, workflowMod] =
  await Promise.all([
    load("dashboard/dashboard.controller.js"),
    load("operational-intelligence/operational-intelligence.service.js"),
    load("summary/weekly-summary.service.js"),
    load("workflow-automation/workflow-job-processor.service.js")
  ]);

const now = new Date("2026-07-14T12:00:00.000Z");
const staleExecutionAttempt = new Date(Date.now() - 2 * 60 * 60 * 1000);

function approval(overrides = {}) {
  return {
    id: `approval-${Math.random().toString(36).slice(2)}`,
    artistId: "artist-a",
    title: "Approval work",
    status: "pending",
    actionType: "calendar_hold_batch",
    executionAttemptedAt: null,
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: now,
    ...overrides
  };
}

const lifecycleRows = [
  approval({ id: "pending", title: "Choose calendar request" }),
  approval({ id: "proposed", status: "proposed", title: "Choose Drive request" }),
  approval({ id: "ready", status: "approved", title: "Run approved draft" }),
  approval({
    id: "active",
    status: "approved",
    title: "Calendar request still running",
    executionAttemptedAt: new Date()
  }),
  approval({
    id: "unknown",
    status: "approved",
    title: "Reconcile Calendar request",
    executionAttemptedAt: staleExecutionAttempt
  }),
  approval({ id: "failed", status: "failed", title: "Review failed Drive request" }),
  approval({
    id: "unsupported",
    status: "approved",
    title: "Review approved checklist",
    actionType: "release_checklist_draft"
  }),
  approval({ id: "rejected", status: "rejected" }),
  approval({ id: "executed", status: "executed" })
];

function lifecycleRowMatches(row, where) {
  if (where.OR) {
    return where.OR.some((branch) =>
      lifecycleRowMatches(row, { ...branch, artistId: where.artistId })
    );
  }
  if (where.status) {
    if (typeof where.status === "string" && row.status !== where.status) {
      return false;
    }
    if (where.status.in && !where.status.in.includes(row.status)) return false;
  }
  if (
    where.executionAttemptedAt === null &&
    row.executionAttemptedAt !== null
  ) {
    return false;
  }
  if (
    where.executionAttemptedAt?.not === null &&
    row.executionAttemptedAt === null
  ) {
    return false;
  }
  if (
    where.executionAttemptedAt?.gt &&
    (!row.executionAttemptedAt ||
      row.executionAttemptedAt <= where.executionAttemptedAt.gt)
  ) {
    return false;
  }
  if (
    where.executionAttemptedAt?.lte &&
    (!row.executionAttemptedAt ||
      row.executionAttemptedAt > where.executionAttemptedAt.lte)
  ) {
    return false;
  }
  if (where.actionType?.in && !where.actionType.in.includes(row.actionType)) {
    return false;
  }
  if (
    where.actionType?.notIn &&
    where.actionType.notIn.includes(row.actionType)
  ) {
    return false;
  }
  return row.artistId === where.artistId;
}

function lifecycleCount(where) {
  return lifecycleRows.filter((row) => lifecycleRowMatches(row, where)).length;
}

test("dashboard stats retain pendingApprovals and add the complete approval attention counts", async () => {
  const artists = [];
  const prisma = {
    client: {
      venue: { count: async ({ where }) => (artists.push(where.artistId), 2) },
      contact: { count: async () => 3 },
      bookingOpportunity: {
        findMany: async () => [
          { stage: "target" },
          { stage: "closed" }
        ]
      },
      task: {
        findMany: async () => [
          { status: "todo", dueAt: new Date("2020-01-01T00:00:00.000Z") }
        ]
      }
    }
  };
  const approvalAttention = {
    pendingDecision: 2,
    readyToExecute: 1,
    executionInProgress: 1,
    needsReconciliation: 2,
    approvedNotExecutable: 1,
    attentionTotal: 5
  };
  const controller = new dashboardMod.DashboardController(
    prisma,
    { resolveArtistId: async () => "artist-a" },
    {
      getApprovalAttention: async (artistId) => {
        artists.push(artistId);
        return approvalAttention;
      }
    }
  );

  const result = await controller.stats(
    { id: "operator-a" },
    { storyboardSession: null },
    "artist-a"
  );

  assert.equal(result.pendingApprovals, 2);
  assert.deepEqual(result.approvalAttention, approvalAttention);
  assert.equal(result.activeOpportunities, 1);
  assert.equal(result.overdueTasks, 1);
  assert.deepEqual(artists, ["artist-a", "artist-a"]);
});

test("operational insights classify one tenant once and prioritize reconciliation before aged decisions and ready execution", async () => {
  const approvalQueries = [];
  const prisma = {
    client: {
      artist: {
        findUnique: async () => ({
          workflowOverdueGraceDays: null,
          workflowStaleFollowupDays: null,
          workflowPendingApprovalDays: null
        })
      },
      approvalRequest: {
        count: async ({ where }) => {
          approvalQueries.push(where);
          return lifecycleCount(where);
        },
        findMany: async ({ where }) => {
          approvalQueries.push(where);
          return [{ id: "pending", title: "Old decision" }];
        }
      },
      bookingOpportunity: { findMany: async () => [] },
      task: { findMany: async () => [] },
      bookingCampaignRecipient: { count: async () => 0 },
      bookingReply: { count: async () => 0 },
      bandEvent: { findMany: async () => [] },
      invoice: {
        count: async () => 0,
        fields: { totalMinor: Symbol("totalMinor") }
      },
      artistProject: { count: async () => 0 }
    }
  };
  const service = new intelligenceMod.OperationalIntelligenceService(
    prisma,
    {
      overdueByDueDate: async () => [],
      followUpsOlderThan: async () => []
    },
    { get: () => 7 }
  );

  const result = await service.getInsights("artist-a");

  assert.equal(result.signals.approvalPendingDecisionCount, 2);
  assert.equal(result.signals.approvalReadyToExecuteCount, 1);
  assert.equal(result.signals.approvalExecutionInProgressCount, 1);
  assert.equal(result.signals.approvalNeedsReconciliationCount, 2);
  assert.equal(result.signals.pendingApprovalAgingCount, 1);
  assert.deepEqual(
    result.priorityActions.slice(0, 3).map((item) => item.id),
    ["approvals-reconciliation", "approvals-pending", "approvals-ready"]
  );
  assert.equal(result.priorityActions[0].severity, "high");
  assert.equal(result.priorityActions[1].severity, "high");
  assert.equal(result.priorityActions[2].severity, "med");
  assert.match(result.priorityActions[0].reason, /never retry/i);
  assert.equal(
    result.bookingHealth.factors.find(
      (factor) => factor.code === "pending_approvals"
    )?.detail,
    "2 approval decision(s) waiting."
  );
  assert.equal(
    result.bookingHealth.factors.some(
      (factor) => factor.code === "approval_reconciliation"
    ),
    true
  );
  assert.equal(
    result.bookingHealth.factors.some(
      (factor) => factor.code === "approved_execution_waiting"
    ),
    true
  );
  assert.equal(
    approvalQueries.every((where) => where.artistId === "artist-a"),
    true
  );
});

test("urgent scan alerts once per day when approval outcomes require reconciliation", async () => {
  const calls = [];
  const prisma = {
    client: {
      artist: {
        findMany: async () => [
          {
            id: "artist-a",
            name: "The Test Band",
            workflowOverdueGraceDays: null,
            workflowStaleFollowupDays: null,
            workflowPendingApprovalDays: null
          }
        ]
      },
      task: { count: async () => 0 },
      approvalRequest: {
        count: async ({ where }) => lifecycleCount(where),
        findMany: async ({ where }) =>
          where.createdAt ? [] : lifecycleRows
      }
    }
  };
  const service = new intelligenceMod.OperationalIntelligenceService(
    prisma,
    {
      overdueByDueDate: async () => [],
      followUpsOlderThan: async () => []
    },
    { get: () => 7 }
  );

  const result = await service.runUrgentTelegramScan({
    sendUrgent: async (input) => {
      calls.push(input);
      return { ok: true, delivered: true };
    }
  });

  assert.deepEqual(result, { artists: 1, sends: 1 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].dedupeKey, /^approval_reconciliation:/);
  assert.equal(calls[0].metadata.reconciliationCount, 2);
  assert.match(calls[0].text, /will not retry/i);
});

test("weekly summary exposes separate approval queues and leads with uncertain outcomes", async () => {
  const service = new summaryMod.WeeklySummaryService({
    client: {
      bookingOpportunity: { findMany: async () => [] },
      task: { findMany: async () => [] },
      approvalRequest: { findMany: async ({ where }) => {
        assert.equal(where.artistId, "artist-a");
        return lifecycleRows;
      } },
      auditEvent: { findMany: async () => [] },
      commandRun: { findMany: async () => [] }
    }
  });

  const result = await service.build("artist-a");

  assert.equal(result.pendingApprovals.length, 2);
  assert.deepEqual(result.approvalWorkQueue.counts, {
    pendingDecision: 2,
    readyToExecute: 1,
    executionInProgress: 1,
    needsReconciliation: 2,
    reconciled: 0,
    approvedNotExecutable: 1,
    attentionTotal: 5
  });
  assert.equal(result.approvalWorkQueue.policyVersion, "approval_lifecycle_v2");
  assert.match(result.recommendations[0], /need reconciliation/i);
  assert.match(result.recommendations[0], /never retry/i);
  assert.match(result.recommendations[1], /separate execution step/i);
  assert.match(result.recommendations[2], /decision\(s\) waiting/i);
  assert.match(result.recommendations[3], /no executable StoryBoard action/i);
});

function workflowProcessor(overrides = {}) {
  const createdNotifications = [];
  const emails = [];
  const audits = [];
  const telegram = [];
  const recipient = { operatorId: "operator-a", email: "owner@test.invalid" };
  const prefs = { approvals: { inApp: true, email: false } };
  const processor = new workflowMod.WorkflowJobProcessorService(
    overrides.prisma ?? {},
    { log: async (input) => (audits.push(input), input) },
    { get: () => 7 },
    {},
    overrides.tasks ?? {},
    { listOwnerAndMembers: async () => [recipient] },
    {
      createForRecipients: async (input) => {
        createdNotifications.push(input);
        return [];
      },
      hasNotificationSince: async () => false
    },
    {
      draftForOperatorIfEnabled: async (input) => {
        emails.push(input);
      }
    },
    {
      prefsForOperators: async () => new Map([[recipient.operatorId, prefs]]),
      channelAllows: (_kind, channel) => channel === "inApp",
      digestEnabled: () => true,
      includeDigestSection: (_pref, section) => section === "approvals"
    },
    {
      trySendApprovalFailed: async (input) => {
        telegram.push(input);
      }
    },
    {},
    { get: () => ({}) }
  );
  return { processor, createdNotifications, emails, audits, telegram };
}

test("every approval lifecycle notification deep-links to Approvals and approved copy stays generic", async () => {
  const row = approval({ id: "approval-notify", title: "Outside work" });
  const harness = workflowProcessor({
    prisma: {
      client: {
        approvalRequest: {
          findFirst: async ({ where }) =>
            where.id === row.id && where.artistId === row.artistId ? row : null
        }
      }
    }
  });
  const expectedKinds = {
    created: "approval_created",
    approved: "approval_approved",
    rejected: "approval_rejected",
    executed: "approval_executed",
    failed: "approval_failed"
  };

  for (const event of Object.keys(expectedKinds)) {
    await harness.processor.process({
      name: "approval.notify",
      data: { artistId: row.artistId, approvalId: row.id, event }
    });
  }

  assert.equal(harness.createdNotifications.length, 5);
  for (const [index, event] of Object.keys(expectedKinds).entries()) {
    const notification = harness.createdNotifications[index];
    assert.equal(notification.kind, expectedKinds[event]);
    assert.equal(notification.metadata.href, "/approvals");
    assert.equal(notification.metadata.approvalId, row.id);
  }
  const approved = harness.createdNotifications[1];
  assert.match(approved.body, /review its current status/i);
  assert.doesNotMatch(approved.body, /ready to execute/i);
  assert.equal(harness.telegram.length, 1);
});

test("daily digest separates reconciliation, ready, pending, and unsupported approval work", async () => {
  const notificationRows = [];
  const harness = workflowProcessor({
    prisma: {
      client: {
        artist: {
          findMany: async () => [
            {
              id: "artist-a",
              name: "Test Band",
              workflowOverdueGraceDays: null,
              workflowStaleFollowupDays: null,
              workflowPendingApprovalDays: 0
            }
          ]
        },
        approvalRequest: {
          findMany: async ({ where }) => {
            assert.equal(where.artistId, "artist-a");
            assert.equal(where.OR.length, 3);
            return lifecycleRows;
          }
        },
        artistMembershipInvite: { findMany: async () => [] },
        auditEvent: { findMany: async () => [] }
      }
    },
    tasks: {
      overdueByDueDate: async () => [],
      followUpsOlderThan: async () => []
    }
  });
  await harness.processor.process({ name: "digest.generate.daily", data: {} });
  notificationRows.push(...harness.createdNotifications);

  assert.equal(notificationRows.length, 1);
  const digest = notificationRows[0];
  assert.equal(digest.metadata.href, "/approvals");
  assert.match(digest.body, /Approval outcomes needing reconciliation \(2\)/);
  assert.match(digest.body, /provider outcome unknown; do not retry/i);
  assert.match(digest.body, /Approved and ready for execution \(1\)/);
  assert.match(digest.body, /Pending approval decisions \(2\)/);
  assert.match(digest.body, /Approved status to review \(1\)/);
  assert.doesNotMatch(digest.body, /rejected|executed/);
});
