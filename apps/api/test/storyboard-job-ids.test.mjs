import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { Job } = require("bullmq");
const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const idsMod = await load("queue/storyboard-job-ids.js");
const queueMod = await load("queue/storyboard-queue.service.js");

const APPROVAL_EVENTS = idsMod.APPROVAL_NOTIFY_EVENTS;
const INVITE_ID = "clinvite01abc";
const APPROVAL_ID = "clapproval02xyz";
const OCCURRED_AT_MS = 1_720_000_000_000;

function assertBullmqAcceptsJobId(jobId) {
  Job.prototype.validateOptions.call({ opts: { jobId } }, { data: "{}" });
}

function assertBullmqRejectsColonJobId(jobId) {
  assert.throws(
    () => Job.prototype.validateOptions.call({ opts: { jobId } }, { data: "{}" }),
    (error) =>
      error instanceof Error && error.message === "Custom Id cannot contain :"
  );
}

function captureQueue() {
  const added = [];
  return {
    added,
    queue: {
      add: async (name, data, opts) => {
        assertBullmqAcceptsJobId(opts.jobId);
        added.push({ name, data, opts });
        return { id: opts.jobId };
      }
    }
  };
}

function queueService(queue) {
  const service = new queueMod.StoryboardQueueService({}, {});
  service.queue = queue;
  return service;
}

const inviteInput = {
  inviteId: INVITE_ID,
  artistId: "clartist01",
  acceptUrl: "https://app.example.test/onboarding?invite=token",
  inviteeEmail: "bandmate@example.test",
  artistName: "StoryBoard",
  role: "member"
};

test("BullMQ 5.73.0 rejects the previous colon-containing invite and approval job IDs", () => {
  assertBullmqRejectsColonJobId(`invite:${INVITE_ID}`);
  assertBullmqRejectsColonJobId(
    `approval:${APPROVAL_ID}:created:${OCCURRED_AT_MS}`
  );
  for (const event of APPROVAL_EVENTS) {
    assertBullmqRejectsColonJobId(
      `approval:${APPROVAL_ID}:${event}:${OCCURRED_AT_MS}`
    );
  }
});

test("encoded invite and approval job IDs are colon-free and accepted by BullMQ", () => {
  const inviteId = idsMod.inviteSendJobId(INVITE_ID);
  assert.equal(inviteId.includes(":"), false);
  assert.equal(inviteId, `invite__${INVITE_ID}`);
  assertBullmqAcceptsJobId(inviteId);

  const approvalId = idsMod.approvalNotifyJobId(
    APPROVAL_ID,
    "created",
    OCCURRED_AT_MS
  );
  assert.equal(approvalId.includes(":"), false);
  assert.equal(approvalId, `approval__${APPROVAL_ID}__created__${OCCURRED_AT_MS}`);
  assertBullmqAcceptsJobId(approvalId);
});

test("invite job IDs stay deterministic for the same invite and distinct across invites", () => {
  assert.equal(idsMod.inviteSendJobId(INVITE_ID), idsMod.inviteSendJobId(INVITE_ID));
  assert.notEqual(idsMod.inviteSendJobId(INVITE_ID), idsMod.inviteSendJobId("clinvite99other"));
});

test("approval job IDs preserve event identity across all five events", () => {
  const ids = APPROVAL_EVENTS.map((event) =>
    idsMod.approvalNotifyJobId(APPROVAL_ID, event, OCCURRED_AT_MS)
  );
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  for (const jobId of ids) {
    assert.equal(jobId.includes(":"), false);
    assertBullmqAcceptsJobId(jobId);
  }
  assert.notEqual(
    idsMod.approvalNotifyJobId(APPROVAL_ID, "created", OCCURRED_AT_MS),
    idsMod.approvalNotifyJobId(APPROVAL_ID, "created", OCCURRED_AT_MS + 1)
  );
  assert.notEqual(
    idsMod.approvalNotifyJobId(APPROVAL_ID, "created", OCCURRED_AT_MS),
    idsMod.approvalNotifyJobId("clapproval99other", "created", OCCURRED_AT_MS)
  );
});

test("invite producer enqueues a BullMQ-valid deduping job id", async () => {
  const { added, queue } = captureQueue();
  const service = queueService(queue);
  await service.enqueueInviteSend(inviteInput);
  await service.enqueueInviteSend(inviteInput);
  assert.equal(added.length, 2);
  assert.equal(added[0].name, "invite.send");
  assert.equal(added[0].opts.jobId, idsMod.inviteSendJobId(INVITE_ID));
  assert.equal(added[1].opts.jobId, added[0].opts.jobId);
  assert.deepEqual(added[0].data.inviteId, INVITE_ID);
});

test("distinct parts that previously collided now get distinct colon-free job IDs", () => {
  const colonId = "a:b";
  const underscoreId = "a_b";
  const doubleUnderscoreId = "a__b";
  const percentEncodedLookalike = "a%3Ab";

  const inviteColon = idsMod.inviteSendJobId(colonId);
  const inviteUnderscore = idsMod.inviteSendJobId(underscoreId);
  const inviteDoubleUnderscore = idsMod.inviteSendJobId(doubleUnderscoreId);
  const invitePercentLookalike = idsMod.inviteSendJobId(percentEncodedLookalike);

  assert.equal(inviteColon, "invite__a%3Ab");
  assert.equal(inviteUnderscore, "invite__a%5Fb");
  assert.equal(inviteDoubleUnderscore, "invite__a%5F%5Fb");
  assert.equal(invitePercentLookalike, "invite__a%253Ab");
  assert.equal(new Set([
    inviteColon,
    inviteUnderscore,
    inviteDoubleUnderscore,
    invitePercentLookalike
  ]).size, 4);
  for (const jobId of [
    inviteColon,
    inviteUnderscore,
    inviteDoubleUnderscore,
    invitePercentLookalike
  ]) {
    assert.equal(jobId.includes(":"), false);
    assertBullmqAcceptsJobId(jobId);
  }

  const approvalColon = idsMod.approvalNotifyJobId(
    colonId,
    "created",
    OCCURRED_AT_MS
  );
  const approvalUnderscore = idsMod.approvalNotifyJobId(
    underscoreId,
    "created",
    OCCURRED_AT_MS
  );
  assert.equal(
    approvalColon,
    `approval__a%3Ab__created__${OCCURRED_AT_MS}`
  );
  assert.equal(
    approvalUnderscore,
    `approval__a%5Fb__created__${OCCURRED_AT_MS}`
  );
  assert.notEqual(approvalColon, approvalUnderscore);
  assert.equal(approvalColon.includes(":"), false);
  assert.equal(approvalUnderscore.includes(":"), false);
  assertBullmqAcceptsJobId(approvalColon);
  assertBullmqAcceptsJobId(approvalUnderscore);

  assert.notEqual(
    idsMod.encodeStoryboardJobId(["invite", "a", "b"]),
    idsMod.encodeStoryboardJobId(["invite", "a__b"])
  );
});

test("identical invite and approval inputs still produce the same job ID", () => {
  assert.equal(idsMod.inviteSendJobId("a:b"), idsMod.inviteSendJobId("a:b"));
  assert.equal(idsMod.inviteSendJobId("a_b"), idsMod.inviteSendJobId("a_b"));
  assert.equal(
    idsMod.approvalNotifyJobId("a:b", "created", OCCURRED_AT_MS),
    idsMod.approvalNotifyJobId("a:b", "created", OCCURRED_AT_MS)
  );
  assert.equal(
    idsMod.approvalNotifyJobId("a_b", "approved", OCCURRED_AT_MS),
    idsMod.approvalNotifyJobId("a_b", "approved", OCCURRED_AT_MS)
  );
});

test("invite producer keeps distinct job IDs for previously colliding invite ids", async () => {
  const { added, queue } = captureQueue();
  const service = queueService(queue);
  await service.enqueueInviteSend({ ...inviteInput, inviteId: "a:b" });
  await service.enqueueInviteSend({ ...inviteInput, inviteId: "a_b" });
  await service.enqueueInviteSend({ ...inviteInput, inviteId: "a:b" });
  assert.equal(added.length, 3);
  assert.equal(added[0].opts.jobId, idsMod.inviteSendJobId("a:b"));
  assert.equal(added[1].opts.jobId, idsMod.inviteSendJobId("a_b"));
  assert.notEqual(added[0].opts.jobId, added[1].opts.jobId);
  assert.equal(added[2].opts.jobId, added[0].opts.jobId);
});

test("approval producer keeps distinct job IDs for previously colliding approval ids", async () => {
  const { added, queue } = captureQueue();
  const service = queueService(queue);
  await service.enqueueApprovalNotify({
    artistId: "clartist01",
    approvalId: "a:b",
    event: "created",
    occurredAtMs: OCCURRED_AT_MS
  });
  await service.enqueueApprovalNotify({
    artistId: "clartist01",
    approvalId: "a_b",
    event: "created",
    occurredAtMs: OCCURRED_AT_MS
  });
  await service.enqueueApprovalNotify({
    artistId: "clartist01",
    approvalId: "a:b",
    event: "created",
    occurredAtMs: OCCURRED_AT_MS
  });
  assert.equal(added.length, 3);
  assert.equal(
    added[0].opts.jobId,
    idsMod.approvalNotifyJobId("a:b", "created", OCCURRED_AT_MS)
  );
  assert.equal(
    added[1].opts.jobId,
    idsMod.approvalNotifyJobId("a_b", "created", OCCURRED_AT_MS)
  );
  assert.notEqual(added[0].opts.jobId, added[1].opts.jobId);
  assert.equal(added[2].opts.jobId, added[0].opts.jobId);
});

test("approval producer enqueues a BullMQ-valid id for each event occurrence", async () => {
  const { added, queue } = captureQueue();
  const service = queueService(queue);
  for (const event of APPROVAL_EVENTS) {
    await service.enqueueApprovalNotify({
      artistId: "clartist01",
      approvalId: APPROVAL_ID,
      event,
      occurredAtMs: OCCURRED_AT_MS
    });
  }
  assert.equal(added.length, 5);
  const jobIds = added.map((entry) => entry.opts.jobId);
  assert.equal(new Set(jobIds).size, 5);
  for (const [index, event] of APPROVAL_EVENTS.entries()) {
    assert.equal(added[index].name, "approval.notify");
    assert.equal(
      added[index].opts.jobId,
      idsMod.approvalNotifyJobId(APPROVAL_ID, event, OCCURRED_AT_MS)
    );
    assert.deepEqual(added[index].data, {
      artistId: "clartist01",
      approvalId: APPROVAL_ID,
      event
    });
  }
});
