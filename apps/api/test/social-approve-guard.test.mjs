import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const service = readFileSync(join(dir, "../src/social/social.service.ts"), "utf8");
const execution = readFileSync(join(dir, "../src/social/social-execution.service.ts"), "utf8");

test("approve-and-post refuses a terminal drop before rewriting captions", () => {
  assert.match(service, /socialApproveAndPostBlockReason/);
  assert.match(service, /if \(blocked\) \{\s*throw new BadRequestException\(blocked\);/s);
  assert.match(service, /const post = await this.execution.requirePost/);
  assert.ok(
    service.indexOf("socialApproveAndPostBlockReason") < service.indexOf("if (input.targets)"),
    "the block check must run before target caption writes"
  );
});

test("execution skips a target that already has a platform id", () => {
  assert.match(execution, /shouldSendSocialTarget/);
  assert.match(execution, /existingExternalPostId: row.externalPostId/);
});
