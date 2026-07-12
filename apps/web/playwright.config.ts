import { defineConfig, devices } from "@playwright/test";

const root = "../..";

export default defineConfig({
  testDir: "./e2e",
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  preserveOutput: "always",
  // These three tests are one serial booking-to-operations journey over the
  // same explicit database. Retrying only the final test would reuse partially
  // mutated state rather than replaying the journey, so fail the real attempt.
  retries: 0,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @storyboard/api start",
      cwd: root,
      url: "http://127.0.0.1:4000/health",
      env: {
        ...process.env,
        NODE_ENV: "development",
        AUTH_DEV_BYPASS: "true",
        WEB_URL: "http://127.0.0.1:3000",
        // Keep the dev session host-only. A developer .env commonly scopes it
        // to localhost, which browsers correctly refuse on the 127.0.0.1 E2E origin.
        COOKIE_DOMAIN: ""
      },
      reuseExistingServer: false
    },
    {
      command: "pnpm --filter @storyboard/web start",
      cwd: root,
      url: "http://127.0.0.1:3000",
      env: { ...process.env, NODE_ENV: "production" },
      reuseExistingServer: false
    }
  ]
});
