import test from "node:test";
import assert from "node:assert/strict";
import { canApproveSocialPost, socialReceiptLabel, SOCIAL_APPROVAL_UNCERTAIN } from "../dist/index.js";

test("only a confirmed published receipt with an ID is called public", () => {
  assert.equal(socialReceiptLabel({ status: "posted", externalPostId: "real-id" }), "Public post confirmed");
  assert.equal(socialReceiptLabel({ status: "posted", externalPostId: null }), "Publication unconfirmed");
  for (const status of ["simulated", "private_upload", "processing", "draft_only", "sending", "unknown", "failed"]) {
    assert.notEqual(socialReceiptLabel({ status, externalPostId: "not-public-proof" }), "Public post confirmed");
  }
  assert.match(socialReceiptLabel({ status: "simulated", externalPostId: "mock-id" }), /nothing sent/);
  assert.match(socialReceiptLabel({ status: "private_upload", externalPostId: "video-id" }), /not public/);
  assert.match(SOCIAL_APPROVAL_UNCERTAIN, /send may have started/);
});

test("only an owner reviewing an unsent pending approval can approve", () => {
  const pending = { isOwner: true, approvalStatus: "pending", postStatus: "pending_approval", hasEnabledTarget: true };
  assert.equal(canApproveSocialPost(pending), true);
  assert.equal(canApproveSocialPost({ ...pending, isOwner: false }), false);
  assert.equal(canApproveSocialPost({ ...pending, hasEnabledTarget: false }), false);
  for (const approvalStatus of [undefined, null, "approved", "executed", "failed", "rejected"]) {
    assert.equal(canApproveSocialPost({ ...pending, approvalStatus }), false);
  }
  for (const postStatus of ["posting", "posted", "unknown", "simulated", "processing", "failed"]) {
    assert.equal(canApproveSocialPost({ ...pending, postStatus }), false);
  }
});
