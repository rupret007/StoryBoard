import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const parseMod = await import(
  pathToFileURL(join(dir, "../dist/workflow-automation/telegram-start-parse.js")).href
);
const cryptoMod = await import(
  pathToFileURL(join(dir, "../dist/workflow-automation/telegram-registration-crypto.js")).href
);

test("parseTelegramStartPayload extracts deep-link payload", () => {
  assert.equal(parseMod.parseTelegramStartPayload("/start abc123"), "abc123");
  assert.equal(parseMod.parseTelegramStartPayload("/START  xyz "), "xyz");
  assert.equal(parseMod.parseTelegramStartPayload("  /start\tpayload9"), "payload9");
  assert.equal(parseMod.parseTelegramStartPayload("/start"), null);
  assert.equal(parseMod.parseTelegramStartPayload("/help"), null);
  assert.equal(parseMod.parseTelegramStartPayload(undefined), null);
});

test("hashTelegramRegistrationToken is deterministic sha256 hex", () => {
  const h = cryptoMod.hashTelegramRegistrationToken("t1");
  assert.equal(h.length, 64);
  assert.equal(
    cryptoMod.hashTelegramRegistrationToken("t1"),
    h
  );
});
