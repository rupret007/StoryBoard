import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { InvitesService } = require("../dist/memberships/invites.service.js");
const { AuditService } = require("../dist/audit/audit.service.js");

function pause() {
  let entered, release;
  const reached = new Promise((resolve) => { entered = resolve; });
  const resumed = new Promise((resolve) => { release = resolve; });
  return { reached, release, wait: async () => { entered(); await resumed; } };
}

// Deterministic service-level interleavings. The transaction double serializes
// writes and snapshots rollback; it does not validate PostgreSQL row locks.
function fixture({ existingRole = null, failAudit = null } = {}) {
  let state = {
    invite: { id: "invite", artistId: "band", email: "player@example.test", role: "member", status: "pending", expiresAt: new Date(Date.now() + 60_000), acceptedAt: null, acceptedOperatorId: null, revokedAt: null },
    member: existingRole ? { id: "member", operatorId: "player", artistId: "band", role: existingRole } : null,
    audits: []
  };
  const sessions = [], notifications = [];
  let nextRead, nextTransaction, tail = Promise.resolve();
  const matches = (where) => Object.entries(where).every(([key, value]) => {
    if (key === "tokenHash") return true;
    if (key === "expiresAt") return (!value.gt || state.invite.expiresAt > value.gt) && (!value.lte || state.invite.expiresAt <= value.lte);
    return state.invite[key] === value;
  });
  const read = async ({ where }) => {
    const snapshot = matches(where) ? structuredClone(state.invite) : null;
    const hook = nextRead;
    nextRead = null;
    if (hook) await hook();
    return snapshot;
  };
  const createAudit = async ({ data }) => {
    if (data.action === failAudit) throw new Error("audit unavailable");
    state.audits.push(data);
    return data;
  };
  const client = {
    artistMembershipInvite: {
      findUnique: read, findFirst: read,
      update: async ({ data }) => Object.assign(state.invite, data),
      updateMany: async ({ where, data }) => {
        if (!matches(where)) return { count: 0 };
        Object.assign(state.invite, data);
        return { count: 1 };
      }
    },
    artistMembership: {
      upsert: async ({ create, update }) => {
        state.member = state.member ? { ...state.member, ...update } : { id: "member", ...create };
        return state.member;
      }
    },
    auditEvent: { create: createAudit }
  };
  client.$transaction = async (work) => {
    const hook = nextTransaction;
    nextTransaction = null;
    if (hook) await hook();
    const previous = tail;
    let unlock;
    tail = new Promise((resolve) => { unlock = resolve; });
    await previous;
    const before = structuredClone(state);
    const tx = { ...client, auditEvent: { create: createAudit } };
    try { return await work(tx); }
    catch (error) { state = before; throw error; }
    finally { unlock(); }
  };
  const service = new InvitesService(
    { client }, new AuditService({ client }),
    { assertOwner: async (operatorId, artistId) => { assert.equal(operatorId, "owner"); assert.equal(artistId, "band"); } },
    { newSessionPayload: (id, band) => ({ id, band }), applySessionCookie: (_reply, payload) => sessions.push(payload) },
    {}, { enqueueMembershipInviteAccepted: async (entry) => notifications.push(entry) }
  );
  return {
    get state() { return state; }, sessions, notifications,
    holdRead() { const gate = pause(); nextRead = gate.wait; return gate; },
    beforeTransaction(hook) { nextTransaction = hook; },
    accept: () => service.accept("token", "player", "player@example.test", "player", {}),
    revoke: () => service.revoke("invite", "band", "owner", "owner")
  };
}

function noAcceptance(f) {
  assert.equal(f.state.member, null);
  assert.equal(f.state.invite.acceptedAt, null);
  assert.equal(f.state.invite.acceptedOperatorId, null);
  assert.equal(f.sessions.length, 0);
  assert.equal(f.notifications.length, 0);
}

for (const winner of ["revoke", "accept"]) {
  test(`${winner} wins after both accept and revoke read pending: loser conflicts`, async () => {
    const f = fixture();
    const gate = f.holdRead();
    const loser = winner === "revoke" ? f.accept() : f.revoke();
    const rejected = assert.rejects(loser, (error) => error.getStatus?.() === 409);
    await gate.reached;
    try { await f[winner](); } finally { gate.release(); }
    await rejected;
    assert.equal(f.state.invite.status, winner === "revoke" ? "revoked" : "accepted");
    if (winner === "revoke") {
      noAcceptance(f);
      assert.deepEqual(f.state.audits.map((a) => a.action), ["membership_invite.revoked"]);
    } else {
      assert.equal(f.state.invite.revokedAt, null);
      assert.equal(f.state.member.role, "member");
      assert.equal(f.sessions.length, 1);
      assert.equal(f.notifications.length, 1);
      assert.equal(f.state.audits.length, 2);
    }
  });
}

for (const existingRole of [null, "owner", "viewer"]) {
  test(`double acceptance has one winner and preserves existing role ${existingRole}`, async () => {
    const f = fixture({ existingRole });
    const gate = f.holdRead();
    const first = f.accept();
    const rejected = assert.rejects(first, (error) => error.getStatus?.() === 409);
    await gate.reached;
    try { assert.equal((await f.accept()).role, existingRole ?? "member"); }
    finally { gate.release(); }
    await rejected;
    assert.equal(f.state.member.role, existingRole ?? "member");
    assert.equal(f.state.audits.length, 2);
    assert.equal(f.sessions.length, 1);
    assert.equal(f.notifications.length, 1);
  });
}

for (const action of ["membership_invite.accepted", "artist_membership.upsert_via_invite", "membership_invite.revoked"]) {
  test(`${action} audit failure rolls back the terminal transition and membership`, async () => {
    const f = fixture({ failAudit: action });
    await assert.rejects(action.endsWith("revoked") ? f.revoke : f.accept, /audit unavailable/);
    assert.equal(f.state.invite.status, "pending");
    assert.equal(f.state.invite.revokedAt, null);
    assert.equal(f.state.audits.length, 0);
    noAcceptance(f);
  });
}

test("acceptance rechecks expiration inside its transaction, including the exact cutoff", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  const f = fixture();
  f.beforeTransaction(() => t.mock.timers.setTime(f.state.invite.expiresAt.getTime()));
  await assert.rejects(f.accept, (error) => error.getStatus?.() === 409);
  assert.equal(f.state.invite.status, "pending");
  assert.equal(f.state.audits.length, 0);
  noAcceptance(f);
});

test("an invite at its expiration cutoff becomes expired without granting access", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  const f = fixture();
  t.mock.timers.setTime(f.state.invite.expiresAt.getTime());
  await assert.rejects(f.accept, /has expired/);
  assert.equal(f.state.invite.status, "expired");
  noAcceptance(f);
});

test("stale expiration cannot overwrite a revocation", async () => {
  const f = fixture();
  f.state.invite.expiresAt = new Date(0);
  const gate = f.holdRead();
  const accepting = f.accept();
  const rejected = assert.rejects(accepting, /has expired/);
  await gate.reached;
  try { await f.revoke(); } finally { gate.release(); }
  await rejected;
  assert.equal(f.state.invite.status, "revoked");
  assert.ok(f.state.invite.revokedAt);
  noAcceptance(f);
});

test("stale revocation cannot overwrite expiration", async () => {
  const f = fixture();
  f.state.invite.expiresAt = new Date(0);
  const gate = f.holdRead();
  const revoking = f.revoke();
  const rejected = assert.rejects(revoking, (error) => error.getStatus?.() === 409);
  await gate.reached;
  try { await assert.rejects(f.accept, /has expired/); } finally { gate.release(); }
  await rejected;
  assert.equal(f.state.invite.status, "expired");
  assert.equal(f.state.invite.revokedAt, null);
  noAcceptance(f);
});

test("stale expiration cannot overwrite a successful acceptance", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
  const f = fixture();
  const gate = f.holdRead();
  const accepting = f.accept();
  const rejected = assert.rejects(accepting, /has expired/);
  await gate.reached;
  try {
    await f.accept();
    t.mock.timers.setTime(f.state.invite.expiresAt.getTime() + 1);
  } finally { gate.release(); }
  await rejected;
  assert.equal(f.state.invite.status, "accepted");
  assert.equal(f.state.invite.revokedAt, null);
  assert.equal(f.state.member.role, "member");
  assert.equal(f.sessions.length, 1);
});

const { WorkflowJobProcessorService } = require("../dist/workflow-automation/workflow-job-processor.service.js");
for (const terminalState of ["accepted", "revoked", null]) {
  test(`invite worker expiration preserves terminal state ${terminalState ?? "expired"} without provider calls`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_800_000_000_000 });
    const invite = { id: "invite", artistId: "band", status: "pending", expiresAt: new Date(Date.now()) };
    const client = { artistMembershipInvite: {
      findFirst: async () => {
        const snapshot = { ...invite };
        // Another request wins after the worker read its pending snapshot.
        if (terminalState) invite.status = terminalState;
        return snapshot;
      },
      update: async ({ data }) => Object.assign(invite, data),
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, invite.id);
        assert.equal(where.artistId, invite.artistId);
        assert.equal(where.status, "pending");
        assert.equal(where.expiresAt.lte.getTime(), Date.now());
        if (invite.status !== where.status || invite.expiresAt > where.expiresAt.lte) return { count: 0 };
        Object.assign(invite, data);
        return { count: 1 };
      }
    } };
    let providerCalls = 0;
    const processor = new WorkflowJobProcessorService(
      { client }, { log: async () => {} }, {},
      { resolveForArtist: async () => { providerCalls++; throw new Error("unexpected provider call"); } }
    );
    const result = await processor.process({ name: "invite.send", data: {
      inviteId: "invite", artistId: "band", acceptUrl: "https://example.test/invite", inviteeEmail: "player@example.test"
    } });
    assert.deepEqual(result, { ok: true, skipped: true });
    assert.equal(invite.status, terminalState ?? "expired");
    assert.equal(providerCalls, 0);
  });
}
