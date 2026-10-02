import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { OnboardingService } = require("../dist/memberships/onboarding.service.js");
const serializationFailure = () => Object.assign(new Error("TransactionWriteConflict"), {
  name: "DriverAdapterError",
  cause: { originalCode: "40001", kind: "TransactionWriteConflict" }
});

function fixture({ commitFailures = [], roles = [], counts = [], auditFailureAt } = {}) {
  let state = { artists: [], memberships: [], audits: [] };
  const cookies = [];
  let attempts = 0;
  let ownerChecks = 0;
  let firstBandChecks = 0;
  let auditCalls = 0;
  const prisma = { client: {
    $transaction: async (work, options) => {
      assert.equal(options.isolationLevel, "Serializable");
      const attempt = attempts++;
      const draft = structuredClone(state);
      const tx = {
        artist: {
          findUnique: async () => null,
          create: async ({ data }) => {
            const artist = { id: `band-attempt-${attempt + 1}`, ...data };
            draft.artists.push(artist);
            return artist;
          }
        },
        artistMembership: {
          findUnique: async ({ where }) => {
            ownerChecks++;
            assert.deepEqual(where, { operatorId_artistId: { operatorId: "operator", artistId: "source-band" } });
            return { role: roles[attempt] ?? "owner" };
          },
          count: async () => { firstBandChecks++; return counts[attempt] ?? 0; },
          create: async ({ data }) => {
            const membership = { id: `membership-attempt-${attempt + 1}`, ...data };
            draft.memberships.push(membership);
            return membership;
          }
        },
        auditEvent: { create: async ({ data }) => {
          auditCalls++;
          if (auditCalls === auditFailureAt) throw new Error("audit unavailable");
          draft.audits.push(data);
        } }
      };
      const result = await work(tx);
      assert.equal(cookies.length, 0, "session must not change before COMMIT succeeds");
      if (commitFailures[attempt]) throw commitFailures[attempt];
      state = draft;
      return result;
    }
  } };
  const audit = { log: async (entry, tx) => {
    assert.ok(tx, "every audit must be part of its workspace transaction");
    await tx.auditEvent.create({ data: entry });
  } };
  const auth = {
    newSessionPayload: (operatorId, artistId) => ({ operatorId, artistId }),
    applySessionCookie: (_reply, payload) => {
      assert.equal(state.artists.at(-1)?.id, payload.artistId, "cookie references committed workspace only");
      assert.equal(state.audits.length, 2);
      cookies.push(payload);
    }
  };
  const service = new OnboardingService(prisma, audit, auth);
  const input = { operatorId: "operator", actorLabel: "operator@test.invalid", name: "New band", reply: {} };
  return {
    additional: () => service.createAdditionalArtist({ ...input, sourceArtistId: "source-band" }),
    first: () => service.createFirstArtist(input),
    state: () => state,
    stats: () => ({ attempts, ownerChecks, firstBandChecks, auditCalls }), cookies
  };
}

for (const [name, failure] of [
  ["pg adapter COMMIT serialization failure", serializationFailure()],
  ["Prisma transaction write conflict", Object.assign(new Error("write conflict"), { code: "P2034" })]
]) {
  test(`workspace retries an aborted ${name} with fresh ownership and atomic audits`, async () => {
    const f = fixture({ commitFailures: [failure] });
    const result = await f.additional();
    assert.equal(result.artistId, "band-attempt-2");
    assert.deepEqual(f.stats(), { attempts: 2, ownerChecks: 2, firstBandChecks: 0, auditCalls: 4 });
    assert.equal(f.state().artists.length, 1);
    assert.equal(f.state().memberships.length, 1);
    assert.equal(f.state().audits.length, 2);
    assert.equal(f.state().memberships[0].artistId, result.artistId);
    assert.ok(f.state().audits.every((entry) => entry.artistId === result.artistId));
    assert.deepEqual(f.cookies, [{ operatorId: "operator", artistId: result.artistId }]);
  });
}

test("workspace retries stop after three aborted transactions with no writes or cookie", async () => {
  const f = fixture({ commitFailures: Array.from({ length: 3 }, serializationFailure) });
  await assert.rejects(f.additional, (error) => error.getStatus() === 409);
  assert.deepEqual(f.stats(), { attempts: 3, ownerChecks: 3, firstBandChecks: 0, auditCalls: 6 });
  assert.deepEqual(f.state(), { artists: [], memberships: [], audits: [] });
  assert.deepEqual(f.cookies, []);
});

test("ownership revoked between attempts stops workspace creation", async () => {
  const f = fixture({ commitFailures: [serializationFailure()], roles: ["owner", "member"] });
  await assert.rejects(f.additional, (error) => error.getStatus() === 403);
  assert.deepEqual(f.stats(), { attempts: 2, ownerChecks: 2, firstBandChecks: 0, auditCalls: 2 });
  assert.deepEqual(f.state(), { artists: [], memberships: [], audits: [] });
  assert.deepEqual(f.cookies, []);
});

test("first-band eligibility is rechecked after a serialization abort", async () => {
  const f = fixture({ commitFailures: [serializationFailure()], counts: [0, 1] });
  await assert.rejects(f.first, (error) => error.getStatus() === 400);
  assert.equal(f.stats().firstBandChecks, 2);
  assert.deepEqual(f.state(), { artists: [], memberships: [], audits: [] });
  assert.deepEqual(f.cookies, []);
});

test("a retry still requires both audits and does not retry audit failure", async () => {
  const f = fixture({ commitFailures: [serializationFailure()], auditFailureAt: 4 });
  await assert.rejects(f.additional, /audit unavailable/);
  assert.equal(f.stats().attempts, 2);
  assert.deepEqual(f.state(), { artists: [], memberships: [], audits: [] });
  assert.deepEqual(f.cookies, []);
});

test("unknown COMMIT, connection and incomplete adapter errors never replay workspace writes", async () => {
  for (const failure of [
    new Error("COMMIT response lost; outcome unknown"),
    Object.assign(new Error("connection lost"), { code: "P1017" }),
    Object.assign(new Error("adapter connection failure"), { name: "DriverAdapterError", cause: { originalCode: "08006", kind: "TransactionWriteConflict" } }),
    Object.assign(new Error("incomplete adapter error"), { name: "DriverAdapterError", cause: { kind: "TransactionWriteConflict" } }),
    Object.assign(new Error("wrong adapter error kind"), { name: "DriverAdapterError", cause: { originalCode: "40001", kind: "Unknown" } }),
    Object.assign(new Error("nested unrelated error"), { cause: { originalCode: "40001", kind: "TransactionWriteConflict" } })
  ]) {
    const f = fixture({ commitFailures: [failure] });
    await assert.rejects(f.additional, (error) => error === failure);
    assert.equal(f.stats().attempts, 1);
    assert.deepEqual(f.cookies, []);
  }
});

test("unique conflicts remain a 409 without replaying the transaction", async () => {
  const f = fixture({ commitFailures: [Object.assign(new Error("unique constraint"), { code: "P2002" })] });
  await assert.rejects(f.additional, (error) => error.getStatus() === 409);
  assert.equal(f.stats().attempts, 1);
  assert.deepEqual(f.cookies, []);
});
