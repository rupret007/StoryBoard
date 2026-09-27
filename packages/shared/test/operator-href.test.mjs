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

test("mailto links keep reserved characters in the recipient, not headers", () => {
  for (const address of [
    "buyer@example.test?subject=Unexpected&body=Injected",
    "buyer#tag@example.test",
    "buyer%0d%0a@example.test",
    "buyer+booking@example.test",
    "buyer,other@example.test"
  ]) {
    const href = shared.sanitizeMailtoHref(address);
    assert.ok(href);
    const url = new URL(href);
    assert.equal(url.search, "");
    assert.equal(url.hash, "");
    assert.equal(decodeURIComponent(url.pathname), address);
    assert.ok(!url.pathname.includes(","));
  }
  assert.equal(shared.sanitizeMailtoHref("  buyer@example.test  "), "mailto:buyer@example.test");
});

test("mailto links reject embedded controls and malformed Unicode without throwing", () => {
  for (const character of ["\u0000", "\u0001", "\t", "\n", "\r", "\u007f", "\ud800"]) {
    assert.equal(shared.sanitizeMailtoHref(`buyer${character}@example.test`), null);
  }
});

test("tel and mailto hrefs reject control characters and empty values", () => {
  assert.equal(shared.sanitizeTelHref("+1 (615) 555-0100"), "tel:+16155550100");
  assert.equal(shared.sanitizeTelHref("not-a-phone"), null);
  assert.equal(shared.sanitizeMailtoHref("buyer@example.test"), "mailto:buyer@example.test");
  assert.equal(shared.sanitizeMailtoHref("buyer@example.test\nBcc:other@example.test"), null);
});
