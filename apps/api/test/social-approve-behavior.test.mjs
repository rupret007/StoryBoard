import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (file) => {
  const module = await import(pathToFileURL(join(dir, "../dist/social", file)).href);
  return module.default ?? module;
};
const [{ SocialService }, { SocialExecutionService }] = await Promise.all([
  load("social.service.js"),
  load("social-execution.service.js")
]);

for (const [postStatus, approvalStatus, reason] of [
  ["posted", "approved", /already posted/i],
  ["partial", "approved", /already posted/i],
  ["failed", "approved", /already failed/i],
  ["posting", "approved", /already posting/i],
  ["pending_approval", "executed", /already posted/i],
  ["pending_approval", "failed", /already failed/i]
]) {
  test(`approve-and-post rejects ${postStatus}/${approvalStatus} before any write or execution`, async () => {
    const target = { id: "target-1", caption: "Approved caption", enabled: true };
    const approval = { id: "approval-1", status: approvalStatus, payload: { caption: target.caption } };
    const post = { id: "post-1", status: postStatus, approval, approvalRequestId: approval.id };
    const before = structuredClone({ target, approval });
    const calls = [];
    const service = new SocialService(
      { client: {
        socialPostTarget: { updateMany: async ({ data }) => {
          calls.push("target write");
          Object.assign(target, data);
          return { count: 1 };
        } },
        approvalRequest: {
          findUniqueOrThrow: async () => approval,
          update: async ({ data }) => {
            calls.push("approval write");
            Object.assign(approval, data);
            return approval;
          }
        }
      } },
      {
        approve: async () => calls.push("approve"),
        executeApproved: async () => calls.push("execute")
      },
      { log: async () => calls.push("audit") },
      { requirePost: async (artistId, postId) => {
        assert.equal(artistId, "artist-1");
        assert.equal(postId, post.id);
        return post;
      } },
      {}
    );

    await assert.rejects(
      service.approveAndPost("artist-1", {
        postId: post.id,
        targets: [{ id: target.id, enabled: false, caption: "Unapproved replacement" }]
      }, { label: "Owner", operatorId: "operator-1" }),
      (error) => error.getStatus() === 400 && reason.test(error.message)
    );
    assert.deepEqual(calls, []);
    assert.deepEqual({ target, approval }, before);
  });
}

test("execution preserves an existing platform receipt and sends only the fresh target", async () => {
  const targets = [
    { id: "already-posted", platform: "facebook", enabled: true, caption: "Approved caption", externalPostId: "fb_existing", status: "posted" },
    { id: "fresh-target", platform: "instagram", enabled: true, caption: "New caption", externalPostId: null, status: "pending" }
  ];
  const receiptBefore = structuredClone(targets[0]);
  const approval = {
    id: "approval-1",
    status: "approved",
    approvedAt: new Date("2026-10-15T12:00:00Z"),
    actionType: "social_post_batch",
    payload: {
      postId: "post-1",
      voiceKey: "stalemate",
      targets: targets.map((target) => ({
        targetId: target.id,
        enabled: target.enabled,
        caption: target.caption,
        platform: target.platform,
        accountExternalId: "page-1",
        accountLabel: "Stalemate Chicago",
        accountVoiceKey: "stalemate"
      }))
    }
  };
  const post = { id: "post-1", voiceKey: "stalemate", targets, mediaAsset: null };
  const sends = [];
  const writes = [];
  const logs = [];
  const service = new SocialExecutionService(
    { client: {
      approvalRequest: { findFirst: async () => approval },
      artist: { findUniqueOrThrow: async () => ({ name: "Stalemate" }) },
      socialPost: { update: async ({ data }) => Object.assign(post, data) },
      socialPostTarget: { update: async ({ where, data }) => {
        writes.push(where.id);
        return Object.assign(targets.find((target) => target.id === where.id), data);
      } },
      socialSendLog: { create: async ({ data }) => logs.push(data) },
      integrationConnection: { findUnique: async () => null }
    } },
    { log: async () => {} },
    { get: () => undefined },
    { configured: () => false }
  );
  service.requirePost = async () => post;
  service.getPost = async () => structuredClone(post);
  const adapter = (platform) => ({
    platform,
    mode: "mock",
    publish: async (input) => {
      sends.push({ platform: input.platform, caption: input.caption });
      return { success: true, isDraftOnly: false, externalPostId: "ig_new", durationMs: 1, requestSummary: {} };
    }
  });
  service.adapters = () => ({ facebook: adapter("facebook"), instagram: adapter("instagram") });

  const result = await service.executeApproved("artist-1", approval.id, { label: "Owner" });

  assert.deepEqual(sends, [{ platform: "instagram", caption: "New caption" }]);
  assert.deepEqual(writes, ["fresh-target", "fresh-target"]);
  assert.deepEqual(logs.map((log) => log.targetId), ["fresh-target"]);
  assert.deepEqual(targets[0], receiptBefore);
  assert.equal(targets[1].externalPostId, "ig_new");
  assert.equal(result.post.status, "posted");
  assert.equal(result.approvalStatus, "executed");
});
