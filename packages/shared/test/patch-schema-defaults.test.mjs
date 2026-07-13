import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const operations = await import(
  pathToFileURL(join(dir, "../dist/schemas/operations.js")).href
);
const manager = await import(
  pathToFileURL(join(dir, "../dist/schemas/manager.js")).href
);

test("partial-update schemas never inject create-time defaults", () => {
  const cases = [
    [
      operations.eventPatchSchema,
      { endsAt: "2026-07-20T00:00:00.000Z" }
    ],
    [operations.songPatchSchema, { notes: "Keep the existing active flag" }],
    [operations.projectPatchSchema, { description: "Keep status and plan arrays" }],
    [operations.dealPatchSchema, { terms: "Keep the negotiated state" }],
    [operations.invoicePatchSchema, { notes: "Keep tax and currency" }],
    [manager.bandMemberPatchSchema, { notes: "Keep roles, instruments, and activity" }],
    [manager.managerInitiativePatchSchema, { description: "Keep initiative status" }]
  ];

  for (const [schema, input] of cases) {
    assert.deepEqual(schema.parse(input), input);
  }

  assert.deepEqual(
    operations.eventPatchSchema.parse({ status: "confirmed", currency: "USD" }),
    { status: "confirmed", currency: "USD" }
  );
  assert.deepEqual(
    manager.bandMemberPatchSchema.parse({ instruments: [], roles: [], active: false }),
    { instruments: [], roles: [], active: false }
  );
});
