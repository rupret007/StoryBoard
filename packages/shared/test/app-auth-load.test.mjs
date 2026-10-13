import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

class ApiHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

test("401 /auth/me stays a sign-in outcome", () => {
  const unauthorized = new ApiHttpError(401, "Unauthorized");
  assert.equal(shared.classifyAppAuthLoadError(unauthorized), "sign_in");
  assert.equal(shared.resolveAppAuthLoad({ ok: false, error: unauthorized }), "sign_in");
  assert.equal(shared.isUnauthorizedAppAuthError(unauthorized), true);
});

test("non-401 /auth/me failures are unreachable instead of a throw path", () => {
  for (const error of [
    new ApiHttpError(500, "Internal Server Error"),
    new ApiHttpError(502, "Bad Gateway"),
    new ApiHttpError(503, "Service Unavailable"),
    new TypeError("fetch failed"),
    new Error("ECONNREFUSED"),
    new Error("API unreachable")
  ]) {
    assert.equal(shared.classifyAppAuthLoadError(error), "unreachable");
    assert.equal(shared.resolveAppAuthLoad({ ok: false, error }), "unreachable");
    assert.equal(shared.isUnauthorizedAppAuthError(error), false);
  }
});

test("successful /auth/me stays ready and a 401-shaped plain object is not sign-in", () => {
  assert.equal(shared.resolveAppAuthLoad({ ok: true }), "ready");
  assert.equal(
    shared.classifyAppAuthLoadError({ name: "ApiHttpError", status: 401 }),
    "unreachable"
  );
});

test("unreachable copy keeps the saved-records honesty line", () => {
  assert.equal(shared.APP_AUTH_UNREACHABLE_TITLE, "StoryBoard is unreachable");
  assert.match(shared.APP_AUTH_SAVED_RECORDS_COPY, /Saved band records are kept/);
  assert.match(shared.APP_AUTH_SAVED_RECORDS_COPY, /If a save was interrupted/);
});
