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

test("unattempted and unfamiliar receipts do not ask for an already-consumed approval", () => {
  for (const status of ["approved", "not_attempted", "unrecognized"]) {
    const label = socialReceiptLabel({ status, externalPostId: null });
    assert.notEqual(label, "Awaiting owner approval");
    assert.notEqual(label, "Public post confirmed");
  }
  assert.equal(socialReceiptLabel({ status: "approved", externalPostId: null }),
    "Owner approved — no send attempt recorded");
  assert.equal(socialReceiptLabel({ status: "not_attempted", externalPostId: null }),
    "No send attempt recorded — review approval status");
  assert.equal(socialReceiptLabel({ status: "unrecognized", externalPostId: null }),
    "Status unconfirmed — refresh to review");
  for (const status of ["draft", "pending"]) {
    assert.equal(socialReceiptLabel({ status, externalPostId: null }), "Awaiting owner approval");
  }
});

test("closed approval receipts do not misidentify expiry as rejection or promise no external effect", () => {
  assert.equal(socialReceiptLabel({ status: "cancelled", externalPostId: null }),
    "Approval closed — no send attempt recorded");
});
