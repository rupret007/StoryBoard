import "reflect-metadata";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { Controller, Post, Put } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { SOCIAL_MEDIA_CHUNK_SIZE } from "@storyboard/shared";
import adapterMod from "../dist/social/social-media-upload-adapter.js";
import controllerMod from "../dist/social/social.controller.js";
import socialMod from "../dist/social/social.service.js";
import mediaMod from "../dist/social/social-media.service.js";
import authMod from "../dist/auth/auth.service.js";
import guardMod from "../dist/auth/session-auth.guard.js";
import membershipMod from "../dist/auth/membership.service.js";
import rolesMod from "../dist/auth/role-policy.service.js";
import prismaMod from "../dist/prisma/prisma.service.js";
import sessionMod from "../dist/auth/session-cookie.js";
import stripeMod from "../dist/integrations/stripe-webhook-raw-body.js";

const { SocialMediaUploadAdapter, SOCIAL_MEDIA_UPLOAD_BODY_LIMIT } = adapterMod;
const secret = "social-upload-http-test-secret";
const artistId = "artist-upload-test";
const chunkUrl = "/social/media/media-test/chunks";
const calls = [];
let app;

// Ordinary Nest routes, including the same path with another method and a
// similar path, must never inherit the upload parser or the larger body limit.
class OrdinaryController {
  post() { calls.push("ordinary-post"); return { ok: true }; }
  put() { calls.push("ordinary-put"); return { ok: true }; }
  samePath() { calls.push("same-path"); return { ok: true }; }
  childPath() { calls.push("child-path"); return { ok: true }; }
}
Controller()(OrdinaryController);
for (const [decorator, path, method] of [
  [Post, "ordinary", "post"],
  [Put, "ordinary", "put"],
  [Post, "social/media/:id/chunks", "samePath"],
  [Put, "social/media/:id/chunks/extra", "childPath"]
]) {
  decorator(path)(OrdinaryController.prototype, method, Object.getOwnPropertyDescriptor(OrdinaryController.prototype, method));
}

function cookie(operatorId = "member") {
  return `sb_session=${sessionMod.signSessionPayload({
    v: 1, operatorId, currentArtistId: artistId,
    iat: Date.now(), exp: Date.now() + 60_000
  }, secret)}`;
}

before(async () => {
  const module = await Test.createTestingModule({
    controllers: [controllerMod.SocialController, OrdinaryController],
    providers: [
      authMod.AuthService,
      guardMod.SessionAuthGuard,
      membershipMod.MembershipService,
      rolesMod.RolePolicyService,
      { provide: ConfigService, useValue: new ConfigService({ SESSION_SECRET: secret }) },
      { provide: prismaMod.PrismaService, useValue: { client: {
        operator: { findUnique: async ({ where }) => ({ id: where.id, email: `${where.id}@example.test`, name: where.id }) },
        artistMembership: { findUnique: async ({ where }) => {
          const key = where.operatorId_artistId;
          return key.artistId === artistId ? { role: key.operatorId } : null;
        } }
      } } },
      { provide: socialMod.SocialService, useValue: {} },
      { provide: mediaMod.SocialMediaService, useValue: {
        appendChunk: async (artist, id, range, bytes) => {
          calls.push({ artist, id, range, bytes });
          return { receivedBytes: bytes.length };
        },
        init: async () => { calls.push("init"); return { ok: true }; },
        complete: async () => { calls.push("complete"); return { ok: true }; }
      } }
    ]
  }).compile();
  app = module.createNestApplication(new SocialMediaUploadAdapter(), { logger: false });
  stripeMod.attachStripeWebhookRawBody(app.getHttpAdapter().getInstance());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
after(async () => { await app?.close(); });
beforeEach(() => { calls.length = 0; });

test("the authenticated chunk route accepts the advertised 8 MiB upload unchanged", async () => {
  const bytes = Buffer.alloc(SOCIAL_MEDIA_CHUNK_SIZE, 0xab);
  const range = `bytes 0-${bytes.length - 1}/${bytes.length}`;
  const response = await app.inject({
    method: "PUT", url: `${chunkUrl}?upload=1`, payload: bytes,
    headers: { "content-type": "application/octet-stream", "content-range": range, cookie: cookie() }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { receivedBytes: bytes.length });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].artist, artistId);
  assert.equal(calls[0].id, "media-test");
  assert.equal(calls[0].range, range);
  assert.ok(Buffer.isBuffer(calls[0].bytes));
  assert.deepEqual(calls[0].bytes, bytes);
});

test("the chunk route still enforces its 10 MiB request limit", async () => {
  const response = await app.inject({
    method: "PUT", url: chunkUrl, payload: Buffer.alloc(SOCIAL_MEDIA_UPLOAD_BODY_LIMIT + 1),
    headers: { "content-type": "application/octet-stream", cookie: cookie() }
  });
  assert.equal(response.statusCode, 413);
  assert.deepEqual(calls, []);
});

test("encapsulated chunk uploads retain session and artist membership authorization", async () => {
  for (const [headers, expected] of [
    [{}, 401],
    [{ cookie: cookie("viewer") }, 403],
    [{ cookie: cookie(), "x-artist-id": "foreign-artist" }, 403]
  ]) {
    const response = await app.inject({
      method: "PUT", url: chunkUrl, payload: Buffer.from("chunk"),
      headers: { "content-type": "application/octet-stream", ...headers }
    });
    assert.equal(response.statusCode, expected);
  }
  assert.deepEqual(calls, []);
});

const otherRoutes = [
  ["POST", "/ordinary"],
  ["PUT", "/ordinary"],
  ["POST", chunkUrl],
  ["PUT", `${chunkUrl}/extra`],
  ["POST", "/social/media"],
  ["POST", "/social/media/media-test/complete"]
];

test("other routes reject octet-stream with HTTP 415 before calling handlers", async () => {
  for (const [method, url] of otherRoutes) {
    const response = await app.inject({
      method, url, payload: Buffer.from("unexpected binary"),
      headers: { "content-type": "application/octet-stream", cookie: cookie() }
    });
    assert.equal(response.statusCode, 415, `${method} ${url}: ${response.body}`);
  }
  assert.deepEqual(calls, []);
});

test("other routes reject JSON and text above Fastify's default 1 MiB limit", async () => {
  for (const [method, url] of otherRoutes) {
    for (const contentType of ["application/json", "text/plain"]) {
      const response = await app.inject({
        method, url, payload: JSON.stringify("x".repeat(1024 * 1024)),
        headers: { "content-type": contentType, cookie: cookie() }
      });
      assert.equal(response.statusCode, 413, `${method} ${url} ${contentType}: ${response.body}`);
    }
  }
  assert.deepEqual(calls, []);
});

test("ordinary routes continue accepting JSON at the default body limit", async () => {
  const response = await app.inject({
    method: "POST", url: "/ordinary", payload: JSON.stringify("x".repeat(1024 * 1024 - 2)),
    headers: { "content-type": "application/json" }
  });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), { ok: true });
  assert.deepEqual(calls, ["ordinary-post"]);
});
