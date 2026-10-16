import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SocialExecutionService } = require("../dist/social/social-execution.service.js");
const { SocialService } = require("../dist/social/social.service.js");
const { ApprovalsService } = require("../dist/approvals/approvals.service.js");

function harness({ role = "owner", deliveryState = "published", mode = "real", publish, auditOwner = true } = {}) {
  const account = { id: "account", artistId: "artist", platform: "facebook", status: "active",
    externalAccountId: "page", accountLabel: "Stalemate", voiceKey: "stalemate" };
  const target = { id: "target", platform: "facebook", account, accountId: account.id, postId: "post",
    enabled: true, caption: "Approved words", title: null, tags: [], includeFacebookEvent: false,
    facebookEventName: null, facebookEventStartsAt: null, facebookEventPlace: null,
    captionVariants: [], selectedVariantIndex: 0, status: "pending", externalPostId: null,
    externalPostUrl: null, isDraftOnly: false, lastError: null };
  const approval = { id: "approval", artistId: "artist", actionType: "social_post_batch", status: "approved",
    sourceKey: "social_post:post", approvedAt: new Date(), approvedBy: "owner@example.invalid",
    executionAttemptedAt: new Date(), payload: { adapterMode: mode, postId: "post", voiceKey: "stalemate", targets: [{
      targetId: "target", platform: "facebook", enabled: true, caption: target.caption, tags: [],
      includeFacebookEvent: false, accountExternalId: "page", accountLabel: "Stalemate", accountVoiceKey: "stalemate"
    }] } };
  const post = { id: "post", artistId: "artist", approvalRequestId: "approval", approval,
    status: "approved", voiceKey: "stalemate", mediaAsset: null, targets: [target], sendLogs: [],
    createdAt: new Date(), note: "note" };
  const writes = [], calls = [], audits = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value?.in) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const client = {
    artistMembership: { findUnique: async () => ({ role }) },
    artist: { findUniqueOrThrow: async () => ({ id: "artist", name: "Stalemate" }) },
    approvalRequest: {
      findFirst: async ({ where }) => matches(approval, where) ? structuredClone(approval) : null,
      updateMany: async ({ where, data }) => {
        if (!matches(approval, where)) return { count: 0 };
        Object.assign(approval, data); writes.push("approval"); return { count: 1 };
      }
    },
    socialPost: {
      findFirst: async ({ where }) => matches(post, where) ? structuredClone(post) : null,
      updateMany: async ({ where, data }) => {
        if (!matches(post, where)) return { count: 0 };
        Object.assign(post, data); writes.push("post"); return { count: 1 };
      },
      update: async ({ data }) => { Object.assign(post, data); writes.push("post"); return post; }
    },
    socialPostTarget: {
      updateMany: async ({ where, data }) => {
        if (!matches(target, where)) return { count: 0 };
        Object.assign(target, data); writes.push("target"); return { count: 1 };
      },
      update: async ({ data }) => { Object.assign(target, data); writes.push("target"); return target; }
    },
    socialSendLog: {
      create: async ({ data }) => { const log = { id: `log-${post.sendLogs.length}`, attemptedAt: new Date(), ...data };
        post.sendLogs.push(log); writes.push("attempt"); return log; },
      update: async ({ where, data }) => { Object.assign(post.sendLogs.find((log) => log.id === where.id), data); }
    },
    auditEvent: { findFirst: async () => auditOwner ? {} : null,
      create: async ({ data }) => { audits.push(data); return data; } },
    integrationConnection: { findUnique: async () => ({ status: "active", encryptedSecrets: { blob: "encrypted" } }) }
  };
  client.$transaction = async (callback) => callback(client);
  const execution = new SocialExecutionService({ client }, {}, { get: (key) => key === "SOCIAL_ADAPTER" ? mode : undefined }, {
    configured: () => true, decryptJson: () => ({ v: 1, pageId: "page", pageAccessToken: "synthetic-token" })
  });
  execution.adapters = () => ({ facebook: { platform: "facebook", mode, publish: async (input) => {
    calls.push(input);
    assert.equal(target.status, "sending");
    assert.equal(post.sendLogs[0].outcome, "unknown", "durable unknown receipt precedes every effect");
    if (publish) return publish(input);
    return { success: true, deliveryState, isDraftOnly: false, externalPostId: "provider-id", durationMs: 1, requestSummary: {} };
  } } });
  let executions = 0;
  const service = new SocialService({ client }, { executeApproved: async () => {
    executions += 1; approval.executionAttemptedAt = new Date(); return execution.executeApproved("artist", "approval", { label: "owner", operatorId: "operator" });
  } }, {}, execution, {});
  return { execution, service, client, approval, post, target, calls, writes, audits, executions: () => executions };
}

const actor = { label: "owner", operatorId: "operator" };
const execute = (h) => h.execution.executeApproved("artist", "approval", actor);
const review = (h, extra = {}) => ({ postId: "post", reviewFingerprint: h.execution.presentPost(h.post).reviewFingerprint, ...extra });

for (const role of ["member", "viewer"]) {
  test(`${role} cannot approve or directly execute social work`, async () => {
    const h = harness({ role });
    await assert.rejects(h.service.approveAndPost("artist", review(h), actor), /owner/);
    await assert.rejects(execute(h), /owner/);
    assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  });
}

test("an approved row without a verified owner decision cannot post", async () => {
  const h = harness({ auditOwner: false });
  await assert.rejects(execute(h), /verified owner/);
  assert.equal(h.calls.length, 0);
});

for (const invalid of ["unclaimed", "different-post", "different-caption", "duplicate-target", "missing-target", "empty-enabled", "changed-account"]) {
  test(`execution refuses ${invalid} before any provider call`, async () => {
    const h = harness();
    if (invalid === "unclaimed") h.approval.executionAttemptedAt = null;
    if (invalid === "different-post") h.post.approvalRequestId = "another-approval";
    if (invalid === "different-caption") h.target.caption = "Unreviewed words";
    if (invalid === "duplicate-target") h.approval.payload.targets.push(h.approval.payload.targets[0]);
    if (invalid === "missing-target") h.approval.payload.targets[0].targetId = "missing";
    if (invalid === "empty-enabled") h.approval.payload.targets[0].enabled = false;
    if (invalid === "changed-account") h.target.account.externalAccountId = "other-page";
    await assert.rejects(execute(h));
    assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  });
}

test("concurrent direct executions have one durable claim and one provider call", async () => {
  const h = harness();
  const results = await Promise.allSettled([execute(h), execute(h)]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(h.calls.length, 1); assert.equal(h.post.status, "posted");
  assert.equal(h.post.sendLogs.length, 1); assert.equal(h.post.sendLogs[0].outcome, "sent");
  await assert.rejects(execute(h), /already has a posting attempt/);
  assert.equal(h.calls.length, 1);
});

test("an uncertain provider response cannot be retried, including approve-and-post replay", async () => {
  const h = harness({ publish: async () => { throw new Error("synthetic-token"); } });
  const result = await execute(h);
  assert.equal(result.approvalStatus, "failed"); assert.equal(h.post.status, "unknown");
  assert.equal(h.post.sendLogs[0].outcome, "unknown");
  await h.service.approveAndPost("artist", review(h), actor);
  assert.equal(h.calls.length, 1); assert.equal(h.executions(), 0);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-token/);
});

for (const [mode, deliveryState, status, approvalStatus] of [
  ["mock", "published", "simulated", "executed"],
  ["real", "private_upload", "private_upload", "executed"],
  ["real", "processing", "processing", "failed"],
  ["real", undefined, "unknown", "failed"]
]) {
  test(`${mode} ${deliveryState} is persisted and presented as ${status}`, async () => {
    const h = harness({ mode, deliveryState });
    if (deliveryState === undefined) h.execution.adapters = () => ({ facebook: { mode: "real", publish: async () => ({ success: true, externalPostId: "id", durationMs: 1, requestSummary: {} }) } });
    const result = await execute(h);
    assert.equal(result.executionResult.results[0].posted, false);
    assert.equal(result.approvalStatus, approvalStatus);
    assert.equal(result.post.status, status); assert.equal(result.post.targets[0].status, status);
  });
}

test("approved/executed snapshots reject edits and exact replays perform no writes", async () => {
  const h = harness();
  const before = structuredClone(h.approval.payload);
  await assert.rejects(h.service.approveAndPost("artist", review(h, { targets: [{ id: "target", enabled: true, caption: "changed" }] }), actor), /cannot change/);
  await h.service.approveAndPost("artist", review(h), actor);
  assert.deepEqual(h.approval.payload, before); assert.equal(h.writes.length, 0); assert.equal(h.calls.length, 0);
});

test("new approval writes reviewed content and owner audit before any execution", async () => {
  const h = harness({ mode: "mock" });
  h.approval.status = "pending"; h.approval.executionAttemptedAt = null; h.approval.approvedAt = null;
  await h.service.approveAndPost("artist", review(h, { targets: [{ id: "target", enabled: true, caption: "Owner reviewed words" }] }), actor);
  assert.equal(h.approval.payload.targets[0].caption, "Owner reviewed words");
  assert.equal(h.calls[0].caption, "Owner reviewed words");
  assert.equal(h.audits.find((audit) => audit.action === "approval.approved").metadata.ownerApproved, true);
});

test("generic Approval Center service cannot authorize social work as a member", async () => {
  const h = harness({ role: "member" });
  const approvals = new ApprovalsService({ client: h.client }, {}, {}, {});
  approvals.get = async () => h.approval;
  await assert.rejects(approvals.approve("artist", "approval", "member", "operator"), /owner/);
  await assert.rejects(approvals.executeApproved("artist", "approval", "member", { actorOperatorId: "operator" }), /owner/);
  assert.equal(h.writes.length, 0); assert.equal(h.calls.length, 0);
});

test("client DTO allowlists fields and corrects old mock/private/pending receipts", () => {
  const h = harness();
  h.target.account.metadata = { token: "synthetic-account-secret" };
  h.post.mediaAsset = { id: "media", kind: "photo", filename: "photo.jpg", storageKey: "internal/path", publicUrl: "https://api.invalid/public/synthetic-token" };
  h.target.status = "posted"; h.target.externalPostId = "mock-id"; h.post.status = "posted";
  h.post.sendLogs.push({ id: "log", targetId: "target", platform: "facebook", outcome: "sent", externalPostId: "mock-id", adapterMode: "mock", attemptedAt: new Date(), requestSummary: { token: "synthetic-request-secret" } });
  const dto = h.execution.presentPost(h.post);
  assert.equal(dto.status, "simulated"); assert.equal(dto.targets[0].status, "simulated");
  assert.equal(dto.sendLogs[0].outcome, "simulated");
  assert.equal(dto.media.publicUrl, "/social/media/media/file");
  assert.doesNotMatch(JSON.stringify(dto), /synthetic|internal\/path|metadata|requestSummary/);
  for (const [platform, expected] of [["youtube", "private_upload"], ["tiktok", "processing"], ["facebook", "unknown"]]) {
    h.target.platform = platform; h.post.sendLogs[0].platform = platform; h.post.sendLogs[0].adapterMode = "real";
    assert.equal(h.execution.presentPost(h.post).status, expected);
  }
});


test("a stale account or adapter mode review cannot approve any work", async () => {
  for (const change of ["account", "mode"]) {
    const h = harness();
    h.approval.status = "pending"; h.approval.executionAttemptedAt = null;
    const input = review(h);
    if (change === "account") h.target.account.externalAccountId = "another-page";
    else h.execution.env = () => ({ SOCIAL_ADAPTER: "mock" });
    await assert.rejects(h.service.approveAndPost("artist", input, actor), /changed/);
    assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
  }
});

test("a mock approval can never execute after switching to real mode", async () => {
  const h = harness({ mode: "mock" });
  h.execution.env = () => ({ SOCIAL_ADAPTER: "real" });
  await assert.rejects(execute(h), /mode changed/);
  assert.equal(h.calls.length, 0); assert.equal(h.writes.length, 0);
});


test("approval HTTP projection removes legacy bearer URLs, raw errors and unproved posting claims", async () => {
  const { presentApprovalResponse } = require("../dist/approvals/approval-response.js");
  const source = { id: "approval", actionType: "social_post_batch", payload: {
    postId: "post", mediaUrl: "https://api.invalid/public/synthetic-bearer", executionError: "synthetic-token",
    secret: "synthetic-secret", targets: [{ targetId: "target", platform: "facebook", caption: "Approved", accessToken: "synthetic-token" }],
    executionResult: { results: [{ platform: "facebook", posted: true, externalPostId: "id", error: "synthetic-token" }] }
  } };
  const result = presentApprovalResponse({ readyToExecute: [source] });
  assert.doesNotMatch(JSON.stringify(result), /synthetic|mediaUrl|accessToken/);
  assert.equal(result.readyToExecute[0].payload.executionResult.results[0].posted, false);
  assert.equal(source.payload.executionError, "synthetic-token", "internal execution source remains unchanged");
});


test("rejected approvals cancel the unsent presentation without rewriting stored evidence", () => {
  const h = harness();
  h.approval.status = "rejected"; h.post.status = "pending_approval";
  const dto = h.execution.presentPost(h.post);
  assert.equal(dto.status, "cancelled"); assert.equal(dto.targets[0].status, "cancelled");
  assert.equal(h.post.status, "pending_approval"); assert.equal(h.target.status, "pending");
});


test("uncertain post-send finalization cannot leave a target presented as still sending", () => {
  const h = harness();
  h.post.status = "unknown"; h.approval.status = "failed"; h.target.status = "sending";
  const dto = h.execution.presentPost(h.post);
  assert.equal(dto.status, "unknown"); assert.equal(dto.targets[0].status, "unknown");
  h.post.status = "approved"; h.approval.status = "approved";
  h.approval.executionAttemptedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
  assert.equal(h.execution.presentPost(h.post).status, "unknown");
});

test("missing credentials leave an unattempted receipt instead of asking for owner approval again", async () => {
  const h = harness();
  h.client.integrationConnection.findUnique = async () => null;
  await assert.rejects(execute(h), /Posting stopped/);
  const before = structuredClone(h.post);
  const dto = h.execution.presentPost(h.post);
  assert.equal(dto.status, "unknown");
  assert.equal(dto.targets[0].status, "not_attempted");
  assert.equal(h.calls.length, 0);
  assert.equal(h.post.sendLogs.length, 0);
  assert.equal(h.target.status, "pending");
  assert.deepEqual(h.post, before, "projection preserves the stored execution evidence");
});

test("pending targets distinguish recorded approval, stopped work, and inconsistent attempt evidence", () => {
  const h = harness();
  h.approval.executionAttemptedAt = null;
  assert.equal(h.execution.presentPost(h.post).targets[0].status, "approved");
  h.approval.status = "failed";
  assert.equal(h.execution.presentPost(h.post).targets[0].status, "not_attempted");
  h.target.externalPostId = "historical-reference";
  assert.equal(h.execution.presentPost(h.post).targets[0].status, "unknown",
    "a provider reference prevents a no-attempt claim without a matching send log");
  h.target.externalPostId = null;
  h.target.externalPostUrl = "https://provider.invalid/post";
  assert.equal(h.execution.presentPost(h.post).targets[0].status, "unknown");
  h.target.externalPostUrl = null;
  h.post.sendLogs.push({ id: "attempt", targetId: h.target.id, platform: "facebook", outcome: "unknown",
    externalPostId: null, adapterMode: "real", attemptedAt: new Date() });
  assert.equal(h.execution.presentPost(h.post).targets[0].status, "unknown",
    "an existing attempt prevents a no-attempt claim even if the target state is stale");
  assert.equal(h.target.status, "pending");
  assert.equal(h.writes.length, 0);
});

for (const approvalStatus of ["rejected", "expired"]) {
  test(`${approvalStatus} receipts preserve attempted work and close only targets without attempt evidence`, () => {
    for (const targetStatus of ["draft", "pending", "skipped"]) {
      for (const evidence of ["none", "log", "id", "url"]) {
        const h = harness();
        h.approval.status = approvalStatus;
        h.post.status = "pending_approval";
        h.target.status = targetStatus;
        if (evidence === "id") h.target.externalPostId = "provider-reference";
        if (evidence === "url") h.target.externalPostUrl = "https://provider.invalid/post";
        if (evidence === "log") h.post.sendLogs.push({ id: "attempt", targetId: h.target.id,
          platform: "facebook", outcome: "unknown", externalPostId: null,
          adapterMode: "real", attemptedAt: new Date() });
        const before = structuredClone(h.post);
        const dto = h.execution.presentPost(h.post);
        assert.equal(dto.targets[0].status, evidence === "none" ? "cancelled" : "unknown",
          `${approvalStatus}/${targetStatus}/${evidence}`);
        assert.deepEqual(h.post, before, "closure projection preserves stored evidence");
        assert.equal(h.writes.length, 0);
      }
    }
    const h = harness();
    h.approval.status = approvalStatus;
    h.target.status = "sending";
    assert.equal(h.execution.presentPost(h.post).targets[0].status, "sending");
    h.target.status = "posted";
    h.target.externalPostId = "provider-reference";
    h.post.sendLogs.push({ id: "sent", targetId: h.target.id, platform: "facebook", outcome: "sent",
      externalPostId: "provider-reference", adapterMode: "real", attemptedAt: new Date(),
      requestSummary: { deliveryState: "published" } });
    assert.equal(h.execution.presentPost(h.post).targets[0].status, "posted");
  });
}
