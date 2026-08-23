import test from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};

const [callbackMod, oauthStateMod, secretBoxMod] = await Promise.all([
  load("integrations/google-oauth-callback.controller.js"),
  load("integrations/oauth-state.js"),
  load("integrations/crypto/secret-box.js")
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
    redirect(url) {
      this.redirects.push(url);
      return url;
    }
  };
}

function makeController({ membership, roles, upserts }) {
  return new callbackMod.GoogleOAuthCallbackController(
    config({
      WEB_URL: "https://app.example.test",
      SESSION_SECRET: "callback-test-session-secret"
    }),
    {
      client: {
        integrationConnection: {
          upsert: async () => {
            upserts.push("upsert");
            return { id: "connection-a" };
          }
        }
      }
    },
    new secretBoxMod.SecretBox("test-integration-secret"),
    {
      operatorFromRequestCookies: async () => ({
        id: "operator-a",
        email: "owner@example.test",
        name: "Owner"
      })
    },
    membership,
    roles,
    {
      enqueueIntegrationConnectionChanged: async () => undefined
    }
  );
}

test("Google integration callback re-checks current owner membership before storing tokens", async () => {
  const upserts = [];
  const controller = makeController({
    membership: {
      assertMembership: async () => {
        throw new ForbiddenException("Not a member of this artist");
      }
    },
    roles: {
      assertOwner: async () => {
        throw new Error("owner check must not run after membership failure");
      }
    },
    upserts
  });
  const state = oauthStateMod.signOAuthState(
    { artistId: "artist-a", issuedAt: Date.now(), operatorId: "operator-a" },
    "callback-test-session-secret"
  );
  const reply = replyCapture();
  await controller.callback("auth-code", state, undefined, {}, reply);
  assert.match(reply.redirects[0] ?? "", /googleError=not_authorized/);
  assert.deepEqual(upserts, []);
});

test("Google integration callback refuses a demoted member before token exchange", async () => {
  const upserts = [];
  const controller = makeController({
    membership: {
      assertMembership: async () => undefined
    },
    roles: {
      assertOwner: async () => {
        throw new ForbiddenException("Owner only");
      }
    },
    upserts
  });
  const state = oauthStateMod.signOAuthState(
    { artistId: "artist-a", issuedAt: Date.now(), operatorId: "operator-a" },
    "callback-test-session-secret"
  );
  const reply = replyCapture();
  await controller.callback("auth-code", state, undefined, {}, reply);
  assert.match(reply.redirects[0] ?? "", /googleError=not_authorized/);
  assert.deepEqual(upserts, []);
});
