import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const layout = readFileSync(join(root, "src/app/(app)/layout.tsx"), "utf8");
const errorPage = readFileSync(join(root, "src/app/error.tsx"), "utf8");
const card = readFileSync(join(root, "src/components/api-unreachable-card.tsx"), "utf8");

test("app layout does not throw non-401 /auth/me failures into the error page", () => {
  assert.match(layout, /classifyAppAuthLoadError/);
  assert.match(layout, /ApiUnreachableCard/);
  assert.doesNotMatch(layout, /\bthrow e\b/);
});

test("error page keeps honesty copy and does not loop operators back to Dashboard", () => {
  assert.doesNotMatch(errorPage, /\/dashboard/);
  assert.match(errorPage, /sb-btn-primary/);
  assert.match(errorPage, /APP_AUTH_SAVED_RECORDS_COPY/);
  assert.match(errorPage, /href="\/"/);
});

test("unreachable card titles the outage and offers Try again", () => {
  assert.match(card, /APP_AUTH_UNREACHABLE_TITLE/);
  assert.match(card, /APP_AUTH_SAVED_RECORDS_COPY/);
  assert.match(card, /Try again/);
  assert.match(card, /sb-btn-primary/);
});
