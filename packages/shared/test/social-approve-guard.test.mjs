import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("approve-and-post stays open while the drop is waiting for Jeff", () => {
  assert.equal(
    shared.socialApproveAndPostBlockReason({
      postStatus: "pending_approval",
      approvalStatus: "pending"
    }),
    null
  );
  assert.match(
    shared.socialApproveAndPostBlockReason({
      postStatus: "pending_approval",
      approvalStatus: "approved"
    }),
    /already approved/i
  );
});

test("approve-and-post stays open while the drop awaits its first owner claim", () => {
  assert.equal(
    shared.socialApproveAndPostBlockReason({
      postStatus: "approved",
      approvalStatus: "pending"
    }),
    null
  );
});

test("approve-and-post is blocked after a send so captions cannot be rewritten", () => {
  assert.match(
    shared.socialApproveAndPostBlockReason({
      postStatus: "posted",
      approvalStatus: "executed"
    }),
    /already posted/i
  );
  assert.match(
    shared.socialApproveAndPostBlockReason({
      postStatus: "partial",
      approvalStatus: "executed"
    }),
    /already has a posting attempt/i
  );
  assert.match(
    shared.socialApproveAndPostBlockReason({
      postStatus: "failed",
      approvalStatus: "failed"
    }),
    /already failed/i
  );
  assert.match(
    shared.socialApproveAndPostBlockReason({
      postStatus: "posting",
      approvalStatus: "approved"
    }),
    /already posting/i
  );
});

test("finished mock/private and uncertain receipts never claim a public post or a safe retry", () => {
  for (const postStatus of ["simulated", "private_upload", "draft_only", "processing", "unknown", "failed", "partial"]) {
    const reason = shared.socialApproveAndPostBlockReason({ postStatus, approvalStatus: "executed" });
    assert.equal(typeof reason, "string");
    assert.doesNotMatch(reason, /already posted|nothing extra was sent|try again/i);
  }
  for (const approvalStatus of ["rejected", "expired"]) {
    assert.match(shared.socialApproveAndPostBlockReason({ postStatus: "pending_approval", approvalStatus }), /closed/);
  }
});

test("a target that already has a platform id is not sent again", () => {
  assert.equal(shared.shouldSendSocialTarget({ enabled: true, existingExternalPostId: null, status: "pending" }), true);
  assert.equal(shared.shouldSendSocialTarget({ enabled: true, existingExternalPostId: "  ", status: "draft" }), true);
  assert.equal(shared.shouldSendSocialTarget({ enabled: false, existingExternalPostId: null, status: "pending" }), false);
  assert.equal(
    shared.shouldSendSocialTarget({ enabled: true, existingExternalPostId: "fb_123", status: "pending" }),
    false
  );
  for (const status of ["failed", "unknown", "processing", "sending", "posted"]) {
    assert.equal(
      shared.shouldSendSocialTarget({ enabled: true, existingExternalPostId: null, status }),
      false
    );
  }
});
