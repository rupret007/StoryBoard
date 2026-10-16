import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const service = readFileSync(join(dir, "../src/social/social.service.ts"), "utf8");
const execution = readFileSync(join(dir, "../src/social/social-execution.service.ts"), "utf8");

test("approve-and-post refuses a terminal drop before rewriting captions", () => {
  const approvalMethod = service.slice(service.indexOf("async approveAndPost("));
  assert.match(approvalMethod, /\$transaction\(async \(tx\) =>/);
  assert.match(approvalMethod, /await assertSocialOwner\(tx, artistId, actor.operatorId\)/);
  assert.match(approvalMethod, /post.approval.status !== ApprovalStatus.pending && post.approval.status !== ApprovalStatus.proposed/);
  assert.match(approvalMethod, /if \(approved.count !== 1\) return \{ approvalId: post.approval.id, execute: false \}/);
  assert.ok(
    approvalMethod.indexOf("if (approved.count !== 1)") < approvalMethod.indexOf("await tx.socialPostTarget.update("),
    "the pending approval must be claimed before any caption write"
  );
});

test("execution refuses a target that already has a platform id", () => {
  const executeMethod = execution.slice(execution.indexOf("async executeApproved("));
  assert.match(executeMethod, /status: \{ in: \["draft", "pending"\] \}, externalPostId: null/);
  assert.match(executeMethod, /if \(claimed.count !== 1\) throw new BadRequestException/);
  assert.ok(executeMethod.indexOf("if (claimed.count !== 1)") < executeMethod.indexOf("await sendSocialTarget("));
});
