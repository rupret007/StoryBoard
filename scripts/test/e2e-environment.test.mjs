import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildE2eEnvironment } from "../e2e-environment.mjs";

const runner = new URL("../run-e2e.mjs", import.meta.url).href;
const playwrightConfig = new URL("../../apps/web/playwright.config.ts", import.meta.url).href;
const providerCredentials = [
  "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN",
  "GOOGLE_CALENDAR_DEFAULT_ID", "GOOGLE_DRIVE_ROOT_FOLDER_ID",
  "INTEGRATION_SECRETS_ENCRYPTION_KEY", "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET", "BANDSINTOWN_APP_ID",
  "TICKETMASTER_API_KEY", "OPENAI_API_KEY", "YOUTUBE_API_KEY",
  "SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"
];
const disabledFlags = [
  "OPENAI_ENABLED", "ENABLE_QUEUE_WORKER", "GMAIL_REPLY_SYNC_ENABLED",
  "BOOKING_ADVISOR_AUTOMATION_ENABLED"
];
const liveEnvironment = Object.fromEntries([
  ...providerCredentials.map((key) => [key, `synthetic-live-${key}`]),
  ...disabledFlags.map((key) => [key, "true"])
]);
const providerKeys = [...providerCredentials, ...disabledFlags];

function assertMockEnvironment(env) {
  for (const key of providerCredentials) assert.equal(env[key], "", key);
  for (const key of disabledFlags) assert.equal(env[key], "false", key);
}

// Execute the real runner, intercepting all child commands before they can
// touch a database, build artifacts, or launch a browser. Explicit URLs also
// prevent port probes. Each case gets its own process/environment.
function childCalls(tz, inherited = {}) {
  const env = {
    ...process.env,
    ...inherited,
    STORYBOARD_TEST_DATABASE_URL: "postgresql://test:test@127.0.0.1/storyboard_test",
    E2E_WEB_URL: "http://127.0.0.1:3000",
    E2E_API_URL: "http://127.0.0.1:4000"
  };
  if (tz === undefined) delete env.TZ;
  else env.TZ = tz;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    const calls = [];
    childProcess.execFileSync = (command, args, options) => {
      calls.push({ command, args, tz: options.env.TZ,
        providers: Object.fromEntries(${JSON.stringify(providerKeys)}.map(key => [key, options.env[key]])) });
    };
    syncBuiltinESMExports();
    await import(${JSON.stringify(runner)});
    console.log(JSON.stringify(calls));
  `], { env, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

test("every e2e runner child overrides inherited live provider credentials", () => {
  const calls = childCalls(undefined, liveEnvironment);
  assert.equal(calls.length, 5);
  for (const call of calls) assertMockEnvironment(call.providers);
});

test("direct Playwright startup overrides inherited providers for both servers", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", `
    const { default: config } = await import(${JSON.stringify(playwrightConfig)});
    console.log(JSON.stringify(config.webServer.map(server => ({
      providers: Object.fromEntries(${JSON.stringify(providerKeys)}.map(key => [key, server.env[key]])),
      nodeEnv: server.env.NODE_ENV,
      reuseExistingServer: server.reuseExistingServer
    }))));
  `], { env: { ...process.env, ...liveEnvironment }, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const servers = JSON.parse(result.stdout);
  assert.equal(servers.length, 2);
  assert.deepEqual(servers.map(server => server.nodeEnv), ["development", "production"]);
  for (const server of servers) {
    assertMockEnvironment(server.providers);
    assert.equal(server.reuseExistingServer, false);
  }
});

test("builder preserves harness settings without mutating the inherited environment", () => {
  const inherited = Object.freeze({
    ...liveEnvironment,
    PATH: "/synthetic/bin", DATABASE_URL: "postgresql://localhost/storyboard_test",
    REDIS_URL: "redis://localhost:6379", SESSION_SECRET: "synthetic-session",
    E2E_API_URL: "http://127.0.0.1:4400", AUTH_DEV_BYPASS: "true", TZ: "UTC"
  });
  const result = buildE2eEnvironment(inherited);
  assertMockEnvironment(result);
  for (const [key, value] of Object.entries(inherited)) {
    if (!providerKeys.includes(key)) assert.equal(result[key], value, key);
  }
  assert.equal(inherited.GOOGLE_CLIENT_ID, liveEnvironment.GOOGLE_CLIENT_ID);
  assert.deepEqual(buildE2eEnvironment(result), result);
});

test("empty overrides prevent dotenv and Nest from restoring live .env providers", () => {
  const directory = mkdtempSync(join(tmpdir(), "storyboard-e2e-env-"));
  const envFile = join(directory, ".env");
  try {
    writeFileSync(envFile, Object.entries(liveEnvironment)
      .map(([key, value]) => `${key}=${value}`).join("\n"));
    const inherited = { ...process.env };
    for (const key of providerKeys) delete inherited[key];
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
      import assert from "node:assert/strict";
      import { createRequire } from "node:module";
      import { config as loadEnv } from "dotenv";
      const require = createRequire(${JSON.stringify(new URL("../../apps/api/package.json", import.meta.url).href)});
      const { ConfigModule } = require("@nestjs/config");
      const envFilePath = ${JSON.stringify(envFile)};
      loadEnv({ path: envFilePath });
      const keys = ${JSON.stringify(providerKeys)};
      const pick = env => Object.fromEntries(keys.map(key => [key, env[key]]));
      const dotenvValues = pick(process.env);
      let nestValues;
      await ConfigModule.forRoot({
        envFilePath,
        validate: config => { nestValues = pick(config); return config; }
      });
      assert.deepEqual(nestValues, dotenvValues);
      console.log(JSON.stringify(nestValues));
    `], { env: buildE2eEnvironment(inherited), encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assertMockEnvironment(JSON.parse(result.stdout));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [label, input, expected] of [
  ["unset TZ defaults to UTC", undefined, "UTC"],
  ["empty TZ defaults to UTC", "", "UTC"],
  ["explicit TZ is preserved", "America/Chicago", "America/Chicago"]
]) {
  test(`e2e subprocess environment: ${label}`, () => {
    const calls = childCalls(input);
    assert.deepEqual(calls.map(({ command, args }) => [command, ...args]), [
      ["node", "scripts/prepare-test-database.mjs"],
      ["node", "scripts/reset-test-database.mjs"],
      ["node", "prisma/seed.mjs"],
      ["pnpm", "build"],
      ["pnpm", "--filter", "@storyboard/web", "test:e2e"]
    ]);
    for (const call of calls) {
      assert.equal(call.tz, expected, `${call.command} ${call.args.join(" ")}`);
    }
  });
}

test("Quality pins the browser workflow environment to UTC", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/quality.yml", import.meta.url), "utf8");
  const browserStep = workflow.split(/^      - /m)
    .find((step) => /^        run: pnpm test:e2e\s*$/m.test(step));
  assert.ok(browserStep, "Quality must run the browser workflow");
  assert.match(browserStep, /^        env:\n(?:          [^\n]*\n)*          TZ: UTC\s*$/m);
});

test("install docs describe the committed lockfile and shared prepare build", () => {
  const runbook = readFileSync(new URL("../../docs/developer-runbook.md", import.meta.url), "utf8");
  const install = runbook.split("## 2. Clone and install")[1].split("## 3.")[0];
  assert.match(install, /uses the committed `pnpm-lock\.yaml`/);
  assert.match(install, /runs \*\*`prepare`\*\*, which builds `@storyboard\/shared` into `dist\/`/);
  assert.doesNotMatch(install, /creates `pnpm-lock\.yaml`/);
});
