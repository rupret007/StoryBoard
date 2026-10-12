import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dashboard = readFileSync(join(root, "src/app/(app)/dashboard/page.tsx"), "utf8");
const summary = readFileSync(join(root, "src/app/(app)/summary/page.tsx"), "utf8");
const bookingPage = readFileSync(join(root, "src/app/(app)/booking/page.tsx"), "utf8");
const bookingClient = readFileSync(join(root, "src/app/(app)/booking/booking-client.tsx"), "utf8");

test("dashboard and summary distinguish a failed insights fetch from a quiet week", () => {
  assert.match(dashboard, /let insightsLoadError = false/);
  assert.match(dashboard, /insightsLoadError = true/);
  assert.match(dashboard, /\{insightsLoadError \?/);
  assert.match(dashboard, /a missing score is not a healthy pipeline/);
  assert.doesNotMatch(dashboard, /\.catch\(\(\) => null\)/);

  assert.match(summary, /let insightsLoadError = false/);
  assert.match(summary, /insightsLoadError = true/);
  assert.match(summary, /a missing score is not a healthy week/);
  assert.doesNotMatch(summary, /\.catch\(\(\) => null\)/);
});

test("booking risk badges do not look low-risk when insights fail", () => {
  assert.match(bookingPage, /insightsLoadError = true/);
  assert.match(bookingPage, /insightsLoadError=\{insightsLoadError\}/);
  assert.match(bookingClient, /insightsLoadError/);
  assert.match(bookingClient, /Missing badges are not the same as low risk/);
});
