import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const csrfMod = await import(
  pathToFileURL(join(dir, "..", "dist", "auth", "csrf-origin.guard.js")).href
);

function config(values) {
  return {
    get: (key) => values[key],
    getOrThrow: (key) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Missing config ${key}`);
      }
      return value;
    }
  };
}

function httpContext(req) {
  return {
    switchToHttp: () => ({
      getRequest: () => req
    })
  };
}

test("production mutating requests require a matching Origin or Referer", () => {
  const guard = new csrfMod.CsrfOriginGuard(
    config({
      NODE_ENV: "production",
      WEB_URL: "https://app.example.test"
    })
  );

  assert.throws(
    () =>
      guard.canActivate(
        httpContext({ method: "POST", url: "/tasks", headers: {} })
      ),
    (error) =>
      error?.getStatus?.() === 403 &&
      /Origin or Referer required/i.test(error.message)
  );

  assert.equal(
    guard.canActivate(
      httpContext({
        method: "POST",
        url: "/tasks",
        headers: { origin: "https://app.example.test" }
      })
    ),
    true
  );

  assert.throws(
    () =>
      guard.canActivate(
        httpContext({
          method: "POST",
          url: "/tasks",
          headers: { origin: "https://evil.example" }
        })
      ),
    (error) => error?.getStatus?.() === 403
  );
});

test("development still allows mutating requests without Origin", () => {
  const guard = new csrfMod.CsrfOriginGuard(
    config({
      NODE_ENV: "development",
      WEB_URL: "http://localhost:3000"
    })
  );
  assert.equal(
    guard.canActivate(
      httpContext({ method: "POST", url: "/tasks", headers: {} })
    ),
    true
  );
});

test("OAuth and Telegram webhook callbacks stay CSRF-exempt", () => {
  const guard = new csrfMod.CsrfOriginGuard(
    config({
      NODE_ENV: "production",
      WEB_URL: "https://app.example.test"
    })
  );
  assert.equal(
    guard.canActivate(
      httpContext({
        method: "POST",
        url: "/integrations/telegram/webhook",
        headers: {}
      })
    ),
    true
  );
  assert.equal(
    guard.canActivate(
      httpContext({
        method: "GET",
        url: "/auth/google/callback?code=x",
        headers: {}
      })
    ),
    true
  );
});
