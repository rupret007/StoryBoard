#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { requireTestDatabaseUrl } from "./test-database.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const databaseUrl = requireTestDatabaseUrl();
const env = { ...process.env, DATABASE_URL: databaseUrl };

for (const args of [
  ["exec", "prisma", "generate"],
  ["exec", "prisma", "migrate", "deploy"]
]) {
  execFileSync("pnpm", args, { cwd: root, env, stdio: "inherit" });
}
