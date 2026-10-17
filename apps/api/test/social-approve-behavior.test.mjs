import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (file) => {
  const module = await import(pathToFileURL(join(dir, "../dist/social", file)).href);
  return module.default ?? module;
};
const [{ SocialService }, { SocialExecutionService }, { socialReviewFingerprint }] = await Promise.all([
  load("social.service.js"),
  load("social-execution.service.js"),
  load("social-review.js")
]);

function reviewTargetInput(target) {
  return {
    id: target.id,
    enabled: target.enabled,
    caption: target.caption,
    title: target.title ?? undefined,
    tags: target.tags,
    includeFacebookEvent: target.includeFacebookEvent,
    selectedVariantIndex: target.selectedVariantIndex ?? 0
  };
}

for (const [postStatus, approvalStatus] of [
  ["posted", "approved"],
  ["partial", "approved"],
  ["failed", "approved"],
  ["posting", "approved"],
  ["pending_approval", "executed"],
  ["pending_approval", "failed"],
  ["simulated", "executed"],
  ["private_upload", "executed"],
  ["processing", "failed"],
  ["unknown", "failed"]
]) {
  test(`approve-and-post rejects edits to ${postStatus}/${approvalStatus} before any write or execution`, async () => {
    const target = { id: "target-1", caption: "Approved caption", enabled: true,
      title: null, tags: [], includeFacebookEvent: false, selectedVariantIndex: 0 };
    const reviewFingerprint = "a".repeat(64);
    const unchangedTargets = [reviewTargetInput(target)];
    const approval = { id: "approval-1", artistId: "artist-1", status: approvalStatus,
      actionType: "social_post_batch", sourceKey: "social_post:post-1",
      executionAttemptedAt: new Date("2026-10-15T12:00:00Z"),
      payload: {
        reviewFingerprint,
        caption: target.caption,
        targets: unchangedTargets.map((row) => ({
          targetId: row.id,
          enabled: row.enabled,
          caption: row.caption,
          platform: "instagram",
          tags: row.tags,
          includeFacebookEvent: row.includeFacebookEvent
        }))
      } };
    const post = { id: "post-1", status: postStatus, approval,
      targets: [target], approvalRequestId: approval.id };
    const before = structuredClone({ target, approval });
    const calls = [];
    const write = (name, row) => async ({ data }) => {
      calls.push(name);
      Object.assign(row, data);
      return { count: 1 };
    };
    const client = {
      artistMembership: { findUnique: async () => ({ role: "owner" }) },
      socialPost: { findFirst: async () => post, update: write("post write", post) },
      socialPostTarget: {
        updateMany: write("target write", target), update: write("target write", target)
      },
      approvalRequest: {
        findUniqueOrThrow: async () => approval,
        update: write("approval write", approval), updateMany: write("approval write", approval)
      },
      auditEvent: { create: async () => calls.push("audit") }
    };
    client.$transaction = async (callback) => callback(client);
    const service = new SocialService(
      { client },
      {
        approve: async () => calls.push("approve"),
        executeApproved: async () => calls.push("execute")
      },
      { log: async () => calls.push("audit") },
      {
        env: () => ({ SOCIAL_ADAPTER: "mock" }),
        requirePost: async (artistId, postId) => {
          assert.equal(artistId, "artist-1");
          assert.equal(postId, post.id);
          return post;
        },
        getPost: async () => structuredClone(post)
      },
      {}
    );
    const actor = { label: "Owner", operatorId: "operator-1" };

    await assert.rejects(
      service.approveAndPost("artist-1", {
        postId: post.id, reviewFingerprint,
        targets: [{ id: target.id, enabled: false, caption: "Unapproved replacement" }]
      }, actor),
      (error) => error.getStatus() === 409 && /approved content cannot change/.test(error.message)
    );
    assert.deepEqual(calls, []);
    assert.deepEqual({ target, approval }, before);

    // The current API permits an unchanged replay only as a read of its receipt.
    const replay = await service.approveAndPost("artist-1", {
      postId: post.id,
      reviewFingerprint,
      targets: unchangedTargets
    }, actor);
    assert.equal(replay.status, postStatus);
    assert.deepEqual(calls, []);
    assert.deepEqual({ target, approval }, before);
  });
}

function pendingApprovalGateFixture(postStatus) {
  const target = {
    id: "target-1", platform: "instagram", caption: "Draft caption", enabled: true,
    title: null, tags: [], includeFacebookEvent: false, selectedVariantIndex: 0,
    facebookEventName: null, facebookEventStartsAt: null, facebookEventPlace: null,
    account: { externalAccountId: "ig_1", accountLabel: "Band", voiceKey: "stalemate", status: "active" }
  };
  const post = {
    id: "post-1", status: postStatus, voiceKey: "stalemate", mediaAsset: null,
    targets: [target], approvalRequestId: "approval-1"
  };
  const reviewFingerprint = socialReviewFingerprint(post, "mock");
  const unchangedTargets = [reviewTargetInput(target)];
  const approval = {
    id: "approval-1", artistId: "artist-1", status: "pending",
    actionType: "social_post_batch", sourceKey: "social_post:post-1",
    executionAttemptedAt: null,
    payload: { reviewFingerprint, caption: target.caption }
  };
  post.approval = approval;
  const before = structuredClone({ target, approval, postStatus: post.status });
  const calls = [];
  const write = (name, row) => async ({ where, data }) => {
    if (where?.status?.in && !where.status.in.includes(row.status)) {
      return { count: 0 };
    }
    calls.push(name);
    Object.assign(row, data);
    return { count: 1 };
  };
  const client = {
    artistMembership: { findUnique: async () => ({ role: "owner" }) },
    socialPost: { findFirst: async () => post, update: write("post write", post) },
    socialPostTarget: {
      updateMany: write("target write", target), update: write("target write", target)
    },
    approvalRequest: {
      findUniqueOrThrow: async () => approval,
      update: write("approval write", approval),
      updateMany: write("approval write", approval)
    },
    auditEvent: { create: async () => calls.push("audit") }
  };
  client.$transaction = async (callback) => callback(client);
  const service = new SocialService(
    { client },
    {
      approve: async () => calls.push("approve"),
      executeApproved: async () => {
        calls.push("execute");
        approval.status = "approved";
        approval.executionAttemptedAt = new Date("2026-10-15T12:01:00Z");
        post.status = "approved";
      }
    },
    { log: async () => calls.push("audit") },
    {
      env: () => ({ SOCIAL_ADAPTER: "mock" }),
      requirePost: async () => structuredClone(post),
      getPost: async () => structuredClone(post)
    },
    {}
  );
  return {
    service, post, target, approval, reviewFingerprint, unchangedTargets, before, calls,
    actor: { label: "Owner", operatorId: "operator-1" }
  };
}

for (const [postStatus, pattern] of [
  ["posted", /already posted/i],
  ["partial", /already has a posting attempt/i],
  ["unknown", /already has a posting attempt/i],
  ["processing", /already has a posting attempt/i],
  ["failed", /already failed/i],
  ["simulated", /already been used/i],
  ["private_upload", /already been used/i],
  ["draft_only", /already been used/i]
]) {
  test(`approve-and-post blocks pending approval at the service gate for ${postStatus}`, async () => {
    const { service, post, target, approval, reviewFingerprint, unchangedTargets, before, calls, actor } =
      pendingApprovalGateFixture(postStatus);

    await assert.rejects(
      service.approveAndPost("artist-1", {
        postId: post.id,
        reviewFingerprint,
        targets: unchangedTargets
      }, actor),
      (error) => error.getStatus() === 409 && pattern.test(error.message)
    );
    assert.deepEqual(calls, []);
    assert.deepEqual({ target, approval }, { target: before.target, approval: before.approval });
  });
}

for (const postStatus of ["pending_approval", "approved"]) {
  test(`approve-and-post allows the first owner claim when approval is pending on ${postStatus}`, async () => {
    const { service, post, reviewFingerprint, unchangedTargets, calls, actor, approval } =
      pendingApprovalGateFixture(postStatus);

    await service.approveAndPost("artist-1", {
      postId: post.id,
      reviewFingerprint,
      targets: unchangedTargets
    }, actor);
    assert.ok(calls.includes("approval write"));
    assert.ok(calls.includes("execute"));
    assert.equal(approval.status, "approved");

    await assert.rejects(
      service.approveAndPost("artist-1", {
        postId: post.id,
        reviewFingerprint,
        targets: [{ ...unchangedTargets[0], caption: "Rewritten after claim" }]
      }, actor),
      (error) => error.getStatus() === 409 && /approved content cannot change/i.test(error.message)
    );
    assert.equal(calls.filter((name) => name === "execute").length, 1);
  });
}

function executionFixture(existingReceipt) {
  const targets = [
    ...(existingReceipt ? [{ id: "already-posted", platform: "facebook", caption: "Approved caption",
      externalPostId: "fb_existing", status: "posted" }] : []),
    { id: "fresh-target", platform: "instagram", caption: "New caption", externalPostId: null, status: "pending" }
  ].map((target) => ({
    ...target, postId: "post-1", enabled: true, title: null, tags: [], includeFacebookEvent: false,
    facebookEventName: null, facebookEventStartsAt: null, facebookEventPlace: null,
    account: { artistId: "artist-1", platform: target.platform, status: "active",
      externalAccountId: target.platform, accountLabel: "Stalemate", voiceKey: "stalemate" }
  }));
  const approval = {
    id: "approval-1", artistId: "artist-1", sourceKey: "social_post:post-1",
    status: "approved", approvedAt: new Date("2026-10-15T12:00:00Z"),
    executionAttemptedAt: new Date("2026-10-15T12:01:00Z"), actionType: "social_post_batch",
    payload: {
      postId: "post-1", voiceKey: "stalemate", adapterMode: "mock",
      targets: targets.map((target) => ({
        targetId: target.id, enabled: target.enabled, caption: target.caption,
        platform: target.platform, tags: [], includeFacebookEvent: false,
        accountExternalId: target.account.externalAccountId,
        accountLabel: target.account.accountLabel, accountVoiceKey: "stalemate"
      }))
    }
  };
  const post = { id: "post-1", artistId: "artist-1", status: "approved",
    approvalRequestId: approval.id, voiceKey: "stalemate", targets, mediaAsset: null };
  const sends = [], writes = [], logs = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) =>
    value?.in ? value.in.includes(row[key]) : row[key] === value);
  const client = {
    artistMembership: { findUnique: async () => ({ role: "owner" }) },
    approvalRequest: { findFirst: async () => approval },
    auditEvent: { findFirst: async () => ({}), create: async () => ({}) },
    artist: { findUniqueOrThrow: async () => ({ name: "Stalemate" }) },
    socialPost: {
      update: async ({ data }) => Object.assign(post, data),
      updateMany: async ({ where, data }) => {
        if (!matches(post, where)) return { count: 0 };
        Object.assign(post, data);
        return { count: 1 };
      }
    },
    socialPostTarget: {
      updateMany: async ({ where, data }) => {
        const target = targets.find((row) => matches(row, where));
        if (!target) return { count: 0 };
        writes.push(target.id);
        Object.assign(target, data);
        return { count: 1 };
      },
      update: async ({ where, data }) => {
        writes.push(where.id);
        return Object.assign(targets.find((target) => target.id === where.id), data);
      }
    },
    socialSendLog: {
      create: async ({ data }) => {
        const log = { id: "log-1", ...data };
        logs.push(log);
        return log;
      },
      update: async ({ where, data }) => Object.assign(logs.find((log) => log.id === where.id), data)
    }
  };
  client.$transaction = async (callback) => callback(client);
  const service = new SocialExecutionService({ client }, {}, { get: () => undefined }, {});
  service.requirePost = async () => post;
  service.getPost = async () => structuredClone(post);
  const adapter = (platform) => ({
    platform, mode: "mock",
    publish: async (input) => {
      sends.push({ platform: input.platform, caption: input.caption });
      return { success: true, deliveryState: "simulated", isDraftOnly: false,
        externalPostId: "ig_new", durationMs: 1, requestSummary: {} };
    }
  });
  service.adapters = () => ({ facebook: adapter("facebook"), instagram: adapter("instagram") });
  return { service, post, targets, sends, writes, logs };
}

const execute = (service) => service.executeApproved("artist-1", "approval-1", { label: "Owner", operatorId: "operator-1" });

test("execution preserves an existing platform receipt and refuses every further send", async () => {
  const { service, post, targets, sends, writes, logs } = executionFixture(true);
  const receiptsBefore = structuredClone(targets);
  await assert.rejects(execute(service), /Posting stopped/);
  assert.deepEqual(sends, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(logs, []);
  assert.deepEqual(targets, receiptsBefore);
  assert.equal(post.status, "unknown");
});

test("a fresh claimed target still sends once and records a simulated receipt", async () => {
  const { service, targets, sends, writes, logs } = executionFixture(false);
  const result = await execute(service);
  assert.deepEqual(sends, [{ platform: "instagram", caption: "New caption" }]);
  assert.deepEqual(writes, ["fresh-target", "fresh-target"]);
  assert.deepEqual(logs.map((log) => log.targetId), ["fresh-target"]);
  assert.equal(targets[0].externalPostId, "ig_new");
  assert.equal(result.post.status, "simulated");
  assert.equal(result.approvalStatus, "executed");
  await assert.rejects(execute(service), /already has a posting attempt/);
  assert.equal(sends.length, 1);
});
