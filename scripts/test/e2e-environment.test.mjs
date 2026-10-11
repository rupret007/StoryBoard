import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = new URL("../run-e2e.mjs", import.meta.url).href;

// Execute the real runner, intercepting all child commands before they can
// touch a database, build artifacts, or launch a browser. Explicit URLs also
// prevent port probes. Each case gets its own process/environment.
function childCalls(tz) {
  const env = {
    ...process.env,
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
      calls.push({ command, args, tz: options.env.TZ });
    };
    syncBuiltinESMExports();
    await import(${JSON.stringify(runner)});
    console.log(JSON.stringify(calls));
  `], { env, encoding: "utf8", timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

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
