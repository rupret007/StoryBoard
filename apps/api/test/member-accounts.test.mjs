import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateMemberAccountLink } = require("../dist/manager/member-account-link.js");
const { ManagerService } = require("../dist/manager/manager.service.js");
const { OperationsService } = require("../dist/operations/operations.service.js");

function fixture() {
  let state = { member: { id: "performer-a", artistId: "band-a", name: "Player", linkedOperatorId: null }, participant: { id: "participant-a", response: "unknown", assignment: "Lead vocal", notes: "Bring guitar" }, audits: [] };
  let failAudit = false;
  const memberships = new Map([["owner", "owner"], ["player", "member"], ["viewer", "viewer"]]);
  const makeClient = (getState) => ({
    artistMembership: { findUnique: async ({ where }) => where.operatorId_artistId.artistId === "band-a" && memberships.has(where.operatorId_artistId.operatorId) ? { role: memberships.get(where.operatorId_artistId.operatorId) } : null },
    bandMember: {
      findUnique: async ({ where }) => getState().member.linkedOperatorId === where.artistId_linkedOperatorId.linkedOperatorId ? structuredClone(getState().member) : null,
      findFirst: async ({ where }) => where.artistId === "band-a" && where.id === "performer-a" && (!where.linkedOperatorId || where.linkedOperatorId === getState().member.linkedOperatorId) ? structuredClone(getState().member) : null,
      update: async ({ data }) => Object.assign(getState().member, data),
      create: async ({ data }) => Object.assign(getState().member, data)
    },
    bandEvent: { findFirst: async ({ where }) => where.artistId === "band-a" && where.id === "event-a" ? { id: "event-a" } : null },
    eventParticipant: { upsert: async ({ update }) => Object.assign(getState().participant, update) },
    auditEvent: { create: async ({ data }) => { if (failAudit) throw new Error("audit failed"); getState().audits.push(data); } }
  });
  const client = makeClient(() => state);
  client.$transaction = async (work) => { const draft = structuredClone(state); const result = await work(makeClient(() => draft)); state = draft; return result; };
  const audit = { log: async (entry, tx) => { assert.ok(tx, "audit must commit with the mutation"); return tx.auditEvent.create({ data: entry }); } };
  return { client, manager: new ManagerService({ client }, audit, { get: () => false }), operations: new OperationsService({ client }, audit, {}), state: () => state, failAudit: () => { failAudit = true; } };
}

test("performer accounts require owner approval and current same-band member access", async () => {
  const f = fixture();
  await assert.rejects(() => validateMemberAccountLink(f.client, "band-a", "player", "player"), (error) => error.getStatus() === 403);
  await assert.rejects(() => validateMemberAccountLink(f.client, "band-a", "viewer", null), (error) => error.getStatus() === 403);
  await assert.rejects(() => validateMemberAccountLink(f.client, "band-b", "owner", "player"), (error) => error.getStatus() === 403);
  await assert.rejects(() => validateMemberAccountLink(f.client, "band-a", "owner", "outsider"), (error) => error.getStatus() === 404);
  await assert.rejects(() => validateMemberAccountLink(f.client, "band-a", "owner", "viewer"), (error) => error.getStatus() === 400);
  await validateMemberAccountLink(f.client, "band-a", "owner", "player");
  await validateMemberAccountLink(f.client, "band-a", "player", undefined);
});

test("account links are tenant scoped, unique and audited atomically; normal member edits remain allowed", async () => {
  const f = fixture();
  await f.manager.patchMember("band-a", "performer-a", { linkedOperatorId: "player" }, "owner@test", "owner");
  assert.equal(f.state().member.linkedOperatorId, "player");
  assert.equal(f.state().audits[0].actorOperatorId, "owner");
  assert.equal(f.state().audits[0].metadata.previousLinkedOperatorId, null);
  await assert.rejects(() => validateMemberAccountLink(f.client, "band-a", "owner", "player", "other-performer"), (error) => error.getStatus() === 409);
  await assert.rejects(() => f.manager.patchMember("band-b", "performer-a", { linkedOperatorId: "player" }, "owner@test", "owner"), (error) => error.getStatus() === 404);
  await assert.rejects(() => f.manager.patchMember("band-a", "performer-a", { linkedOperatorId: null }, "player@test", "player"), (error) => error.getStatus() === 403);
  await f.manager.patchMember("band-a", "performer-a", { roles: ["guitar"] }, "player@test", "player");
  f.failAudit();
  await assert.rejects(() => f.manager.patchMember("band-a", "performer-a", { linkedOperatorId: null }, "owner@test", "owner"), /audit failed/);
  assert.equal(f.state().member.linkedOperatorId, "player");
});

test("create and intake cannot bypass owner approval for account links", async () => {
  const f = fixture();
  await assert.rejects(() => f.manager.createMember("band-a", { name: "Player", linkedOperatorId: "player" }, "player@test", "player"), (error) => error.getStatus() === 403);
  await assert.rejects(() => f.manager.completeIntake("band-a", { profile: {}, members: [{ name: "Player", linkedOperatorId: "player" }] }, "player@test", "player"), (error) => error.getStatus() === 403);
  assert.equal(f.state().audits.length, 0);
});

test("availability preserves assignment and notes and attributes self versus coordinator records", async () => {
  const f = fixture();
  await f.manager.patchMember("band-a", "performer-a", { linkedOperatorId: "player" }, "owner@test", "owner");
  await f.operations.participant("band-a", "event-a", { bandMemberId: "performer-a", response: "available" }, "player@test", "player", true);
  assert.equal(f.state().participant.assignment, "Lead vocal");
  assert.equal(f.state().participant.notes, "Bring guitar");
  assert.equal(f.state().audits.at(-1).metadata.recordedForSelf, true);
  await f.operations.participant("band-a", "event-a", { bandMemberId: "performer-a", response: "tentative", notes: null }, "owner@test", "owner");
  assert.equal(f.state().participant.notes, null);
  assert.equal(f.state().audits.at(-1).metadata.recordedForSelf, false);
  assert.equal(f.state().audits.at(-1).actorOperatorId, "owner");
  await assert.rejects(() => f.operations.participant("band-b", "event-a", { bandMemberId: "performer-a", response: "available" }, "player@test", "player"), (error) => error.getStatus() === 404);
  await assert.rejects(() => f.operations.participant("band-a", "event-a", { bandMemberId: "performer-a", response: "available" }, "owner@test", "owner", true), (error) => error.getStatus() === 404);
  f.failAudit();
  await assert.rejects(() => f.operations.participant("band-a", "event-a", { bandMemberId: "performer-a", response: "unavailable" }, "player@test", "player"), /audit failed/);
  assert.equal(f.state().participant.response, "tentative");
});

test("intake rejects one account linked to two performers before writing any performer or profile", async () => {
  const f = fixture();
  const writes = [];
  f.manager.putProfile = async () => { writes.push("profile"); };
  f.manager.createMember = async (_artistId, input) => { writes.push(input.name); };
  const members = [
    { name: "Player one", linkedOperatorId: "player" },
    { name: "Player two", linkedOperatorId: "player" }
  ];
  await assert.rejects(
    () => f.manager.completeIntake("band-a", { profile: { communicationCadence: "daily" }, members }, "owner@example.test", "owner"),
    (error) => error.getStatus() === 409
  );
  assert.deepEqual(writes, []);
});
