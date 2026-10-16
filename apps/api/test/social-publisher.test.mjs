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

test("a reported send without a platform id stays unknown and never counts as posted", async () => {
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
  assert.equal(result.log.outcome, "unknown");
  assert.equal(result.deliveryState, "unknown");
});

test("mock identifiers are recorded as simulation and never count as posted", async () => {
  const result = await sendSocialTarget({
    artistId: "artist-1",
    artistName: "Stalemate",
    artistVoice: "stalemate",
    approval: approval(),
    payload,
    target: payload.targets[0],
    adapter: new MockSocialPlatformAdapter("facebook")
  });
  assert.equal(result.posted, false);
  assert.equal(result.log.outcome, "simulated");
  assert.ok(result.externalPostId);
  assert.equal(result.log.approvalRequestId, "approval-1");
});

test("mock TikTok inbox identifiers remain simulated", async () => {
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
  assert.equal(result.isDraftOnly, false);
  assert.equal(result.log.outcome, "simulated");
  assert.ok(result.externalPostId);
});

for (const [state, posted] of [["published", true], ["private_upload", false], ["processing", false], ["draft_only", false], [undefined, false]]) {
  test(`real adapter state ${state} cannot imply more public delivery than proved`, async () => {
    const result = await sendSocialTarget({ artistId: "artist-1", artistName: "Stalemate", artistVoice: "stalemate",
      approval: approval(), payload, target: payload.targets[0], adapter: { platform: "facebook", mode: "real",
        async publish() { return { success: true, externalPostId: "provider-id", deliveryState: state,
          isDraftOnly: false, durationMs: 1, requestSummary: {} }; } } });
    assert.equal(result.posted, posted);
    assert.equal(result.log.outcome, posted ? "sent" : state ?? "unknown");
  });
}

test("a thrown provider exception is unknown and does not expose its secret text", async () => {
  const result = await sendSocialTarget({ artistId: "artist-1", artistName: "Stalemate", artistVoice: "stalemate",
    approval: approval(), payload, target: payload.targets[0], adapter: { platform: "facebook", mode: "real",
      async publish() { throw new Error("synthetic-access-token"); } } });
  assert.equal(result.posted, false);
  assert.equal(result.log.outcome, "unknown");
  assert.doesNotMatch(JSON.stringify(result), /synthetic-access-token/);
});
