import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "../../..");
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

function source(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

test("S10 leftover cents go to the largest basis-point share so amounts sum to net", () => {
  const equalThree = shared.equalActiveMemberSplits([
    { id: "a", active: true },
    { id: "b", active: true },
    { id: "c", active: true }
  ]);
  assert.deepEqual(equalThree.map((split) => split.basisPoints), [3333, 3333, 3334]);
  assert.equal(equalThree.reduce((sum, split) => sum + split.basisPoints, 0), 10000);

  const allocated = shared.allocateSettlementSplits(100, equalThree);
  assert.equal(allocated.reduce((sum, split) => sum + split.amountMinor, 0), 100);
  assert.deepEqual(allocated.map((split) => split.amountMinor), [33, 33, 34]);

  const largestFirst = shared.allocateSettlementSplits(101, [
    { bandMemberId: "lead", basisPoints: 6000 },
    { bandMemberId: "rest", basisPoints: 4000 }
  ]);
  assert.equal(largestFirst.reduce((sum, split) => sum + split.amountMinor, 0), 101);
  assert.equal(largestFirst[0].amountMinor, 61);
  assert.equal(largestFirst[1].amountMinor, 40);

  const ops = source("apps/api/src/operations/operations.service.ts");
  assert.match(ops, /allocateSettlementSplits\(netMinor/);
  assert.match(ops, /settlementSnapshotBody/);
});

test("S10 PDF lines match allocated amounts and keep a 10000 basis-point total", () => {
  const splits = shared.allocateSettlementSplits(100, [
    { bandMemberId: "a", basisPoints: 3333 },
    { bandMemberId: "b", basisPoints: 3333 },
    { bandMemberId: "c", basisPoints: 3334 }
  ]);
  const body = shared.settlementSnapshotBody({
    currency: "USD",
    grossMinor: 150,
    expenseMinor: 50,
    netMinor: 100,
    splits: [
      { amountMinor: splits[0].amountMinor, bandMember: { name: "Alex", active: true } },
      { amountMinor: splits[1].amountMinor, bandMember: { name: "Morgan", active: true } },
      { amountMinor: splits[2].amountMinor, bandMember: { name: "Riley", active: true } }
    ]
  });
  assert.match(body, /Net: USD 1\.00/);
  assert.match(body, /Alex: USD 0\.33/);
  assert.match(body, /Morgan: USD 0\.33/);
  assert.match(body, /Riley: USD 0\.34/);
});

test("S11 equal-split includes only active members and PDF drops inactive names", () => {
  const splits = shared.equalActiveMemberSplits([
    { id: "active-a", active: true },
    { id: "inactive", active: false },
    { id: "active-b", active: true }
  ]);
  assert.deepEqual(splits.map((split) => split.bandMemberId), ["active-a", "active-b"]);
  assert.equal(splits.reduce((sum, split) => sum + split.basisPoints, 0), 10000);
  assert.equal(shared.equalActiveMemberSplits([{ id: "gone", active: false }]).length, 0);

  const body = shared.settlementSnapshotBody({
    currency: "USD",
    grossMinor: 10000,
    expenseMinor: 0,
    netMinor: 10000,
    splits: [
      { amountMinor: 10000, bandMember: { name: "Alex", active: true } },
      { amountMinor: 0, bandMember: { name: "Inactive Pat", active: false } }
    ]
  });
  assert.match(body, /Alex: USD 100\.00/);
  assert.doesNotMatch(body, /Inactive Pat/);

  const ui = source("apps/web/src/app/(app)/operations/operations-client.tsx");
  assert.match(ui, /equalActiveMemberSplits\(members\)/);
  const api = source("apps/api/src/operations/operations.service.ts");
  assert.match(api, /Inactive members cannot receive settlement splits/);
});
