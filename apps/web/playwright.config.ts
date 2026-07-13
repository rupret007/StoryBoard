import { defineConfig, devices } from "@playwright/test";

const root = "../..";
const normalizeUrl = (value: string) => value.replace(/\/$/, "");
const webUrl = normalizeUrl(process.env.E2E_WEB_URL ?? "http://127.0.0.1:3000");
const apiUrl = normalizeUrl(process.env.E2E_API_URL ?? "http://127.0.0.1:4000");
const webPort = new URL(webUrl).port || (webUrl.startsWith("https:") ? "443" : "80");
const apiPort = new URL(apiUrl).port || (apiUrl.startsWith("https:") ? "443" : "80");

export default defineConfig({
  testDir: "./e2e",
  // Manager journeys deliberately exercise several audited API transitions.
  // Keep one real attempt, but allow slower developer and shared CI machines
  // enough time to finish the workflow instead of failing mid-assertion.
  timeout: 60_000,
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  preserveOutput: "always",
  // Each focused case creates its own domain prerequisites, but every case
  // still shares the same reset database. Fail the real attempt so a retry
  // cannot hide state leakage or an idempotency regression.
  retries: 0,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  use: {
    baseURL: webUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @storyboard/api start",
      cwd: root,
      url: `${apiUrl}/health`,
      env: {
        ...process.env,
        NODE_ENV: "development",
        AUTH_DEV_BYPASS: "true",
        API_PORT: apiPort,
        WEB_URL: webUrl,
        // Keep the dev session host-only. A developer .env commonly scopes it
        // to localhost, which browsers correctly refuse on the 127.0.0.1 E2E origin.
        COOKIE_DOMAIN: ""
      },
      reuseExistingServer: false
    },
    {
      command: `pnpm --filter @storyboard/web exec next start --port ${webPort}`,
      cwd: root,
      url: webUrl,
      env: { ...process.env, NODE_ENV: "production" },
      reuseExistingServer: false
    }
  ]
});
