import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const service = readFileSync(join(dir, "../src/social/social.service.ts"), "utf8");

test("social drops resolve show facts from a recorded event only", () => {
  assert.match(service, /resolveRecordedSocialShow/);
  assert.match(service, /SOCIAL_SHOW_NOT_RECORDED/);
  assert.doesNotMatch(service, /input\.show/);
  assert.doesNotMatch(service, /ticketUrl/);
});
