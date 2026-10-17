import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const { SocialOAuthController } = await load("social/social-oauth.controller.js");
const { signOAuthState } = await load("integrations/oauth-state.js");
const { SocialMediaService } = await load("social/social-media.service.js");
const { SocialMediaPublicController } = await load("social/social-media-public.controller.js");
const { SocialController } = await load("social/social.controller.js");

function harness({ owner = true } = {}) {
  const saved = { connections: [], accounts: [], audits: [], secrets: [] };
  const configValues = {
    WEB_URL: "http://web.example", API_URL: "http://api.example", SESSION_SECRET: "synthetic-session-secret",
    META_APP_ID: "meta-app", META_APP_SECRET: "meta-secret", YOUTUBE_CLIENT_ID: "yt-client",
    YOUTUBE_CLIENT_SECRET: "yt-secret", TIKTOK_CLIENT_KEY: "tt-key", TIKTOK_CLIENT_SECRET: "tt-secret"
  };
  const config = { get: (key) => configValues[key], getOrThrow: (key) => configValues[key] };
  const tx = {
    artist: { findUniqueOrThrow: async () => ({ id: "artist", name: "Stalemate" }) },
    integrationConnection: { upsert: async (input) => { saved.connections.push(input); return { id: "connection" }; } },
    socialAccount: { upsert: async (input) => { saved.accounts.push(input); return { id: "account" }; } },
    auditEvent: { create: async (input) => { saved.audits.push(input); return {}; } }
  };
  const controller = new SocialOAuthController(
    config, { client: { $transaction: async (callback) => callback(tx) } },
    { configured: () => true, encryptJson: (input) => { saved.secrets.push(input); return "encrypted-synthetic-value"; } },
    { operatorFromRequestCookies: async () => ({ id: "owner", email: "owner@example.test" }) },
    { assertMembership: async () => {} },
    { assertOwner: async () => { if (!owner) throw new Error("owner required"); } }
  );
  return {
    controller, saved,
    state: signOAuthState({ artistId: "artist", operatorId: "owner", issuedAt: Date.now() }, configValues.SESSION_SECRET),
    reply: { redirect: (url) => url }
  };
}

async function withFetch(http, run) {
  const previous = globalThis.fetch;
  globalThis.fetch = http;
  try { return await run(); } finally { globalThis.fetch = previous; }
}

const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, json: async () => data });

test("OAuth provider errors and transport exception details never enter browser redirects", async () => {
  const h = harness();
  const secret = "synthetic-provider-secret";
  const providerError = await h.controller.youtubeCallback(undefined, h.state, secret, {}, h.reply);
  assert.equal(providerError, "http://web.example/social?connectError=provider_authorization_failed");
  const transportError = await withFetch(async () => { throw new Error(secret); }, () => h.controller.youtubeCallback("code", h.state, undefined, {}, h.reply));
  assert.equal(transportError, "http://web.example/social?connectError=connect_failed");
  assert.equal(h.saved.connections.length, 0);
});

test("OAuth callback rechecks current ownership before exchanging any credentials", async () => {
  const h = harness({ owner: false });
  let fetches = 0;
  const redirect = await withFetch(async () => { fetches += 1; throw new Error("unexpected"); }, () => h.controller.youtubeCallback("code", h.state, undefined, {}, h.reply));
  assert.match(redirect, /connect_failed$/);
  assert.equal(fetches, 0);
  assert.equal(h.saved.connections.length, 0);
});

test("YouTube callback binds encrypted credentials and social account to the verified channel", async () => {
  const h = harness();
  const redirect = await withFetch(async (url) => {
    if (String(url).includes("oauth2.googleapis.com/token")) return response({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", scope: "youtube.upload youtube.readonly" });
    assert.match(String(url), /channels\?part=id,snippet&mine=true/);
    return response({ items: [{ id: "channel-stalemate", snippet: { title: "Stalemate" } }] });
  }, () => h.controller.youtubeCallback("code", h.state, undefined, {}, h.reply));
  assert.equal(redirect, "http://web.example/social?connected=youtube_publish");
  assert.equal(h.saved.secrets[0].channelId, "channel-stalemate");
  assert.equal(h.saved.accounts[0].create.externalAccountId, "channel-stalemate");
  assert.equal(h.saved.accounts[0].create.accountLabel, "Stalemate");
  assert.equal(h.saved.connections[0].create.encryptedSecrets.blob, "encrypted-synthetic-value");
  assert.equal(h.saved.audits.length, 1);
  assert.ok(!JSON.stringify(h.saved.audits).includes("synthetic-access"));
});

test("TikTok callback reads the v2 top-level token and verifies the corresponding profile", async () => {
  const h = harness();
  const redirect = await withFetch(async (url) => {
    if (String(url).includes("/oauth/token/")) return response({ access_token: "synthetic-tt", open_id: "tt-stalemate", scope: "video.upload" });
    return response({ data: { user: { open_id: "tt-stalemate", display_name: "Stalemate" } }, error: { code: "ok" } });
  }, () => h.controller.tiktokCallback("code", h.state, undefined, {}, h.reply));
  assert.equal(redirect, "http://web.example/social?connected=tiktok");
  assert.equal(h.saved.secrets[0].openId, "tt-stalemate");
  assert.equal(h.saved.accounts[0].create.externalAccountId, "tt-stalemate");
});

test("OAuth refuses mismatched TikTok profile identity without saving credentials", async () => {
  const h = harness();
  const redirect = await withFetch(async (url) => String(url).includes("/oauth/token/")
    ? response({ access_token: "synthetic-tt", open_id: "tt-stalemate" })
    : response({ data: { user: { open_id: "other-account", display_name: "Other" } }, error: { code: "ok" } }),
  () => h.controller.tiktokCallback("code", h.state, undefined, {}, h.reply));
  assert.match(redirect, /connect_failed$/);
  assert.equal(h.saved.connections.length, 0);
  assert.equal(h.saved.accounts.length, 0);
});

test("Meta callback binds Page and Instagram credentials to the actual selected accounts", async () => {
  const h = harness();
  const redirect = await withFetch(async (url) => {
    const path = String(url);
    if (path.includes("/oauth/access_token")) return response({ access_token: "synthetic-meta-user" });
    if (path.includes("/me/accounts")) return response({ data: [{ id: "page-stalemate", name: "Stalemate", access_token: "synthetic-page-token", instagram_business_account: { id: "ig-stalemate" } }] });
    assert.match(path, /\/ig-stalemate\?fields=id,username/);
    return response({ id: "ig-stalemate", username: "stalemateband" });
  }, () => h.controller.metaCallback("code", h.state, undefined, {}, h.reply));
  assert.equal(redirect, "http://web.example/social?connected=meta");
  assert.equal(h.saved.secrets[0].pageAccessToken, "synthetic-page-token");
  assert.equal(h.saved.secrets[0].pageId, "page-stalemate");
  assert.equal(h.saved.secrets[0].instagramBusinessId, "ig-stalemate");
  assert.deepEqual(h.saved.accounts.map((account) => account.create.externalAccountId), ["page-stalemate", "ig-stalemate"]);
});

test("Meta callback refuses to silently select the first of several Pages", async () => {
  const h = harness();
  const redirect = await withFetch(async (url) => String(url).includes("/me/accounts")
    ? response({ data: [{ id: "page-one", name: "Stalemate", access_token: "synthetic-one" }, { id: "page-two", name: "Rad Dad", access_token: "synthetic-two" }] })
    : response({ access_token: "synthetic-user" }),
  () => h.controller.metaCallback("code", h.state, undefined, {}, h.reply));
  assert.match(redirect, /connect_failed$/);
  assert.equal(h.saved.connections.length, 0);
  assert.equal(h.saved.accounts.length, 0);
});

test("media upload responses expose only the authenticated file route", () => {
  const service = new SocialMediaService({}, {});
  const result = service.present({ id: "asset", filename: "clip.mp4", mimeType: "video/mp4", byteSize: 4, receivedBytes: 4, publicUrl: "https://api.example/social/media/asset/public/synthetic-secret", kind: "video", uploadStatus: "ready" });
  assert.equal(result.publicUrl, "/social/media/asset/file");
  assert.ok(!JSON.stringify(result).includes("synthetic-secret"));
});

test("previously stored active media is refused by both file routes", async () => {
  for (const mimeType of ["text/html", "image/svg+xml"]) {
    const asset = { id: "asset", artistId: "artist", filename: "photo.jpg", mimeType, byteSize: 4, receivedBytes: 4, storageKey: "artist/asset", uploadStatus: "ready" };
    const service = new SocialMediaService({ client: { socialMediaAsset: {
      findFirst: async () => asset, findUnique: async () => asset
    } } }, { getOrThrow: () => "synthetic-session-secret" });
    await assert.rejects(() => service.openForArtist("artist", "asset"), (error) => error.getStatus() === 404);
    await assert.rejects(() => service.openPublic("asset", service.publicToken("asset")), (error) => error.getStatus() === 404);
  }
});

test("both media controllers disable sniffing and sandbox direct file navigation", async () => {
  const file = { mimeType: "image/png", filename: "image.png", byteSize: 4, stream: "synthetic-stream" };
  const media = { openForArtist: async () => file, openPublic: async () => file };
  const publicController = new SocialMediaPublicController(media);
  const authenticatedController = new SocialController({}, media,
    { resolveArtistId: async () => "artist" }, { assertCanRead: async () => {} }, {});
  for (const invoke of [
    (reply) => publicController.publicFile("asset", "synthetic-token", reply),
    (reply) => authenticatedController.mediaFile("asset", { id: "owner" }, {}, reply, "artist")
  ]) {
    const headers = {};
    const reply = { header: (key, value) => { headers[key] = value; return reply; }, send: (stream) => stream };
    assert.equal(await invoke(reply), "synthetic-stream");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Content-Security-Policy"], "sandbox");
  }
});
