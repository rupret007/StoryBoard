import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const applyImport = await import(
  pathToFileURL(join(dir, "..", "dist", "booking", "booking-terms-apply.js")).href
);
const applyMod = applyImport.default ?? applyImport;

test("mergeAppliedBookingTerms keeps recorded fee, currency, and conditions when analysis is null", () => {
  const merged = applyMod.mergeAppliedBookingTerms(
    {
      targetDate: "2026-10-01T00:00:00.000Z",
      proposedFeeMinor: 75000,
      proposedCurrency: "USD",
      negotiationConditions: "Deposit due 14 days out"
    },
    {
      proposedDate: null,
      proposedFeeMinor: null,
      proposedCurrency: null,
      materialConditions: null
    }
  );

  assert.deepEqual(merged, {
    targetDate: "2026-10-01T00:00:00.000Z",
    proposedFeeMinor: 75000,
    proposedCurrency: "USD",
    negotiationConditions: "Deposit due 14 days out"
  });
});

test("mergeAppliedBookingTerms writes only the reviewed fields that are present", () => {
  const merged = applyMod.mergeAppliedBookingTerms(
    {
      targetDate: "2026-10-01T00:00:00.000Z",
      proposedFeeMinor: 75000,
      proposedCurrency: "USD",
      negotiationConditions: "Old conditions"
    },
    {
      proposedDate: "2026-11-12T00:00:00.000Z",
      proposedFeeMinor: 90000,
      proposedCurrency: null,
      materialConditions: "New hold terms"
    }
  );

  assert.equal(merged.targetDate, "2026-11-12T00:00:00.000Z");
  assert.equal(merged.proposedFeeMinor, 90000);
  assert.equal(merged.proposedCurrency, "USD");
  assert.equal(merged.negotiationConditions, "New hold terms");
});

test("mergeAppliedBookingTerms treats blank analysis strings as absent", () => {
  const merged = applyMod.mergeAppliedBookingTerms(
    {
      targetDate: "2026-10-01T00:00:00.000Z",
      proposedFeeMinor: 75000,
      proposedCurrency: "USD",
      negotiationConditions: "Deposit due 14 days out"
    },
    {
      proposedDate: "   ",
      proposedFeeMinor: 0,
      proposedCurrency: "",
      materialConditions: "  "
    }
  );

  assert.equal(merged.targetDate, "2026-10-01T00:00:00.000Z");
  assert.equal(merged.proposedFeeMinor, 0);
  assert.equal(merged.proposedCurrency, "USD");
  assert.equal(merged.negotiationConditions, "Deposit due 14 days out");
});
