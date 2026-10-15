import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("phone video mime maps to video and stays under the 2 GB cap", () => {
  assert.equal(shared.socialMediaKindFromMime("video/quicktime", "clip.mov"), "video");
  assert.deepEqual(
    shared.assertSocialMediaLimits({ mimeType: "video/mp4", filename: "set.mp4", byteSize: 1_500_000_000 }),
    { kind: "video" }
  );
  assert.throws(
    () => shared.assertSocialMediaLimits({ mimeType: "video/mp4", byteSize: 2_000_000_001 }),
    /2 GB/
  );
});

test("Content-Range chunks must be sequential", () => {
  const range = shared.parseSocialContentRange("bytes 0-7/20", 20);
  assert.equal(range.length, 8);
  assert.equal(shared.nextReceivedBytes(0, range), 8);
  assert.throws(() => shared.nextReceivedBytes(4, range), /start at byte 4/);
});

test("TikTok FILE_UPLOAD plan uses chunked FILE_UPLOAD, not a public URL", () => {
  const plan = shared.tiktokFileUploadPlan(25 * 1024 * 1024);
  assert.equal(plan.source, "FILE_UPLOAD");
  assert.equal(plan.totalChunkCount, 3);
  assert.equal(plan.chunks.at(-1)?.length, 5 * 1024 * 1024);
});
