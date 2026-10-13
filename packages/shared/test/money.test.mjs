import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);
const {
  parseCurrencyToMinor,
  MONEY_MINOR_MAX,
  PARSE_CURRENCY_INVALID_MESSAGE,
  PARSE_CURRENCY_REQUIRED_MESSAGE,
  PARSE_CURRENCY_MIN_MESSAGE,
  PARSE_CURRENCY_RANGE_MESSAGE
} = shared;

test("empty optional money stays null instead of NaN", () => {
  assert.deepEqual(parseCurrencyToMinor(""), { ok: true, amountMinor: null });
  assert.deepEqual(parseCurrencyToMinor("   "), { ok: true, amountMinor: null });
});

test("empty required money is rejected", () => {
  assert.deepEqual(parseCurrencyToMinor("", { empty: "reject" }), {
    ok: false,
    message: PARSE_CURRENCY_REQUIRED_MESSAGE
  });
});

test("whole and two-decimal dollars become cents", () => {
  assert.deepEqual(parseCurrencyToMinor("0"), { ok: true, amountMinor: 0 });
  assert.deepEqual(parseCurrencyToMinor("12"), { ok: true, amountMinor: 1200 });
  assert.deepEqual(parseCurrencyToMinor("12.5"), { ok: true, amountMinor: 1250 });
  assert.deepEqual(parseCurrencyToMinor("12.50"), { ok: true, amountMinor: 1250 });
  assert.deepEqual(parseCurrencyToMinor("0.01"), { ok: true, amountMinor: 1 });
});

test("scientific notation, negatives, and extra fractions are rejected", () => {
  for (const value of ["1e2", "-1", "12.345", "abc", "$12", "12,000", "Infinity", "NaN"]) {
    assert.deepEqual(parseCurrencyToMinor(value), {
      ok: false,
      message: PARSE_CURRENCY_INVALID_MESSAGE
    });
  }
});

test("a positive minimum rejects zero", () => {
  assert.deepEqual(parseCurrencyToMinor("0", { minMinor: 1 }), {
    ok: false,
    message: PARSE_CURRENCY_MIN_MESSAGE
  });
  assert.deepEqual(parseCurrencyToMinor("0.01", { minMinor: 1 }), { ok: true, amountMinor: 1 });
});

test("amounts above the recorded integer range are rejected", () => {
  const over = String(MONEY_MINOR_MAX / 100 + 1);
  assert.deepEqual(parseCurrencyToMinor(over), {
    ok: false,
    message: PARSE_CURRENCY_RANGE_MESSAGE
  });
});
