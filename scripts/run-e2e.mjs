#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { requireTestDatabaseUrl } from "./test-database.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const databaseUrl = requireTestDatabaseUrl();
const webUrl = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000";
const apiUrl = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const env = {
  ...process.env,
  // The harness builds the production artifacts before Playwright starts its
  // separately configured API (development) and web (production) servers.
  // Do not inherit a developer shell's nonstandard NODE_ENV into Next build.
  NODE_ENV: "production",
  DATABASE_URL: databaseUrl,
  AUTH_DEV_BYPASS: "true",
  E2E_WEB_URL: webUrl,
  E2E_API_URL: apiUrl,
  WEB_URL: webUrl,
  NEXT_PUBLIC_API_URL: apiUrl,
  API_URL: apiUrl,
  // A host-only cookie is required for the browser's 127.0.0.1 test origin.
  // The developer `.env` commonly sets COOKIE_DOMAIN=localhost instead.
  COOKIE_DOMAIN: "",
  ENABLE_QUEUE_WORKER: "false"
};

execFileSync("node", ["scripts/prepare-test-database.mjs"], {
  cwd: root,
  env,
  stdio: "inherit"
});
execFileSync("node", ["scripts/reset-test-database.mjs"], {
  cwd: root,
  env,
  stdio: "inherit"
});
execFileSync("node", ["prisma/seed.mjs"], {
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
