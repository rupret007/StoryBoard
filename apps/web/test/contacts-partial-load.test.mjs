import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(root, "src/app/(app)/contacts/page.tsx"), "utf8");
const client = readFileSync(join(root, "src/app/(app)/contacts/contacts-client.tsx"), "utf8");

test("contacts load independently of venues", () => {
  assert.match(page, /Promise\.allSettled\(/);
  assert.match(page, /let contextError = ""/);
  assert.match(page, /contactRows\.status === "fulfilled"/);
  assert.match(page, /contextError=\{contextError\}/);
  assert.doesNotMatch(page, /\[contacts, venues\] = await Promise\.all\(/);
});

test("a venue fetch failure does not hide recorded contacts", () => {
  assert.match(client, /contextError/);
  assert.match(client, /Reload venues/);
  assert.match(client, /\{loadError \? null : initialContacts\.length === 0 \?/);
});
