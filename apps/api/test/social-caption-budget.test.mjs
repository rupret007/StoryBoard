import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  SocialCaptionBudgetService,
  SOCIAL_CAPTION_BUDGET_UNAVAILABLE,
  SOCIAL_CAPTION_BUDGET_EXHAUSTED
} = require("../dist/social/social-caption-budget.service.js");
const { validateEnv } = require("../dist/config/env.validation.js");

const baseEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://test:test@localhost/storyboard_test",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "synthetic-unit-test-session-value-with-32-characters"
};

function harness(limit, query = async () => [{ calls: 1 }]) {
  const state = { limit, queries: [] };
  const service = new SocialCaptionBudgetService({
    get: (name) => {
      assert.equal(name, "SOCIAL_CAPTION_DAILY_CALL_LIMIT");
      return state.limit;
    }
  }, {
    client: {
      $queryRaw: async (...args) => {
        state.queries.push(args);
        return query(...args);
      }
    }
  });
  return { service, state };
}

function unavailable(message) {
  return (error) => {
    assert.equal(error.getStatus(), 503);
    assert.equal(error.message, message);
    assert.doesNotMatch(JSON.stringify(error.getResponse()), /synthetic-private|postgresql|SELECT|INSERT/i);
    return true;
  };
}

test("caption daily limit defaults to 100 in production and explicitly accepts zero", () => {
  assert.equal(validateEnv(baseEnv).SOCIAL_CAPTION_DAILY_CALL_LIMIT, 100);
  for (const value of [0, "0", 7, "7", 2147483647, "2147483647"]) {
    assert.equal(validateEnv({ ...baseEnv, SOCIAL_CAPTION_DAILY_CALL_LIMIT: value }).SOCIAL_CAPTION_DAILY_CALL_LIMIT, Number(value));
  }
});

test("malformed daily limits fail startup and runtime validation before storage access", async () => {
  for (const limit of ["", " ", "-1", "1.5", "1e3", "Infinity", "00", "100synthetic-private", -1, 1.5, NaN, Infinity, 2147483648, null, true, {}]) {
    assert.throws(() => validateEnv({ ...baseEnv, SOCIAL_CAPTION_DAILY_CALL_LIMIT: limit }), /SOCIAL_CAPTION_DAILY_CALL_LIMIT/);
    const { service, state } = harness(limit);
    await assert.rejects(service.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_UNAVAILABLE));
    assert.equal(state.queries.length, 0);
  }
});

test("zero daily limit disables provider attempts without touching storage", async () => {
  const { service, state } = harness(0);
  await assert.rejects(service.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_EXHAUSTED));
  assert.equal(state.queries.length, 0);
});

test("each allowed attempt requires one durable reservation and uses the current configured cap", async () => {
  const { service, state } = harness(undefined);
  await service.reserve();
  state.limit = 7;
  await service.reserve();
  state.limit = 0;
  await assert.rejects(service.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_EXHAUSTED));
  assert.equal(state.queries.length, 2);
  assert.deepEqual(state.queries.map((args) => args.slice(1)), [[100], [7]]);
});

test("an exhausted durable counter blocks every later attempt", async () => {
  const { service, state } = harness(1, async () => state.queries.length === 1 ? [{ calls: 1 }] : []);
  await service.reserve();
  await assert.rejects(service.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_EXHAUSTED));
  await assert.rejects(service.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_EXHAUSTED));
  assert.equal(state.queries.length, 3);
});

test("storage failures and uncertain writes never use a memory fallback or expose database details", async () => {
  const { service, state } = harness(100, async () => {
    throw new Error("postgresql://synthetic-private:password@localhost INSERT failed");
  });
  await assert.rejects(service.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_UNAVAILABLE));
  await assert.rejects(service.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_UNAVAILABLE));
  assert.equal(state.queries.length, 2);
  const missing = new SocialCaptionBudgetService({ get: () => 100 }, { client: {} });
  await assert.rejects(missing.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_UNAVAILABLE));
  const missingConfig = new SocialCaptionBudgetService({ get: () => { throw new Error("synthetic-private config error"); } }, {});
  await assert.rejects(missingConfig.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_UNAVAILABLE));
});

test("unexpected reservation results fail closed", async () => {
  for (const result of [undefined, null, {}, [{ calls: 0 }], [{ calls: 101 }], [{ calls: 1.5 }], [{ calls: "1" }], [{}], [null], [{ calls: 1 }, { calls: 2 }]]) {
    const { service } = harness(100, async () => result);
    await assert.rejects(service.reserve(), unavailable(SOCIAL_CAPTION_BUDGET_UNAVAILABLE));
  }
});
