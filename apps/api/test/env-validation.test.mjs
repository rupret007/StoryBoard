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

test("development still accepts the documented local session placeholder", () => {
  const config = envMod.validateEnv(base({
    NODE_ENV: "development",
    SESSION_SECRET: "replace-me"
  }));
  assert.equal(config.SESSION_SECRET, "replace-me");
});

test("production rejects weak or placeholder session secrets", () => {
  assert.throws(
    () => envMod.validateEnv(base({ NODE_ENV: "production", SESSION_SECRET: "replace-me" })),
    /SESSION_SECRET/
  );
  assert.throws(
    () => envMod.validateEnv(base({ NODE_ENV: "production", SESSION_SECRET: "shortsecret" })),
    /SESSION_SECRET/
  );
  assert.throws(
    () => envMod.validateEnv(base({
      NODE_ENV: "production",
      SESSION_SECRET: "local-demo-session-secret-change-me"
    })),
    /SESSION_SECRET/
  );
});

test("production accepts a high-entropy session secret", () => {
  const secret = "production-session-secret-32chars!!";
  const config = envMod.validateEnv(base({
    NODE_ENV: "production",
    SESSION_SECRET: secret
  }));
  assert.equal(config.SESSION_SECRET, secret);
});

test("production cannot enable AUTH_DEV_BYPASS", () => {
  assert.throws(
    () => envMod.validateEnv(base({
      NODE_ENV: "production",
      SESSION_SECRET: "production-session-secret-32chars!!",
      AUTH_DEV_BYPASS: "true"
    })),
    /AUTH_DEV_BYPASS/
  );
});

test("production requires a Telegram webhook secret when the bot token is set", () => {
  assert.throws(
    () => envMod.validateEnv(base({
      NODE_ENV: "production",
      SESSION_SECRET: "production-session-secret-32chars!!",
      TELEGRAM_BOT_TOKEN: "123:token"
    })),
    /TELEGRAM_WEBHOOK_SECRET/
  );
  const config = envMod.validateEnv(base({
    NODE_ENV: "production",
    SESSION_SECRET: "production-session-secret-32chars!!",
    TELEGRAM_BOT_TOKEN: "123:token",
    TELEGRAM_WEBHOOK_SECRET: "webhook-secret"
  }));
  assert.equal(config.TELEGRAM_WEBHOOK_SECRET, "webhook-secret");
});

test("development can keep Telegram inbound optional without a webhook secret", () => {
  const config = envMod.validateEnv(base({
    NODE_ENV: "development",
    TELEGRAM_BOT_TOKEN: "123:token"
  }));
  assert.equal(config.TELEGRAM_WEBHOOK_SECRET, undefined);
});
