import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("Stalemate and Rad Dad resolve as separate voices", () => {
  assert.equal(shared.resolveSocialVoice("Stalemate"), "stalemate");
  assert.equal(shared.resolveSocialVoice("Rad Dad"), "rad_dad");
  assert.equal(shared.resolveSocialVoice("Rad  Dad Band"), "rad_dad");
  assert.equal(shared.resolveSocialVoice("Trailer Swift"), "unknown");
  assert.equal(shared.resolveSocialVoice("My Artist"), "unknown");
});

test("Stalemate Instagram hashtag cap stays at two", () => {
  assert.equal(shared.hashtagCapForVoice("stalemate", "instagram"), 2);
  assert.equal(shared.hashtagCapForVoice("rad_dad", "instagram"), 8);
});

test("banned phrases stay bound to each voice", () => {
  assert.equal(shared.containsBannedPhrase("excited to announce Friday", "stalemate"), "excited to announce");
  assert.equal(shared.containsBannedPhrase("our music journey continues", "rad_dad"), "music journey");
  assert.equal(shared.containsBannedPhrase("Playing Burlington Saturday", "stalemate"), null);
});
