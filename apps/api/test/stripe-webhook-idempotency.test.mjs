import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  StripeWebhookIdempotencyService,
  STRIPE_WEBHOOK_CLAIM_LEASE_MS
} = require("../dist/integrations/stripe-webhook-idempotency.service.js");
const { StripeWebhookController } = require("../dist/integrations/stripe-webhook.controller.js");
const { StripeWebhookService } = require("../dist/integrations/stripe-webhook.service.js");
const signature = require("../dist/integrations/stripe-webhook-signature.js");

const SECRET = "whsec_test_secret";

function uniqueError() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function signPayload(payload, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function eventPayload(id = "evt_123abc", type = "payment_intent.succeeded") {
  return JSON.stringify({ id, type, data: { object: {} } });
}

function claimStore({ failComplete = false } = {}) {
  const rows = new Map();
  const events = [];
  let idSeq = 0;

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
        leaseExpiresAt: data.leaseExpiresAt,
        eventType: data.eventType ?? null,
        lastError: data.lastError ?? null,
        completedAt: data.completedAt ?? null
      };
      rows.set(data.eventId, row);
      return { ...row };
    },
    updateMany: async ({ where, data }) => {
      const row = rows.get(where.eventId);
      if (!row) {
        return { count: 0 };
      }
      if (where.status && row.status !== where.status) {
        return { count: 0 };
      }
      if (where.leaseExpiresAt?.lte && row.leaseExpiresAt > where.leaseExpiresAt.lte) {
        return { count: 0 };
      }
      if (data.status === "completed") {
        if (failComplete) {
          throw new Error("complete update failed");
        }
        events.push("completed");
      } else if (data.leaseExpiresAt && data.status === undefined) {
        events.push(where.leaseExpiresAt?.lte ? "reclaim" : "expired");
      }
      Object.assign(row, data);
      return { count: 1 };
    }
  };

  return {
    events,
    rows,
    row: (eventId) => rows.get(eventId),
    seed(eventId, overrides = {}) {
      const row = {
        id: `seed-${eventId}`,
        eventId,
        status: "processing",
        leaseExpiresAt: new Date(Date.now() + STRIPE_WEBHOOK_CLAIM_LEASE_MS),
        eventType: null,
        lastError: null,
        completedAt: null,
        ...overrides
      };
      rows.set(eventId, row);
      return row;
    },
    prisma: { client: { stripeWebhookEvent } }
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

test("claims the unique Stripe event before the handler and marks completed after", async () => {
  const store = claimStore();
  const service = new StripeWebhookIdempotencyService(store.prisma);
  const order = [];
  const result = await service.runOnce("evt_order1", async () => {
    order.push("handler");
    return "acked";
  });
  assert.deepEqual(result, { duplicate: false, result: "acked" });
  assert.deepEqual(store.events, ["claim", "completed"]);
  assert.deepEqual(order, ["handler"]);
  assert.equal(store.row("evt_order1").status, "completed");
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
  assert.deepEqual(store.events, ["claim", "handler", "completed", "claim"]);
  assert.equal(store.row("evt_dup_1").status, "completed");
});

test("two concurrent deliveries of the same Stripe event process once", async () => {
  const store = claimStore();
  let processorCalls = 0;
  let releaseCreates;
  const allCreatesEntered = new Promise((resolve) => {
    releaseCreates = resolve;
  });
  let waitingCreates = 0;
  const originalCreate = store.prisma.client.stripeWebhookEvent.create;
  store.prisma.client.stripeWebhookEvent.create = async (args) => {
    waitingCreates += 1;
    if (waitingCreates >= 2) releaseCreates();
    await allCreatesEntered;
    return originalCreate(args);
  };

  const controller = controllerFor(store, async (event) => {
    processorCalls += 1;
    store.events.push("handler");
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload("evt_race_1", "invoice.paid");
  const header = signPayload(payload);
  const results = await Promise.all([
    controller.webhook({ rawBody: payload }, header),
    controller.webhook({ rawBody: payload }, header)
  ]);
  assert.equal(processorCalls, 1);
  assert.equal(results.filter((result) => result.duplicate === false).length, 1);
  assert.equal(results.filter((result) => result.duplicate === true).length, 1);
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
  const result = await controller.webhook({ rawBody: payload }, signPayload(payload));
  assert.deepEqual(result, { ok: true, duplicate: true });
  assert.equal(processorCalls, 0);
  assert.equal(store.row("evt_inflight_1").status, "processing");
  assert.equal(store.row("evt_inflight_1").completedAt, null);
});

test("a failed handler expires the lease so a retry can process", async () => {
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
  assert.equal(store.row("evt_fail_1").status, "processing");
  assert.ok(store.row("evt_fail_1").leaseExpiresAt <= new Date());
  assert.ok(store.events.includes("expired"));

  const retry = await controller.webhook({ rawBody: payload }, header);
  assert.deepEqual(retry, { ok: true, duplicate: false });
  assert.equal(attempts, 2);
  assert.equal(store.row("evt_fail_1").status, "completed");
});

test("complete-update failure does not release the claim or rerun the side effect", async () => {
  const store = claimStore({ failComplete: true });
  let processorCalls = 0;
  const controller = controllerFor(store, async (event) => {
    processorCalls += 1;
    store.events.push("handler");
    return { acknowledged: true, eventId: event.id, type: event.type };
  });
  const payload = eventPayload("evt_complete_fail");
  const header = signPayload(payload);
  await assert.rejects(
    () => controller.webhook({ rawBody: payload }, header),
    /complete update failed/
  );
  assert.equal(processorCalls, 1);
  assert.equal(store.row("evt_complete_fail").status, "processing");
  assert.ok(store.row("evt_complete_fail").leaseExpiresAt > new Date());
  assert.equal(store.events.includes("expired"), false);

  const retry = await controller.webhook({ rawBody: payload }, header);
  assert.deepEqual(retry, { ok: true, duplicate: true });
  assert.equal(processorCalls, 1);
  assert.equal(store.row("evt_complete_fail").status, "processing");
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
