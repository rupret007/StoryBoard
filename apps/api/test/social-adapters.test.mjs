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

test("Facebook photo publish requires a Graph post receipt before published", async () => {
  const calls = [];
  const http = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes("/photos")) return jsonResponse(200, { id: "photo-1", post_id: "page-1_99" });
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
  assert.equal(result.deliveryState, "published");
  assert.match(calls[0].url, /\/page-1\/photos/);
});

test("Facebook success without an id is not posted", async () => {
  const adapter = new adapters.FacebookRealAdapter(async () => jsonResponse(200, {}));
  const result = await adapter.publish({
    platform: "facebook",
    caption: "No id",
    mediaUrl: "https://cdn.example/photo.jpg",
    mediaKind: "photo",
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
  assert.equal(result.deliveryState, "published");
  assert.equal(result.externalPostUrl, undefined, "numeric media ids are not Instagram permalinks");
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
  const root = await mkdtemp(join(tmpdir(), "sb-yt-no-id-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "video");
  const http = async (url, init) => {
    if (String(url).includes("uploadType=resumable")) {
      return jsonResponse(200, {}, { location: "https://upload.example/session" });
    }
    if (String(url).includes("upload.example")) return jsonResponse(200, {});
    return jsonResponse(500, {});
  };
  const adapter = new adapters.YouTubeRealAdapter(http);
  const result = await adapter.publish({
    platform: "youtube",
    caption: "Live",
    title: "Burlington",
    mediaUrl: "https://cdn.example/clip.mp4",
    mediaPath,
    mediaByteSize: 5,
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
  assert.equal(result.deliveryState, "processing");
  assert.equal(result.externalPostUrl, undefined);
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
  assert.equal(result.deliveryState, "processing", "video upload ids do not prove publication");
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
  assert.equal(result.deliveryState, "private_upload");
  assert.equal(result.isDraftOnly, true);
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
  assert.equal(result.deliveryState, "processing");
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

test("Instagram local video polls container status until FINISHED", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-ig-poll-"));
  const mediaPath = join(root, "reel.mp4");
  await writeFile(mediaPath, "reel");
  let statusReads = 0;
  const http = async (url) => {
    if (String(url).includes("content_publishing_limit")) {
      return jsonResponse(200, { data: [{ quota_usage: 0, config: { quota_total: 50 } }] });
    }
    if (String(url).endsWith("/media")) {
      return jsonResponse(200, { id: "container-poll", uri: "https://rupload.example/ig" });
    }
    if (String(url).includes("rupload.example")) return jsonResponse(200, {});
    if (String(url).includes("status_code")) {
      statusReads += 1;
      return jsonResponse(200, { status_code: statusReads < 2 ? "IN_PROGRESS" : "FINISHED" });
    }
    if (String(url).includes("media_publish")) return jsonResponse(200, { id: "ig-reel-poll" });
    return jsonResponse(500, {});
  };
  const adapter = new adapters.InstagramRealAdapter(http, { intervalMs: 0, maxAttempts: 5 });
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
  assert.equal(result.externalPostId, "ig-reel-poll");
  assert.equal(statusReads, 2);
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

test("mock adapter receipts explicitly identify simulation and have no provider link", async () => {
  const registry = adapters.mockSocialAdapters();
  const posted = await registry.facebook.publish({
    platform: "facebook",
    caption: "Mock",
    account
  });
  assert.equal(posted.success, true);
  assert.ok(posted.externalPostId);
  assert.equal(posted.deliveryState, "simulated");
  assert.equal(posted.externalPostUrl, undefined);
  const draft = await registry.tiktok.publish({
    platform: "tiktok",
    caption: "Mock",
    account
  });
  assert.equal(draft.isDraftOnly, true);
  assert.ok(draft.externalPostId);
  assert.equal(draft.deliveryState, "simulated");
});

test("Facebook photo object ids cannot claim the corresponding feed post exists", async () => {
  const adapter = new adapters.FacebookRealAdapter(async () => jsonResponse(200, { id: "photo-1" }));
  const result = await adapter.publish({ platform: "facebook", caption: "Photo", mediaUrl: "https://cdn.example/image.jpg", mediaKind: "photo", account });
  assert.equal(result.success, true);
  assert.equal(result.deliveryState, "processing");
  assert.equal(result.externalPostUrl, undefined);
});

test("FacebookRealAdapter.publish fails pre-flight without calling Graph API when photo or video media is missing both local bytes and mediaUrl", async () => {
  let calls = 0;
  const adapter = new adapters.FacebookRealAdapter(async () => {
    calls += 1;
    return jsonResponse(200, { id: "page-1_99", post_id: "page-1_99" });
  });
  for (const mediaKind of ["photo", "video", undefined]) {
    calls = 0;
    const result = await adapter.publish({
      platform: "facebook",
      caption: "Caption only",
      mediaKind,
      account
    });
    assert.equal(result.success, false);
    assert.equal(calls, 0);
    assert.match(result.errorMessage ?? "", /No request was sent/);
  }
});

test("FacebookRealAdapter.publishLocalVideo aborts with unknown deliveryState when transfer offsets do not advance or exceed mediaByteSize", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-fb-stall-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "1234567890");
  const stall = async () => {
    const adapter = new adapters.FacebookRealAdapter(async (url, init) => {
      const body = String(init?.body ?? "");
      if (body.includes("upload_phase=start")) {
        return jsonResponse(200, {
          upload_session_id: "sess-stall",
          start_offset: "0",
          end_offset: "10"
        });
      }
      if (body.includes("video_file_chunk")) {
        return jsonResponse(200, { start_offset: "0", end_offset: "10" });
      }
      return jsonResponse(500, {});
    });
    return adapter.publish({
      platform: "facebook",
      caption: "Local clip",
      mediaKind: "video",
      mediaPath,
      mediaByteSize: 10,
      mediaMimeType: "video/mp4",
      account
    });
  };
  const oversize = async () => {
    const adapter = new adapters.FacebookRealAdapter(async (url, init) => {
      const body = String(init?.body ?? "");
      if (body.includes("upload_phase=start")) {
        return jsonResponse(200, {
          upload_session_id: "sess-big",
          start_offset: "0",
          end_offset: "99"
        });
      }
      return jsonResponse(500, {});
    });
    return adapter.publish({
      platform: "facebook",
      caption: "Local clip",
      mediaKind: "video",
      mediaPath,
      mediaByteSize: 10,
      mediaMimeType: "video/mp4",
      account
    });
  };
  const stalled = await stall();
  assert.equal(stalled.success, false);
  assert.equal(stalled.deliveryState, "unknown");
  assert.match(stalled.errorMessage ?? "", /offsets did not advance/);
  const tooLarge = await oversize();
  assert.equal(tooLarge.success, false);
  assert.equal(tooLarge.deliveryState, "unknown");
  assert.match(tooLarge.errorMessage ?? "", /invalid offsets/);
});

test("YouTubeRealAdapter refreshes OAuth token when stored accessToken is expired or rejected with 401 on resumable init", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-yt-refresh-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "yt-bytes");
  const authHeaders = [];
  let initAttempts = 0;
  const http = async (url, init) => {
    const authorization = init?.headers?.Authorization ?? "";
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return jsonResponse(200, { access_token: "fresh-yt-token" });
    }
    if (String(url).includes("uploadType=resumable")) {
      initAttempts += 1;
      authHeaders.push(authorization);
      if (initAttempts === 1) {
        return jsonResponse(401, { error: "invalid_token" });
      }
      return jsonResponse(200, {}, { location: "https://upload.example/session" });
    }
    if (String(url).includes("upload.example")) {
      return jsonResponse(200, { id: "yt_vid_refresh" });
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
    account: {
      ...account,
      accessToken: "stale-yt",
      refreshToken: "refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret"
    }
  });
  assert.equal(result.success, true);
  assert.equal(result.externalPostId, "yt_vid_refresh");
  assert.equal(initAttempts, 2);
  assert.equal(authHeaders[0], "Bearer stale-yt");
  assert.equal(authHeaders[1], "Bearer fresh-yt-token");
});

test("youtube publish 401 on init with failed refresh does not mark delivery unknown", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-yt-401-refresh-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "video");
  let calls = 0;
  const http = async (url) => {
    calls += 1;
    if (String(url).includes("oauth2.googleapis.com/token")) {
      throw new Error("refresh rejected");
    }
    if (String(url).includes("uploadType=resumable")) {
      return jsonResponse(401, { error: "invalid_token" });
    }
    throw new Error(`unexpected network access: ${url}`);
  };
  const adapter = new adapters.YouTubeRealAdapter(http);
  const result = await adapter.publish({
    platform: "youtube",
    caption: "Local",
    mediaKind: "video",
    mediaPath,
    mediaByteSize: 5,
    mediaMimeType: "video/mp4",
    account: {
      ...account,
      accessToken: "stale-yt",
      refreshToken: "refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret"
    }
  });
  assert.equal(result.success, false);
  assert.equal(result.deliveryState, undefined);
  assert.equal(result.isDraftOnly, true);
  assert.match(result.errorMessage ?? "", /refresh rejected/);
  assert.equal(calls, 2);
});

test("YouTubeRealAdapter.publish fails without unknown deliveryState when token refresh fails before resumable init", async () => {
  let calls = 0;
  const root = await mkdtemp(join(tmpdir(), "sb-yt-auth-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "video");
  const adapter = new adapters.YouTubeRealAdapter(async () => {
    calls += 1;
    throw new Error("unexpected network access");
  });
  const result = await adapter.publish({
    platform: "youtube",
    caption: "Local",
    mediaKind: "video",
    mediaPath,
    mediaByteSize: 5,
    mediaMimeType: "video/mp4",
    account: {
      ...account,
      externalAccountId: "channel-1",
      accessToken: undefined,
      refreshToken: "refresh",
      clientId: undefined,
      clientSecret: undefined
    }
  });
  assert.equal(result.success, false);
  assert.equal(result.deliveryState, undefined);
  assert.equal(calls, 0);
  assert.match(result.errorMessage ?? "", /client credentials are missing/);
});

test("Facebook event option fails before either external effect", async () => {
  let calls = 0;
  const adapter = new adapters.FacebookRealAdapter(async () => { calls += 1; return jsonResponse(200, { id: "unexpected" }); });
  const result = await adapter.publish({ platform: "facebook", caption: "Show", includeFacebookEvent: true, facebookEventName: "Show", facebookEventStartsAt: "2030-01-01T00:00:00Z", account });
  assert.equal(result.success, false);
  assert.equal(calls, 0);
  assert.match(result.errorMessage, /separate durable approval/);
});

test("YouTube never fetches an owner-supplied media URL or starts a session without local video bytes", async () => {
  let calls = 0;
  const adapter = new adapters.YouTubeRealAdapter(async () => { calls += 1; throw new Error("unexpected network access"); });
  const result = await adapter.publish({ platform: "youtube", caption: "Video", mediaUrl: "https://127.0.0.1/private", mediaKind: "video", account });
  assert.equal(result.success, false);
  assert.equal(calls, 0);
  assert.match(result.errorMessage, /completed local video file/);
});

test("tiktok publish rejects local path without byte size before network call", async () => {
  let calls = 0;
  const adapter = new adapters.TikTokRealAdapter(async () => {
    calls += 1;
    return jsonResponse(200, {});
  });
  const result = await adapter.publish({
    platform: "tiktok",
    caption: "Video",
    mediaPath: "/tmp/clip.mp4",
    mediaKind: "video",
    account
  });
  assert.equal(result.success, false);
  assert.equal(result.isDraftOnly, true);
  assert.equal(calls, 0);
  assert.match(result.errorMessage ?? "", /local file \(FILE_UPLOAD\) or an https media URL/);
});

test("TikTok local photos fail before an unsupported FILE_UPLOAD request", async () => {
  let calls = 0;
  const adapter = new adapters.TikTokRealAdapter(async () => { calls += 1; return jsonResponse(200, {}); });
  const result = await adapter.publish({ platform: "tiktok", caption: "Photo", mediaPath: "/unused/photo.jpg", mediaByteSize: 10, mediaKind: "photo", account });
  assert.equal(result.success, false);
  assert.equal(calls, 0);
});

test("YouTubeRealAdapter.validateAccount returns false when mine=true channel id does not match account.externalAccountId", async () => {
  const adapter = new adapters.YouTubeRealAdapter(async (url) => {
    if (String(url).includes("/channels")) {
      return jsonResponse(200, { items: [{ id: "other-channel", snippet: {} }] });
    }
    return jsonResponse(500, {});
  });
  const ok = await adapter.validateAccount({
    platform: "youtube",
    caption: "x",
    account: { ...account, externalAccountId: "expected-channel", accessToken: "yt-token" }
  });
  assert.equal(ok, false);
});

test("FacebookRealAdapter.validateAccount and InstagramRealAdapter.validateAccount return false on mismatched graph id or transport error", async () => {
  const facebook = new adapters.FacebookRealAdapter(async () =>
    jsonResponse(200, { id: "other-page" })
  );
  assert.equal(
    await facebook.validateAccount({ platform: "facebook", caption: "x", account }),
    false
  );
  let facebookCalls = 0;
  const facebookTransport = new adapters.FacebookRealAdapter(async () => {
    facebookCalls += 1;
    throw new Error("network down");
  });
  assert.equal(
    await facebookTransport.validateAccount({ platform: "facebook", caption: "x", account }),
    false
  );
  assert.equal(facebookCalls, 1);

  const instagram = new adapters.InstagramRealAdapter(async () =>
    jsonResponse(200, { id: "other-ig" })
  );
  assert.equal(
    await instagram.validateAccount({ platform: "instagram", caption: "x", account }),
    false
  );
  let instagramCalls = 0;
  const instagramTransport = new adapters.InstagramRealAdapter(async () => {
    instagramCalls += 1;
    throw new Error("dns failure");
  });
  assert.equal(
    await instagramTransport.validateAccount({ platform: "instagram", caption: "x", account }),
    false
  );
  assert.equal(instagramCalls, 1);
});

test("TikTokRealAdapter.validateAccount rejects placeholder tokens", async () => {
  let calls = 0;
  const adapter = new adapters.TikTokRealAdapter(async () => {
    calls += 1;
    return jsonResponse(200, { data: { user: { open_id: "page-1" } }, error: { code: "ok" } });
  });
  const ok = await adapter.validateAccount({
    platform: "tiktok",
    caption: "x",
    account: { ...account, accessToken: "replace-me", externalAccountId: "page-1" }
  });
  assert.equal(ok, false);
  assert.equal(calls, 0);
});

test("provider errors and transport exceptions cannot expose credentials in adapter receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-errors-"));
  const mediaPath = join(root, "clip.mp4");
  await writeFile(mediaPath, "video");
  const secret = "synthetic-secret-do-not-return";
  for (const [platform, Adapter] of Object.entries({ facebook: adapters.FacebookRealAdapter, instagram: adapters.InstagramRealAdapter, youtube: adapters.YouTubeRealAdapter, tiktok: adapters.TikTokRealAdapter })) {
    for (const throwing of [false, true]) {
      const http = async () => {
        if (throwing) throw new Error(`request failed with access_token=${secret}`);
        return jsonResponse(400, { error: { code: "denied", message: secret }, message: secret, access_token: secret });
      };
      const result = await new Adapter(http).publish({ platform, caption: "Caption", mediaKind: "video", mediaPath, mediaByteSize: 5, mediaUrl: "https://cdn.example/video.mp4", account: { ...account, accessToken: secret } });
      assert.equal(result.success, false);
      assert.equal(result.deliveryState, "unknown", "an attempted request cannot claim there was no external effect");
      assert.ok(!JSON.stringify(result).includes(secret), `${platform} leaked credential material`);
    }
  }
});
