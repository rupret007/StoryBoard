import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dayOf = readFileSync(join(root, "src/app/(app)/operations/events/[id]/day-of-client.tsx"), "utf8");
const types = readFileSync(join(root, "src/lib/types.ts"), "utf8");

test("day-of money checkpoint surfaces foreign-currency invoices for review without converting them", () => {
  assert.match(types, /currencyReviewInvoiceCount: number/);
  assert.match(types, /currencyReviewCurrencies: string\[\]/);
  assert.match(types, /currencyReviewMessage: string \| null/);
  assert.match(dayOf, /role="status" data-testid="day-of-currency-review"/);
  assert.match(dayOf, /dayOf\.currencyReviewMessage/);
  assert.match(dayOf, /Review invoices/);
  assert.match(dayOf, /dayOf\.currencyReviewInvoiceCount > 0/);
  assert.doesNotMatch(dayOf, /exchange rate/i);
  assert.doesNotMatch(dayOf, /convert.*EUR/i);
});
