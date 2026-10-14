import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = readFileSync(join(root, "src/app/(app)/booking-campaigns/booking-campaigns-client.tsx"), "utf8");

test("campaign recipient follow-up blur can clear a stored date and resyncs from the server", () => {
  assert.match(client, /campaignFollowUpDueAtWrite/);
  assert.match(client, /campaignFollowUpDueAtChanged/);
  assert.match(client, /followUpDueAt: campaignFollowUpDueAtWrite\(date\)/);
  assert.match(client, /setDate\(recipient\.followUpDueAt\?\.slice\(0, 10\) \?\? ""\)/);
  assert.doesNotMatch(client, /if \(date\) void onUpdate/);
});
