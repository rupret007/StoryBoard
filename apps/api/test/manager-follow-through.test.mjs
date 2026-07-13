import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const importedFollowThrough = await import(pathToFileURL(join(dir, "..", "dist", "manager", "manager-follow-through.js")).href);
const followThrough = importedFollowThrough.default ?? importedFollowThrough;

const now = new Date("2026-07-13T18:00:00.000Z");
const earlier = new Date("2026-07-13T17:00:00.000Z");
const recent = new Date("2026-07-13T17:30:00.000Z");

function approval(
  id,
  status,
  { attempted = false, attemptedAt = earlier, updatedAt = now, reconciliations = [] } = {}
) {
  return {
    id,
    title: `Approval ${id}`,
    status,
    actionType: id.includes("drive") ? "drive_ensure_folder" : "calendar_hold_batch",
    executionAttemptedAt: attempted ? attemptedAt : null,
    approvedAt: status === "approved" ? earlier : null,
    updatedAt,
    reconciliations
  };
}

function reconciliation(outcome, createdAt = now) {
  return { outcome, createdAt };
}

function source(approvals, overrides = {}) {
  return {
    id: "recommendation-mixed-batch",
    title: "Prepare show logistics",
    workstream: "live",
    priority: "high",
    outcome: "blocked",
    outcomeReason: "approval_failed",
    nextAction: "Review the approval batch.",
    proposedAction: { type: "prepare_event_logistics_approvals", eventId: "event-a" },
    createdAt: earlier,
    updatedAt: now,
    outcomeAt: now,
    task: null,
    decision: null,
    project: null,
    event: null,
    approvals,
    ...overrides
  };
}

test("an ambiguous provider attempt outranks failed, rejected, and expired sibling approvals", () => {
  for (const siblingStatus of ["failed", "rejected", "expired"]) {
    const attempted = approval("calendar-attempted", "approved", { attempted: true, updatedAt: earlier });
    const sibling = approval(`drive-${siblingStatus}`, siblingStatus, { updatedAt: now });
    const item = followThrough.projectManagerFollowThrough(source([sibling, attempted]), now);

    assert.equal(item.state, "blocked");
    assert.equal(item.stage, "execution_unknown");
    assert.equal(item.target.id, attempted.id);
    assert.equal(item.target.status, "execution_unknown");
    assert.equal(item.canReconcile, false);
    assert.match(item.detail, /no final result/i);
    assert.match(item.detail, /not safe/i);
    assert.match(item.nextAction, /reconcile/i);
  }
});

test("a fresh one-shot provider claim stays in motion and cannot be reconciled", () => {
  const active = approval("calendar-active", "approved", {
    attempted: true,
    attemptedAt: recent
  });
  const item = followThrough.projectManagerFollowThrough(source([active]), now);

  assert.equal(item.state, "in_motion");
  assert.equal(item.stage, "execution_in_progress");
  assert.equal(item.target.id, active.id);
  assert.equal(item.target.status, "execution_in_progress");
  assert.equal(item.canReconcile, false);
  assert.match(item.detail, /may still be running/i);
  assert.match(item.nextAction, /wait for the final result/i);
  assert.match(item.nextAction, /will not offer reconciliation or a replacement/i);
});

test("a finalized failed approval remains a normal approval failure when no execution is ambiguous", () => {
  const failed = approval("calendar-failed", "failed");
  const rejected = approval("drive-rejected", "rejected", { updatedAt: earlier });
  const item = followThrough.projectManagerFollowThrough(source([rejected, failed]), now);

  assert.equal(item.state, "blocked");
  assert.equal(item.stage, "approval_failed");
  assert.equal(item.target.id, failed.id);
  assert.equal(item.canReconcile, false);
  assert.match(item.nextAction, /Open Approvals/i);
});

test("a still-unknown receipt keeps Manager blocked and sends reconciliation to Approvals", () => {
  const attempted = approval("calendar-attempted", "approved", {
    attempted: true,
    reconciliations: [reconciliation("still_unknown")]
  });
  const item = followThrough.projectManagerFollowThrough(source([attempted]), now);

  assert.equal(item.state, "blocked");
  assert.equal(item.stage, "execution_unknown");
  assert.equal(item.canReconcile, false);
  assert.equal(item.destination.href, "/approvals");
  assert.match(item.detail, /not safe/i);
  assert.match(item.nextAction, /reconcile the provider result/i);
  assert.doesNotMatch(item.nextAction, /retry it/i);
});

test("observed external effects keep follow-through blocked until linked records are repaired", () => {
  const attempted = approval("calendar-attempted", "approved", {
    attempted: true,
    reconciliations: [reconciliation("external_effect_observed")]
  });
  const item = followThrough.projectManagerFollowThrough(
    source([attempted], {
      outcome: "accepted",
      outcomeReason: "approval_prepared"
    }),
    now
  );

  assert.equal(item.state, "blocked");
  assert.equal(item.stage, "reconciled");
  assert.equal(item.status, "External effect observed — repair required");
  assert.equal(item.canReconcile, false);
  assert.equal(item.target.status, "reconciled_external_effect");
  assert.match(item.detail, /does not prove the full batch succeeded/i);
  assert.match(item.detail, /does not .*repair StoryBoard's linked records/i);
  assert.match(item.nextAction, /record a task/i);
  assert.match(item.nextAction, /StoryBoard cannot link here/i);
  assert.match(item.nextAction, /do not run the original request again/i);
});

test("an observed external effect outranks a no-effect sibling and keeps the whole batch repair-required", () => {
  const noEffect = approval("drive-no-effect", "failed", {
    attempted: true,
    updatedAt: now,
    reconciliations: [
      reconciliation(
        "no_external_effect_observed",
        new Date("2026-07-13T17:30:00.000Z")
      )
    ]
  });
  const externalEffect = approval("calendar-external-effect", "approved", {
    attempted: true,
    updatedAt: earlier,
    reconciliations: [reconciliation("external_effect_observed", earlier)]
  });
  const item = followThrough.projectManagerFollowThrough(
    source([noEffect, externalEffect], {
      outcome: "blocked",
      outcomeReason: "approval_reconciled_external_effect_needs_repair"
    }),
    now
  );

  assert.equal(item.state, "blocked");
  assert.equal(item.stage, "reconciled");
  assert.equal(item.status, "External effect observed — repair required");
  assert.equal(item.target.id, externalEffect.id);
  assert.equal(item.target.status, "reconciled_external_effect");
  assert.equal(item.canReconcile, false);
  assert.match(item.nextAction, /record a task/i);
  assert.doesNotMatch(item.status, /complete/i);
});

test("an observed external effect outranks an unresolved sibling and names both required reviews", () => {
  const unknown = approval("drive-unknown", "approved", {
    attempted: true,
    updatedAt: now
  });
  const externalEffect = approval("calendar-external-effect", "approved", {
    attempted: true,
    updatedAt: earlier,
    reconciliations: [reconciliation("external_effect_observed", earlier)]
  });
  const item = followThrough.projectManagerFollowThrough(
    source([unknown, externalEffect]),
    now
  );

  assert.equal(item.state, "blocked");
  assert.equal(item.stage, "reconciled");
  assert.equal(item.target.id, externalEffect.id);
  assert.equal(item.target.status, "reconciled_external_effect");
  assert.match(item.detail, /still has an unresolved provider outcome/i);
  assert.match(item.nextAction, /reconcile every remaining provider outcome/i);
  assert.match(item.nextAction, /record a task/i);
  assert.match(item.nextAction, /do not run the original requests again/i);
});

test("no observed external effect closes the original request but requires a separately reviewed replacement", () => {
  const failed = approval("drive-failed", "failed", {
    attempted: true,
    reconciliations: [reconciliation("no_external_effect_observed")]
  });
  const item = followThrough.projectManagerFollowThrough(source([failed]), now);

  assert.equal(item.state, "blocked");
  assert.equal(item.stage, "reconciled");
  assert.equal(item.status, "No external effect found");
  assert.equal(item.canReconcile, false);
  assert.equal(item.target.status, "reconciled_no_external_effect");
  assert.match(item.detail, /original request remains closed/i);
  assert.match(item.detail, /was not retried/i);
  assert.match(item.nextAction, /separate, newly reviewed request/i);
});

test("rejected and expired approvals are final non-reconcilable decisions, not failed receipts", () => {
  for (const status of ["rejected", "expired"]) {
    const stopped = approval(`calendar-${status}`, status);
    const item = followThrough.projectManagerFollowThrough(source([stopped], {
      outcome: "dismissed",
      outcomeReason: "approval_rejected"
    }), now);

    assert.equal(item.state, "blocked");
    assert.equal(item.stage, "approval_rejected");
    assert.equal(item.outcome, "dismissed");
    assert.equal(item.target.id, stopped.id);
    assert.equal(item.target.status, status);
    assert.match(item.detail, /no provider action is authorized/i);
    assert.match(item.nextAction, /separate reviewed request/i);
    assert.match(item.nextAction, /do not retry/i);
  }
});

test("an approved non-provider record is complete and is never offered for execution", () => {
  const record = approval("release-checklist", "approved");
  record.actionType = "release_checklist_draft";
  const item = followThrough.projectManagerFollowThrough(source([record], {
    outcome: "accepted",
    outcomeReason: "approval_prepared"
  }), now);

  assert.equal(item.state, "completed");
  assert.equal(item.stage, "internal_change_complete");
  assert.match(item.status, /no execution step/i);
  assert.doesNotMatch(item.nextAction, /execute/i);
});
