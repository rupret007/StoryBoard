import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("operator hrefs accept only credential-free http(s)", () => {
  assert.equal(shared.sanitizeOperatorHref("https://docs.example.test/stage-plot.pdf"), "https://docs.example.test/stage-plot.pdf");
  assert.equal(shared.sanitizeOperatorHref("http://venue.local/input-list"), "http://venue.local/input-list");
  assert.equal(shared.sanitizeOperatorHref("javascript:alert(1)"), null);
  assert.equal(shared.sanitizeOperatorHref("data:text/html,hi"), null);
  assert.equal(shared.sanitizeOperatorHref("file:///etc/passwd"), null);
  assert.equal(shared.sanitizeOperatorHref("https://user:secret@evil.test/plot"), null);
  assert.equal(shared.sanitizeOperatorHref("   "), null);
});

test("tel and mailto hrefs reject control characters and empty values", () => {
  assert.equal(shared.sanitizeTelHref("+1 (615) 555-0100"), "tel:+16155550100");
  assert.equal(shared.sanitizeTelHref("not-a-phone"), null);
  assert.equal(shared.sanitizeMailtoHref("buyer@example.test"), "mailto:buyer@example.test");
  assert.equal(shared.sanitizeMailtoHref("buyer@example.test\nBcc:other@example.test"), null);
});

test("mailto hrefs keep URL delimiters inside the recorded address", () => {
  for (const address of [
    "buyer@example.test?subject=unexpected",
    "buyer@example.test?bcc=other%40example.test",
    "buyer#booking@example.test",
    "buyer%0D%0ABcc%3Aother@example.test",
    "buyer+booking@example.test"
  ]) {
    const href = shared.sanitizeMailtoHref(address);
    assert.ok(href);
    const url = new URL(href);
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(decodeURIComponent(url.pathname), address);
  }
  assert.equal(shared.sanitizeMailtoHref("  buyer@example.test  "), "mailto:buyer@example.test");
});
