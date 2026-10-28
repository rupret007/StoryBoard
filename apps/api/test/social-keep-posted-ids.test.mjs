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
  assert.match(execution, /shouldSkipSocialTargetSend\(row\)/);
  assert.match(execution, /preserveSocialTargetPostId\(\s*liveTarget\?\.externalPostId/);
  assert.doesNotMatch(
    execution,
    /approval.status !== ApprovalStatus.approved && approval.status !== ApprovalStatus.executed/
  );
});

import { postedIdHarness as harness } from "./helpers/social-posted-id-harness.mjs";

const actor = { label: "owner", operatorId: "operator" };
const execute = (h) => h.execution.executeApproved("artist", "approval", actor);

test("an executed approval cannot erase its previously recorded platform id", async () => {
  const h = harness();
  await execute(h);
  h.approval.status = "executed";
  const receipt = structuredClone(h.target);
  const log = structuredClone(h.post.sendLogs);
  const writeCount = h.writes.length;

  await assert.rejects(execute(h), /claimed owner approval/);
  assert.deepEqual(h.target, receipt);
  assert.equal(h.target.externalPostId, "provider-id");
  assert.deepEqual(h.post.sendLogs, log);
  assert.equal(h.calls.length, 1);
  assert.equal(h.writes.length, writeCount);
});

test("an existing platform id prevents a target send even when its status is still pending", async () => {
  const h = harness();
  h.target.externalPostId = "page_99";
  h.target.externalPostUrl = "https://example.invalid/posts/99";
  const receipt = structuredClone(h.target);

  await assert.rejects(execute(h), /Posting stopped/);
  assert.deepEqual(h.target, receipt);
  assert.equal(h.calls.length, 0);
  assert.equal(h.post.sendLogs.length, 0);
  assert.equal(h.writes.includes("target"), false);
});

test("a failed send without an id does not erase a platform id recorded during the attempt", async () => {
  const h = harness({
    publish: async () => {
      h.target.externalPostId = "page_99";
      h.target.externalPostUrl = "https://example.invalid/posts/99";
      return { success: false, isDraftOnly: false, durationMs: 1, requestSummary: {} };
    }
  });

  const result = await execute(h);
  assert.equal(result.approvalStatus, "failed");
  assert.equal(h.target.externalPostId, "page_99");
  assert.equal(h.target.externalPostUrl, "https://example.invalid/posts/99");
  assert.equal(h.post.sendLogs[0].externalPostId, "page_99");
  assert.equal(h.audits.at(-1).metadata.externalPostId, "page_99");
  assert.equal(result.executionResult.results[0].externalPostId, "page_99");
});

test("a multi-target post refuses before sending any target when another enabled target already has a platform id", async () => {
  const h = harness();
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value?.in) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const account2 = { ...h.target.account, id: "account-2", externalAccountId: "page-2", accountLabel: "Second" };
  const target2 = {
    ...structuredClone(h.target),
    id: "target-2",
    account: account2,
    accountId: account2.id,
    externalPostId: "page_99",
    externalPostUrl: "https://example.invalid/posts/99"
  };
  h.post.targets.push(target2);
  h.approval.payload.targets.push({
    targetId: "target-2",
    platform: "facebook",
    enabled: true,
    caption: target2.caption,
    tags: [],
    includeFacebookEvent: false,
    accountExternalId: "page-2",
    accountLabel: "Second",
    accountVoiceKey: "stalemate"
  });
  h.client.socialPostTarget.findUnique = async ({ where, select }) => {
    const row = h.post.targets.find((item) => item.id === where.id);
    if (!row) return null;
    if (!select) return structuredClone(row);
    return Object.fromEntries(
      Object.keys(select).filter((key) => key in row).map((key) => [key, row[key]])
    );
  };
  h.client.socialPostTarget.updateMany = async ({ where, data }) => {
    const row = h.post.targets.find((item) => matches(item, where));
    if (!row) return { count: 0 };
    Object.assign(row, data);
    h.writes.push("target");
    return { count: 1 };
  };
  h.client.socialPostTarget.update = async ({ where, data }) => {
    const row = h.post.targets.find((item) => item.id === where.id);
    if (!row) throw new Error("target not found");
    Object.assign(row, data);
    h.writes.push("target");
    return row;
  };
  h.execution.adapters = () => ({
    facebook: {
      platform: "facebook",
      mode: "real",
      publish: async (input) => {
        h.calls.push(input);
        return {
          success: true,
          deliveryState: "published",
          isDraftOnly: false,
          externalPostId: "should-not-run",
          durationMs: 1,
          requestSummary: {}
        };
      }
    }
  });

  await assert.rejects(execute(h), /Posting stopped/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.post.sendLogs.length, 0);
});

test("a platform id recorded after the read snapshot survives a later send attempt", async () => {
  const h = harness();
  const claimPost = h.client.socialPost.updateMany;
  h.client.socialPost.updateMany = async (input) => {
    const claimed = await claimPost(input);
    h.target.externalPostId = "page_100";
    h.target.externalPostUrl = "https://example.invalid/posts/100";
    return claimed;
  };

  await assert.rejects(execute(h), /Posting stopped/);
  assert.equal(h.target.externalPostId, "page_100");
  assert.equal(h.target.externalPostUrl, "https://example.invalid/posts/100");
  assert.equal(h.target.status, "pending");
  assert.equal(h.calls.length, 0);
  assert.equal(h.post.sendLogs.length, 0);
  assert.equal(h.writes.includes("target"), false);
});
