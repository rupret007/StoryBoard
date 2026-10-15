import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const adapters = await load("social/social-adapters.js");

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (name) => headers[name.toLowerCase()] ?? headers[name] ?? null }
  };
}

const account = {
  externalAccountId: "page-1",
  label: "Stalemate",
  accessToken: "token",
  instagramBusinessId: "ig-1"
};

test("Facebook photo publish requires a Graph id before success", async () => {
  const calls = [];
  const http = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes("/photos")) return jsonResponse(200, { id: "page-1_99" });
    return jsonResponse(500, { error: { message: "unexpected" } });
  };
  const adapter = new adapters.FacebookRealAdapter(http);
  const result = await adapter.publish({
    platform: "facebook",
    caption: "Burlington Saturday",
    mediaUrl: "https://cdn.example/photo.jpg",
    mediaKind: "photo",
    account
  });
  assert.equal(result.success, true);
  assert.equal(result.externalPostId, "page-1_99");
  assert.match(calls[0].url, /\/page-1\/photos/);
});

test("Facebook success without an id is not posted", async () => {
  const adapter = new adapters.FacebookRealAdapter(async () => jsonResponse(200, {}));
  const result = await adapter.publish({
    platform: "facebook",
    caption: "No id",
    account
  });
  assert.equal(result.success, false);
  assert.match(result.errorMessage, /without a post id/);
});

test("Instagram waits for a media_publish id and checks quota", async () => {
  const http = async (url) => {
    if (String(url).includes("content_publishing_limit")) {
      return jsonResponse(200, { data: [{ quota_usage: 1, config: { quota_total: 50, quota_duration: 86400 } }] });
    }
    if (String(url).endsWith("/media")) return jsonResponse(200, { id: "container-1" });
    if (String(url).includes("media_publish")) return jsonResponse(200, { id: "ig-post-1" });
    return jsonResponse(500, {});
  };
  const adapter = new adapters.InstagramRealAdapter(http);
  const result = await adapter.publish({
    platform: "instagram",
    caption: "Short",
    mediaUrl: "https://cdn.example/photo.jpg",
    mediaKind: "photo",
    account
  });
  assert.equal(result.success, true);
  assert.equal(result.externalPostId, "ig-post-1");
});

test("Instagram refuses when content_publishing_limit is exhausted", async () => {
  const adapter = new adapters.InstagramRealAdapter(async (url) => {
    if (String(url).includes("content_publishing_limit")) {
      return jsonResponse(200, { data: [{ quota_usage: 50, config: { quota_total: 50 } }] });
    }
    return jsonResponse(500, {});
  });
  const result = await adapter.publish({
    platform: "instagram",
    caption: "Too many",
    mediaUrl: "https://cdn.example/photo.jpg",
    mediaKind: "photo",
    account
  });
  assert.equal(result.success, false);
  assert.match(result.errorMessage, /content_publishing_limit/);
});

test("YouTube resumable upload is not posted without a video id", async () => {
  const http = async (url, init) => {
    if (String(url).includes("uploadType=resumable")) {
      return jsonResponse(200, {}, { location: "https://upload.example/session" });
    }
    if (String(url).includes("cdn.example")) return jsonResponse(200, "bytes");
    if (String(url).includes("upload.example")) return jsonResponse(200, {});
    return jsonResponse(500, {});
  };
  const adapter = new adapters.YouTubeRealAdapter(http);
  const result = await adapter.publish({
    platform: "youtube",
    caption: "Live",
    title: "Burlington",
    mediaUrl: "https://cdn.example/clip.mp4",
    mediaKind: "video",
    account: { ...account, accessToken: "yt" }
  });
  assert.equal(result.success, false);
  assert.match(result.errorMessage, /no video id/);
});

test("TikTok inbox init is draft-only and needs publish_id", async () => {
  const adapter = new adapters.TikTokRealAdapter(async () =>
    jsonResponse(200, { data: { publish_id: "v_inbox_url~v2.1" }, error: { code: "ok" } })
  );
  const result = await adapter.publish({
    platform: "tiktok",
    caption: "Hook",
    mediaUrl: "https://cdn.example/clip.mp4",
    mediaKind: "video",
    account
  });
  assert.equal(result.success, true);
  assert.equal(result.isDraftOnly, true);
  assert.equal(result.externalPostId, "v_inbox_url~v2.1");
});

test("mock adapters still return an id so tests can prove the posted gate", async () => {
  const registry = adapters.mockSocialAdapters();
  const posted = await registry.facebook.publish({
    platform: "facebook",
    caption: "Mock",
    account
  });
  assert.equal(posted.success, true);
  assert.ok(posted.externalPostId);
  const draft = await registry.tiktok.publish({
    platform: "tiktok",
    caption: "Mock",
    account
  });
  assert.equal(draft.isDraftOnly, true);
  assert.ok(draft.externalPostId);
});
