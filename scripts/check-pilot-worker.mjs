#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireApi = createRequire(join(root, "apps/api/package.json"));
const { Queue } = requireApi("bullmq");
const { default: Redis } = requireApi("ioredis");
const { Client } = requireApi("pg");
const dist = join(root, "apps/api/dist");
if (!existsSync(join(dist, "main.js"))) throw new Error("Build the current API first: pnpm --filter @storyboard/api build");
if (process.argv.length > 2) throw new Error("This check accepts no connection URLs or container names; it only uses containers it creates.");
const label = `storyboard-worker-test-${randomBytes(5).toString("hex")}`;
const pgName = `${label}-pg`, redisName = `${label}-redis`;
const runtime = mkdtempSync(join(tmpdir(), `${label}-`));
const apiCwd = join(runtime, "run", "api");
mkdirSync(apiCwd, { recursive: true });
const password = randomBytes(20).toString("hex");
const sessionSecret = randomBytes(32).toString("hex");
const containers = [];
let api, apiOutput = "", queue, redis;
const inherited = Object.fromEntries(["PATH", "SystemRoot", "TMPDIR"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", timeout: 60000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${executable} ${args[0]} failed; check local Docker, installed images, migrations and build prerequisites. No external target was used.`);
  return result.stdout.trim();
}
async function poll(check, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await delay(250); }
  throw new Error(`Timed out: ${label}`);
}
function mappedPort(name, port) { return Number(command("docker", ["inspect", "--format", `{{(index (index .NetworkSettings.Ports "${port}/tcp") 0).HostPort}}`, name])); }
async function freePort() {
  const server = createServer();
  await new Promise((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
function buildFingerprint() {
  const hash = createHash("sha256");
  function scan(directory) { for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name.endsWith(".js")) hash.update(path.slice(dist.length)).update(readFileSync(path));
  } }
  scan(dist); return hash.digest("hex");
}
async function stopApi() {
  if (!api?.pid || api.exitCode !== null || api.signalCode !== null) return;
  const child = api;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  await exited; clearTimeout(timer);
}

try {
  const apiBuildSha256 = buildFingerprint();
  // Images must already exist locally: this test does not pull or change a deployment.
  command("docker", ["image", "inspect", "postgres:16", "redis:7"]);
  const pgPort = await freePort();
  command("docker", ["run", "--pull=never", "-d", "--name", pgName, "--label", "storyboard.synthetic-worker-check=true", "-p", `127.0.0.1:${pgPort}:5432`, "-e", "POSTGRES_USER=storyboard", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=storyboard_worker_test", "postgres:16"]);
  containers.push(pgName);
  const redisPort = await freePort();
  command("docker", ["run", "--pull=never", "-d", "--name", redisName, "--label", "storyboard.synthetic-worker-check=true", "-p", `127.0.0.1:${redisPort}:6379`, "redis:7"]);
  containers.push(redisName);
  const dbUrl = `postgresql://storyboard:${password}@127.0.0.1:${mappedPort(pgName, 5432)}/storyboard_worker_test`;
  const redisUrl = `redis://127.0.0.1:${mappedPort(redisName, 6379)}/0`;
  async function sql(text, params = []) {
    const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 2000 });
    client.on("error", () => undefined);
    try { await client.connect(); return await client.query(text, params); } finally { await client.end().catch(() => undefined); }
  }
  await poll(async () => { try { await sql("SELECT 1"); return true; } catch { return false; } }, "isolated PostgreSQL startup");
  console.log("Working: isolated PostgreSQL and Redis started; applying existing migrations.");
  command("pnpm", ["exec", "prisma", "migrate", "deploy"], { env: { ...inherited, DATABASE_URL: dbUrl } });
  await sql('INSERT INTO "Artist" (id,name,slug,"updatedAt") VALUES ($1,$2,$3,NOW())', ["worker-test-band", "Synthetic worker test band", "synthetic-worker-test"]);
  await sql('INSERT INTO "Operator" (id,email,name,"workflowEmailEnabled","updatedAt") VALUES ($1,$2,$3,false,NOW())', ["worker-test-owner", "worker@example.test", "Synthetic owner"]);
  await sql('INSERT INTO "ArtistMembership" (id,"artistId","operatorId",role) VALUES ($1,$2,$3,$4)', ["worker-test-membership", "worker-test-band", "worker-test-owner", "owner"]);
  await sql('INSERT INTO "ArtistOperatingProfile" (id,"artistId","communicationCadence","intakeCompletedAt","updatedAt") VALUES ($1,$2,$3,NOW(),NOW())', ["worker-test-profile", "worker-test-band", "weekly"]);
  // Weekly Monday 00:00 UTC is always due, avoiding a midnight daily boundary during the drill.
  await sql('INSERT INTO "ManagerSettings" (id,"artistId","scheduleEnabled","scheduledAiEnabled",timezone,"dailyHour","weeklyDay","updatedAt") VALUES ($1,$2,true,false,$3,0,1,NOW())', ["worker-test-settings", "worker-test-band", "UTC"]);
  const port = await freePort();
  const apiUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...inherited, NODE_ENV: "production", DATABASE_URL: dbUrl, REDIS_URL: redisUrl, API_PORT: String(port), WEB_URL: "http://127.0.0.1:3999", SESSION_SECRET: sessionSecret,
    ENABLE_QUEUE_WORKER: "true", AUTH_DEV_BYPASS: "false", OPENAI_ENABLED: "false", OPENAI_API_KEY: "", GMAIL_REPLY_SYNC_ENABLED: "false", BOOKING_ADVISOR_AUTOMATION_ENABLED: "false",
    GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_OAUTH_REFRESH_TOKEN: "", BANDSINTOWN_APP_ID: "", TICKETMASTER_API_KEY: "", TELEGRAM_BOT_TOKEN: "", TELEGRAM_WEBHOOK_SECRET: "",
    MANAGER_SCHEDULE_SCAN_MS: "60000", WORKFLOW_AUTOMATION_REPEAT_MS: "86400000", WORKFLOW_DIGEST_DAILY_MS: "86400000", WORKFLOW_DIGEST_WEEKLY_MS: "604800000"
  };
  async function startApi() {
    api = spawn(process.execPath, [join(dist, "main.js")], { cwd: apiCwd, env, stdio: ["ignore", "pipe", "pipe"] });
    api.on("error", () => undefined);
    api.stdout.on("data", (chunk) => { apiOutput = (apiOutput + chunk).slice(-10000); });
    api.stderr.on("data", (chunk) => { apiOutput = (apiOutput + chunk).slice(-10000); });
    await poll(async () => {
      if (api.exitCode !== null || api.signalCode !== null) throw new Error(`API exited before ready: ${apiOutput.slice(-1800)}`);
      try { const response = await fetch(`${apiUrl}/ready`); if (!response.ok) return false; const ready = await response.json(); return ready.workerEnabled && ready.workerRunning; } catch { return false; }
    }, "API with existing worker ready");
  }
  redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  redis.on("error", () => undefined);
  queue = new Queue("storyboard-enrichment", { connection: redis });
  await startApi();
  async function scan(jobId) {
    const job = await queue.add("manager.schedule.scan", {}, { jobId });
    await poll(async () => { const state = await job.getState(); if (state === "failed") throw new Error("Manager scan job failed"); return state === "completed"; }, `scan job ${jobId}`);
    const saved = await queue.getJob(job.id);
    assert.equal(saved.returnvalue.ok, true); assert.equal(saved.returnvalue.failed, 0);
    return saved.returnvalue;
  }
  async function records() {
    const runs = (await sql('SELECT id,mode,"scheduleKey",trace FROM "ManagerRun" WHERE "artistId"=$1', ["worker-test-band"])).rows;
    const notices = (await sql('SELECT id,"recipientOperatorId",metadata FROM "WorkflowNotification" WHERE "artistId"=$1 AND kind=$2', ["worker-test-band", "manager_brief_ready"])).rows;
    assert.equal(runs.length, 1); assert.equal(notices.length, 1);
    assert.equal(runs[0].mode, "deterministic");
    assert.equal(runs[0].trace.providerContext.attempted, false);
    assert.equal(notices[0].metadata.managerRunId, runs[0].id);
    assert.equal(notices[0].recipientOperatorId, "worker-test-owner");
    return { runId: runs[0].id, noticeId: notices[0].id, scheduleKey: runs[0].scheduleKey };
  }
  await scan("worker-proof-first");
  const before = await records();
  const duplicate = await scan("worker-proof-duplicate");
  assert.equal(duplicate.generated, 0);
  assert.deepEqual(await records(), before);
  console.log("Working: existing BullMQ worker produced one deterministic scheduled brief and one in-app notification; second scan produced no duplicate.");
  await poll(async () => (await queue.getJobs(["completed"], 0, 100)).some((job) => job.name === "manager.schedule.scan" && job.id.startsWith("repeat:") && job.returnvalue?.ok), "registered recurring scheduler job completed", 75000);
  assert.deepEqual(await records(), before);
  console.log("Working: registered recurring scan also completed and preserved the same brief/notification.");

  await stopApi();
  const queued = await queue.add("manager.schedule.scan", {}, { jobId: "worker-proof-after-restart" });
  assert.equal(await queued.getState(), "waiting");
  command("docker", ["restart", pgName]);
  assert.equal(mappedPort(pgName, 5432), pgPort, "PostgreSQL host port changed after restart");
  await poll(async () => { try { await sql("SELECT 1"); return true; } catch { return false; } }, "PostgreSQL restart");
  await startApi();
  await poll(async () => (await queued.getState()) === "completed", "queued scan consumed after API/database restart");
  const resumed = await queue.getJob(queued.id);
  assert.equal(resumed.returnvalue.ok, true); assert.equal(resumed.returnvalue.generated, 0);
  assert.deepEqual(await records(), before);
  const now = Date.now();
  const body = Buffer.from(JSON.stringify({ v: 1, operatorId: "worker-test-owner", currentArtistId: "worker-test-band", iat: now, exp: now + 60000 })).toString("base64url");
  const cookie = `${body}.${createHmac("sha256", sessionSecret).update(body).digest("base64url")}`;
  const response = await fetch(`${apiUrl}/workflow/notifications`, { headers: { cookie: `sb_session=${cookie}`, "x-artist-id": "worker-test-band" } });
  assert.equal(response.status, 200);
  const visible = await response.json();
  assert.equal(visible.items.filter((item) => item.id === before.noticeId).length, 1);
  const failures = (await sql('SELECT count(*)::int AS count FROM "AuditEvent" WHERE action=$1', ["manager.schedule_failed"])).rows[0].count;
  assert.equal(failures, 0);
  const version = (await sql("SHOW server_version")).rows[0].server_version;
  assert.equal(buildFingerprint(), apiBuildSha256, "API build changed during the check; rerun against stable artifacts");
  console.log(JSON.stringify({ status: "PASS", check: "pilot_worker_restart_v1", apiBuildSha256, postgresVersion: version, recurringScanProcessed: true, restart: "API process and isolated PostgreSQL container", queuedWorkResumed: true, scheduledBriefs: 1, notifications: 1, rowIdsPreserved: true, authenticatedNotificationRead: true, providerAttempted: false, ...before }, null, 2));
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : "Worker check failed"}`);
  process.exitCode = 1;
} finally {
  await stopApi();
  await queue?.close().catch(() => undefined);
  await redis?.quit().catch(() => undefined);
  for (const name of containers.reverse()) {
    const cleanup = spawnSync("docker", ["rm", "-f", "-v", name], { stdio: "ignore", timeout: 30000 });
    if (cleanup.status !== 0) console.error(`Cleanup needed for synthetic container ${name}`);
  }
  rmSync(runtime, { recursive: true, force: true });
}
