#!/usr/bin/env node
import "dotenv/config";
import { backupDatabase, parseArguments } from "./database-recovery.mjs";

try {
  const result = await backupDatabase(parseArguments(process.argv.slice(2), "backup"));
  console.log(`Private PostgreSQL backup created: ${result.archive}\nChecksum manifest: ${result.manifest}\nA restore drill is still required; this is not proof of recovery.`);
} catch (error) {
  console.error(`Backup refused or failed: ${error.message}`);
  process.exitCode = 1;
}
