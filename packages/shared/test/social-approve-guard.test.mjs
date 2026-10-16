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
  assert.equal(
    shared.socialApproveAndPostBlockReason({
      postStatus: "pending_approval",
      approvalStatus: "approved"
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
    /already posted/i
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

test("a target that already has a platform id is not sent again", () => {
  assert.equal(shared.shouldSendSocialTarget({ enabled: true, existingExternalPostId: null }), true);
  assert.equal(shared.shouldSendSocialTarget({ enabled: true, existingExternalPostId: "  " }), true);
  assert.equal(shared.shouldSendSocialTarget({ enabled: false, existingExternalPostId: null }), false);
  assert.equal(
    shared.shouldSendSocialTarget({ enabled: true, existingExternalPostId: "fb_123" }),
    false
  );
});
