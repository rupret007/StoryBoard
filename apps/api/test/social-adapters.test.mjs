import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

test("Facebook local video uses resumable upload_phase and still needs an id", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-fb-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "videobytes");
  const calls = [];
  const http = async (url, init) => {
    calls.push({ url, body: String(init?.body ?? "") });
    const body = String(init?.body ?? "");
    if (body.includes("upload_phase=start")) {
      return jsonResponse(200, { upload_session_id: "sess-1", start_offset: "0", end_offset: "10" });
    }
    if (String(url).includes("graph-video") && body.includes("video_file_chunk")) {
      return jsonResponse(200, { start_offset: "10", end_offset: "10" });
    }
    if (body.includes("upload_phase=finish")) return jsonResponse(200, { id: "page-1_77" });
    return jsonResponse(500, {});
  };
  const adapter = new adapters.FacebookRealAdapter(http);
  const result = await adapter.publish({
    platform: "facebook",
    caption: "Local clip",
    mediaKind: "video",
    mediaPath,
    mediaByteSize: 10,
    mediaMimeType: "video/mp4",
    account
  });
  assert.equal(result.success, true);
  assert.equal(result.externalPostId, "page-1_77");
  assert.ok(calls.some((row) => row.body.includes("upload_phase=start")));
});

test("YouTube resumable PUT uses the local file, not a public URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-yt-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "yt-bytes");
  const bodies = [];
  const http = async (url, init) => {
    if (String(url).includes("uploadType=resumable")) {
      return jsonResponse(200, {}, { location: "https://upload.example/session" });
    }
    if (String(url).includes("upload.example")) {
      bodies.push(init?.body);
      return jsonResponse(200, { id: "yt_vid_1" });
    }
    return jsonResponse(500, {});
  };
  const adapter = new adapters.YouTubeRealAdapter(http);
  const result = await adapter.publish({
    platform: "youtube",
    caption: "Local",
    mediaKind: "video",
    mediaPath,
    mediaByteSize: 8,
    mediaMimeType: "video/mp4",
    account: { ...account, accessToken: "yt" }
  });
  assert.equal(result.success, true);
  assert.equal(result.externalPostId, "yt_vid_1");
  assert.equal(Buffer.from(bodies[0]).toString(), "yt-bytes");
});

test("TikTok local video uses FILE_UPLOAD then PUT chunks", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-tt-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "tiktok-file");
  const calls = [];
  const http = async (url, init) => {
    calls.push({ url, body: String(init?.body ?? "") });
    if (String(url).includes("/inbox/video/init/")) {
      return jsonResponse(200, {
        data: { publish_id: "v_inbox_file~1", upload_url: "https://tiktok-upload.example/put" },
        error: { code: "ok" }
      });
    }
    if (String(url).includes("tiktok-upload.example")) return jsonResponse(200, {});
    return jsonResponse(500, {});
  };
  const adapter = new adapters.TikTokRealAdapter(http);
  const result = await adapter.publish({
    platform: "tiktok",
    caption: "Local",
    mediaKind: "video",
    mediaPath,
    mediaByteSize: 11,
    mediaMimeType: "video/mp4",
    account
  });
  assert.equal(result.success, true);
  assert.equal(result.isDraftOnly, true);
  assert.equal(result.externalPostId, "v_inbox_file~1");
  assert.match(calls[0].body, /FILE_UPLOAD/);
});

test("Instagram local video uses resumable upload_type and still needs a publish id", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-ig-"));
  const mediaPath = join(root, "reel.mp4");
  await writeFile(mediaPath, "reel");
  const calls = [];
  const http = async (url, init) => {
    calls.push({ url, body: String(init?.body ?? "") });
    if (String(url).includes("content_publishing_limit")) {
      return jsonResponse(200, { data: [{ quota_usage: 0, config: { quota_total: 50 } }] });
    }
    if (String(url).endsWith("/media")) {
      return jsonResponse(200, { id: "container-r", uri: "https://rupload.example/ig" });
    }
    if (String(url).includes("rupload.example")) return jsonResponse(200, {});
    if (String(url).includes("status_code")) return jsonResponse(200, { status_code: "FINISHED" });
    if (String(url).includes("media_publish")) return jsonResponse(200, { id: "ig-reel-1" });
    return jsonResponse(500, {});
  };
  const adapter = new adapters.InstagramRealAdapter(http);
  const result = await adapter.publish({
    platform: "instagram",
    caption: "Reel",
    mediaKind: "video",
    mediaPath,
    mediaByteSize: 4,
    mediaMimeType: "video/mp4",
    account
  });
  assert.equal(result.success, true);
  assert.equal(result.externalPostId, "ig-reel-1");
  assert.match(calls.find((row) => row.url.endsWith("/media")).body, /resumable/);
});

test("Instagram photos still require a public https URL, not only a local file", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-ig-photo-"));
  const mediaPath = join(root, "shot.jpg");
  await writeFile(mediaPath, "jpeg");
  const adapter = new adapters.InstagramRealAdapter(async () => jsonResponse(200, {}));
  const result = await adapter.publish({
    platform: "instagram",
    caption: "Photo",
    mediaKind: "photo",
    mediaPath,
    mediaByteSize: 4,
    mediaMimeType: "image/jpeg",
    mediaUrl: "http://localhost:4000/social/media/x/public/tok",
    account
  });
  assert.equal(result.success, false);
  assert.match(result.errorMessage ?? "", /public https hosted URL/);
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
