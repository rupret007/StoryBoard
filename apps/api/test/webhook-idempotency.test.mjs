import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { WebhookIdempotencyService } = require("../dist/integrations/webhook-idempotency.service.js");
const { TelegramWebhookController } = require("../dist/workflow-automation/telegram-webhook.controller.js");
const { StripeWebhookController } = require("../dist/integrations/stripe-webhook.controller.js");
const { StripeWebhookService } = require("../dist/integrations/stripe-webhook.service.js");
const ids = require("../dist/integrations/inbound-webhook-ids.js");

function uniqueError() {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

function claimStore({ createBarrier = false } = {}) {
  const rows = new Map();
  const events = [];
  let idSeq = 0;
  let waitingCreates = 0;
  let releaseCreates;
  const allCreatesEntered = new Promise((resolve) => {
    releaseCreates = resolve;
  });
  const keyOf = (provider, eventId) => `${provider}:${eventId}`;

  const inboundWebhookClaim = {
    create: async ({ data }) => {
      events.push("claim");
      if (createBarrier) {
        waitingCreates += 1;
        if (waitingCreates >= 2) releaseCreates();
        await allCreatesEntered;
      }
      const key = keyOf(data.provider, data.eventId);
      if (rows.has(key)) throw uniqueError();
      const row = {
        id: `claim-${++idSeq}`,
        provider: data.provider,
        eventId: data.eventId,
        status: data.status ?? "attempted",
        processedAt: data.processedAt ?? null,
        lastError: data.lastError ?? null
      };
      rows.set(key, row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      const key = keyOf(where.provider_eventId.provider, where.provider_eventId.eventId);
      const row = rows.get(key);
      if (!row) throw new Error("claim row missing");
      Object.assign(row, data);
      if (data.status === "processed") events.push("processed");
      return { ...row };
    },
    delete: async ({ where }) => {
      const key = keyOf(where.provider_eventId.provider, where.provider_eventId.eventId);
      const row = rows.get(key);
      if (!row) throw new Error("claim row missing");
      rows.delete(key);
      events.push("released");
      return row;
    }
  };

  return {
    events,
    rows,
    row: (provider, eventId) => rows.get(keyOf(provider, eventId)),
    prisma: { client: { inboundWebhookClaim } }
  };
}

function config(values = {}) {
  return { get: (key) => values[key] };
}

test("telegram and stripe event id extractors reject missing or empty ids", () => {
  assert.equal(ids.telegramUpdateId(undefined), null);
  assert.equal(ids.telegramUpdateId({ message: {} }), null);
  assert.equal(ids.telegramUpdateId({ update_id: -1 }), null);
  assert.equal(ids.telegramUpdateId({ update_id: 12.5 }), null);
  assert.equal(ids.telegramUpdateId({ update_id: 9001 }), "9001");
  assert.equal(ids.telegramUpdateId({ update_id: "42" }), "42");
  assert.equal(ids.stripeEventId(undefined), null);
  assert.equal(ids.stripeEventId({ type: "charge.succeeded" }), null);
  assert.equal(ids.stripeEventId({ id: "   " }), null);
  assert.equal(ids.stripeEventId({ id: "evt_123" }), "evt_123");
});

test("claims the unique webhook row before the handler and marks processed after", async () => {
  const store = claimStore();
  const service = new WebhookIdempotencyService(store.prisma);
  const order = [];
  const result = await service.runOnce("telegram", "1001", async () => {
    order.push("handler");
    return "bound";
  });
  assert.deepEqual(result, { duplicate: false, result: "bound" });
  assert.deepEqual(store.events, ["claim", "processed"]);
  assert.deepEqual(order, ["handler"]);
  assert.equal(store.row("telegram", "1001").status, "processed");
  assert.ok(store.row("telegram", "1001").processedAt instanceof Date);
});

test("duplicate Telegram update_id deliveries invoke the registration handler once", async () => {
  const store = claimStore();
  const service = new WebhookIdempotencyService(store.prisma);
  let handlerCalls = 0;
  const controller = new TelegramWebhookController(
    config(),
    {
      handleWebhookUpdate: async () => {
        handlerCalls += 1;
        store.events.push("handler");
      }
    },
    service
  );
  const body = {
    update_id: 7001,
    message: { text: "/start token", chat: { id: 99 } }
  };
  const first = await controller.webhook({ body });
  const second = await controller.webhook({ body });
  assert.deepEqual(first, { ok: true, duplicate: false });
  assert.deepEqual(second, { ok: true, duplicate: true });
  assert.equal(handlerCalls, 1);
  assert.deepEqual(store.events, ["claim", "handler", "processed", "claim"]);
  assert.equal(store.row("telegram", "7001").status, "processed");
});

test("duplicate Stripe event id deliveries invoke the processor once", async () => {
  const store = claimStore();
  const service = new WebhookIdempotencyService(store.prisma);
  const stripe = new StripeWebhookService();
  let processorCalls = 0;
  stripe.useProcessor(async (body) => {
    processorCalls += 1;
    store.events.push("handler");
    return { acknowledged: true, eventId: body.id, type: body.type };
  });
  const controller = new StripeWebhookController(config(), service, stripe);
  const body = { id: "evt_dup_1", type: "payment_intent.succeeded", data: { object: {} } };
  const first = await controller.webhook({ body });
  const second = await controller.webhook({ body });
  assert.deepEqual(first, { ok: true, duplicate: false });
  assert.deepEqual(second, { ok: true, duplicate: true });
  assert.equal(processorCalls, 1);
  assert.deepEqual(store.events, ["claim", "handler", "processed", "claim"]);
  assert.equal(store.row("stripe", "evt_dup_1").status, "processed");
});

test("two concurrent deliveries of the same Telegram update claim first and handle once", async () => {
  const store = claimStore({ createBarrier: true });
  const service = new WebhookIdempotencyService(store.prisma);
  let handlerCalls = 0;
  const controller = new TelegramWebhookController(
    config(),
    {
      handleWebhookUpdate: async () => {
        handlerCalls += 1;
        store.events.push("handler");
      }
    },
    service
  );
  const body = { update_id: 8002, message: { text: "/start token", chat: { id: 1 } } };
  const results = await Promise.all([
    controller.webhook({ body }),
    controller.webhook({ body })
  ]);
  const processed = results.filter((r) => r.duplicate === false);
  const skipped = results.filter((r) => r.duplicate === true);
  assert.equal(handlerCalls, 1, "both deliveries invoked the handler before the unique insert");
  assert.equal(processed.length, 1);
  assert.equal(skipped.length, 1);
  assert.equal(store.events.filter((e) => e === "claim").length, 2);
  assert.equal(store.events.filter((e) => e === "handler").length, 1);
  assert.equal(store.row("telegram", "8002").status, "processed");
});

test("two concurrent Stripe deliveries of the same event id process once", async () => {
  const store = claimStore({ createBarrier: true });
  const service = new WebhookIdempotencyService(store.prisma);
  const stripe = new StripeWebhookService();
  let processorCalls = 0;
  stripe.useProcessor(async (body) => {
    processorCalls += 1;
    store.events.push("handler");
    return { acknowledged: true, eventId: body.id, type: body.type };
  });
  const controller = new StripeWebhookController(config(), service, stripe);
  const body = { id: "evt_race_1", type: "invoice.paid" };
  const results = await Promise.all([
    controller.webhook({ body }),
    controller.webhook({ body })
  ]);
  assert.equal(processorCalls, 1);
  assert.equal(results.filter((r) => r.duplicate === false).length, 1);
  assert.equal(results.filter((r) => r.duplicate === true).length, 1);
  assert.equal(store.row("stripe", "evt_race_1").status, "processed");
});

test("a failed Telegram handler releases the claim so a retry can process", async () => {
  const store = claimStore();
  const service = new WebhookIdempotencyService(store.prisma);
  let attempts = 0;
  const controller = new TelegramWebhookController(
    config(),
    {
      handleWebhookUpdate: async () => {
        attempts += 1;
        store.events.push("handler");
        if (attempts === 1) throw new Error("registration unavailable");
      }
    },
    service
  );
  const body = { update_id: 9003, message: { text: "/start token", chat: { id: 2 } } };
  await assert.rejects(() => controller.webhook({ body }), /registration unavailable/);
  assert.equal(store.row("telegram", "9003"), undefined);
  assert.ok(store.events.includes("released"));

  const retry = await controller.webhook({ body });
  assert.deepEqual(retry, { ok: true, duplicate: false });
  assert.equal(attempts, 2);
  assert.equal(store.row("telegram", "9003").status, "processed");
});

test("a failed Stripe handler releases the claim so a retry can process", async () => {
  const store = claimStore();
  const service = new WebhookIdempotencyService(store.prisma);
  const stripe = new StripeWebhookService();
  let attempts = 0;
  stripe.useProcessor(async (body) => {
    attempts += 1;
    store.events.push("handler");
    if (attempts === 1) throw new Error("stripe processor unavailable");
    return { acknowledged: true, eventId: body.id, type: body.type };
  });
  const controller = new StripeWebhookController(config(), service, stripe);
  const body = { id: "evt_fail_1", type: "checkout.session.completed" };
  await assert.rejects(() => controller.webhook({ body }), /stripe processor unavailable/);
  assert.equal(store.row("stripe", "evt_fail_1"), undefined);
  const retry = await controller.webhook({ body });
  assert.deepEqual(retry, { ok: true, duplicate: false });
  assert.equal(attempts, 2);
  assert.equal(store.row("stripe", "evt_fail_1").status, "processed");
});

test("wrong Telegram or Stripe webhook secrets fail closed without claiming", async () => {
  const store = claimStore();
  const service = new WebhookIdempotencyService(store.prisma);
  let telegramCalls = 0;
  const telegram = new TelegramWebhookController(
    config({ TELEGRAM_WEBHOOK_SECRET: "tg-secret" }),
    {
      handleWebhookUpdate: async () => {
        telegramCalls += 1;
      }
    },
    service
  );
  await assert.rejects(
    () => telegram.webhook({ body: { update_id: 1 } }, "wrong"),
    (error) => error.getStatus?.() === 403
  );
  assert.equal(telegramCalls, 0);
  assert.equal(store.rows.size, 0);

  const stripe = new StripeWebhookController(
    config({ STRIPE_WEBHOOK_SECRET: "stripe-secret" }),
    service,
    new StripeWebhookService()
  );
  await assert.rejects(
    () => stripe.webhook({ body: { id: "evt_1" } }, "wrong"),
    (error) => error.getStatus?.() === 403
  );
  assert.equal(store.rows.size, 0);
});

test("Stripe webhook without an event id is rejected without claiming", async () => {
  const store = claimStore();
  const service = new WebhookIdempotencyService(store.prisma);
  const stripe = new StripeWebhookController(config(), service, new StripeWebhookService());
  await assert.rejects(
    () => stripe.webhook({ body: { type: "charge.succeeded" } }),
    (error) => error.getStatus?.() === 400
  );
  assert.equal(store.rows.size, 0);
});

test("Telegram webhook without update_id stays 200 and does not claim or handle", async () => {
  const store = claimStore();
  const service = new WebhookIdempotencyService(store.prisma);
  let handlerCalls = 0;
  const controller = new TelegramWebhookController(
    config(),
    {
      handleWebhookUpdate: async () => {
        handlerCalls += 1;
      }
    },
    service
  );
  const result = await controller.webhook({
    body: { message: { text: "/start token", chat: { id: 1 } } }
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(handlerCalls, 0);
  assert.equal(store.rows.size, 0);
});
