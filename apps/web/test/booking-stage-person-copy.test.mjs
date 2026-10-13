import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "../..");
const shared = await import(pathToFileURL(join(repoRoot, "packages/shared/dist/index.js")).href);

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

test("S08 ops next-action and booking-stage review use person-shaped no-auto-pitch copy", () => {
  const operatorCopy = source("packages/shared/src/operator-copy.ts");
  assert.match(
    operatorCopy,
    /export const NO_AUTO_PITCH_COPY =\s*"StoryBoard will not send a pitch; a person still books"/
  );

  const nextAction = source("packages/shared/src/ops-next-action.ts");
  assert.match(nextAction, /import \{ NO_AUTO_PITCH_COPY \} from "\.\/operator-copy"/);
  assert.match(nextAction, /When you are ready, add this room to a pitch campaign\. \$\{NO_AUTO_PITCH_COPY\}\./);
  assert.match(nextAction, /Record outreach when you are ready\. \$\{NO_AUTO_PITCH_COPY\}\./);
  assert.match(nextAction, /Confirm the date when you are ready\. Confirming creates a gig\. \$\{NO_AUTO_PITCH_COPY\}\./);
  assert.match(
    nextAction,
    /Confirm this booking to create a reviewable approval when you are ready\. \$\{NO_AUTO_PITCH_COPY\}\./
  );
  assert.doesNotMatch(nextAction, /Travis/);

  const review = source("packages/shared/src/booking-stage-review.ts");
  assert.match(review, /bookingStageReviewCopy/);
  assert.match(review, /NO_AUTO_PITCH_COPY/);
  assert.match(review, /after the booker has confirmed/);
  assert.match(review, /When you are ready, closing ends this opportunity's pipeline history/);
  assert.match(review, /When you are ready, this records the stage only/);
  assert.doesNotMatch(review, /Travis/);

  const confirmed = shared.bookingStageReviewCopy("confirmed");
  const closed = shared.bookingStageReviewCopy("closed");
  const other = shared.bookingStageReviewCopy("outreach");
  assert.ok(confirmed.includes(shared.NO_AUTO_PITCH_COPY));
  assert.match(confirmed, /after the booker has confirmed/);
  assert.ok(closed.includes(shared.NO_AUTO_PITCH_COPY), "Closed-stage review must render NO_AUTO_PITCH_COPY");
  assert.match(closed, /when you are ready/i);
  assert.match(closed, /does not cancel an existing gig or send a message/);
  assert.ok(other.includes(shared.NO_AUTO_PITCH_COPY));
  assert.match(other, /when you are ready/i);
  for (const copy of [confirmed, closed, other, shared.BOOKING_TERMS_APPLIED_COPY]) {
    assert.doesNotMatch(copy, /Travis/i);
  }

  const editor = source("apps/web/src/app/(app)/booking/booking-stage-editor.tsx");
  assert.match(editor, /bookingStageReviewCopy\(review\.stage\)/);
  assert.match(editor, /data-testid="booking-stage-review-copy"/);
  assert.doesNotMatch(editor, /Travis/);

  const inbox = source("apps/web/src/app/(app)/booking-inbox/booking-inbox-client.tsx");
  assert.match(inbox, /BOOKING_TERMS_APPLIED_COPY/);
  assert.doesNotMatch(inbox, /Travis/);
  assert.ok(shared.BOOKING_TERMS_APPLIED_COPY.includes(shared.NO_AUTO_PITCH_COPY));
  assert.match(shared.BOOKING_TERMS_APPLIED_COPY, /when you are ready/i);

  const showControl = source("apps/web/src/app/(app)/operations/operations-show-control.tsx");
  assert.match(showControl, /No recorded action right now/);
  assert.match(
    showControl,
    /Review the recorded posture below\. StoryBoard will not invent work to fill an empty queue\./
  );
  assert.match(showControl, />\s*Add an event\s*</);
});
