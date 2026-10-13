import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const eventDayOf = await import(pathToFileURL(join(dir, "..", "dist", "operations/event-day-of.js")).href);
const now = new Date("2026-07-12T12:00:00.000Z");

function event(overrides = {}) {
  return {
    id: "event-day",
    status: "confirmed",
    startsAt: new Date("2026-07-12T21:00:00.000Z"),
    endsAt: null,
    loadInAt: new Date("2026-07-12T17:00:00.000Z"),
    soundcheckAt: null,
    doorsAt: null,
    setAt: null,
    curfewAt: null,
    guaranteeMinor: 100000,
    depositMinor: 10000,
    currency: "USD",
    participants: [],
    tasks: [],
    schedule: [],
    deals: [],
    invoices: [],
    ...overrides
  };
}

function readiness(eventId = "event-day") {
  return {
    eventId,
    title: "Show",
    startsAt: "2026-07-12T21:00:00.000Z",
    daysUntil: 0,
    score: 80,
    status: "attention",
    confidence: 1,
    confidenceLabel: "high",
    observedAt: now.toISOString(),
    headline: "Open.",
    nextAction: null,
    categories: [],
    gaps: [],
    evidenceIds: [eventId]
  };
}

function view(overrides = {}) {
  return eventDayOf.deterministicEventDayOf(event(overrides), readiness(), [], now);
}

test("day-of money excludes a voided invoice from the open balance", () => {
  const result = view({
    invoices: [{ id: "voided-usd", totalMinor: 10000, paidMinor: 0, status: "voided", currency: "USD" }]
  });
  assert.equal(result.openInvoiceBalanceMinor, 0);
  assert.equal(result.recordedPaidMinor, 0);
  assert.equal(result.depositRemainingMinor, 10000);
  assert.equal(result.currencyReviewInvoiceCount, 0);
  assert.equal(result.currencyReviewMessage, null);
  assert.ok(result.evidenceIds.includes("voided-usd"));
});

test("day-of money does not let a foreign-currency payment satisfy the event-currency deposit", () => {
  const result = view({
    invoices: [{ id: "paid-eur", totalMinor: 10000, paidMinor: 10000, status: "paid", currency: "EUR" }]
  });
  assert.equal(result.recordedPaidMinor, 0);
  assert.equal(result.openInvoiceBalanceMinor, 0);
  assert.equal(result.depositRemainingMinor, 10000);
  assert.equal(result.currency, "USD");
  assert.equal(result.currencyReviewInvoiceCount, 1);
  assert.deepEqual(result.currencyReviewCurrencies, ["EUR"]);
  assert.match(result.currencyReviewMessage, /1 invoice in EUR needs review/i);
  assert.match(result.currencyReviewMessage, /not included in these USD totals/i);
  assert.match(result.currencyReviewMessage, /did not convert/i);
  assert.ok(result.evidenceIds.includes("paid-eur"));
});

test("day-of money dedupes the same invoice linked on the event and the deal", () => {
  const invoice = { id: "invoice-shared", totalMinor: 100000, paidMinor: 25000, status: "partially_paid", currency: "USD" };
  const result = view({
    depositMinor: 25000,
    deals: [{ id: "deal-a", status: "accepted", currency: "USD", offerAmountMinor: 100000, depositMinor: 25000, invoices: [invoice] }],
    invoices: [invoice]
  });
  assert.equal(result.recordedPaidMinor, 25000);
  assert.equal(result.openInvoiceBalanceMinor, 75000);
  assert.equal(result.depositRemainingMinor, 0);
  assert.equal(result.expectedFeeMinor, 100000);
  assert.equal(result.currencyReviewInvoiceCount, 0);
});

test("day-of money keeps same-currency payable invoices in the event-currency totals", () => {
  const result = view({
    depositMinor: 25000,
    invoices: [
      { id: "open-usd", totalMinor: 100000, paidMinor: 25000, status: "partially_paid", currency: "USD" },
      { id: "voided-usd", totalMinor: 40000, paidMinor: 0, status: "voided", currency: "USD" },
      { id: "paid-eur", totalMinor: 10000, paidMinor: 10000, status: "paid", currency: "EUR" }
    ]
  });
  assert.equal(result.recordedPaidMinor, 25000);
  assert.equal(result.openInvoiceBalanceMinor, 75000);
  assert.equal(result.depositRemainingMinor, 0);
  assert.equal(result.currencyReviewInvoiceCount, 1);
  assert.deepEqual(result.currencyReviewCurrencies, ["EUR"]);
});

test("day-of money ignores mismatched-currency deal fee and deposit amounts", () => {
  const result = view({
    guaranteeMinor: 100000,
    depositMinor: 25000,
    deals: [{ id: "deal-eur", status: "accepted", currency: "EUR", offerAmountMinor: 500000, depositMinor: 80000, invoices: [] }]
  });
  assert.equal(result.expectedFeeMinor, 100000);
  assert.equal(result.expectedDepositMinor, 25000);
  assert.equal(result.depositRemainingMinor, 25000);
});

test("day-of money lists each foreign currency once and skips voided foreign invoices", () => {
  const result = view({
    invoices: [
      { id: "eur-a", totalMinor: 2000, paidMinor: 0, status: "issued", currency: "eur" },
      { id: "gbp-a", totalMinor: 3000, paidMinor: 500, status: "partially_paid", currency: "GBP" },
      { id: "eur-void", totalMinor: 9000, paidMinor: 0, status: "voided", currency: "EUR" }
    ]
  });
  assert.equal(result.recordedPaidMinor, 0);
  assert.equal(result.openInvoiceBalanceMinor, 0);
  assert.equal(result.currencyReviewInvoiceCount, 2);
  assert.deepEqual(result.currencyReviewCurrencies, ["EUR", "GBP"]);
  assert.match(result.currencyReviewMessage, /2 invoices in EUR, GBP need review/i);
  assert.doesNotMatch(result.currencyReviewMessage, /convert them into EUR/i);
});
