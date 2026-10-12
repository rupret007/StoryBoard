import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("clearing a campaign follow-up date writes null instead of skipping the PATCH", () => {
  assert.equal(shared.campaignFollowUpDueAtWrite(""), null);
  assert.equal(shared.campaignFollowUpDueAtWrite("   "), null);
  assert.equal(shared.campaignFollowUpDueAtWrite(null), null);
  assert.equal(shared.campaignFollowUpDueAtWrite(undefined), null);
  assert.equal(shared.campaignFollowUpDueAtWrite("2026-09-15"), "2026-09-15T12:00:00.000Z");
  assert.equal(shared.campaignFollowUpDueAtWrite("09-15-2026"), null);
});

test("a cleared or edited follow-up is a change; an unchanged noon-UTC day is not", () => {
  assert.equal(shared.campaignFollowUpDueAtChanged("2026-09-15T12:00:00.000Z", ""), true);
  assert.equal(shared.campaignFollowUpDueAtChanged(null, "2026-09-15"), true);
  assert.equal(shared.campaignFollowUpDueAtChanged("2026-09-15T12:00:00.000Z", "2026-09-15"), false);
  assert.equal(shared.campaignFollowUpDueAtChanged(null, ""), false);
});
