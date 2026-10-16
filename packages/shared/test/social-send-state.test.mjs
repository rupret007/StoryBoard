import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("a target with a platform id is not sent again", () => {
  assert.equal(shared.shouldSkipSocialTargetSend({ externalPostId: "page-1_99" }), true);
  assert.equal(shared.shouldSkipSocialTargetSend({ externalPostId: "  " }), false);
  assert.equal(shared.shouldSkipSocialTargetSend({ externalPostId: null }), false);
});

test("a refused later attempt keeps the id that already landed", () => {
  assert.equal(shared.preserveSocialTargetPostId("page-1_99", undefined), "page-1_99");
  assert.equal(shared.preserveSocialTargetPostId("page-1_99", null), "page-1_99");
  assert.equal(shared.preserveSocialTargetPostId(null, "page-1_100"), "page-1_100");
  assert.equal(shared.preserveSocialTargetPostId(null, undefined), null);
});
