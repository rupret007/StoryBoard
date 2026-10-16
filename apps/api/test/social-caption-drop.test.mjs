import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const { SocialService } = await load("social/social.service.js");
const { SocialCaptionService } = await load("social/social-caption.service.js");

test("failed configured caption generation creates no post, target, media, approval, or send", async () => {
  const writes = [];
  const unexpectedWrite = (name) => async () => { writes.push(name); throw new Error(`Unexpected ${name}`); };
  const prisma = {
    client: {
      artist: { findUniqueOrThrow: async () => ({ id: "artist-caption", name: "Stalemate" }) },
      socialVoiceProfile: { findUnique: async () => ({ confirmedFacts: [] }) },
      socialPost: { create: unexpectedWrite("post") },
      socialPostTarget: { create: unexpectedWrite("target") },
      socialMediaAsset: { create: unexpectedWrite("media") },
      $transaction: unexpectedWrite("transaction")
    }
  };
  const captionService = new SocialCaptionService({
    get: (key) => key === "OPENAI_ENABLED" ? true : key === "OPENAI_API_KEY" ? "synthetic-test-key" : undefined
  });
  const service = new SocialService(
    prisma,
    { create: unexpectedWrite("approval") },
    { log: unexpectedWrite("audit") },
    { env: () => ({ SOCIAL_ADAPTER: "real" }), executeApproved: unexpectedWrite("send") },
    { draft: (input) => captionService.draft(input, {
      responses: { create: async () => { throw new Error("Synthetic provider failure"); } }
    }) }
  );
  await assert.rejects(service.createDrop("artist-caption", {
    note: "Friday at Burlington Bar.",
    mediaUrl: "https://example.invalid/clip.mp4",
    mediaKind: "video",
    platforms: ["facebook"]
  }, { label: "owner@test.invalid", operatorId: "owner-caption" }),
  (error) => error.getStatus() === 503 && /No draft was created/.test(error.message));
  assert.deepEqual(writes, []);
});
