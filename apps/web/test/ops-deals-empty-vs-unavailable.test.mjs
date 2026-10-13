import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/app/(app)/operations/page.tsx"), "utf8");
const client = readFileSync(join(root, "src/app/(app)/operations/operations-client.tsx"), "utf8");

test("operations tracks whether deals and invoices loaded", () => {
  assert.match(page, /let dealsAvailable = false/);
  assert.match(page, /let invoicesAvailable = false/);
  assert.match(page, /dealsAvailable = true/);
  assert.match(page, /invoicesAvailable = true/);
  assert.match(page, /dealsAvailable=\{dealsAvailable\}/);
  assert.match(page, /invoicesAvailable=\{invoicesAvailable\}/);
});

test("Deals empty states require a successful load", () => {
  assert.match(client, /function Deals\(\{ dealsAvailable, invoicesAvailable,/);
  assert.match(client, /dealsAvailable \? <EmptyState title="No offers yet"/);
  assert.match(client, /Offers could not be loaded/);
  assert.match(client, /invoicesAvailable \? <p className="text-sm text-\[var\(--text-muted\)\]">No invoices yet\./);
  assert.match(client, /Invoices could not be loaded/);
  assert.doesNotMatch(client, /\{!deals\.length \? <EmptyState title="No offers yet"/);
  assert.doesNotMatch(client, /\{!invoices\.length \? <p className="text-sm text-\[var\(--text-muted\)\]">No invoices yet\./);
});
