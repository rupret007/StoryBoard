import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { bookingStageReviewCopy, nextBookingStages, NO_AUTO_PITCH_COPY } = createRequire(import.meta.url)("../dist/index.js");

test("booking choices preserve the hold negotiation loop and terminal stages", () => {
  assert.deepEqual(nextBookingStages("hold"), ["offer", "confirmed", "closed"]);
  assert.deepEqual(nextBookingStages("confirmed"), ["closed"]);
  assert.deepEqual(nextBookingStages("closed"), []);
  assert.deepEqual(nextBookingStages("conversation"), ["offer", "hold", "confirmed", "closed"]);
  assert.deepEqual(nextBookingStages("unknown"), []);
  assert.deepEqual(nextBookingStages("constructor"), []);
  assert.deepEqual(nextBookingStages("__proto__"), []);
});

test("every booking-stage review line renders shared no-auto-pitch copy and names no individual", () => {
  const confirmed = bookingStageReviewCopy("confirmed");
  assert.match(confirmed, /after the booker has confirmed/);
  assert.ok(confirmed.includes(NO_AUTO_PITCH_COPY));
  assert.doesNotMatch(confirmed, /Travis/i);
  assert.doesNotMatch(confirmed, /\.\./);

  const closed = bookingStageReviewCopy("closed");
  assert.match(closed, /when you are ready/i);
  assert.match(closed, /does not cancel an existing gig or send a message/);
  assert.ok(closed.includes(NO_AUTO_PITCH_COPY), `closed review missing NO_AUTO_PITCH_COPY: ${JSON.stringify(closed)}`);
  assert.doesNotMatch(closed, /Travis/i);
  assert.doesNotMatch(closed, /\.\./);

  for (const stage of ["target", "outreach", "conversation", "offer", "hold"]) {
    const copy = bookingStageReviewCopy(stage);
    assert.match(copy, /when you are ready/i);
    assert.match(copy, /this records the stage only/);
    assert.ok(copy.includes(NO_AUTO_PITCH_COPY), `${stage} review missing NO_AUTO_PITCH_COPY`);
    assert.doesNotMatch(copy, /Travis/i);
    assert.doesNotMatch(copy, /\.\./);
  }
});
