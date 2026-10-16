import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const execution = readFileSync(join(dir, "../src/social/social-execution.service.ts"), "utf8");

test("social execution will not re-send or erase a platform id", () => {
  assert.match(execution, /shouldSkipSocialTargetSend/);
  assert.match(execution, /preserveSocialTargetPostId\(row.externalPostId, sent.externalPostId\)/);
  assert.match(execution, /if \(approval.status !== ApprovalStatus.approved\)/);
  assert.doesNotMatch(
    execution,
    /approval.status !== ApprovalStatus.approved && approval.status !== ApprovalStatus.executed/
  );
});
