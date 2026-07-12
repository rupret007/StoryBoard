import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const envImport = await import(pathToFileURL(join(dir, "..", "dist", "config", "env.validation.js")).href);
const envMod = envImport.default ?? envImport;

function base(overrides = {}) {
  return {
    DATABASE_URL: "postgresql://storyboard:storyboard@localhost:5432/storyboard?schema=public",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SECRET: "local-session-secret",
    ...overrides
  };
}

test("environment validation accepts the documented local development seed email", () => {
  const config = envMod.validateEnv(base({ SEED_OPERATOR_EMAIL: "dev@localhost" }));
  assert.equal(config.SEED_OPERATOR_EMAIL, "dev@localhost");
});

test("environment validation rejects malformed seed emails", () => {
  assert.throws(() => envMod.validateEnv(base({ SEED_OPERATOR_EMAIL: "not-an-email" })), /SEED_OPERATOR_EMAIL/);
});

test("Gmail reply synchronization remains disabled unless explicitly enabled", () => {
  assert.equal(envMod.validateEnv(base()).GMAIL_REPLY_SYNC_ENABLED, false);
  assert.equal(envMod.validateEnv(base({ GMAIL_REPLY_SYNC_ENABLED: "true" })).GMAIL_REPLY_SYNC_ENABLED, true);
});
