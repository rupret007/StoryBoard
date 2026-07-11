import { defineConfig, devices } from "@playwright/test";

const root = "../..";

export default defineConfig({
  testDir: "./e2e",
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  preserveOutput: "always",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "on-first-retry"
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
        AUTH_DEV_BYPASS: "true"
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
