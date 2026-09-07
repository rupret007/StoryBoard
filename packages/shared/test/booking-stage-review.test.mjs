import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { nextBookingStages } = createRequire(import.meta.url)("../dist/index.js");

test("booking choices preserve the hold negotiation loop and terminal stages", () => {
  assert.deepEqual(nextBookingStages("hold"), ["offer", "confirmed", "closed"]);
  assert.deepEqual(nextBookingStages("confirmed"), ["closed"]);
  assert.deepEqual(nextBookingStages("closed"), []);
  assert.deepEqual(nextBookingStages("conversation"), ["offer", "hold", "confirmed", "closed"]);
  assert.deepEqual(nextBookingStages("unknown"), []);
  assert.deepEqual(nextBookingStages("constructor"), []);
  assert.deepEqual(nextBookingStages("__proto__"), []);
});
