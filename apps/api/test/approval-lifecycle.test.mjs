import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const [lifecycle, approvalsMod] = await Promise.all([
  load("approvals/approval-lifecycle.js"),
  load("approvals/approvals.service.js")
]);

const now = new Date("2026-07-14T12:00:00.000Z");
const freshAttempt = new Date("2026-07-14T11:30:00.000Z");
const staleAttempt = new Date(
  now.getTime() - lifecycle.APPROVAL_EXECUTION_LEASE_MS - 1
);

function classifiable(
  status,
  actionType = "drive_ensure_folder",
  attempted = false,
  reconciliations = []
) {
  return {
    status,
    actionType,
    executionAttemptedAt: attempted ? staleAttempt : null,
    reconciliations
  };
}

function reconciliation(id, outcome, createdAt = now) {
  return {
    id,
    outcome,
    resolutionKey: outcome === "still_unknown" ? null : "terminal",
    note: "Checked the provider console and recorded the observed result.",
    evidence: {
      checkedLocation: "Google provider console",
      providerReference:
        outcome === "external_effect_observed" ? "provider-reference-1" : null
    },
    idempotencyKey: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    policyVersion: "approval_reconciliation_v1",
    observedAt: createdAt,
    actorLabel: "member@test.invalid",
    actorOperatorId: "operator-1",
    createdAt
  };
}

function row(id, status, overrides = {}) {
  return {
    id,
    artistId: "artist-1",
    opportunityId: null,
    eventId: null,
    managerRecommendationId: null,
    sourceKey: null,
    title: `Approval ${id}`,
    status,
    actionType: "drive_ensure_folder",
    payload: { folderName: "Band files" },
    proposedBy: "member@test.invalid",
    approvedBy: status === "approved" ? "owner@test.invalid" : null,
    approvedAt: status === "approved" ? now : null,
    executionAttemptedAt: null,
    createdAt: now,
    updatedAt: now,
    bookingCampaign: null,
    campaignDeliveries: [],
    reconciliations: [],
    ...overrides
  };
}

function getInFilter(whereClause) {
  if (whereClause?.in) return whereClause.in;
  if (typeof whereClause === "string") return [whereClause];
  return null;
}

function matchValue(value, filter) {
  if (filter === undefined) {
    return true;
  }
  if (filter === null) {
    return value === null;
  }
  if (typeof filter !== "object") {
    return value === filter;
  }
  if (Array.isArray(filter.in)) {
    return filter.in.includes(value);
  }
  if (Array.isArray(filter.notIn)) {
    return !filter.notIn.includes(value);
  }
  if (filter.gte || filter.lte) {
    if (value == null) return false;
    const after = filter.gte ? value >= filter.gte : true;
    const before = filter.lte ? value <= filter.lte : true;
    return after && before;
  }
  return true;
}

function outcomeInReconciliations(rows, outcomeFilter, artistId) {
  if (!outcomeFilter?.in || outcomeFilter.in.length === 0) {
    return false;
  }
  const accepted = new Set(outcomeFilter.in);
  return rows.some(
    (row) =>
      (!artistId || row.artistId == null || row.artistId === artistId) &&
      accepted.has(row.outcome)
  );
}

function reconciliationMatches(candidate, clause, invert = false) {
  if (!clause) {
    return true;
  }
  const hasOutcome = outcomeInReconciliations(
    candidate.reconciliations,
    clause.outcome,
    candidate.artistId
  );
  return invert ? !hasOutcome : hasOutcome;
}

function rowMatchesWhere(candidate, where = {}) {
  if (where.artistId !== undefined && candidate.artistId !== where.artistId) {
    return false;
  }
  const statusFilter = getInFilter(where.status);
  if (statusFilter && !statusFilter.includes(candidate.status)) {
    return false;
  }
  if (
    where.status &&
    typeof where.status !== "object" &&
    candidate.status !== where.status
  ) {
    return false;
  }
  if (!matchValue(candidate.actionType, where.actionType)) {
    return false;
  }
  if (!matchValue(candidate.executionAttemptedAt, where.executionAttemptedAt)) {
    return false;
  }
  if (where.reconciliations) {
    const checkSome = where.reconciliations.some;
    const checkNone = where.reconciliations.none;
    if (
      checkSome &&
      !reconciliationMatches(candidate, checkSome, false)
    ) {
      return false;
    }
    if (
      checkNone &&
      !reconciliationMatches(candidate, checkNone, true)
    ) {
      return false;
    }
  }
  if (Array.isArray(where.OR)) {
    if (!where.OR.some((clause) => rowMatchesWhere(candidate, clause))) {
      return false;
    }
  }
  return true;
}

function applyOrdering(rows, orderBy) {
  if (!orderBy) {
    return [...rows];
  }
  const field = Object.keys(orderBy)[0];
  const direction = orderBy[field];
  if (!field) return [...rows];
  if (!field || !direction) {
    return [...rows];
  }
  return [...rows].sort((left, right) => {
    const leftValue = left[field];
    const rightValue = right[field];
    if (leftValue === rightValue) return 0;
    const comparison = leftValue < rightValue ? -1 : 1;
    return direction === "desc" ? -comparison : comparison;
  });
}

function applyPagination(rows, query) {
  const start = Math.max(0, Number(query.skip) || 0);
  const take = Math.max(1, Number(query.take) || rows.length);
  return rows.slice(start, start + take);
}

function includeCampaignDeliveries(candidate, includeQuery) {
  if (!includeQuery?.campaignDeliveries) return candidate.campaignDeliveries;
  return candidate.campaignDeliveries.filter(
    (delivery) =>
      !includeQuery.campaignDeliveries.where ||
      delivery.artistId === includeQuery.campaignDeliveries.where.artistId
  );
}

function includeReconciliations(candidate, includeQuery) {
  if (!includeQuery?.reconciliations) return candidate.reconciliations;
  const where = includeQuery.reconciliations.where;
  const sorted = [...candidate.reconciliations].sort(
    (left, right) => right.createdAt - left.createdAt
  );
  const filtered = sorted.filter((entry) =>
    !where ||
    ((!where.artistId || entry.artistId == null || entry.artistId === where.artistId) &&
      (!where.outcome || where.outcome.in?.includes(entry.outcome)))
  );
  return includeQuery.reconciliations.take
    ? filtered.slice(0, includeQuery.reconciliations.take)
    : filtered;
}

test("approval_lifecycle_v2 classifies one-shot claims and durable reconciliation", () => {
  assert.equal(
    lifecycle.APPROVAL_LIFECYCLE_POLICY_VERSION,
    "approval_lifecycle_v2"
  );
  const cases = [
    [classifiable("proposed"), "pending_decision"],
    [classifiable("pending"), "pending_decision"],
    [classifiable("approved"), "approved_ready"],
    [
      classifiable("approved", "release_checklist_draft"),
      "approved_not_executable"
    ],
    [classifiable("approved", "drive_ensure_folder", true), "execution_unknown"],
    [
      classifiable("approved", "release_checklist_draft", true),
      "execution_unknown"
    ],
    [classifiable("failed"), "failed_needs_reconciliation"],
    [classifiable("failed", "drive_ensure_folder", true), "failed_needs_reconciliation"],
    [
      classifiable("failed", "drive_ensure_folder", true, [
        reconciliation("1", "still_unknown")
      ]),
      "failed_needs_reconciliation"
    ],
    [
      classifiable("approved", "drive_ensure_folder", true, [
        reconciliation("2", "external_effect_observed")
      ]),
      "reconciled_external_effect"
    ],
    [
      classifiable("failed", "drive_ensure_folder", true, [
        reconciliation("3", "no_external_effect_observed")
      ]),
      "reconciled_no_external_effect"
    ],
    [classifiable("executed"), null],
    [classifiable("rejected"), null],
    [classifiable("expired"), null]
  ];
  for (const [input, expected] of cases) {
    assert.equal(
      lifecycle.approvalLifecycleStage(input, now),
      expected,
      JSON.stringify(input)
    );
  }
  assert.equal(
    lifecycle.approvalLifecycleStage(
      classifiable("approved", "drive_ensure_folder", false, []),
      now
    ),
    "approved_ready"
  );
  assert.equal(
    lifecycle.approvalLifecycleStage(
      {
        ...classifiable("approved"),
        executionAttemptedAt: freshAttempt
      },
      now
    ),
    "execution_in_progress"
  );
});

test("the executable predicate is exact and partition counts are mutually exclusive", () => {
  for (const actionType of [
    "outbound_email_batch",
    "outbound_email_send_batch",
    "calendar_hold_batch",
    "drive_ensure_folder"
  ]) {
    assert.equal(lifecycle.approvalActionIsExecutable(actionType), true);
  }
  for (const actionType of [
    "release_checklist_draft",
    "google_calendar_create",
    "",
    "drive_ensure_folder_extra"
  ]) {
    assert.equal(lifecycle.approvalActionIsExecutable(actionType), false);
  }
  const partition = lifecycle.partitionApprovalLifecycle([
    classifiable("pending"),
    classifiable("approved"),
    {
      ...classifiable("approved"),
      executionAttemptedAt: freshAttempt
    },
    classifiable("approved", "drive_ensure_folder", true),
    classifiable("failed"),
    classifiable("failed", "drive_ensure_folder", true, [
      reconciliation("4", "external_effect_observed")
    ]),
    classifiable("approved", "drive_ensure_folder", true, [
      reconciliation("5", "no_external_effect_observed")
    ]),
    classifiable("approved", "release_checklist_draft"),
    classifiable("executed")
  ], now);
  assert.deepEqual(partition.counts, {
    pendingDecision: 1,
    readyToExecute: 1,
    executionInProgress: 1,
    needsReconciliation: 2,
    reconciled: 2,
    approvedNotExecutable: 1,
    attentionTotal: 4
  });
  assert.equal(
      partition.pendingDecision.length +
      partition.readyToExecute.length +
      partition.executionInProgress.length +
      partition.needsReconciliation.length +
      partition.reconciled.length +
      partition.approvedNotExecutable.length,
    8
  );
});

function serviceHarness(rows) {
  const queries = [];
  const client = {
    approvalRequest: {
      findMany: async (query) => {
        queries.push({ op: "findMany", query });
        const filtered = rows
          .filter((candidate) => rowMatchesWhere(candidate, query.where))
          .map((candidate) => ({
            ...candidate,
            campaignDeliveries: includeCampaignDeliveries(candidate, query.include),
            reconciliations: includeReconciliations(candidate, query.include)
          }));
        return applyPagination(applyOrdering(filtered, query.orderBy), query);
      },
      count: async (query) => {
        queries.push({ op: "count", query });
        return rows.filter((candidate) =>
          rowMatchesWhere(candidate, query.where)
        ).length;
      }
    }
  };
  const service = new approvalsMod.ApprovalsService(
    { client },
    { log: async () => undefined },
    { resolveForArtist: async () => { throw new Error("unused"); } },
    { enqueueApprovalNotify: async () => undefined }
  );
  return { service, queries };
}

test("work queue is tenant-scoped, capability-aware, and summarizes mixed delivery outcomes", async () => {
  const activeAttempt = new Date();
  const expiredAttempt = new Date(
    activeAttempt.getTime() - lifecycle.APPROVAL_EXECUTION_LEASE_MS - 1
  );
  const rows = [
    row("pending", "pending"),
    row("proposed", "proposed"),
    row("ready", "approved"),
    row("in-progress", "approved", { executionAttemptedAt: activeAttempt }),
    row("unknown", "approved", { executionAttemptedAt: expiredAttempt }),
    row("failed", "failed", {
      bookingCampaign: { id: "campaign-1", artistId: "artist-1" },
      campaignDeliveries: [
        { artistId: "artist-1", status: "sent" },
        { artistId: "artist-1", status: "failed" },
        { artistId: "artist-1", status: "unknown" },
        { artistId: "artist-2", status: "sent" }
      ]
    }),
    row("reconciled", "failed", {
      executionAttemptedAt: now,
      reconciliations: [
        reconciliation("6", "no_external_effect_observed")
      ]
    }),
    row("nonexec", "approved", {
      actionType: "release_checklist_draft",
      bookingCampaign: { id: "wrong-campaign", artistId: "artist-2" }
    }),
    row("terminal", "executed"),
    row("other-artist", "approved", {
      artistId: "artist-2",
      executionAttemptedAt: now
    })
  ];
  const { service, queries } = serviceHarness(rows);
  const result = await service.workQueue("artist-1", true);

  assert.equal(result.policyVersion, "approval_lifecycle_v2");
  assert.ok(Number.isFinite(Date.parse(result.observedAt)));
  assert.deepEqual(result.capabilities, {
    canDecide: true,
    canExecute: true,
    canReconcile: true
  });
  assert.deepEqual(result.counts, {
    pendingDecision: 2,
    readyToExecute: 1,
    executionInProgress: 1,
    needsReconciliation: 2,
    reconciled: 1,
    approvedNotExecutable: 1,
    attentionTotal: 5
  });
  assert.deepEqual(
    result.needsReconciliation.map((item) => item.lifecycleStage).sort(),
    ["execution_unknown", "failed_needs_reconciliation"]
  );
  assert.equal(result.executionInProgress.length, 1);
  assert.equal(result.executionInProgress[0].lifecycleStage, "execution_in_progress");
  assert.equal(result.executionInProgress[0].capabilities.canReconcile, false);
  assert.equal(result.executionInProgress[0].capabilities.canExecute, false);
  assert.equal(
    result.readyToExecute[0].capabilities.canExecute,
    true
  );
  assert.equal(
    result.needsReconciliation.every(
      (item) =>
        !item.capabilities.canExecute &&
        item.capabilities.canReconcile &&
        !item.capabilities.canRetry
    ),
    true
  );
  assert.equal(result.reconciled[0].lifecycleStage, "reconciled_no_external_effect");
  assert.equal(result.reconciled[0].capabilities.canExecute, false);
  assert.equal(result.reconciled[0].capabilities.canReconcile, false);
  assert.equal(result.reconciled[0].capabilities.canRetry, false);
  assert.equal(result.reconciled[0].terminalReconciliation.outcome, "no_external_effect_observed");
  assert.equal(result.approvedNotExecutable[0].capabilities.canExecute, false);
  assert.equal(result.approvedNotExecutable[0].campaignId, null);
  const failed = result.needsReconciliation.find(
    (item) => item.lifecycleStage === "failed_needs_reconciliation"
  );
  assert.equal(failed.campaignId, "campaign-1");
  assert.deepEqual(failed.deliverySummary, {
    total: 3,
    pending: 0,
    drafted: 0,
    sending: 0,
    sent: 1,
    failed: 1,
    unknown: 1
  });
  assert.equal(
    result.pendingDecision.every(
      (item) => item.capabilities.canApprove && item.capabilities.canReject
    ),
    true
  );
  assert.equal(
    [...result.pendingDecision, ...result.readyToExecute, ...result.executionInProgress, ...result.needsReconciliation]
      .some((item) => item.id === "other-artist"),
    false
  );
  const queueQuery = queries.find((entry) => entry.op === "findMany").query;
  assert.equal(queueQuery.where.artistId, "artist-1");
  assert.deepEqual(
    [...queueQuery.where.status.in].sort(),
    ["approved", "failed", "pending", "proposed"]
  );
  assert.equal(
    queueQuery.include.campaignDeliveries.where.artistId,
    "artist-1"
  );
  const countQueries = queries
    .filter((entry) => entry.op === "count")
    .map((entry) => entry.query.where.artistId);
  assert.deepEqual(countQueries, [
    "artist-1",
    "artist-1",
    "artist-1",
    "artist-1",
    "artist-1",
    "artist-1"
  ]);
});

test("viewer work queue preserves visibility while disabling every mutation", async () => {
  const { service } = serviceHarness([
    row("pending", "pending"),
    row("ready", "approved"),
    row("active", "approved", { executionAttemptedAt: new Date() }),
    row("failed", "failed")
  ]);
  const result = await service.workQueue("artist-1", false);
  assert.deepEqual(result.capabilities, {
    canDecide: false,
    canExecute: false,
    canReconcile: false
  });
  for (const item of [
    ...result.pendingDecision,
    ...result.readyToExecute,
    ...result.executionInProgress,
    ...result.needsReconciliation
  ]) {
    assert.deepEqual(item.capabilities, {
      canApprove: false,
      canReject: false,
      canExecute: false,
      canReconcile: false,
      canRetry: false
    });
  }
});

test("legacy ready-to-execute endpoint uses the shared executable predicate", async () => {
  const { service, queries } = serviceHarness([
    row("ready", "approved"),
    row("nonexec", "approved", { actionType: "release_checklist_draft" }),
    row("claimed", "approved", { executionAttemptedAt: now })
  ]);
  const result = await service.readyToExecute("artist-1");
  const readyQuery = queries.find((entry) => entry.op === "findMany").query;
  assert.deepEqual(
    readyQuery.where.actionType.in.sort(),
    ["calendar_hold_batch", "drive_ensure_folder", "outbound_email_batch", "outbound_email_send_batch", "booking_reply_confirm"].sort()
  );
  assert.equal(readyQuery.where.executionAttemptedAt, null);
  assert.deepEqual(result.map((item) => item.id), ["ready"]);
});

test("list and ready-to-execute endpoints apply limits and preserve bounded ready set", async () => {
  const rows = [
    row("pending-old", "pending", {
      createdAt: new Date("2026-07-14T09:00:00.000Z")
    }),
    row("pending-new", "pending", {
      createdAt: new Date("2026-07-14T10:00:00.000Z")
    }),
    row("approved-exec", "approved", {
      createdAt: new Date("2026-07-14T11:00:00.000Z"),
      approvedAt: new Date("2026-07-14T11:05:00.000Z")
    }),
    row("approved-nonexec", "approved", {
      actionType: "release_checklist_draft",
      createdAt: new Date("2026-07-14T12:00:00.000Z"),
      approvedAt: new Date("2026-07-14T12:05:00.000Z")
    }),
    row("approved-claimed", "approved", {
      createdAt: new Date("2026-07-14T13:00:00.000Z"),
      approvedAt: new Date("2026-07-14T13:05:00.000Z"),
      executionAttemptedAt: now
    })
  ];
  const { service, queries } = serviceHarness(rows);

  const list = await service.list("artist-1", undefined, {
    limit: 2,
    offset: 1
  });
  const pending = await service.pending("artist-1", {
    limit: 1,
    offset: 1
  });
  const ready = await service.readyToExecute("artist-1", {
    limit: 1,
    offset: 0
  });
  const queue = await service.workQueue("artist-1", true, {
    limit: 2,
    offset: 1
  });

  assert.equal(list.length, 2);
  assert.equal(pending.length, 1);
  assert.deepEqual(pending[0].id, "pending-new");
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, "approved-exec");
  assert.equal(queue.pendingDecision.length, 1);
  assert.ok(queue.readyToExecute.length <= 1);
  assert.equal(queue.counts.readyToExecute, 1);

  const listQuery = queries
    .filter((entry) => entry.op === "findMany")
    .find((entry) => entry.query.orderBy?.createdAt === "desc").query;
  const pendingQuery = queries
    .filter((entry) => entry.op === "findMany")
    .find((entry) => entry.query.orderBy?.createdAt === "asc" && entry.query.where.status?.in?.includes("pending")).query;
  const readyQuery = queries
    .filter((entry) => entry.op === "findMany")
    .find((entry) => entry.query.orderBy?.approvedAt === "asc").query;
  assert.deepEqual(
    { take: listQuery.take, skip: listQuery.skip },
    { take: 2, skip: 1 }
  );
  assert.deepEqual(
    { take: pendingQuery.take, skip: pendingQuery.skip },
    { take: 1, skip: 1 }
  );
  assert.deepEqual(
    { take: readyQuery.take, skip: readyQuery.skip },
    { take: 1, skip: 0 }
  );
  assert.equal(
    readyQuery.where.executionAttemptedAt === null,
    true
  );
  assert.deepEqual(
    readyQuery.where.actionType.in.sort(),
    ["calendar_hold_batch", "drive_ensure_folder", "outbound_email_batch", "outbound_email_send_batch", "booking_reply_confirm"].sort()
  );
});
