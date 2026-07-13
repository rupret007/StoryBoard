import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const importedFollowThrough = await import(pathToFileURL(join(dir, "..", "dist", "manager", "manager-follow-through.js")).href);
const followThrough = importedFollowThrough.default ?? importedFollowThrough;

const now = new Date("2026-07-13T18:00:00.000Z");
const earlier = new Date("2026-07-13T17:00:00.000Z");

function approval(id, status, { attempted = false, updatedAt = now } = {}) {
  return {
    id,
    title: `Approval ${id}`,
    status,
    actionType: id.includes("drive") ? "drive_ensure_folder" : "calendar_hold_batch",
    executionAttemptedAt: attempted ? earlier : null,
    approvedAt: status === "approved" ? earlier : null,
    updatedAt
  };
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
    assert.match(item.detail, /no final result/i);
    assert.match(item.detail, /not safe/i);
    assert.match(item.nextAction, /reconcile/i);
  }
});

test("a finalized failed approval remains a normal approval failure when no execution is ambiguous", () => {
  const failed = approval("calendar-failed", "failed");
  const rejected = approval("drive-rejected", "rejected", { updatedAt: earlier });
  const item = followThrough.projectManagerFollowThrough(source([rejected, failed]), now);

  assert.equal(item.state, "blocked");
  assert.equal(item.stage, "approval_failed");
  assert.equal(item.target.id, failed.id);
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
