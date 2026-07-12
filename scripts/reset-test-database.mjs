#!/usr/bin/env node
import pg from "pg";
import { requireTestDatabaseUrl } from "./test-database.mjs";

const client = new pg.Client({ connectionString: requireTestDatabaseUrl() });
try {
  await client.connect();
  await client.query('TRUNCATE TABLE "Artist", "Operator" RESTART IDENTITY CASCADE');
  console.log("Explicit test database reset complete.");
} finally {
  await client.end();
}
