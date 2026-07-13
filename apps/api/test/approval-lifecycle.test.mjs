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
        queries.push(query);
        const statuses = query.where.status?.in ??
          (typeof query.where.status === "string" ? [query.where.status] : null);
        return rows
          .filter(
            (candidate) =>
              candidate.artistId === query.where.artistId &&
              (!statuses || statuses.includes(candidate.status)) &&
              (query.where.executionAttemptedAt !== null ||
                candidate.executionAttemptedAt === null)
          )
          .map((candidate) => ({
            ...candidate,
            campaignDeliveries: query.include?.campaignDeliveries
              ? candidate.campaignDeliveries.filter(
                  (delivery) =>
                    delivery.artistId ===
                    query.include.campaignDeliveries.where.artistId
                )
              : candidate.campaignDeliveries
          }));
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
  assert.equal(queries[0].where.artistId, "artist-1");
  assert.deepEqual(
    [...queries[0].where.status.in].sort(),
    ["approved", "failed", "pending", "proposed"]
  );
  assert.equal(
    queries[0].include.campaignDeliveries.where.artistId,
    "artist-1"
  );
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
  const { service } = serviceHarness([
    row("ready", "approved"),
    row("nonexec", "approved", { actionType: "release_checklist_draft" }),
    row("claimed", "approved", { executionAttemptedAt: now })
  ]);
  const result = await service.readyToExecute("artist-1");
  assert.deepEqual(result.map((item) => item.id), ["ready"]);
});
