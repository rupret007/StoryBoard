import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("operator API errors prefer Nest message over raw JSON", () => {
  assert.equal(
    shared.operatorApiErrorMessage(
      JSON.stringify({ statusCode: 400, message: "Voided invoices are immutable", error: "Bad Request" }),
      "Request failed"
    ),
    "Voided invoices are immutable"
  );
  assert.equal(
    shared.operatorApiErrorMessage(
      JSON.stringify({ message: ["Payment exceeds invoice balance", "try again"] }),
      "Request failed"
    ),
    "Payment exceeds invoice balance try again"
  );
  assert.equal(
    shared.operatorApiErrorMessage("", "Request failed"),
    "Request failed"
  );
  assert.equal(
    shared.operatorApiErrorMessage("<html>nope</html>", "Request failed"),
    "Request failed"
  );
  assert.equal(
    shared.operatorApiErrorMessage("{not-json", "Request failed"),
    "Request failed"
  );
  assert.equal(
    shared.operatorApiErrorMessage("Cannot apply terms to a closed opportunity", "Request failed"),
    "Cannot apply terms to a closed opportunity"
  );
});
