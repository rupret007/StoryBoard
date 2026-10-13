import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);
const { parseCount, PARSE_COUNT_INVALID_MESSAGE } = shared;

test("empty attendance stays unknown instead of NaN", () => {
  assert.deepEqual(parseCount(""), { ok: true, value: null });
  assert.deepEqual(parseCount("   "), { ok: true, value: null });
});

test("whole counts are accepted", () => {
  assert.deepEqual(parseCount("0"), { ok: true, value: 0 });
  assert.deepEqual(parseCount("42"), { ok: true, value: 42 });
});

test("decimals, signs, and scientific notation are rejected", () => {
  for (const value of ["1.5", "-1", "1e2", "abc", "12.0"]) {
    assert.deepEqual(parseCount(value), { ok: false, message: PARSE_COUNT_INVALID_MESSAGE });
  }
});
