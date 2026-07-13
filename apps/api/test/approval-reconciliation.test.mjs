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
const [policy, approvalsMod] = await Promise.all([
  load("approvals/approval-reconciliation.js"),
  load("approvals/approvals.service.js")
]);

const observedAt = "2026-07-13T12:00:00.000Z";
const uuid = "c71cf1f2-5510-4fcb-a02e-a97965152a64";

function validInput(overrides = {}) {
  return {
    outcome: "still_unknown",
    note: "Checked the provider console and the result is still unclear.",
    checkedLocation: "Google Calendar web interface",
    providerReference: null,
    observedAt,
    idempotencyKey: uuid,
    ...overrides
  };
}

test("approval reconciliation boundary is strict and requires evidence for an observed effect", () => {
  assert.equal(
    policy.APPROVAL_RECONCILIATION_POLICY_VERSION,
    "approval_reconciliation_v1"
  );
  assert.equal(policy.approvalReconciliationInputSchema.safeParse(validInput()).success, true);
  assert.equal(
    policy.approvalReconciliationInputSchema.safeParse({
      ...validInput(),
      unexpected: "not accepted"
    }).success,
    false
  );
  assert.equal(
    policy.approvalReconciliationInputSchema.safeParse(
      validInput({ outcome: "external_effect_observed" })
    ).success,
    false
  );
  assert.equal(
    policy.approvalReconciliationInputSchema.safeParse(
      validInput({
        outcome: "external_effect_observed",
        providerReference: "calendar-event-123"
      })
    ).success,
    true
  );
});

test("approval reconciliation evidence rejects credential-shaped values without echoing them", () => {
  const cases = [
    { note: "Checked api_key=do-not-store-this in the provider console." },
    { checkedLocation: "https://operator:password@example.invalid/calendar" },
    { providerReference: "Authorization: Bearer do-not-store-this" },
    { note: "Observed token eyJheader.payload.signature while checking logs." }
  ];
  for (const override of cases) {
    const parsed = policy.approvalReconciliationInputSchema.safeParse(
      validInput(override)
    );
    assert.equal(parsed.success, false, JSON.stringify(override));
    assert.match(
      JSON.stringify(parsed.error.flatten()),
      /Do not store credentials or access tokens/
    );
    assert.doesNotMatch(JSON.stringify(parsed.error.flatten()), /do-not-store-this/);
  }
});

test("approval reconciliation helpers deterministically select latest and terminal evidence", () => {
  const first = {
    outcome: "external_effect_observed",
    createdAt: new Date("2026-07-13T10:00:00.000Z")
  };
  const newest = {
    outcome: "still_unknown",
    createdAt: new Date("2026-07-13T12:00:00.000Z")
  };
  const laterTerminal = {
    outcome: "no_external_effect_observed",
    createdAt: new Date("2026-07-13T11:00:00.000Z")
  };
  const rows = [first, newest, laterTerminal];

  assert.equal(policy.approvalReconciliationIsConclusive("still_unknown"), false);
  assert.equal(
    policy.approvalReconciliationIsConclusive("external_effect_observed"),
    true
  );
  assert.equal(policy.latestApprovalReconciliation(rows), newest);
  assert.equal(policy.terminalApprovalReconciliation(rows), laterTerminal);
  assert.deepEqual(rows, [first, newest, laterTerminal], "helper must not reorder caller state");
  assert.deepEqual(policy.approvalReconciliationEvidence(validInput()), {
    checkedLocation: "Google Calendar web interface",
    providerReference: null
  });
});

test("idempotency intent comparison normalizes timestamps but rejects changed evidence", () => {
  const input = validInput();
  const stored = {
    outcome: input.outcome,
    note: input.note,
    evidence: policy.approvalReconciliationEvidence(input),
    observedAt: new Date("2026-07-13T07:00:00.000-05:00")
  };
  assert.equal(policy.approvalReconciliationIntentMatches(stored, input), true);
  assert.equal(
    policy.approvalReconciliationIntentMatches(stored, {
      ...input,
      checkedLocation: "Google Calendar mobile app"
    }),
    false
  );
  assert.equal(
    policy.approvalReconciliationIntentMatches(stored, {
      ...input,
      note: "A different observation that is long enough to be accepted."
    }),
    false
  );
});

test("known provider effects are detected narrowly and mock references are not treated as real", () => {
  assert.equal(
    policy.approvalReconciliationHasKnownExternalEffect({
      actionType: "calendar_hold_batch",
      payload: {
        executionResult: {
          calendarMode: "google",
          holds: [{ eventId: "calendar-event-123" }]
        }
      }
    }),
    true
  );
  assert.equal(
    policy.approvalReconciliationHasKnownExternalEffect({
      actionType: "outbound_email_batch",
      campaignDeliveries: [
        {
          status: "drafted",
          providerDraftId: "gmail-draft-123",
          providerMessageId: null,
          providerThreadId: null
        }
      ]
    }),
    true
  );
  assert.equal(
    policy.approvalReconciliationHasKnownExternalEffect({
      actionType: "calendar_hold_batch",
      payload: {
        executionResult: {
          calendarMode: "mock",
          holds: [{ eventId: "mock-calendar-event" }]
        }
      }
    }),
    false
  );
  assert.equal(
    policy.approvalReconciliationHasKnownExternalEffect({
      actionType: "drive_ensure_folder",
      payload: { executionResult: { driveMode: "google" } }
    }),
    false,
    "absence of a stable provider reference must not be treated as proof"
  );
});

function serviceHarness({
  status = "failed",
  attempted = true,
  executionAttemptedAt = undefined,
  actionType = "calendar_hold_batch",
  payload = {},
  campaignDeliveries = [],
  managerRecommendationId = null,
  siblingApprovals = []
} = {}) {
  const approval = {
    id: "approval-1",
    artistId: "artist-1",
    status,
    actionType,
    payload,
    campaignDeliveries,
    executionAttemptedAt: attempted
      ? executionAttemptedAt ?? new Date("2026-07-13T11:00:00.000Z")
      : null,
    managerRecommendationId
  };
  const receipts = [];
  const audits = [];
  const managerRecommendation = managerRecommendationId
    ? {
        id: managerRecommendationId,
        outcome: "accepted",
        outcomeReason: "approval_prepared",
        outcomeAt: null
      }
    : null;
  let approvalWrites = 0;
  const findReceipt = (artistId, idempotencyKey) =>
    receipts.find(
      (row) => row.artistId === artistId && row.idempotencyKey === idempotencyKey
    ) ?? null;
  const transaction = {
    approvalRequest: {
      findFirst: async ({ where }) => {
        if (where.id !== approval.id || where.artistId !== approval.artistId) return null;
        return {
          ...approval,
          reconciliations: receipts
            .filter(
              (row) =>
                row.approvalId === approval.id &&
                row.outcome !== "still_unknown"
            )
            .sort((left, right) => right.createdAt - left.createdAt)
            .slice(0, 1)
        };
      },
      findMany: async ({ where }) => {
        if (
          where.artistId !== approval.artistId ||
          where.managerRecommendationId !== managerRecommendationId
        ) {
          return [];
        }
        return [approval, ...siblingApprovals].map((row) => ({
          id: row.id,
          eventId: row.eventId ?? null,
          sourceKey: row.sourceKey ?? null,
          actionType: row.actionType ?? "calendar_hold_batch",
          status: row.status,
          executionAttemptedAt: row.executionAttemptedAt ?? null,
          payload: row.payload ?? {},
          reconciliations: [
            ...(row.id === approval.id
              ? receipts.filter(
                  (receipt) =>
                    receipt.approvalId === row.id &&
                    receipt.outcome !== "still_unknown"
                )
              : (row.reconciliations ?? []))
          ]
            .sort((left, right) => right.createdAt - left.createdAt)
            .slice(0, 1)
        }));
      },
      update: async () => {
        approvalWrites += 1;
        throw new Error("reconciliation must not mutate the original approval");
      }
    },
    approvalReconciliation: {
      findUnique: async ({ where }) => {
        const key = where.artistId_idempotencyKey;
        return findReceipt(key.artistId, key.idempotencyKey);
      },
      create: async ({ data }) => {
        const row = {
          id: `receipt-${receipts.length + 1}`,
          ...data,
          createdAt: new Date(`2026-07-13T12:0${receipts.length}:01.000Z`)
        };
        receipts.push(row);
        return row;
      }
    },
    auditEvent: {
      create: async ({ data }) => {
        audits.push(data);
        return data;
      }
    },
    managerRecommendation: {
      findFirst: async ({ where }) =>
        managerRecommendation?.id === where.id
          ? { ...managerRecommendation }
          : null,
      update: async ({ where, data }) => {
        assert.equal(where.id, managerRecommendation?.id);
        Object.assign(managerRecommendation, data);
        return { ...managerRecommendation };
      },
      updateMany: async () => ({ count: 0 })
    }
  };
  const client = {
    $transaction: async (callback) => callback(transaction),
    approvalRequest: {
      findFirst: async ({ where }) =>
        where.id === approval.id && where.artistId === approval.artistId
          ? { ...approval }
          : null
    },
    approvalReconciliation: {
      findUnique: transaction.approvalReconciliation.findUnique,
      findMany: async ({ where }) =>
        receipts
          .filter(
            (row) =>
              row.artistId === where.artistId && row.approvalId === where.approvalId
          )
          .sort((left, right) => right.createdAt - left.createdAt),
      findFirst: async ({ where }) =>
        receipts
          .filter(
            (row) =>
              row.artistId === where.artistId &&
              row.approvalId === where.approvalId &&
              where.outcome.in.includes(row.outcome)
          )
          .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
    }
  };
  const service = new approvalsMod.ApprovalsService(
    { client },
    { log: async () => undefined },
    { resolveForArtist: async () => { throw new Error("unused"); } },
    { enqueueApprovalNotify: async () => undefined }
  );
  return {
    service,
    approval,
    receipts,
    audits,
    managerRecommendation,
    approvalWrites: () => approvalWrites
  };
}

test("still-unknown receipts are append-only, audited, unresolved, and idempotent", async () => {
  const harness = serviceHarness();
  const input = validInput();
  const created = await harness.service.recordReconciliation(
    "artist-1",
    "approval-1",
    input,
    "member@test.invalid",
    "operator-1"
  );
  const replay = await harness.service.recordReconciliation(
    "artist-1",
    "approval-1",
    input,
    "member@test.invalid",
    "operator-1"
  );
  const read = await harness.service.reconciliations(
    "artist-1",
    "approval-1",
    true
  );

  assert.equal(created.created, true);
  assert.equal(replay.created, false);
  assert.equal(created.receipt.id, replay.receipt.id);
  assert.equal(harness.receipts.length, 1);
  assert.equal(harness.audits.length, 1);
  assert.equal(harness.approvalWrites(), 0);
  assert.equal(harness.approval.status, "failed");
  assert.equal(read.resolved, false);
  assert.equal(read.resolutionOutcome, null);
  assert.deepEqual(read.capabilities, { canReconcile: true, canRetry: false });
});

test("a fresh one-shot execution claim cannot be reconciled while provider work may still be running", async () => {
  const harness = serviceHarness({
    status: "approved",
    attempted: true,
    executionAttemptedAt: new Date()
  });

  const read = await harness.service.reconciliations(
    "artist-1",
    "approval-1",
    true
  );
  assert.deepEqual(read.capabilities, { canReconcile: false, canRetry: false });
  await assert.rejects(
    harness.service.recordReconciliation(
      "artist-1",
      "approval-1",
      validInput(),
      "member@test.invalid",
      "operator-1"
    ),
    /execution is still in progress/i
  );
  assert.equal(harness.receipts.length, 0);
  assert.equal(harness.audits.length, 0);
});

test("reconciliation evidence cannot predate an attempt or be collected inside an expired claim's lease window", async () => {
  const preAttempt = serviceHarness({
    status: "failed",
    attempted: true,
    executionAttemptedAt: new Date("2026-07-13T11:00:00.000Z")
  });
  await assert.rejects(
    preAttempt.service.recordReconciliation(
      "artist-1",
      "approval-1",
      validInput({
        observedAt: "2026-07-13T10:59:59.000Z",
        idempotencyKey: "d94a5aba-d542-447f-85ed-e31cd6f586fe"
      }),
      "member@test.invalid",
      "operator-1"
    ),
    /must be observed after the execution attempt/i
  );

  const attemptAt = new Date(Date.now() - 90 * 60 * 1000);
  const withinLease = serviceHarness({
    status: "approved",
    attempted: true,
    executionAttemptedAt: attemptAt
  });
  await assert.rejects(
    withinLease.service.recordReconciliation(
      "artist-1",
      "approval-1",
      validInput({
        observedAt: new Date(attemptAt.getTime() + 30 * 60 * 1000).toISOString(),
        idempotencyKey: "16fd8357-3cf9-44cc-819b-aeb97ef917d2"
      }),
      "member@test.invalid",
      "operator-1"
    ),
    /must be collected after the execution lease ends/i
  );
  assert.equal(preAttempt.receipts.length, 0);
  assert.equal(withinLease.receipts.length, 0);
});

test("a conclusive receipt resolves review without mutating or re-executing the approval", async () => {
  for (const [outcome, providerReference] of [
    ["external_effect_observed", "calendar-event-123"],
    ["no_external_effect_observed", null]
  ]) {
    const harness = serviceHarness({ status: "approved", attempted: true });
    await harness.service.recordReconciliation(
      "artist-1",
      "approval-1",
      validInput({
        outcome,
        providerReference,
        idempotencyKey:
          outcome === "external_effect_observed"
            ? "a2e9da91-0ca4-4d79-87bb-7ab0c203ca9a"
            : "a89973ba-0c62-4e11-b11d-ecc23b315fa9"
      }),
      "member@test.invalid",
      "operator-1"
    );
    const read = await harness.service.reconciliations(
      "artist-1",
      "approval-1",
      true
    );

    assert.equal(read.resolved, true);
    assert.equal(read.resolutionOutcome, outcome);
    assert.deepEqual(read.capabilities, { canReconcile: false, canRetry: false });
    assert.equal(harness.approvalWrites(), 0);
    assert.equal(harness.approval.status, "approved");
    assert.equal(harness.approval.executionAttemptedAt instanceof Date, true);
    await assert.rejects(
      harness.service.recordReconciliation(
        "artist-1",
        "approval-1",
        validInput({
          idempotencyKey: "fbe87ded-b770-40ba-afd8-4d93ad718f39"
        }),
        "member@test.invalid",
        "operator-1"
      ),
      /already final/
    );
  }
});

test("a contradictory no-effect receipt is rejected when StoryBoard already saved a provider effect", async () => {
  const harness = serviceHarness({
    status: "failed",
    attempted: true,
    payload: {
      executionResult: {
        calendarMode: "google",
        holds: [{ eventId: "calendar-event-123" }]
      }
    }
  });

  await assert.rejects(
    harness.service.recordReconciliation(
      "artist-1",
      "approval-1",
      validInput({
        outcome: "no_external_effect_observed",
        idempotencyKey: "bc09e7ce-5cb4-4fc4-99dc-c62628a3053a"
      }),
      "member@test.invalid",
      "operator-1"
    ),
    /already has a recorded external effect/
  );
  assert.equal(harness.receipts.length, 0);
  assert.equal(harness.audits.length, 0);
  assert.equal(harness.approvalWrites(), 0);
});

test("an external-effect receipt keeps a mixed Manager approval batch blocked and repair-required", async () => {
  const harness = serviceHarness({
    status: "approved",
    attempted: true,
    managerRecommendationId: "manager-recommendation-1",
    siblingApprovals: [
      {
        id: "approval-2",
        artistId: "artist-1",
        managerRecommendationId: "manager-recommendation-1",
        actionType: "drive_ensure_folder",
        status: "failed",
        executionAttemptedAt: new Date("2026-07-13T10:00:00.000Z"),
        payload: {},
        reconciliations: [
          {
            outcome: "no_external_effect_observed",
            createdAt: new Date("2026-07-13T11:30:00.000Z")
          }
        ]
      },
      {
        id: "approval-3",
        artistId: "artist-1",
        managerRecommendationId: "manager-recommendation-1",
        actionType: "calendar_hold_batch",
        status: "approved",
        executionAttemptedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        payload: {},
        reconciliations: []
      }
    ]
  });

  await harness.service.recordReconciliation(
    "artist-1",
    "approval-1",
    validInput({
      outcome: "external_effect_observed",
      providerReference: "calendar-event-123",
      idempotencyKey: "68540dda-6bb5-4be7-9419-88a49bd39e18"
    }),
    "member@test.invalid",
    "operator-1"
  );

  assert.equal(harness.managerRecommendation.outcome, "blocked");
  assert.equal(
    harness.managerRecommendation.outcomeReason,
    "approval_reconciled_external_effect_needs_repair"
  );
  assert.notEqual(harness.managerRecommendation.outcome, "completed");
  const managerAudit = harness.audits.find(
    (audit) =>
      audit.action === "manager.recommendation_approval_reconciled"
  );
  assert.ok(managerAudit);
  assert.equal(managerAudit.severity, "warning");
  assert.equal(managerAudit.metadata.outcome, "blocked");
  assert.equal(
    managerAudit.metadata.outcomeReason,
    "approval_reconciled_external_effect_needs_repair"
  );
  assert.deepEqual(managerAudit.metadata.reconciliationOutcomes.filter(Boolean).sort(), [
    "external_effect_observed",
    "no_external_effect_observed"
  ]);
  assert.equal(managerAudit.metadata.reconciliationOutcomes.includes(null), true);
});

test("service rejects foreign approvals, non-reconcilable states, future evidence, and changed idempotent intent", async () => {
  const foreign = serviceHarness();
  await assert.rejects(
    foreign.service.recordReconciliation(
      "artist-2",
      "approval-1",
      validInput(),
      "member@test.invalid",
      "operator-1"
    ),
    /Approval not found/
  );

  const untouched = serviceHarness({ status: "approved", attempted: false });
  await assert.rejects(
    untouched.service.recordReconciliation(
      "artist-1",
      "approval-1",
      validInput(),
      "member@test.invalid",
      "operator-1"
    ),
    /does not have an uncertain or failed execution/
  );

  const future = serviceHarness();
  await assert.rejects(
    future.service.recordReconciliation(
      "artist-1",
      "approval-1",
      validInput({ observedAt: "2999-01-01T00:00:00.000Z" }),
      "member@test.invalid",
      "operator-1"
    ),
    /cannot be in the future/
  );

  const conflict = serviceHarness();
  await conflict.service.recordReconciliation(
    "artist-1",
    "approval-1",
    validInput(),
    "member@test.invalid",
    "operator-1"
  );
  await assert.rejects(
    conflict.service.recordReconciliation(
      "artist-1",
      "approval-1",
      validInput({ checkedLocation: "Google Calendar mobile app" }),
      "member@test.invalid",
      "operator-1"
    ),
    /idempotency key is already used for different evidence/
  );
});
