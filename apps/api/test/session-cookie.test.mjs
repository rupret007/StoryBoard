import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import cookie from "@fastify/cookie";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import authControllerMod from "../dist/auth/auth.controller.js";
import authServiceMod from "../dist/auth/auth.service.js";
import membershipMod from "../dist/auth/membership.service.js";
import rolePolicyMod from "../dist/auth/role-policy.service.js";
import sessionGuardMod from "../dist/auth/session-auth.guard.js";
import prismaMod from "../dist/prisma/prisma.service.js";
import sessionCookieMod from "../dist/auth/session-cookie.js";

const { AuthController } = authControllerMod;
const { AuthService } = authServiceMod;
const { MembershipService } = membershipMod;
const { RolePolicyService } = rolePolicyMod;
const { SessionAuthGuard } = sessionGuardMod;
const { PrismaService } = prismaMod;
const { readSessionFromCookieHeader, signSessionPayload } = sessionCookieMod;

const secret = "session-cookie-test-secret";
const payload = {
  v: 1,
  operatorId: "operator-test",
  currentArtistId: null,
  iat: Date.now(),
  exp: Date.now() + 60_000
};
const token = signSessionPayload(payload, secret);
const encodedToken = token.replace(".", "%2E");
const invalidTokens = [
  signSessionPayload(payload, "wrong-secret"),
  `${token.split(".")[0]}.short`,
  signSessionPayload({ ...payload, exp: Date.now() - 1 }, secret)
];
const malformedValues = [
  ["bare percent", "%"],
  ["truncated escape", "%2"],
  ["non-hex escape", "%GG"],
  ["invalid UTF-8 byte", "%FF"],
  ["truncated UTF-8 sequence", "%E0%A4"],
  ["UTF-8 surrogate", "%ED%A0%80"]
];

for (const [description, value] of malformedValues) {
  test(`session cookie rejects ${description} without logging`, (t) => {
    const logs = [];
    for (const method of ["log", "info", "warn", "error", "debug"]) {
      t.mock.method(console, method, (...args) => logs.push(args));
    }
    assert.equal(readSessionFromCookieHeader(`other=ok; sb_session=${value}`, secret), null);
    assert.deepEqual(logs, []);
  });
}

test("session cookie retains valid raw and percent-encoded signatures", () => {
  for (const value of [token, encodedToken]) {
    assert.deepEqual(
      readSessionFromCookieHeader(`other=%; sb_session= ${value} ; theme=dark`, secret),
      payload
    );
  }
});

test("missing, invalid-signature, and expired cookies remain unauthenticated", () => {
  for (const header of [undefined, "", " ", "other=%", "sb_session=", ...invalidTokens.map((value) => `sb_session=${value}`)]) {
    assert.equal(readSessionFromCookieHeader(header, secret), null);
  }
});

test("a malformed first session cookie cannot fall through to a valid duplicate", () => {
  assert.equal(readSessionFromCookieHeader(`sb_session=%; sb_session=${token}`, secret), null);
});

test("protected auth/me returns 401 for malformed cookies through the real auth service and guard", async (t) => {
  const logs = [];
  const logger = Object.fromEntries(
    ["log", "error", "warn", "debug", "verbose", "fatal"].map((method) => [method, (...args) => logs.push(args)])
  );
  for (const method of ["log", "info", "warn", "error", "debug"]) {
    t.mock.method(console, method, (...args) => logs.push(args));
  }
  const operator = { id: payload.operatorId, email: "operator@example.test", name: "Test" };
  let operatorReads = 0;
  let membershipReads = 0;
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      AuthService,
      SessionAuthGuard,
      { provide: ConfigService, useValue: new ConfigService({ SESSION_SECRET: secret }) },
      { provide: MembershipService, useValue: {} },
      { provide: RolePolicyService, useValue: {} },
      {
        provide: PrismaService,
        useValue: {
          client: {
            operator: { findUnique: async ({ where }) => {
              operatorReads++;
              return where.id === operator.id ? operator : null;
            } },
            artistMembership: { findMany: async () => { membershipReads++; return []; } }
          }
        }
      }
    ]
  }).setLogger(logger).compile();
  const app = module.createNestApplication(new FastifyAdapter(), { logger });
  t.after(() => app.close());
  await app.register(cookie, { secret });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  logs.length = 0;

  for (const [description, value] of malformedValues) {
    await t.test(description, async () => {
      const response = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: `sb_session=${value}` } });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), { message: "Sign in required", error: "Unauthorized", statusCode: 401 });
    });
  }
  for (const value of ["", ...invalidTokens]) {
    const response = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: `sb_session=${value}` } });
    assert.equal(response.statusCode, 401);
  }
  assert.equal(operatorReads, 0);
  assert.equal(membershipReads, 0);
  assert.deepEqual(logs, []);

  for (const value of [token, encodedToken]) {
    const response = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: `sb_session=${value}` } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { operator, memberships: [], currentArtistId: null });
  }
  assert.equal(operatorReads, 4);
  assert.equal(membershipReads, 2);

  const unknownOperator = signSessionPayload({ ...payload, operatorId: "missing" }, secret);
  const response = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: `sb_session=${unknownOperator}` } });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().message, "Session operator not found");
  assert.equal(operatorReads, 5);
  assert.equal(membershipReads, 2);
});
