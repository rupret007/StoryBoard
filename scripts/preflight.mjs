#!/usr/bin/env node
import "dotenv/config";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";

const require = createRequire(join(process.cwd(), "apps/api/src/main.ts"));

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

console.log("StoryBoard preflight");
console.log(`Node ${process.version}`);

try {
  run("docker compose ps");
} catch {
  console.error("Docker Compose check failed. Is Docker running?");
  process.exit(1);
}

try {
  const { Client } = require("pg");
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("SELECT 1");
  await client.end();
  console.log("Postgres: SELECT 1 OK");
} catch (e) {
  console.error("Postgres check failed:", e.message);
  process.exit(1);
}

try {
  const Redis = require("ioredis");
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const redis = new Redis(url, { maxRetriesPerRequest: 1, enableReadyCheck: true });
  await redis.ping();
  redis.disconnect();
  console.log("Redis: PING OK");
} catch (e) {
  console.error("Redis check failed:", e.message);
  process.exit(1);
}
