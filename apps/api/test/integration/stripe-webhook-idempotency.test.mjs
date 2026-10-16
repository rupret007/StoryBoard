import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { requireTestDatabaseUrl } from "../../../../scripts/test-database.mjs";

const testDatabaseUrl = requireTestDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl;

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "..", "dist", path)).href);
  return module.default ?? module;
};

const [prismaMod, idempotencyMod, controllerMod, stripeMod] = await Promise.all([
  load("lib/prisma.js"),
  load("integrations/stripe-webhook-idempotency.service.js"),
  load("integrations/stripe-webhook.controller.js"),
  load("integrations/stripe-webhook.service.js")
]);

const { StripeWebhookIdempotencyService, isStripeWebhookInFlightError } = idempotencyMod;
const { StripeWebhookController } = controllerMod;
const { StripeWebhookService } = stripeMod;

const client = prismaMod.createPrismaClient();
const prisma = { client };
const SECRET = "whsec_postgres_idempotency";

function signPayload(payload, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function eventPayload(id, type = "payment_intent.succeeded") {
  return JSON.stringify({ id, type, data: { object: {} } });
}

function isAbortedTransactionError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return (
    code === "25P02" ||
    /current transaction is aborted|commands ignored until end of transaction/i.test(message)
  );
}

function config() {
  return { get: (key) => (key === "STRIPE_WEBHOOK_SECRET" ? SECRET : undefined) };
}

function controllerFor(processor) {
  const idempotency = new StripeWebhookIdempotencyService(prisma);
  const stripe = new StripeWebhookService();
  stripe.useProcessor(processor);
  return new StripeWebhookController(config(), idempotency, stripe);
}

async function recordEffect(tx, eventId) {
  await tx.$executeRaw`
    INSERT INTO "StripeWebhookTestEffect" ("eventId") VALUES (${eventId})
  `;
}

async function effectCount(eventId) {
  const rows = await client.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "StripeWebhookTestEffect"
    WHERE "eventId" = ${eventId}
  `;
  return rows[0]?.count ?? 0;
}

async function eventRow(eventId) {
  return client.stripeWebhookEvent.findUnique({ where: { eventId } });
}

async function resetDatabase() {
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StripeWebhookTestEffect" (
      "eventId" TEXT PRIMARY KEY
    )
  `);
  await client.$executeRawUnsafe('TRUNCATE TABLE "StripeWebhookEvent", "StripeWebhookTestEffect"');
}

before(resetDatabase);
after(async () => {
  await resetDatabase();
  await client.$disconnect();
});

test("postgres: duplicate Stripe delivery is acknowledged without re-running the handler", async () => {
  await resetDatabase();
  const eventId = `evt_pg_dup_${randomUUID().replaceAll("-", "")}`;
  let processorCalls = 0;
  const controller = controllerFor(async (event, tx) => {
    processorCalls += 1;
    await recordEffect(tx, event.id);
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload(eventId);
  const header = signPayload(payload);

  const first = await controller.webhook({ rawBody: payload }, header);
  const second = await controller.webhook({ rawBody: payload }, header);

  assert.deepEqual(first, { ok: true, duplicate: false });
  assert.deepEqual(second, { ok: true, duplicate: true });
  assert.equal(processorCalls, 1);
  assert.equal(await effectCount(eventId), 1);
  const row = await eventRow(eventId);
  assert.equal(row.status, "completed");
  assert.ok(row.appliedAt instanceof Date);
  assert.ok(row.completedAt instanceof Date);
});

test("postgres: concurrent first deliveries run the handler once", async () => {
  await resetDatabase();
  const eventId = `evt_pg_race_${randomUUID().replaceAll("-", "")}`;
  let processorCalls = 0;
  const controller = controllerFor(async (event, tx) => {
    processorCalls += 1;
    await recordEffect(tx, event.id);
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload(eventId, "invoice.paid");
  const header = signPayload(payload);

  const results = await Promise.allSettled([
    controller.webhook({ rawBody: payload }, header),
    controller.webhook({ rawBody: payload }, header)
  ]);

  const aborted = results.filter(
    (result) => result.status === "rejected" && isAbortedTransactionError(result.reason)
  );
  assert.equal(
    aborted.length,
    0,
    aborted[0]?.reason instanceof Error ? aborted[0].reason.message : "aborted transaction"
  );

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const processed = fulfilled.filter((result) => result.value.duplicate === false);
  const duplicates = fulfilled.filter((result) => result.value.duplicate === true);
  const inFlight = results.filter(
    (result) =>
      result.status === "rejected" &&
      (result.reason.getStatus?.() === 503 || isStripeWebhookInFlightError(result.reason))
  );

  assert.equal(processorCalls, 1);
  assert.equal(processed.length, 1);
  assert.equal(duplicates.length + inFlight.length, 1);
  assert.equal(await effectCount(eventId), 1);
  assert.equal((await eventRow(eventId)).status, "completed");
});

test("postgres: an expired unapplied claim can be recovered after a crashed owner", async () => {
  await resetDatabase();
  const eventId = `evt_pg_crash_${randomUUID().replaceAll("-", "")}`;
  await client.stripeWebhookEvent.create({
    data: {
      eventId,
      status: "processing",
      leaseOwner: randomUUID(),
      leaseExpiresAt: new Date(Date.now() - 1),
      appliedAt: null,
      eventType: "checkout.session.completed"
    }
  });

  let processorCalls = 0;
  const service = new StripeWebhookIdempotencyService(prisma);
  const result = await service.runOnce(eventId, async (tx) => {
    processorCalls += 1;
    await recordEffect(tx, eventId);
    return "recovered";
  }, "checkout.session.completed");

  assert.deepEqual(result, { duplicate: false, result: "recovered" });
  assert.equal(processorCalls, 1);
  assert.equal(await effectCount(eventId), 1);
  const row = await eventRow(eventId);
  assert.equal(row.status, "completed");
  assert.ok(row.appliedAt instanceof Date);
  assert.equal(await client.stripeWebhookEvent.count({ where: { eventId } }), 1);
});

test("postgres: a failed handler rolls the claim and side effect back so a retry can process", async () => {
  await resetDatabase();
  const eventId = `evt_pg_fail_${randomUUID().replaceAll("-", "")}`;
  let attempts = 0;
  const service = new StripeWebhookIdempotencyService(prisma);

  await assert.rejects(
    () =>
      service.runOnce(eventId, async (tx) => {
        attempts += 1;
        await recordEffect(tx, eventId);
        throw new Error("stripe processor unavailable");
      }),
    /stripe processor unavailable/
  );
  assert.equal(attempts, 1);
  assert.equal(await effectCount(eventId), 0);
  assert.equal(await eventRow(eventId), null);

  const retry = await service.runOnce(eventId, async (tx) => {
    attempts += 1;
    await recordEffect(tx, eventId);
    return "acked";
  });
  assert.deepEqual(retry, { duplicate: false, result: "acked" });
  assert.equal(attempts, 2);
  assert.equal(await effectCount(eventId), 1);
  assert.equal((await eventRow(eventId)).status, "completed");
});
