import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

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
  assert.equal(typeof jobId, "string");
  assert.ok(jobId.length > 0, "job id must be non-empty");
  Job.prototype.validateOptions.call({ opts: { jobId } }, { data: "{}" });
}

function assertBullmqRejectsColonJobId(jobId) {
  assert.throws(
    () => Job.prototype.validateOptions.call({ opts: { jobId } }, { data: "{}" }),
    (error) =>
      error instanceof Error && error.message === "Custom Id cannot contain :"
  );
}

function everyCustomJobId() {
  return [
    ...idsMod.allScheduledJobIds(),
    idsMod.inviteSendJobId(INVITE_ID),
    ...APPROVAL_EVENTS.map((event) =>
      idsMod.approvalNotifyJobId(APPROVAL_ID, event, OCCURRED_AT_MS)
    )
  ];
}

function captureQueue() {
  const added = [];
  return {
    added,
    queue: {
      add: async (name, data, opts) => {
        if (opts?.jobId !== undefined) {
          assertBullmqAcceptsJobId(opts.jobId);
        }
        added.push({ name, data, opts });
        return { id: opts?.jobId };
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

test("every custom queue job ID is accepted by the pinned BullMQ validator", () => {
  const jobIds = everyCustomJobId();
  assert.ok(jobIds.length >= 7 + 1 + APPROVAL_EVENTS.length);
  for (const jobId of jobIds) {
    assert.equal(jobId.includes(":"), false, `job id ${jobId} contains :`);
    assertBullmqAcceptsJobId(jobId);
  }
});

test("BullMQ 5.73.0 still rejects the previous colon-containing invite and approval job IDs", () => {
  assertBullmqRejectsColonJobId(`invite:${INVITE_ID}`);
  for (const event of APPROVAL_EVENTS) {
    assertBullmqRejectsColonJobId(
      `approval:${APPROVAL_ID}:${event}:${OCCURRED_AT_MS}`
    );
  }
});

test("scheduled job IDs stay colon-free and cover every repeat producer", () => {
  const scheduled = idsMod.allScheduledJobIds();
  assert.deepEqual(scheduled, [
    "repeat-task-check-overdue",
    "repeat-booking-replies-sync",
    "repeat-followup-check-stale",
    "repeat-urgent-telegram-scan",
    "repeat-digest-daily",
    "repeat-digest-weekly",
    "repeat-manager-schedule-scan"
  ]);
  assert.equal(new Set(scheduled).size, scheduled.length);
});

test("source producers only set job IDs from the catalog or colon-free encoder", () => {
  const source = readFileSync(
    join(dir, "..", "src", "queue", "storyboard-queue.service.ts"),
    "utf8"
  );
  const jobIdLiterals = [...source.matchAll(/jobId:\s*[`'"]([^`'"]+)[`'"]/g)].map(
    (match) => match[1]
  );
  assert.deepEqual(jobIdLiterals, [], "queue service still hardcodes a jobId string");
  assert.match(source, /inviteSendJobId\(/);
  assert.match(source, /approvalNotifyJobId\(/);
  assert.match(source, /STORYBOARD_JOB_IDS\./);
});

test("invite and approval producers enqueue a BullMQ-valid id for every event", async () => {
  const { added, queue } = captureQueue();
  const service = queueService(queue);
  await service.enqueueInviteSend(inviteInput);
  await service.enqueueInviteSend(inviteInput);
  for (const event of APPROVAL_EVENTS) {
    await service.enqueueApprovalNotify({
      artistId: "clartist01",
      approvalId: APPROVAL_ID,
      event,
      occurredAtMs: OCCURRED_AT_MS
    });
  }
  assert.equal(added.length, 2 + APPROVAL_EVENTS.length);
  assert.equal(added[0].opts.jobId, idsMod.inviteSendJobId(INVITE_ID));
  assert.equal(added[1].opts.jobId, added[0].opts.jobId);
  for (const [index, event] of APPROVAL_EVENTS.entries()) {
    const entry = added[index + 2];
    assert.equal(entry.name, "approval.notify");
    assert.equal(
      entry.opts.jobId,
      idsMod.approvalNotifyJobId(APPROVAL_ID, event, OCCURRED_AT_MS)
    );
    assert.deepEqual(entry.data, {
      artistId: "clartist01",
      approvalId: APPROVAL_ID,
      event
    });
    assertBullmqAcceptsJobId(entry.opts.jobId);
  }
});
