import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};

const [auditMod, operationsMod] = await Promise.all([
  load("audit/audit.service.js"),
  load("operations/operations.service.js")
]);

const paymentInput = {
  idempotencyKey: "deposit-10000",
  amountMinor: 10000,
  currency: "USD",
  method: "check",
  receivedAt: "2026-10-11T12:00:00.000Z"
};

function harness({ failAuditAction = null } = {}) {
  let invoice = {
    id: "invoice-a",
    artistId: "artist-a",
    currency: "USD",
    paidMinor: 0,
    totalMinor: 10000,
    status: "issued"
  };
  let payments = [];
  let audits = [];
  let inTransaction = false;
  let auditAttempts = 0;
  let isolationLevels = [];

  const client = {
    paymentRecord: {
      findUnique: async ({ where }) => {
        const key = where.artistId_idempotencyKey;
        return payments.find((row) => row.artistId === key.artistId && row.idempotencyKey === key.idempotencyKey) ?? null;
      },
      create: async ({ data }) => {
        const row = { id: `payment-${payments.length + 1}`, ...data };
        payments.push(row);
        return row;
      }
    },
    invoice: {
      findFirst: async ({ where }) => (
        where.id === invoice.id && where.artistId === invoice.artistId ? { ...invoice } : null
      ),
      updateMany: async ({ where, data }) => {
        if (
          where.id !== invoice.id
          || where.artistId !== invoice.artistId
          || where.paidMinor !== invoice.paidMinor
          || where.totalMinor !== invoice.totalMinor
          || where.currency !== invoice.currency
          || where.status !== invoice.status
        ) return { count: 0 };
        invoice = { ...invoice, ...data };
        return { count: 1 };
      }
    },
    auditEvent: {
      create: async ({ data }) => {
        auditAttempts += 1;
        assert.equal(inTransaction, true, `${data.action} must be written inside the transaction`);
        if (data.action === failAuditAction) throw new Error("audit unavailable");
        const row = { id: `audit-${audits.length + 1}`, ...data };
        audits.push(row);
        return row;
      }
    }
  };
  client.$transaction = async (callback, options) => {
    isolationLevels.push(options?.isolationLevel);
    const invoiceBefore = { ...invoice };
    const paymentsBefore = payments.map((row) => ({ ...row }));
    const auditsBefore = audits.map((row) => ({ ...row }));
    inTransaction = true;
    try {
      return await callback(client);
    } catch (error) {
      invoice = invoiceBefore;
      payments = paymentsBefore;
      audits = auditsBefore;
      throw error;
    } finally {
      inTransaction = false;
    }
  };

  const audit = new auditMod.AuditService({ client });
  const service = new operationsMod.OperationsService({ client }, audit, {});
  return {
    service,
    get invoice() { return invoice; },
    get payments() { return payments; },
    get audits() { return audits; },
    get auditAttempts() { return auditAttempts; },
    isolationLevels
  };
}

test("a payment audit failure rolls the payment and invoice balance back", async () => {
  const state = harness({ failAuditAction: "invoice.payment_recorded" });

  await assert.rejects(
    () => state.service.recordPayment("artist-a", "invoice-a", paymentInput, "owner@test", "operator-a"),
    /audit unavailable/
  );

  assert.equal(state.invoice.paidMinor, 0);
  assert.equal(state.invoice.status, "issued");
  assert.equal(state.payments.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(state.auditAttempts, 1);
  assert.deepEqual(state.isolationLevels, ["Serializable"]);

  await assert.rejects(
    () => state.service.recordPayment("artist-a", "invoice-a", paymentInput, "owner@test", "operator-a"),
    /audit unavailable/
  );
  assert.equal(state.invoice.paidMinor, 0);
  assert.equal(state.payments.length, 0);
  assert.equal(state.audits.length, 0);
  assert.equal(state.auditAttempts, 2);
});

test("a recorded payment and exact replay produce one payment, one balance update, and one audit", async () => {
  const state = harness();

  const first = await state.service.recordPayment("artist-a", "invoice-a", paymentInput, "owner@test", "operator-a");
  assert.equal(first.id, "payment-1");
  assert.equal(first.amountMinor, 10000);
  assert.equal(state.payments.length, 1);
  assert.equal(state.invoice.paidMinor, 10000);
  assert.equal(state.invoice.status, "paid");
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].action, "invoice.payment_recorded");
  assert.equal(state.audits[0].aggregateType, "PaymentRecord");
  assert.equal(state.audits[0].aggregateId, "payment-1");
  assert.equal(state.audits[0].actorOperatorId, "operator-a");
  assert.deepEqual(state.audits[0].metadata, {
    invoiceId: "invoice-a",
    amountMinor: 10000,
    idempotencyKey: "deposit-10000"
  });

  const replay = await state.service.recordPayment("artist-a", "invoice-a", paymentInput, "owner@test", "operator-a");
  assert.equal(replay.id, first.id);
  assert.equal(state.payments.length, 1);
  assert.equal(state.invoice.paidMinor, 10000);
  assert.equal(state.audits.length, 1);
  assert.equal(state.auditAttempts, 1);
  assert.deepEqual(state.isolationLevels, ["Serializable", "Serializable"]);
});
