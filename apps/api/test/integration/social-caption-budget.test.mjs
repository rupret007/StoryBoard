import "reflect-metadata";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { requireTestDatabaseUrl } from "../../../../scripts/test-database.mjs";

const databaseUrl = requireTestDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;
const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "..", "dist", path)).href);
  return module.default ?? module;
};
const [{ PrismaClient }, { SocialCaptionBudgetService }, { createPrismaClient }] = await Promise.all([
  load("generated/prisma/client.js"),
  load("social/social-caption-budget.service.js"),
  load("lib/prisma.js")
]);

// Other integration files exercise the global budget too. Isolate only this
// suite's usage table, preserving the real migrated constraints and SQL path.
const schema = `caption_budget_test_${randomUUID().replaceAll("-", "")}`;
const admin = createPrismaClient();
const clients = [];
function newClient() {
  const client = new PrismaClient({ adapter: new PrismaPg({
    connectionString: databaseUrl,
    options: `-c search_path=${schema}`
  }, { schema }) });
  clients.push(client);
  return client;
}
const first = newClient();
const second = newClient();
function service(client, limit) {
  return new SocialCaptionBudgetService({
    get: (key) => key === "SOCIAL_CAPTION_DAILY_CALL_LIMIT" ? limit : undefined
  }, { client });
}
function isUnavailable(error) {
  return error?.getStatus?.() === 503;
}
async function todayCalls() {
  const rows = await first.$queryRaw`
    SELECT "calls" FROM "SocialCaptionDailyUsage"
    WHERE "day" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
  `;
  return rows[0]?.calls ?? 0;
}

before(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  await admin.$executeRawUnsafe(`CREATE TABLE "${schema}"."SocialCaptionDailyUsage" (LIKE public."SocialCaptionDailyUsage" INCLUDING ALL)`);
  for (const client of [first, second]) {
    const [row] = await client.$queryRaw`SELECT current_schema() AS "schema"`;
    assert.equal(row.schema, schema, "budget SQL must stay within the isolated test schema");
  }
});
beforeEach(async () => {
  await first.socialCaptionDailyUsage.deleteMany();
});
after(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()));
  try {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.$disconnect();
  }
});

test("database integration: concurrent caption reservations across instances cannot exceed the daily cap", async () => {
  const services = [service(first, 7), service(second, 7)];
  const attempts = await Promise.allSettled(Array.from({ length: 40 }, (_, index) => services[index % 2].reserve()));
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 7);
  const rejected = attempts.filter((result) => result.status === "rejected");
  assert.equal(rejected.length, 33);
  assert.ok(rejected.every((result) => isUnavailable(result.reason)));
  assert.equal(await todayCalls(), 7);
  await assert.rejects(services[0].reserve(), isUnavailable);
  await assert.rejects(services[1].reserve(), isUnavailable);
  assert.equal(await todayCalls(), 7);
});

test("database integration: an exhausted caption allowance persists across new clients and service instances", async () => {
  await service(first, 2).reserve();
  await service(second, 2).reserve();
  const restarted = newClient();
  await assert.rejects(service(restarted, 2).reserve(), isUnavailable);
  assert.equal(await todayCalls(), 2);
});

test("database integration: a zero caption cap fails closed without creating usage", async () => {
  await assert.rejects(service(first, 0).reserve(), isUnavailable);
  await assert.rejects(service(second, "0").reserve(), isUnavailable);
  assert.equal(await first.socialCaptionDailyUsage.count(), 0);
});

test("database integration: yesterday's caption calls cannot consume today's UTC allowance", async () => {
  await first.$executeRaw`
    INSERT INTO "SocialCaptionDailyUsage" ("day", "calls")
    VALUES ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 1, 1000000)
  `;
  const budget = service(first, 2);
  await budget.reserve();
  await budget.reserve();
  await assert.rejects(budget.reserve(), isUnavailable);
  assert.equal(await todayCalls(), 2);
  const rows = await first.socialCaptionDailyUsage.findMany({ orderBy: { day: "asc" } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].calls, 1000000, "past usage remains immutable");
});

test("database integration: the default caption allowance permits exactly 100 daily calls", async () => {
  const budget = service(first, undefined);
  const attempts = await Promise.allSettled(Array.from({ length: 101 }, () => budget.reserve()));
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 100);
  const rejected = attempts.filter((result) => result.status === "rejected");
  assert.equal(rejected.length, 1);
  assert.ok(isUnavailable(rejected[0].reason));
  assert.equal(await todayCalls(), 100);
});
