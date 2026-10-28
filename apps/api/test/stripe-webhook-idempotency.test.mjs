import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const http = require("node:http");
const { Readable } = require("node:stream");
const Fastify = require("fastify");
const {
  StripeWebhookIdempotencyService,
  StripeWebhookInFlightError,
  isStripeWebhookInFlightError,
  STRIPE_WEBHOOK_CLAIM_LEASE_MS
} = require("../dist/integrations/stripe-webhook-idempotency.service.js");
const { StripeWebhookController } = require("../dist/integrations/stripe-webhook.controller.js");
const { StripeWebhookService } = require("../dist/integrations/stripe-webhook.service.js");
const signature = require("../dist/integrations/stripe-webhook-signature.js");
const rawBody = require("../dist/integrations/stripe-webhook-raw-body.js");

const SECRET = "whsec_test_secret";
const idempotencySource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/integrations/stripe-webhook-idempotency.service.ts"),
  "utf8"
);

test("pg-adapter serialization conflicts are handled only through isTransactionConflict", () => {
  assert.doesNotMatch(idempotencySource, /isPgAdapterTransactionConflict/);
  assert.match(idempotencySource, /function isTransactionConflict/);
});

function uniqueError() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function lockNotAvailableError() {
  return Object.assign(new Error("could not obtain lock"), { code: "55P03" });
}

function signPayload(payload, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function eventPayload(id = "evt_123abc", type = "payment_intent.succeeded") {
  return JSON.stringify({ id, type, data: { object: {} } });
}

function cloneRows(rows) {
  return new Map(
    [...rows.entries()].map(([eventId, row]) => [eventId, { ...row }])
  );
}

function claimStore({
  failApply = false,
  failComplete = false,
  stealOwnerAfterClaim = false
} = {}) {
  const rows = new Map();
  const events = [];
  const effects = [];
  const locks = new Set();
  const isolationLevels = [];
  let idSeq = 0;

  const matchesWhere = (row, where) => {
    if (where.status) {
      if (typeof where.status === "object" && Array.isArray(where.status.in)) {
        if (!where.status.in.includes(row.status)) {
          return false;
        }
      } else if (row.status !== where.status) {
        return false;
      }
    }
    if (where.leaseOwner !== undefined && row.leaseOwner !== where.leaseOwner) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(where, "appliedAt")) {
      if (where.appliedAt === null && row.appliedAt != null) {
        return false;
      }
      if (where.appliedAt?.not === null && row.appliedAt == null) {
        return false;
      }
    }
    if (where.leaseExpiresAt?.lte && row.leaseExpiresAt > where.leaseExpiresAt.lte) {
      return false;
    }
    return true;
  };

  const stripeWebhookEvent = {
    create: async ({ data }) => {
      events.push("claim");
      if (rows.has(data.eventId)) {
        throw uniqueError();
      }
      const row = {
        id: `claim-${++idSeq}`,
        eventId: data.eventId,
        status: data.status ?? "processing",
        leaseOwner: data.leaseOwner ?? null,
        leaseExpiresAt: data.leaseExpiresAt,
        eventType: data.eventType ?? null,
        lastError: data.lastError ?? null,
        appliedAt: data.appliedAt ?? null,
        completedAt: data.completedAt ?? null
      };
      rows.set(data.eventId, row);
      if (stealOwnerAfterClaim) {
        row.leaseOwner = `stolen-${data.eventId}`;
      }
      return { ...row };
    },
    findUnique: async ({ where }) => {
      const row = rows.get(where.eventId);
      return row ? { ...row } : null;
    },
    updateMany: async ({ where, data }) => {
      const row = rows.get(where.eventId);
      if (!row || !matchesWhere(row, where)) {
        return { count: 0 };
      }
      if (data.appliedAt && data.status === undefined) {
        if (failApply) {
          throw new Error("apply update failed");
        }
        events.push("applied");
      }
      if (data.status === "completed") {
        if (failComplete) {
          throw new Error("complete update failed");
        }
        events.push("completed");
      } else if (data.leaseExpiresAt && data.status === undefined && data.appliedAt === undefined) {
        events.push(where.leaseExpiresAt?.lte ? "reclaim" : "expired");
      }
      Object.assign(row, data);
      return { count: 1 };
    }
  };

  const client = {
    stripeWebhookEvent,
    $transaction: async (fn, options) => {
      isolationLevels.push(options?.isolationLevel);
      const snapshotRows = cloneRows(rows);
      const snapshotEffects = effects.map((effect) => ({ ...effect }));
      const held = [];
      let mutated = false;
      let aborted = false;
      const assertLive = () => {
        if (aborted) {
          throw Object.assign(
            new Error(
              "current transaction is aborted, commands ignored until end of transaction block"
            ),
            { code: "25P02" }
          );
        }
      };
      const acquireLock = (eventId) => {
        if (held.includes(eventId)) {
          return;
        }
        if (locks.has(eventId)) {
          throw lockNotAvailableError();
        }
        locks.add(eventId);
        held.push(eventId);
      };
      const insertClaim = async (eventId, leaseOwner, leaseExpiresAt, eventType) => {
        acquireLock(eventId);
        if (rows.has(eventId)) {
          events.push("claim");
          return [];
        }
        const created = await stripeWebhookEvent.create({
          data: {
            eventId,
            leaseOwner,
            leaseExpiresAt,
            eventType,
            status: "processing",
            lastError: null
          }
        });
        mutated = true;
        return [{ leaseOwner: created.leaseOwner }];
      };
      const tx = {
        stripeWebhookEvent: {
          create: async (args) => {
            assertLive();
            acquireLock(args.data.eventId);
            try {
              const created = await stripeWebhookEvent.create(args);
              mutated = true;
              return created;
            } catch (error) {
              if (error && typeof error === "object" && error.code === "P2002") {
                aborted = true;
              }
              throw error;
            }
          },
          findUnique: async (args) => {
            assertLive();
            return stripeWebhookEvent.findUnique(args);
          },
          updateMany: async (args) => {
            assertLive();
            const updated = await stripeWebhookEvent.updateMany(args);
            if (updated.count > 0) {
              mutated = true;
            }
            return updated;
          }
        },
        $queryRaw: async (query, ...values) => {
          assertLive();
          const sql = Array.isArray(query) ? query.join("?") : String(query);
          if (/INSERT/i.test(sql)) {
            const [eventId, leaseOwner, leaseExpiresAt, eventType] = values;
            return insertClaim(eventId, leaseOwner, leaseExpiresAt, eventType);
          }
          const eventId = values[0];
          acquireLock(eventId);
          const row = rows.get(eventId);
          return row ? [{ ...row }] : [];
        },
        $executeRaw: async (query, ...values) => {
          assertLive();
          const sql = Array.isArray(query) ? query.join("?") : String(query);
          if (/StripeWebhookTestEffect/i.test(sql)) {
            const effect = { eventId: values[0] };
            effects.push(effect);
            mutated = true;
            return 1;
          }
          return 0;
        },
        handlerEffect: {
          create: async ({ data }) => {
            assertLive();
            const effect = { eventId: data.eventId };
            effects.push(effect);
            mutated = true;
            return effect;
          }
        }
      };
      try {
        return await fn(tx);
      } catch (error) {
        if (mutated) {
          rows.clear();
          for (const [eventId, row] of snapshotRows) {
            rows.set(eventId, row);
          }
          effects.length = 0;
          effects.push(...snapshotEffects);
        }
        throw error;
      } finally {
        for (const eventId of held) {
          locks.delete(eventId);
        }
      }
    }
  };

  return {
    events,
    rows,
    effects,
    isolationLevels,
    row: (eventId) => rows.get(eventId),
    seed(eventId, overrides = {}) {
      const row = {
        id: `seed-${eventId}`,
        eventId,
        status: "processing",
        leaseOwner: `seed-owner-${eventId}`,
        leaseExpiresAt: new Date(Date.now() + STRIPE_WEBHOOK_CLAIM_LEASE_MS),
        eventType: null,
        lastError: null,
        appliedAt: null,
        completedAt: null,
        ...overrides
      };
      rows.set(eventId, row);
      return row;
    },
    prisma: { client }
  };
}

function config(values = { STRIPE_WEBHOOK_SECRET: SECRET }) {
  return { get: (key) => values[key] };
}

function controllerFor(store, processor, values) {
  const idempotency = new StripeWebhookIdempotencyService(store.prisma);
  const stripe = new StripeWebhookService();
  if (processor) {
    stripe.useProcessor(processor);
  }
  return new StripeWebhookController(config(values), idempotency, stripe);
}

test("runOnce converts Prisma P2010 driverAdapterError 40001 TransactionWriteConflict into StripeWebhookInFlightError", async () => {
  const conflict = Object.assign(new Error("Raw query failed"), {
    code: "P2010",
    meta: { driverAdapterError: new Error("TransactionWriteConflict", { cause: {
      kind: "TransactionWriteConflict", originalCode: "40001"
    } }) }
  });
  const service = new StripeWebhookIdempotencyService({ client: {
    $transaction: async () => { throw conflict; }
  } });
  await assert.rejects(
    () => service.runOnce("evt_adapter_conflict", async () => {
      assert.fail("serialization conflict must not run the handler");
    }),
    (error) => isStripeWebhookInFlightError(error) && error instanceof StripeWebhookInFlightError
  );
});

test("raw claim serialization conflicts return a retryable webhook response without running work", async () => {
  const conflict = Object.assign(new Error("Raw query failed"), {
    code: "P2010",
    meta: { code: "40001", message: "could not serialize access due to concurrent update" }
  });
  let processorCalls = 0;
  let transactionCalls = 0;
  const controller = controllerFor({ prisma: { client: {
    $transaction: async (work, options) => {
      transactionCalls += 1;
      assert.equal(options.isolationLevel, "Serializable");
      return work({ $queryRaw: async () => { throw conflict; } });
    }
  } } }, async () => { processorCalls += 1; });
  const payload = eventPayload("evt_raw_serialization_conflict");

  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, signPayload(payload)),
    (error) => error.getStatus?.() === 503 && /already being processed/.test(error.message)
  );
  assert.equal(processorCalls, 0);
  assert.equal(transactionCalls, 1);
});

test("unrelated raw query errors are not misclassified as duplicate deliveries", async () => {
  const failure = Object.assign(new Error("Raw query failed"), {
    code: "P2010",
    meta: { code: "42P01", message: "relation does not exist" }
  });
  const service = new StripeWebhookIdempotencyService({ client: {
    $transaction: async () => { throw failure; }
  } });
  await assert.rejects(() => service.runOnce("evt_bad_query", async () => {
    assert.fail("failed claim must not run the handler");
  }), (error) => error === failure);
});

test("Prisma pg-adapter raw serialization conflicts return 503 without processing or replay", async () => {
  const conflict = Object.assign(new Error("Raw query failed"), {
    code: "P2010",
    meta: { driverAdapterError: new Error("TransactionWriteConflict", { cause: {
      kind: "TransactionWriteConflict", originalCode: "40001"
    } }) }
  });
  let transactionCalls = 0;
  let processorCalls = 0;
  const controller = controllerFor({ prisma: { client: {
    $transaction: async (work) => {
      transactionCalls += 1;
      return work({ $queryRaw: async () => { throw conflict; } });
    }
  } } }, async () => { processorCalls += 1; });
  const payload = eventPayload("evt_adapter_serialization_conflict");
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, signPayload(payload)),
    (error) => error.getStatus?.() === 503
  );
  assert.equal(transactionCalls, 1);
  assert.equal(processorCalls, 0);
});

test("unrelated pg-adapter errors retain their original failure", async () => {
  const failure = Object.assign(new Error("Raw query failed"), {
    code: "P2010",
    meta: { driverAdapterError: new Error("Connection closed", { cause: {
      kind: "ConnectionClosed", originalCode: "08006"
    } }) }
  });
  const service = new StripeWebhookIdempotencyService({ client: {
    $transaction: async () => { throw failure; }
  } });
  await assert.rejects(() => service.runOnce("evt_connection_failure", async () => {
    assert.fail("failed claim must not run the handler");
  }), (error) => error === failure);
});

test("Prisma raw errors with SQLSTATE only in the message still return 503", async () => {
  const conflict = Object.assign(new Error('Raw query failed. Code: `40001`. Message: `write conflict`'), {
    code: "P2010"
  });
  let transactionCalls = 0;
  const controller = controllerFor({ prisma: { client: {
    $transaction: async (work) => {
      transactionCalls += 1;
      return work({ $queryRaw: async () => { throw conflict; } });
    }
  } } }, async () => {
    assert.fail("a conflicting claim must not run the handler");
  });
  const payload = eventPayload("evt_message_serialization_conflict");

  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, signPayload(payload)),
    (error) => error.getStatus?.() === 503
  );
  assert.equal(transactionCalls, 1);
});

test("incomplete or mismatched pg-adapter metadata preserves the original claim error", async () => {
  const failures = [
    { code: "P2010" },
    { code: "P2010", meta: null },
    { code: "P2010", meta: { driverAdapterError: "TransactionWriteConflict" } },
    { code: "P2010", meta: { driverAdapterError: { cause: null } } },
    { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001" } } } },
    { code: "P2010", meta: { driverAdapterError: { cause: { kind: "TransactionWriteConflict" } } } },
    { code: "P2010", meta: { driverAdapterError: { cause: {
      kind: "TransactionWriteConflict", originalCode: "08006"
    } } } },
    { code: "P2010", meta: { driverAdapterError: { cause: {
      kind: "ConnectionClosed", originalCode: "40001"
    } } } },
    { code: "P2002", meta: { driverAdapterError: { cause: {
      kind: "TransactionWriteConflict", originalCode: "40001"
    } } } }
  ];
  for (const fields of failures) {
    const failure = Object.assign(new Error("Raw query failed"), fields);
    const service = new StripeWebhookIdempotencyService({ client: {
      $transaction: async (work) => work({ $queryRaw: async () => { throw failure; } })
    } });
    await assert.rejects(() => service.runOnce("evt_adapter_metadata_failure", async () => {
      assert.fail("a failed claim must not run the handler");
    }), (error) => error === failure);
  }
});

test("stripe event id extractor rejects missing, empty, or non-evt ids", () => {
  assert.equal(signature.stripeEventId(undefined), null);
  assert.equal(signature.stripeEventId({ type: "charge.succeeded" }), null);
  assert.equal(signature.stripeEventId({ id: "   " }), null);
  assert.equal(signature.stripeEventId({ id: "ch_123" }), null);
  assert.equal(signature.stripeEventId({ id: "evt_123abc" }), "evt_123abc");
  assert.equal(signature.stripeEventId({ id: "evt_dup_1" }), "evt_dup_1");
});

test("Stripe-Signature verification accepts a valid signed payload and rejects the rest", () => {
  const payload = eventPayload();
  const nowMs = Date.now();
  const header = signPayload(payload, SECRET, Math.floor(nowMs / 1000));

  assert.deepEqual(
    signature.verifyStripeWebhookSignature({
      payload,
      signatureHeader: header,
      secret: SECRET,
      nowMs
    }),
    { ok: true }
  );
  assert.equal(
    signature.verifyStripeWebhookSignature({
      payload,
      signatureHeader: header,
      secret: ""
    }).reason,
    "missing_secret"
  );
  assert.equal(
    signature.verifyStripeWebhookSignature({
      payload: "",
      signatureHeader: header,
      secret: SECRET
    }).reason,
    "missing_payload"
  );
  assert.equal(
    signature.verifyStripeWebhookSignature({
      payload,
      signatureHeader: "",
      secret: SECRET
    }).reason,
    "missing_signature"
  );
  assert.equal(
    signature.verifyStripeWebhookSignature({
      payload,
      signatureHeader: signPayload(payload, "whsec_other"),
      secret: SECRET
    }).reason,
    "invalid_signature"
  );
  assert.equal(
    signature.verifyStripeWebhookSignature({
      payload: eventPayload("evt_tampered"),
      signatureHeader: header,
      secret: SECRET
    }).reason,
    "invalid_signature"
  );
  assert.equal(
    signature.verifyStripeWebhookSignature({
      payload,
      signatureHeader: signPayload(payload, SECRET, Math.floor(nowMs / 1000) - 400),
      secret: SECRET,
      nowMs
    }).reason,
    "timestamp_expired"
  );
});

test("claims the unique Stripe event, persists appliedAt, then runs the handler in one transaction", async () => {
  const store = claimStore();
  const service = new StripeWebhookIdempotencyService(store.prisma);
  const order = [];
  const result = await service.runOnce("evt_order1", async (tx) => {
    order.push("handler");
    await tx.handlerEffect.create({ data: { eventId: "evt_order1" } });
    return "acked";
  });
  assert.deepEqual(result, { duplicate: false, result: "acked" });
  assert.deepEqual(store.events, ["claim", "applied", "completed"]);
  assert.deepEqual(order, ["handler"]);
  assert.deepEqual(store.isolationLevels, ["Serializable"]);
  assert.equal(store.effects.length, 1);
  assert.equal(store.row("evt_order1").status, "completed");
  assert.ok(store.row("evt_order1").appliedAt instanceof Date);
  assert.ok(store.row("evt_order1").completedAt instanceof Date);
});

test("duplicate Stripe event deliveries invoke the processor once", async () => {
  const store = claimStore();
  let processorCalls = 0;
  const controller = controllerFor(store, async (event) => {
    processorCalls += 1;
    store.events.push("handler");
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload("evt_dup_1");
  const header = signPayload(payload);
  const first = await controller.webhook({ rawBody: payload }, header);
  const second = await controller.webhook({ rawBody: payload }, header);
  assert.deepEqual(first, { ok: true, duplicate: false });
  assert.deepEqual(second, { ok: true, duplicate: true });
  assert.equal(processorCalls, 1);
  assert.deepEqual(store.events, ["claim", "applied", "handler", "completed", "claim"]);
  assert.equal(store.row("evt_dup_1").status, "completed");
});

test("two concurrent deliveries of the same Stripe event process once", async () => {
  const store = claimStore();
  let processorCalls = 0;
  const controller = controllerFor(store, async (event) => {
    processorCalls += 1;
    store.events.push("handler");
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload("evt_race_1", "invoice.paid");
  const header = signPayload(payload);
  const results = await Promise.allSettled([
    controller.webhook({ rawBody: payload }, header),
    controller.webhook({ rawBody: payload }, header)
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const processed = fulfilled.filter((result) => result.value.duplicate === false);
  const duplicates = fulfilled.filter((result) => result.value.duplicate === true);
  const inFlight = results.filter(
    (result) => result.status === "rejected" && result.reason.getStatus?.() === 503
  );
  assert.equal(processorCalls, 1);
  assert.equal(processed.length, 1);
  assert.equal(duplicates.length + inFlight.length, 1);
  assert.equal(store.row("evt_race_1").status, "completed");
});

test("an abandoned processing claim can be retried after the lease expires", async () => {
  const store = claimStore();
  store.seed("evt_crash_1", {
    status: "processing",
    leaseExpiresAt: new Date(Date.now() - 1)
  });
  let processorCalls = 0;
  const controller = controllerFor(store, async (event) => {
    processorCalls += 1;
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload("evt_crash_1");
  const result = await controller.webhook({ rawBody: payload }, signPayload(payload));
  assert.deepEqual(result, { ok: true, duplicate: false });
  assert.equal(processorCalls, 1);
  assert.ok(store.events.includes("reclaim"));
  assert.equal(store.row("evt_crash_1").status, "completed");
});

test("an in-flight processing claim within its lease is treated as a duplicate", async () => {
  const store = claimStore();
  store.seed("evt_inflight_1", {
    status: "processing",
    leaseExpiresAt: new Date(Date.now() + STRIPE_WEBHOOK_CLAIM_LEASE_MS)
  });
  let processorCalls = 0;
  const controller = controllerFor(store, async () => {
    processorCalls += 1;
    return { acknowledged: true, eventId: "evt_inflight_1", type: null };
  });
  const payload = eventPayload("evt_inflight_1");
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, signPayload(payload)),
    (error) => error.getStatus?.() === 503
  );
  assert.equal(processorCalls, 0);
  assert.equal(store.row("evt_inflight_1").status, "processing");
  assert.equal(store.row("evt_inflight_1").completedAt, null);
});

test("a failed handler rolls the claim back so a retry can process", async () => {
  const store = claimStore();
  let attempts = 0;
  const controller = controllerFor(store, async (event) => {
    attempts += 1;
    store.events.push("handler");
    if (attempts === 1) {
      throw new Error("stripe processor unavailable");
    }
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload("evt_fail_1", "checkout.session.completed");
  const header = signPayload(payload);
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, header),
    /stripe processor unavailable/
  );
  assert.equal(store.rows.size, 0);
  assert.equal(store.effects.length, 0);

  const retry = await controller.webhook({ rawBody: payload }, header);
  assert.deepEqual(retry, { ok: true, duplicate: false });
  assert.equal(attempts, 2);
  assert.equal(store.row("evt_fail_1").status, "completed");
});

test("apply-write failure never invokes the handler and does not leave a durable apply", async () => {
  const store = claimStore({ failApply: true });
  const service = new StripeWebhookIdempotencyService(store.prisma);
  let handlerCalls = 0;
  await assert.rejects(
    () =>
      service.runOnce("evt_apply_fail", async (tx) => {
        handlerCalls += 1;
        await tx.handlerEffect.create({ data: { eventId: "evt_apply_fail" } });
        return "acked";
      }),
    /apply update failed/
  );
  assert.equal(handlerCalls, 0);
  assert.equal(store.effects.length, 0);
  assert.equal(store.rows.size, 0);
});

test("complete-write failure rolls appliedAt and handler work back so a retry can process once", async () => {
  const store = claimStore({ failComplete: true });
  let processorCalls = 0;
  const controller = controllerFor(store, async (event, tx) => {
    processorCalls += 1;
    store.events.push("handler");
    await tx.handlerEffect.create({ data: { eventId: event.id } });
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload("evt_complete_fail");
  const header = signPayload(payload);
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, header),
    /complete update failed/
  );
  assert.equal(processorCalls, 1);
  assert.equal(store.effects.length, 0);
  assert.equal(store.rows.size, 0);
  assert.equal(store.events.includes("expired"), false);

  const retryStore = claimStore();
  const retryController = controllerFor(retryStore, async (event, tx) => {
    processorCalls += 1;
    await tx.handlerEffect.create({ data: { eventId: event.id } });
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const retry = await retryController.webhook({ rawBody: payload }, header);
  assert.deepEqual(retry, { ok: true, duplicate: false });
  assert.equal(processorCalls, 2);
  assert.equal(retryStore.effects.length, 1);
  assert.equal(retryStore.row("evt_complete_fail").status, "completed");
  assert.ok(retryStore.row("evt_complete_fail").appliedAt instanceof Date);
});

test("an in-flight unfinished claim returns HTTP 503 so Stripe keeps retrying", async () => {
  const store = claimStore();
  store.seed("evt_inflight_503", {
    status: "processing",
    leaseExpiresAt: new Date(Date.now() + STRIPE_WEBHOOK_CLAIM_LEASE_MS)
  });
  let processorCalls = 0;
  const controller = controllerFor(store, async () => {
    processorCalls += 1;
    return { acknowledged: true, eventId: "evt_inflight_503", type: null };
  });
  const payload = eventPayload("evt_inflight_503");
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, signPayload(payload)),
    (error) => error.getStatus?.() === 503
  );
  assert.equal(processorCalls, 0);
  assert.equal(store.row("evt_inflight_503").status, "processing");
  assert.equal(store.row("evt_inflight_503").completedAt, null);
  assert.equal(store.row("evt_inflight_503").appliedAt, null);
});

test("success persist requires the current lease owner and does not run the handler without it", async () => {
  const store = claimStore({ stealOwnerAfterClaim: true });
  const service = new StripeWebhookIdempotencyService(store.prisma);
  let handlerCalls = 0;
  await assert.rejects(
    () =>
      service.runOnce("evt_owner_fence", async (tx) => {
        handlerCalls += 1;
        await tx.handlerEffect.create({ data: { eventId: "evt_owner_fence" } });
        return "stale";
      }),
    /stripe webhook claim apply update failed/
  );
  assert.equal(handlerCalls, 0);
  assert.equal(store.effects.length, 0);
  assert.equal(store.rows.size, 0);
});

test("an expired lease does not start a second handler while the owner still holds the row lock", async () => {
  const store = claimStore();
  const service = new StripeWebhookIdempotencyService(store.prisma);

  let releaseA;
  const aHeld = new Promise((resolve) => {
    releaseA = resolve;
  });
  let aEntered;
  const aStarted = new Promise((resolve) => {
    aEntered = resolve;
  });
  const runA = service.runOnce("evt_overlap_1", async (tx) => {
    aEntered();
    await aHeld;
    await tx.handlerEffect.create({ data: { eventId: "evt_overlap_1" } });
    return "owner";
  });
  await aStarted;

  store.row("evt_overlap_1").leaseExpiresAt = new Date(0);
  const ownerDuringA = store.row("evt_overlap_1").leaseOwner;

  let handlerB = 0;
  const runB = service.runOnce("evt_overlap_1", async (tx) => {
    handlerB += 1;
    await tx.handlerEffect.create({ data: { eventId: "evt_overlap_1" } });
    return "intruder";
  });
  await assert.rejects(runB, /already being processed/);
  assert.equal(handlerB, 0);
  assert.equal(store.effects.length, 0);
  assert.equal(store.row("evt_overlap_1").leaseOwner, ownerDuringA);
  assert.equal(store.row("evt_overlap_1").status, "processing");
  assert.ok(store.row("evt_overlap_1").appliedAt instanceof Date);
  assert.equal(store.events.includes("reclaim"), false);

  releaseA();
  const resultA = await runA;
  assert.deepEqual(resultA, { duplicate: false, result: "owner" });
  assert.equal(store.effects.length, 1);
  assert.equal(store.row("evt_overlap_1").status, "completed");
  assert.equal(store.row("evt_overlap_1").leaseOwner, ownerDuringA);

  const retry = await service.runOnce("evt_overlap_1", async () => "again");
  assert.deepEqual(retry, { duplicate: true });
  assert.equal(store.effects.length, 1);
});

test("a stale worker cannot complete after losing the lease owner token", async () => {
  const store = claimStore({ stealOwnerAfterClaim: true });
  const service = new StripeWebhookIdempotencyService(store.prisma);
  await assert.rejects(
    () => service.runOnce("evt_stale_1", async () => "stale"),
    /stripe webhook claim apply update failed/
  );
  assert.equal(store.rows.size, 0);
});

test("a failed reclaim of a locked row cannot expire another owner's lease", async () => {
  const store = claimStore();
  const service = new StripeWebhookIdempotencyService(store.prisma);

  let releaseA;
  const aHeld = new Promise((resolve) => {
    releaseA = resolve;
  });
  let aEntered;
  const aStarted = new Promise((resolve) => {
    aEntered = resolve;
  });
  const runA = service.runOnce("evt_stale_expire", async (tx) => {
    aEntered();
    await aHeld;
    await tx.handlerEffect.create({ data: { eventId: "evt_stale_expire" } });
    return "owner";
  });
  await aStarted;
  const ownerDuringA = store.row("evt_stale_expire").leaseOwner;
  const leaseDuringA = store.row("evt_stale_expire").leaseExpiresAt.getTime();

  await assert.rejects(
    () =>
      service.runOnce("evt_stale_expire", async () => {
        throw new Error("stale handler failed");
      }),
    /already being processed/
  );

  assert.equal(store.row("evt_stale_expire").leaseOwner, ownerDuringA);
  assert.equal(store.row("evt_stale_expire").leaseExpiresAt.getTime(), leaseDuringA);
  assert.equal(store.events.includes("expired"), false);

  releaseA();
  const resultA = await runA;
  assert.deepEqual(resultA, { duplicate: false, result: "owner" });
  assert.equal(store.row("evt_stale_expire").status, "completed");
  assert.equal(store.row("evt_stale_expire").leaseOwner, ownerDuringA);
});

test("missing Stripe webhook secret fails closed without claiming", async () => {
  const store = claimStore();
  let processorCalls = 0;
  const controller = controllerFor(
    store,
    async () => {
      processorCalls += 1;
    },
    {}
  );
  const payload = eventPayload("evt_nosecret");
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, signPayload(payload)),
    (error) => error.getStatus?.() === 503
  );
  assert.equal(processorCalls, 0);
  assert.equal(store.rows.size, 0);
});

test("missing or invalid Stripe-Signature fails closed without claiming", async () => {
  const store = claimStore();
  let processorCalls = 0;
  const controller = controllerFor(store, async () => {
    processorCalls += 1;
  });
  const payload = eventPayload("evt_bad_sig");

  await assert.rejects(
    () => controller.webhook({ rawBody: payload }),
    (error) => error.getStatus?.() === 400
  );
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, "t=1,v1=deadbeef"),
    (error) => error.getStatus?.() === 400
  );
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, signPayload(payload, "whsec_other")),
    (error) => error.getStatus?.() === 400
  );
  await assert.rejects(
    () => controller.webhook({}, signPayload(payload)),
    (error) => error.getStatus?.() === 400
  );
  assert.equal(processorCalls, 0);
  assert.equal(store.rows.size, 0);
});

test("Stripe webhook without an evt_ id is rejected after signature check without claiming", async () => {
  const store = claimStore();
  const controller = controllerFor(store);
  const payload = JSON.stringify({ type: "charge.succeeded", data: { object: {} } });
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, signPayload(payload)),
    (error) => error.getStatus?.() === 400
  );
  assert.equal(store.rows.size, 0);
});

test("raw-body capture rejects an oversize payload without buffering the rest", async () => {
  const maxBytes = 64 * 1024;
  const chunk = Buffer.alloc(16 * 1024, 97);
  let reads = 0;
  let destroyed = false;
  const payload = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          reads += 1;
          return { done: false, value: chunk };
        }
      };
    },
    destroy() {
      destroyed = true;
    }
  };

  await assert.rejects(
    () => rawBody.bufferStripeWebhookRawBody(payload, { maxBytes }),
    (error) =>
      error.statusCode === 413 && rawBody.isStripeWebhookPayloadTooLargeError(error)
  );
  assert.equal(reads, 5);
  assert.equal(destroyed, true);
});

test("raw-body capture rejects a declared Content-Length over the limit without reading", async () => {
  let reads = 0;
  let destroyed = false;
  const payload = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          reads += 1;
          return { done: false, value: Buffer.from("x") };
        }
      };
    },
    destroy() {
      destroyed = true;
    }
  };
  await assert.rejects(
    () =>
      rawBody.bufferStripeWebhookRawBody(payload, {
        declaredLength: rawBody.STRIPE_WEBHOOK_MAX_RAW_BODY_BYTES + 1
      }),
    (error) => error.statusCode === 413
  );
  assert.equal(reads, 0);
  assert.equal(destroyed, true);
});

function socketBackedReadable() {
  const socket = {
    writable: true,
    destroyed: false,
    destroy() {
      this.destroyed = true;
      this.writable = false;
    }
  };
  const stream = new Readable({
    read() {
      this.push(Buffer.alloc(32, 0x61));
      this.push(Buffer.alloc(32, 0x61));
      this.push(null);
    }
  });
  stream.socket = socket;
  const originalDestroy = stream.destroy.bind(stream);
  stream.destroy = function destroy(err) {
    socket.destroy();
    return originalDestroy(err);
  };
  return { stream, socket };
}

test("raw-body capture does not destroy a socket-backed stream before throwing 413", async () => {
  const { stream, socket } = socketBackedReadable();
  await assert.rejects(
    () => rawBody.bufferStripeWebhookRawBody(stream, { maxBytes: 16 }),
    (error) =>
      error.statusCode === 413 && rawBody.isStripeWebhookPayloadTooLargeError(error)
  );
  assert.equal(socket.destroyed, false);
  assert.equal(socket.writable, true);
  assert.equal(stream.destroyed, false);
});

test("raw-body capture does not destroy a live IncomingMessage socket before throwing 413", async () => {
  await new Promise((resolve, reject) => {
    const server = http.createServer();
    const closeServer = () => {
      server.closeAllConnections?.();
      server.close();
    };
    const timeout = setTimeout(() => {
      closeServer();
      reject(new Error("IncomingMessage 413 transport test timed out"));
    }, 2000);
    const finish = (error) => {
      clearTimeout(timeout);
      closeServer();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
    server.on("request", async (req, res) => {
      try {
        await assert.rejects(
          () => rawBody.bufferStripeWebhookRawBody(req, { maxBytes: 16 }),
          (error) =>
            error.statusCode === 413 &&
            rawBody.isStripeWebhookPayloadTooLargeError(error)
        );
        assert.equal(req.destroyed, false);
        assert.equal(req.socket?.destroyed, false);
        assert.equal(req.socket?.writable, true);
        res.statusCode = 413;
        res.setHeader("connection", "close");
        res.end("too large");
        finish();
      } catch (error) {
        finish(error);
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      const req = http.request({
        host: "127.0.0.1",
        port,
        path: "/",
        method: "POST",
        headers: { "transfer-encoding": "chunked" }
      });
      req.on("error", () => {});
      req.write(Buffer.alloc(32, 0x61));
      req.write(Buffer.alloc(32, 0x61));
    });
    server.on("error", (error) => finish(error));
  });
});

test("raw-body capture accepts a payload at the size limit", async () => {
  const maxBytes = 32;
  const buffer = await rawBody.bufferStripeWebhookRawBody(
    {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("a".repeat(16));
        yield Buffer.from("b".repeat(16));
      }
    },
    { maxBytes }
  );
  assert.equal(buffer.length, 32);
  assert.equal(rawBody.readStripeRawBody({ rawBody: "ok" }), "ok");
});

test("unauthenticated webhook rejects an oversize raw body with HTTP 413 and does not claim", async () => {
  const store = claimStore();
  let processorCalls = 0;
  const controller = controllerFor(store, async () => {
    processorCalls += 1;
  });
  const huge = "x".repeat(rawBody.STRIPE_WEBHOOK_MAX_RAW_BODY_BYTES + 1);
  await assert.rejects(
    () => controller.webhook({ rawBody: huge }, signPayload(huge)),
    (error) => error.getStatus?.() === 413
  );
  assert.equal(processorCalls, 0);
  assert.equal(store.rows.size, 0);
});

function postWebhookSocket(port, { body, headers, trickleAfterBytes, end = true } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: rawBody.STRIPE_WEBHOOK_PATH,
        method: "POST",
        headers
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.setTimeout(5000, () => {
      req.destroy(new Error("Stripe webhook socket request timed out"));
    });
    req.on("error", reject);
    if (typeof trickleAfterBytes === "number") {
      req.write(body.subarray(0, trickleAfterBytes));
      setTimeout(() => {
        req.end(body.subarray(trickleAfterBytes));
      }, 25);
      return;
    }
    if (end === false) {
      req.write(body);
      return;
    }
    req.end(body);
  });
}

async function withLiveWebhookServer(run) {
  const app = Fastify({ logger: false });
  rawBody.attachStripeWebhookRawBody(app);
  app.post(rawBody.STRIPE_WEBHOOK_PATH, async () => ({ ok: true }));
  await app.listen({ host: "127.0.0.1", port: 0 });
  try {
    await run(app.server.address().port);
  } finally {
    await app.close();
  }
}

test("oversized Stripe webhook over a real socket returns HTTP 413", async () => {
  const oversize = Buffer.alloc(rawBody.STRIPE_WEBHOOK_MAX_RAW_BODY_BYTES + 1, 0x78);
  await withLiveWebhookServer(async (port) => {
    const declared = await postWebhookSocket(port, {
      body: oversize,
      headers: {
        "content-type": "application/json",
        "content-length": String(oversize.length)
      }
    });
    assert.equal(declared.statusCode, 413);
    assert.match(declared.body, /Stripe webhook payload exceeds size limit/);
    assert.equal(declared.headers.connection, "close");

    const trickled = await postWebhookSocket(port, {
      body: oversize,
      headers: {
        "content-type": "application/json",
        "content-length": String(oversize.length)
      },
      trickleAfterBytes: 16 * 1024
    });
    assert.equal(trickled.statusCode, 413);
    assert.match(trickled.body, /Stripe webhook payload exceeds size limit/);
    assert.equal(trickled.headers.connection, "close");

    const chunked = await postWebhookSocket(port, {
      body: oversize,
      headers: {
        "content-type": "application/json",
        "transfer-encoding": "chunked"
      }
    });
    assert.equal(chunked.statusCode, 413);
    assert.match(chunked.body, /Stripe webhook payload exceeds size limit/);
    assert.equal(chunked.headers.connection, "close");

    // Leave the request open after the oversize chunk. `for await` + `break`
    // destroys IncomingMessage (and the TCP socket) before Fastify can write
    // 413, so the client sees ECONNRESET instead of a status line.
    const openChunked = await postWebhookSocket(port, {
      body: oversize,
      headers: {
        "content-type": "application/json",
        "transfer-encoding": "chunked"
      },
      end: false
    });
    assert.equal(openChunked.statusCode, 413);
    assert.match(openChunked.body, /Stripe webhook payload exceeds size limit/);
    assert.equal(openChunked.headers.connection, "close");
  });
});

test("in-limit Stripe webhook over a real socket is delivered to the handler", async () => {
  const body = Buffer.from('{"id":"evt_socket_ok"}');
  await withLiveWebhookServer(async (port) => {
    const response = await postWebhookSocket(port, {
      body,
      headers: {
        "content-type": "application/json",
        "content-length": String(body.length)
      }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, JSON.stringify({ ok: true }));
  });
});
