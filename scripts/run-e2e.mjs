#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { requireTestDatabaseUrl } from "./test-database.mjs";

async function isPortInUse(port) {
  async function canBind(host) {
    return new Promise((resolve) => {
      const server = net.createServer();
      const onBound = () => {
        server.close(() => resolve(false));
      };
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE") {
          resolve(true);
        } else {
          resolve(true);
        }
      });
      if (host) {
        server.listen(port, host);
      } else {
        server.listen(port);
      }
      server.once("listening", onBound);
    });
  }

  // Probe a small set of host bindings because macOS can report 4000 as used on
  // 0.0.0.0 while permitting a separate 127.0.0.1 listener in some local
  // setups. If any binding fails, treat the port as unavailable for Playwright.
  const probes = [undefined, "127.0.0.1", "::1", "0.0.0.0", "::"];
  for (const host of probes) {
    if (await canBind(host)) {
      return true;
    }
  }
  return false;
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    const inUse = await isPortInUse(port);
    if (!inUse) {
      return port;
    }
  }
  throw new Error(
    `No available port found starting at ${startPort} (after probing 50 ports).`
  );
}

async function resolveTestUrl(envName, fallbackUrl) {
  const explicit = process.env[envName];
  const parsed = new URL(explicit ?? fallbackUrl);
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));

  if (explicit || !(await isPortInUse(port))) {
    return parsed.toString();
  }

  const fallbackPort = await findAvailablePort(port + 1);
  parsed.port = String(fallbackPort);
  console.log(
    `Auto-selected ${envName}=${parsed.toString()} because the default port ${port} was already in use.`
  );
  return parsed.toString();
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const databaseUrl = requireTestDatabaseUrl();
const webUrl = await resolveTestUrl("E2E_WEB_URL", "http://127.0.0.1:3000");
const apiUrl = await resolveTestUrl("E2E_API_URL", "http://127.0.0.1:4000");
const canonicalizeUrl = (value) => value.replace(/\/$/, "");
const browserWebUrl = canonicalizeUrl(webUrl);
const browserApiUrl = canonicalizeUrl(apiUrl);
const env = {
  ...process.env,
  // The harness builds the production artifacts before Playwright starts its
  // separately configured API (development) and web (production) servers.
  // Do not inherit a developer shell's nonstandard NODE_ENV into Next build.
  NODE_ENV: "production",
  DATABASE_URL: databaseUrl,
  AUTH_DEV_BYPASS: "true",
  E2E_WEB_URL: browserWebUrl,
  E2E_API_URL: browserApiUrl,
  WEB_URL: browserWebUrl,
  NEXT_PUBLIC_API_URL: browserApiUrl,
  API_URL: browserApiUrl,
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
