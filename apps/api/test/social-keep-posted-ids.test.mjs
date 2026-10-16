import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const execution = readFileSync(join(dir, "../src/social/social-execution.service.ts"), "utf8");

test("social execution will not re-send or erase a platform id", () => {
  // The base now protects the same invariant with durable post/target claims.
  // Require those stronger guards, including an ID check in the database write
  // so an ID recorded after the initial snapshot is protected as well.
  assert.match(execution, /await assertSocialOwner\(this.prisma.client, artistId, actor.operatorId\)/);
  assert.match(execution, /if \(approval.status !== ApprovalStatus.approved \|\| !approval.approvedAt \|\|\s*!approval.executionAttemptedAt \|\| approval.actionType !== "social_post_batch"\)/);
  assert.match(execution, /action: "approval.approved", actorOperatorId: \{ not: null \}/);
  assert.match(execution, /const claim = await this.prisma.client.socialPost.updateMany/);
  assert.match(execution, /if \(claim.count !== 1\) throw new BadRequestException/);
  assert.match(execution, /const claimed = await tx.socialPostTarget.updateMany\(\{\s*where: \{ id: row.id, postId: post.id, status: \{ in: \["draft", "pending"\] \}, externalPostId: null \}/);
  assert.match(execution, /if \(claimed.count !== 1\) throw new BadRequestException/);
  assert.doesNotMatch(
    execution,
    /approval.status !== ApprovalStatus.approved && approval.status !== ApprovalStatus.executed/
  );
});
