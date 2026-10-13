import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "../..");

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

  const editor = source("apps/web/src/app/(app)/booking/booking-stage-editor.tsx");
  assert.match(editor, /NO_AUTO_PITCH_COPY/);
  assert.match(editor, /after the booker has confirmed/);
  assert.match(editor, /When you are ready, this records the stage only/);
  assert.doesNotMatch(editor, /Travis/);
  assert.match(editor, /does not cancel an existing gig or send a message/);

  const showControl = source("apps/web/src/app/(app)/operations/operations-show-control.tsx");
  assert.match(showControl, /No recorded action right now/);
  assert.match(
    showControl,
    /Review the recorded posture below\. StoryBoard will not invent work to fill an empty queue\./
  );
  assert.match(showControl, />\s*Add an event\s*</);
});
