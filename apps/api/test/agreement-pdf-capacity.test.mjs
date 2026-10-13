import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pdf from "../dist/operations/simple-pdf.js";
import operations from "../dist/operations/operations.service.js";

const numberedTerms = (count) => Array.from({ length: count }, (_, i) => `Term ${i + 1}`).join("\n");

function isCapacityError(error) {
  assert.equal(error.getStatus?.(), 400);
  assert.match(error.message, /one-page PDF/i);
  assert.match(error.message, /shorten/i);
  assert.match(error.message, /blank lines/i);
  assert.match(error.message, /keep all required terms and disclaimers/i);
  return true;
}

function assertValidPdf(bytes) {
  const text = bytes.toString();
  assert.ok(text.startsWith("%PDF-1.4\n"));
  assert.ok(text.endsWith("%%EOF\n"));
  const xref = Number(text.match(/startxref\n(\d+)\n/)[1]);
  assert.equal(bytes.subarray(xref, xref + 4).toString(), "xref");
  const entries = text.slice(text.indexOf("0000000000 65535 f \n") + 20).split("\n").slice(0, 5);
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    assert.ok(bytes.subarray(offset).toString().startsWith(`${index + 1} 0 obj\n`));
  });
  const stream = text.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
  assert.equal(Buffer.byteLength(stream[2]), Number(stream[1]));
}

test("short PDFs retain their pre-fix bytes, valid offsets, and deterministic SHA-256", () => {
  const first = pdf.renderTextPdf("Agreement", "Line one\nLine two");
  assert.equal(first.sha256, "b80fdc651de275308a204ac91d0768ceb8df170fef713881636e9fa0bd135411");
  assert.deepEqual(first, pdf.renderTextPdf("Agreement", "Line one\nLine two"));
  assert.equal(first.sha256, createHash("sha256").update(first.bytes).digest("hex"));
  assertValidPdf(first.bytes);
});

test("exactly 58 rows retain every term and the trailing disclaimer", () => {
  const body = `${numberedTerms(55)}\nFINAL DISCLAIMER`;
  const { bytes } = pdf.renderTextPdf("Agreement", body);
  for (let i = 1; i <= 55; i += 1) assert.ok(bytes.includes(`(Term ${i}) Tj`));
  assert.ok(bytes.includes("(FINAL DISCLAIMER) Tj"));
  assertValidPdf(bytes);
  assert.deepEqual(pdf.renderTextPdf("Agreement", body.replaceAll("\n", "\r\n")).bytes, bytes);
});

test("the 92-character wrap boundary counts every row without dropping text", () => {
  const exact = "x".repeat(92 * 55) + "FINAL DISCLAIMER";
  const { bytes } = pdf.renderTextPdf("Agreement", exact);
  assert.ok(bytes.includes("(FINAL DISCLAIMER) Tj"));
  assert.equal((bytes.toString().match(/\(x{92}\) Tj/g) ?? []).length, 55);
  assert.throws(() => pdf.renderTextPdf("Agreement", "x".repeat(92 * 56 + 1)), isCapacityError);
});

test("one row over capacity rejects instead of dropping the disclaimer", () => {
  assert.throws(() => pdf.renderTextPdf("Agreement", `${numberedTerms(56)}\nFINAL DISCLAIMER`), isCapacityError);
});

test("the reported 60-term content-loss reproduction fails closed", () => {
  assert.throws(() => pdf.renderTextPdf("Agreement", `${numberedTerms(60)}\nFINAL IMPORTANT TERM`), isCapacityError);
});

test("wrapped titles and blank rows share the page capacity", () => {
  assert.ok(pdf.renderTextPdf("t".repeat(93), numberedTerms(55)).bytes.includes("(Term 55) Tj"));
  assert.throws(() => pdf.renderTextPdf("t".repeat(93), numberedTerms(56)), isCapacityError);
  assert.throws(() => pdf.renderTextPdf("Agreement", `${numberedTerms(55)}\n\nDISCLAIMER`), isCapacityError);
});

test("PDF escaping preserves reviewed parentheses and backslashes", () => {
  const { bytes } = pdf.renderTextPdf("Agreement", "Terms (reviewed) \\ final");
  assert.ok(bytes.includes("(Terms \\(reviewed\\) \\\\ final) Tj"));
  assertValidPdf(bytes);
});

function harness({ bodyTemplate = "{{terms}}\n{{cancellationTerms}}", terms = "Pay on arrival", cancellationTerms = "Cancel with notice", title = "Show", legalDisclaimer = "Not legal advice. Review before signing." } = {}) {
  const deal = { id: "deal-a", artist: { name: "Test band" }, title, terms, cancellationTerms, currency: "USD", buyerName: "Test buyer" };
  const template = { id: "template-a", bodyTemplate, legalDisclaimer };
  const writes = [];
  const audits = [];
  const service = new operations.OperationsService({ client: {
    dealOffer: {
      findFirst: async ({ where }) => where.artistId === "artist-a" && where.id === deal.id ? deal : null,
      findUniqueOrThrow: async () => deal
    },
    documentTemplate: { findFirst: async () => template },
    agreement: {
      aggregate: async () => ({ _max: { version: 3 } }),
      create: async ({ data }) => { writes.push(data); return { id: "agreement-4", ...data }; }
    }
  } }, { log: async (entry) => { audits.push(entry); } }, {});
  return { deal, template, writes, audits, generate: (templateId) => service.generateDealDocument("artist-a", deal.id, templateId, "owner@test", "operator-a") };
}

for (const [name, overrides] of Object.entries({
  "template rows": { bodyTemplate: `${numberedTerms(60)}\nFINAL IMPORTANT TERM` },
  "expanded terms": { terms: "x".repeat(92 * 56 + 1) },
  "expanded cancellation terms": { cancellationTerms: numberedTerms(56) },
  "trailing disclaimer only": { bodyTemplate: numberedTerms(55) },
  "wrapped title": { title: "t".repeat(160), bodyTemplate: numberedTerms(54) },
  "wrapped disclaimer": { bodyTemplate: numberedTerms(54), legalDisclaimer: "d".repeat(93) }
})) {
  test(`oversized agreement (${name}) returns 400 before any agreement, snapshot, or success audit`, async () => {
    const fixture = harness(overrides);
    await assert.rejects(fixture.generate(), isCapacityError);
    await assert.rejects(fixture.generate("template-a"), isCapacityError);
    // Snapshots are nested in agreement.create; no write call means neither can persist.
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.audits, []);
  });
}

test("an exact-fit agreement snapshots all expanded terms and disclaimer with one success audit", async () => {
  const fixture = harness({ terms: numberedTerms(53) });
  const saved = await fixture.generate();
  assert.equal(saved.version, 4);
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.audits.length, 1);
  const snapshot = saved.snapshots.create;
  const bytes = Buffer.from(snapshot.contentBase64, "base64");
  for (let i = 1; i <= 53; i += 1) assert.ok(bytes.includes(`(Term ${i}) Tj`));
  assert.ok(bytes.includes("(Cancel with notice) Tj"));
  assert.ok(bytes.includes(`(${fixture.template.legalDisclaimer}) Tj`));
  assert.equal(snapshot.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(fixture.audits[0].action, "agreement.generated");
  assert.equal(fixture.audits[0].metadata.sha256, snapshot.sha256);
  assertValidPdf(bytes);
});

test("shortening rejected input allows a new snapshot without consuming a version on failure", async () => {
  const fixture = harness({ terms: numberedTerms(60) });
  await assert.rejects(fixture.generate(), isCapacityError);
  fixture.deal.terms = "Reviewed concise terms";
  const saved = await fixture.generate();
  assert.equal(saved.version, 4);
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.audits.length, 1);
  assert.ok(Buffer.from(saved.snapshots.create.contentBase64, "base64").includes("(Reviewed concise terms) Tj"));
});
