import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const [{ sendSocialTarget }, { MockSocialPlatformAdapter }] = await Promise.all([
  load("social/social-publisher.js"),
  load("social/social-adapters.js")
]);

const payload = {
  postId: "post-1",
  voiceKey: "stalemate",
  targets: [
    {
      targetId: "target-1",
      platform: "facebook",
      enabled: true,
      caption: "Burlington Saturday",
      accountExternalId: "page-1",
      accountLabel: "Stalemate Chicago",
      accountVoiceKey: "stalemate"
    }
  ]
};

function approval() {
  return {
    id: "approval-1",
    status: "approved",
    approvedAt: new Date("2026-10-15T12:00:00.000Z"),
    actionType: "social_post_batch"
  };
}

test("refuses to send without an explicit approval record", async () => {
  const result = await sendSocialTarget({
    artistId: "artist-1",
    artistName: "Stalemate",
    artistVoice: "stalemate",
    approval: null,
    payload,
    target: payload.targets[0],
    adapter: new MockSocialPlatformAdapter("facebook")
  });
  assert.equal(result.posted, false);
  assert.equal(result.log.outcome, "refused_no_approval");
  assert.match(result.log.errorMessage, /explicit approval record/);
});

test("refuses a Rad Dad account on a Stalemate workspace before the adapter runs", async () => {
  let called = false;
  const adapter = {
    platform: "facebook",
    mode: "mock",
    async publish() {
      called = true;
      return { success: true, isDraftOnly: false, externalPostId: "should-not", durationMs: 1, requestSummary: {} };
    }
  };
  const result = await sendSocialTarget({
    artistId: "artist-1",
    artistName: "Stalemate",
    artistVoice: "stalemate",
    approval: approval(),
    payload,
    target: {
      ...payload.targets[0],
      accountLabel: "Rad Dad Band",
      accountVoiceKey: "rad_dad"
    },
    adapter
  });
  assert.equal(called, false);
  assert.equal(result.log.outcome, "refused_account_mismatch");
});

test("does not count a send as posted when the platform omits an id", async () => {
  const adapter = {
    platform: "facebook",
    mode: "real",
    async publish() {
      return { success: true, isDraftOnly: false, durationMs: 4, requestSummary: { platform: "facebook" } };
    }
  };
  const result = await sendSocialTarget({
    artistId: "artist-1",
    artistName: "Stalemate",
    artistVoice: "stalemate",
    approval: approval(),
    payload,
    target: payload.targets[0],
    adapter
  });
  assert.equal(result.posted, false);
  assert.equal(result.log.outcome, "refused_no_id");
});

test("logs a send only after the platform returns an id", async () => {
  const result = await sendSocialTarget({
    artistId: "artist-1",
    artistName: "Stalemate",
    artistVoice: "stalemate",
    approval: approval(),
    payload,
    target: payload.targets[0],
    adapter: new MockSocialPlatformAdapter("facebook")
  });
  assert.equal(result.posted, true);
  assert.equal(result.log.outcome, "sent");
  assert.ok(result.externalPostId);
  assert.equal(result.log.approvalRequestId, "approval-1");
});

test("TikTok inbox success is draft_only and still requires a publish id", async () => {
  const result = await sendSocialTarget({
    artistId: "artist-1",
    artistName: "Stalemate",
    artistVoice: "stalemate",
    approval: approval(),
    payload,
    target: { ...payload.targets[0], platform: "tiktok" },
    adapter: new MockSocialPlatformAdapter("tiktok")
  });
  assert.equal(result.posted, false);
  assert.equal(result.isDraftOnly, true);
  assert.equal(result.log.outcome, "draft_only");
  assert.ok(result.externalPostId);
});
