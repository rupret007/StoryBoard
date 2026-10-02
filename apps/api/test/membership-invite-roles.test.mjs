import "reflect-metadata";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { InvitesService } = require("../dist/memberships/invites.service.js");

function fixture(existingRole, invitedRole) {
  const operatorId = "invited-operator";
  const artistId = "invited-band";
  const invite = { id: "invite", artistId, email: "player@example.test", role: invitedRole, status: "pending", expiresAt: new Date(Date.now() + 60_000) };
  let member = existingRole ? { id: "membership", operatorId, artistId, role: existingRole } : null;
  const audits = [];
  const notifications = [];
  const sessions = [];
  const client = {
    artistMembershipInvite: {
      findUnique: async () => invite,
      update: async ({ data }) => Object.assign(invite, data)
    },
    artistMembership: {
      upsert: async ({ where, create, update }) => {
        assert.deepEqual(where.operatorId_artistId, { operatorId, artistId });
        member = member ? { ...member, ...update } : { id: "membership", ...create };
        return member;
      }
    }
  };
  client.$transaction = async (work) => work(client);
  const service = new InvitesService(
    { client }, { log: async (entry) => audits.push(entry) }, {},
    { newSessionPayload: (id, band) => ({ operatorId: id, currentArtistId: band }), applySessionCookie: (_reply, payload) => sessions.push(payload) },
    {}, { enqueueMembershipInviteAccepted: async (entry) => notifications.push(entry) }
  );
  return { service, invite, audits, notifications, sessions, member: () => member, accept: () => service.accept("synthetic-token", operatorId, invite.email, "synthetic actor", {}) };
}

test("accepting a lower-role invitation cannot demote the sole band owner", async () => {
  for (const invitedRole of ["member", "viewer"]) {
    const f = fixture("owner", invitedRole);
    assert.deepEqual(await f.accept(), { artistId: "invited-band", role: "owner" });
    assert.equal(f.member().role, "owner");
    assert.equal(f.invite.status, "accepted");
    assert.equal(f.audits.find((entry) => entry.action === "membership_invite.accepted").metadata.role, "owner");
    assert.equal(f.audits.find((entry) => entry.action === "membership_invite.accepted").metadata.invitedRole, invitedRole);
    assert.equal(f.notifications[0].role, "owner");
    assert.deepEqual(f.sessions, [{ operatorId: "invited-operator", currentArtistId: "invited-band" }]);
  }
});

test("invitations preserve an existing role in either direction instead of replacing Team's controls", async () => {
  for (const [existingRole, invitedRole] of [["member", "owner"], ["viewer", "member"], ["member", "viewer"]]) {
    const f = fixture(existingRole, invitedRole);
    assert.equal((await f.accept()).role, existingRole);
    assert.equal(f.member().role, existingRole);
    assert.equal(f.audits.find((entry) => entry.action === "artist_membership.upsert_via_invite").metadata.role, existingRole);
    assert.equal(f.notifications[0].role, existingRole);
  }
});

test("a first membership still receives the explicitly invited role", async () => {
  for (const role of ["owner", "member", "viewer"]) {
    const f = fixture(null, role);
    assert.deepEqual(await f.accept(), { artistId: "invited-band", role });
    assert.equal(f.member().role, role);
    assert.equal(f.notifications[0].role, role);
  }
});

test("preserving existing roles does not bypass invite email and status checks", async () => {
  const f = fixture("owner", "member");
  await assert.rejects(() => f.service.accept("synthetic-token", "invited-operator", "other@example.test", "synthetic actor", {}), /email does not match/);
  assert.equal(f.member().role, "owner");
  assert.equal(f.invite.status, "pending");
  f.invite.status = "revoked";
  await assert.rejects(f.accept, /no longer valid/);
  assert.equal(f.member().role, "owner");
  assert.equal(f.audits.length, 0);
  assert.equal(f.sessions.length, 0);
});
