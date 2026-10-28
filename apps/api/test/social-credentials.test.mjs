import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const module = await import(pathToFileURL(join(dir, "..", "dist", "social/social-credentials.js")).href);
const { boundSocialSecrets } = module.default ?? module;

test("publishing credentials bind to the exact owner-reviewed provider identity", () => {
  const cases = [
    ["facebook", "pageId"], ["instagram", "instagramBusinessId"],
    ["youtube", "channelId"], ["tiktok", "openId"]
  ];
  for (const [platform, identity] of cases) {
    const secrets = { v: 1, [identity]: "approved-account", accessToken: "user-token", pageAccessToken: "page-token" };
    assert.ok(boundSocialSecrets(platform, "approved-account", secrets));
    assert.equal(boundSocialSecrets(platform, "other-account", secrets), null);
    assert.equal(boundSocialSecrets(platform, undefined, secrets), null);
    assert.equal(boundSocialSecrets(platform, "approved-account", { ...secrets, [identity]: undefined }), null);
    assert.equal(boundSocialSecrets(platform, "approved-account", null), null);
  }
});

test("Meta uses the verified Page token and never substitutes a user token", () => {
  const secrets = { v: 1, pageId: "page", pageAccessToken: "page-token", accessToken: "user-token" };
  assert.equal(boundSocialSecrets("facebook", "page", secrets).accessToken, "page-token");
  assert.equal(boundSocialSecrets("facebook", "page", { ...secrets, pageAccessToken: undefined }), null);
});

test("YouTube refresh tokens still require a verified channel identity", () => {
  assert.ok(boundSocialSecrets("youtube", "channel", { v: 1, channelId: "channel", refreshToken: "refresh" }));
  assert.equal(boundSocialSecrets("youtube", "youtube-env", { v: 1, refreshToken: "refresh" }), null);
});

test("boundSocialSecrets normalizes and strips placeholder accessToken and refreshToken values", () => {
  const bound = boundSocialSecrets("youtube", "channel", {
    v: 1,
    channelId: "channel",
    accessToken: " replace-me ",
    refreshToken: "replace-me",
    pageAccessToken: " replace-me "
  });
  assert.equal(bound, null);
  const usable = boundSocialSecrets("youtube", "channel", {
    v: 1,
    channelId: "channel",
    accessToken: " live-token ",
    refreshToken: " replace-me "
  });
  assert.equal(usable.accessToken, "live-token");
  assert.equal(usable.refreshToken, undefined);
});
