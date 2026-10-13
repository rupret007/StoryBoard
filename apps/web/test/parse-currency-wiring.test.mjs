import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ops = readFileSync(join(root, "src/app/(app)/operations/operations-client.tsx"), "utf8");
const project = readFileSync(join(root, "src/app/(app)/operations/projects/[id]/project-client.tsx"), "utf8");
const dayOf = readFileSync(join(root, "src/app/(app)/operations/events/[id]/day-of-client.tsx"), "utf8");

test("operations money writes parse currency instead of sending NaN cents", () => {
  assert.match(ops, /parseCurrencyToMinor/);
  assert.match(ops, /guaranteeParsed = parseCurrencyToMinor\(guarantee\)/);
  assert.match(ops, /depositParsed = parseCurrencyToMinor\(deposit\)/);
  assert.match(ops, /const revenue = parseCurrencyToMinor\(grossRevenue\)/);
  assert.match(ops, /parseCurrencyToMinor\(amount\)/);
  assert.match(ops, /parseCurrencyToMinor\(invoiceAmount, \{ empty: "reject" \}\)/);
  assert.match(ops, /parseCurrencyToMinor\(expenseAmount, \{ empty: "reject", minMinor: 1 \}\)/);
  assert.match(ops, /parseCurrencyToMinor\(settlementGross, \{ empty: "reject" \}\)/);
  assert.match(ops, /parseCurrencyToMinor\(amount, \{ empty: "reject", minMinor: 1 \}\)/);
  assert.doesNotMatch(ops, /Math\.round\(Number\([A-Za-z]+\) \* 100\)/);
});

test("project budget and day-of revenue use the shared currency parser", () => {
  assert.match(project, /parseCurrencyToMinor\(budget\)/);
  assert.doesNotMatch(project, /Math\.round\(Number\(budget\) \* 100\)/);
  assert.match(dayOf, /parseCurrencyToMinor\(grossRevenue\)/);
  assert.doesNotMatch(dayOf, /Math\.round\(Number\(grossRevenue\) \* 100\)/);
});
