#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { requireTestDatabaseUrl } from "./test-database.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const databaseUrl = requireTestDatabaseUrl();
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  AUTH_DEV_BYPASS: "true",
  WEB_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
  API_URL: "http://127.0.0.1:4000",
  ENABLE_QUEUE_WORKER: "false"
};

execFileSync("node", ["scripts/prepare-test-database.mjs"], {
  cwd: root,
  env,
  stdio: "inherit"
});
// Playwright starts the production servers, so make this command self-contained:
// it must not accidentally exercise a stale API or Next build from a prior run.
execFileSync("pnpm", ["build"], {
  cwd: root,
  env,
  stdio: "inherit"
});
execFileSync("pnpm", ["--filter", "@storyboard/web", "test:e2e"], {
  cwd: root,
  env,
  stdio: "inherit"
});
