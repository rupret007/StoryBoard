import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("matching Stalemate account is allowed", () => {
  const result = shared.checkSocialAccountMatch({
    artistName: "Stalemate",
    artistVoice: "stalemate",
    accountLabel: "Stalemate Chicago",
    accountVoice: "stalemate",
    accountExternalId: "page-1",
    platform: "facebook"
  });
  assert.deepEqual(result, { ok: true });
});

test("Rad Dad page is refused on a Stalemate workspace", () => {
  const result = shared.checkSocialAccountMatch({
    artistName: "Stalemate",
    artistVoice: "stalemate",
    accountLabel: "Rad Dad Band",
    accountVoice: "rad_dad",
    accountExternalId: "page-2",
    platform: "facebook"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "cross_band_account");
});

test("unbound account on a named voice is refused", () => {
  const result = shared.checkSocialAccountMatch({
    artistName: "Stalemate",
    artistVoice: "stalemate",
    accountLabel: "Promo Page",
    accountVoice: "unknown",
    accountExternalId: "page-3",
    platform: "instagram"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "voice_mismatch");
});

test("missing account is refused before any send", () => {
  const result = shared.checkSocialAccountMatch({
    artistName: "Rad Dad",
    artistVoice: "rad_dad",
    accountLabel: "",
    accountVoice: "rad_dad",
    accountExternalId: "",
    platform: "tiktok"
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_account");
});
