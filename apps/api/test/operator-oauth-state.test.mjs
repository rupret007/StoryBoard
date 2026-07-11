import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const load = (path) => import(pathToFileURL(join(dir, "..", "dist", path)).href);

const [stateMod, authServiceMod, controllerMod] = await Promise.all([
  load("auth/operator-oauth-state.js"),
  load("auth/auth.service.js"),
  load("auth/auth.controller.js")
]);

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

function replyCapture() {
  return {
    redirects: [],
    statusCodes: [],
    setCookies: [],
    clearedCookies: [],
    code(status) {
      this.statusCodes.push(status);
      return this;
    },
    redirect(url) {
      this.redirects.push(url);
      return url;
    },
    setCookie(...args) {
      this.setCookies.push(args);
      return this;
    },
    clearCookie(...args) {
      this.clearedCookies.push(args);
      return this;
    }
  };
}

test("operator OAuth state is opaque and compared safely", () => {
  const one = stateMod.createOperatorOAuthState();
  const two = stateMod.createOperatorOAuthState();
  assert.equal(one.length, 43);
  assert.notEqual(one, two);
  assert.equal(stateMod.operatorOAuthStateMatches(one, one), true);
  assert.equal(stateMod.operatorOAuthStateMatches(one, two), false);
  assert.equal(stateMod.operatorOAuthStateMatches(one, undefined), false);
  assert.equal(stateMod.operatorOAuthStateMatches(one, `${one}x`), false);
});

test("operator OAuth state cookie is signed, short-lived, and callback-scoped", () => {
  const auth = new authServiceMod.AuthService(
    config({
      NODE_ENV: "production",
      COOKIE_DOMAIN: "app.example.test",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_OPERATOR_REDIRECT_URI:
        "https://api.example.test/auth/operator/google/callback"
    }),
    { client: {} }
  );
  const reply = replyCapture();
  auth.applyOperatorOAuthStateCookie(reply, "state-value");

  const [name, value, options] = reply.setCookies[0];
  assert.equal(name, stateMod.OPERATOR_OAUTH_STATE_COOKIE);
  assert.equal(value, "state-value");
  assert.deepEqual(options, {
    path: "/auth/operator/google/callback",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    signed: true,
    maxAge: 600,
    domain: "app.example.test"
  });
  assert.equal(
    auth.readOperatorOAuthStateFromRequest({
      cookies: { [stateMod.OPERATOR_OAUTH_STATE_COOKIE]: "signed-state" },
      unsignCookie: () => ({ valid: true, value: "state-value" })
    }),
    "state-value"
  );
  assert.equal(
    auth.readOperatorOAuthStateFromRequest({
      cookies: { [stateMod.OPERATOR_OAUTH_STATE_COOKIE]: "tampered" },
      unsignCookie: () => ({ valid: false, value: null })
    }),
    null
  );

  const url = new URL(auth.buildGoogleOperatorAuthUrl("state-value"));
  assert.equal(url.searchParams.get("state"), "state-value");
  auth.clearOperatorOAuthStateCookie(reply);
  assert.equal(reply.clearedCookies[0][0], stateMod.OPERATOR_OAUTH_STATE_COOKIE);
});

test("operator callback exchanges a code only once for a matching state", async () => {
  let storedState = "expected-state";
  let completed = 0;
  let cleared = 0;
  const auth = {
    buildGoogleOperatorAuthUrl: (state) => `https://google.test/?state=${state}`,
    applyOperatorOAuthStateCookie: () => undefined,
    readOperatorOAuthStateFromRequest: () => storedState,
    clearOperatorOAuthStateCookie: () => {
      cleared += 1;
      storedState = null;
    },
    completeGoogleOperatorLogin: async () => {
      completed += 1;
    }
  };
  const controller = new controllerMod.AuthController(
    auth,
    config({ WEB_URL: "https://web.example.test" }),
    {},
    {}
  );

  const missingReply = replyCapture();
  await controller.googleCallback(
    "code",
    undefined,
    undefined,
    {},
    missingReply
  );
  assert.equal(
    missingReply.redirects[0],
    "https://web.example.test/?authError=invalid_state"
  );
  assert.equal(completed, 0);
  assert.equal(cleared, 0);

  const mismatchReply = replyCapture();
  await controller.googleCallback(
    "code",
    "wrong-state",
    undefined,
    {},
    mismatchReply
  );
  assert.equal(
    mismatchReply.redirects[0],
    "https://web.example.test/?authError=invalid_state"
  );
  assert.equal(completed, 0);
  assert.equal(cleared, 0);

  const validReply = replyCapture();
  await controller.googleCallback(
    "code",
    "expected-state",
    undefined,
    {},
    validReply
  );
  assert.equal(validReply.redirects[0], "https://web.example.test/?signedIn=1");
  assert.equal(completed, 1);
  assert.equal(cleared, 1);

  const replayReply = replyCapture();
  await controller.googleCallback(
    "replayed-code",
    "expected-state",
    undefined,
    {},
    replayReply
  );
  assert.equal(
    replayReply.redirects[0],
    "https://web.example.test/?authError=invalid_state"
  );
  assert.equal(completed, 1);
  assert.equal(cleared, 1);
});
