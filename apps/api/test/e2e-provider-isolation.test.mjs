import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { buildE2eEnvironment } from "../../../scripts/e2e-environment.mjs";

const require = createRequire(import.meta.url);
const { buildAdapterRegistry, providerModes } = require("../dist/integrations/build-registry.js");
const { validateEnv } = require("../dist/config/env.validation.js");

test("browser environment selects only mock adapters and disables provider automation", () => {
  const inherited = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://localhost/storyboard_test",
    REDIS_URL: "redis://localhost:6379",
    SESSION_SECRET: "synthetic-test-session-secret",
    GOOGLE_CLIENT_ID: "synthetic-live-client",
    GOOGLE_CLIENT_SECRET: "synthetic-live-secret",
    GOOGLE_OAUTH_REFRESH_TOKEN: "synthetic-live-refresh",
    BANDSINTOWN_APP_ID: "synthetic-live-discovery",
    TICKETMASTER_API_KEY: "synthetic-live-discovery",
    TELEGRAM_BOT_TOKEN: "synthetic-live-telegram",
    OPENAI_ENABLED: "true",
    OPENAI_API_KEY: "synthetic-live-openai",
    BOOKING_ADVISOR_AUTOMATION_ENABLED: "true",
    GMAIL_REPLY_SYNC_ENABLED: "true",
    ENABLE_QUEUE_WORKER: "true"
  };
  const env = validateEnv(buildE2eEnvironment(inherited));
  assert.deepEqual(providerModes(buildAdapterRegistry(env)), {
    gmail: "mock", calendar: "mock", drive: "mock", bandsintown: "mock",
    ticketmaster: "mock", youtube: "mock", spotify: "mock"
  });
  assert.equal(env.TELEGRAM_BOT_TOKEN, "");
  assert.equal(env.OPENAI_ENABLED, false);
  assert.equal(env.GMAIL_REPLY_SYNC_ENABLED, false);
  assert.equal(env.BOOKING_ADVISOR_AUTOMATION_ENABLED, false);
  assert.equal(env.ENABLE_QUEUE_WORKER, "false");
});
