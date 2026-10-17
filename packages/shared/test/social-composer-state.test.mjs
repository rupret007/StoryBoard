import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);

test("a fresh Social visit does not auto-select a previous drop", () => {
  assert.equal(shared.defaultActiveSocialPost(), null);
});

test("keepPost merges the drafted drop to the front without losing other rows", () => {
  const older = { id: "old", note: "yesterday" };
  const created = { id: "new", note: "just drafted" };
  const next = shared.mergeSocialPost({ posts: [older] }, created);
  assert.deepEqual(next.posts.map((row) => row.id), ["new", "old"]);
  const again = shared.mergeSocialPost(next, { id: "new", note: "posted" });
  assert.deepEqual(again.posts.map((row) => row.id), ["new", "old"]);
  assert.equal(again.posts[0].note, "posted");
});

test("Approve & post stays off when approval is not a pending owner review", () => {
  const pendingDrop = {
    id: "post-pending",
    status: "pending_approval",
    approval: { status: "pending" },
    targets: [{ enabled: true, externalPostId: null }]
  };
  assert.equal(shared.socialApproveBlockReason(pendingDrop), null);
  assert.equal(
    shared.socialApproveBlockReason({
      ...pendingDrop,
      approval: { status: "rejected" }
    }),
    "not_ready"
  );
  assert.equal(
    shared.socialApproveBlockReason({
      ...pendingDrop,
      status: "approved",
      approval: { status: "approved" }
    }),
    "not_ready"
  );
  assert.equal(
    shared.socialApproveBlockReason({
      ...pendingDrop,
      approval: null
    }),
    "not_ready"
  );
});

test("Approve & post stays off when any target already has a platform ID or simulated status", () => {
  const posted = {
    id: "post-1",
    status: "posted",
    approval: { status: "executed" },
    targets: [{ enabled: true, externalPostId: "fb_1" }]
  };
  assert.equal(shared.socialApproveBlockReason(posted), "already_posted");
  assert.equal(
    shared.socialApproveBlockReason({
      id: "post-sim",
      status: "simulated",
      approval: { status: "pending" },
      targets: [{ enabled: true, externalPostId: null }]
    }),
    "already_posted"
  );
  assert.equal(
    shared.socialApproveBlockReason({
      id: "post-partial",
      status: "pending_approval",
      approval: { status: "pending" },
      targets: [
        { enabled: true, externalPostId: "fb_1" },
        { enabled: true, externalPostId: null }
      ]
    }),
    "already_posted"
  );
  assert.equal(
    shared.socialApproveBlockReason(
      {
        id: "post-unchecked",
        status: "pending_approval",
        approval: { status: "pending" },
        targets: [{ enabled: false, externalPostId: "fb_1" }]
      },
      [{ enabled: true, externalPostId: null }]
    ),
    "already_posted"
  );
  assert.equal(
    shared.socialApproveBlockReason({
      id: "post-2",
      status: "pending_approval",
      approval: { status: "pending" },
      targets: [{ enabled: true, externalPostId: null }]
    }),
    null
  );
  assert.equal(
    shared.socialApproveBlockReason(
      {
        id: "post-3",
        status: "pending_approval",
        approval: { status: "pending" },
        targets: [{ enabled: false, externalPostId: null }]
      },
      [{ enabled: false, externalPostId: null }]
    ),
    "none_enabled"
  );
});

test("an empty note can take the recorded show title and never overwrites Jeff's text", () => {
  assert.equal(shared.noteFromRecordedShow("", { title: " Stalemate at Burlington " }), "Stalemate at Burlington");
  assert.equal(shared.noteFromRecordedShow("Manic clip", { title: "Stalemate at Burlington" }), "Manic clip");
  assert.equal(shared.noteFromRecordedShow("", null), "");
});

test("switching recorded shows updates an untouched show-title note without overwriting custom text", () => {
  const showA = { title: "Stalemate at Burlington" };
  const showB = { title: "Rad Dad at Montpelier" };
  assert.equal(shared.noteFromRecordedShow("", showA), "Stalemate at Burlington");
  assert.equal(
    shared.noteFromRecordedShow("Stalemate at Burlington", showB, showA),
    "Rad Dad at Montpelier"
  );
  assert.equal(
    shared.noteFromRecordedShow("Stalemate at Burlington", null, showA),
    ""
  );
  assert.equal(
    shared.noteFromRecordedShow("Jeff's custom hook", showB, showA),
    "Jeff's custom hook"
  );
});
