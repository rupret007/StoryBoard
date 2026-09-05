import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createSetlistDraftState: create, reduceSetlistDraft: reduce, setlistDraftStatus: status, setlistDraftSavePayload: payload } = require("../dist/index.js");
const versions = ["2026-09-04T20:00:00.000Z", "2026-09-04T20:00:00.001Z", "2026-09-04T20:00:00.002Z", "2026-09-04T20:00:00.003Z"];
const song = (songId) => ({ songId, itemType: "song", label: null, transitionNotes: null });
function saved(version = 0, overrides = {}) {
  return { id: "set-a", name: "Friday running order", status: "active", notes: null, updatedAt: versions[version], sourceKey: "vault:existing", items: [song("opener"), { itemType: "break", label: "Set break" }, song("closer")], ...overrides };
}
function edit(state, changes = { notes: "Count in quietly" }) { return reduce(state, { type: "edit", draft: { ...state.draft, ...changes } }); }
function receive(state, snapshot) { return reduce(state, { type: "received", snapshot }); }
function review(state, choice = "keep-draft", expectedUpdatedAt = state.latest?.updatedAt) { return reduce(state, { type: "review", choice, expectedUpdatedAt }); }
function begin(state, requestId = 1) { return reduce(state, { type: "begin-save", requestId }); }
function success(state, snapshot, requestId = 1) { return reduce(state, { type: "save-succeeded", requestId, snapshot }); }
function fail(state, conflict = false, requestId = 1) { return reduce(state, { type: "save-failed", requestId, conflict }); }
function receipt(state, version) { return saved(version, state.pending.draft); }

test("pristine editor has a stable receipt; empty notes and labels normalize", () => {
  const state = create("set-a", saved());
  assert.equal(state.base.updatedAt, versions[0]);
  assert.equal(state.draft.notes, "");
  assert.equal(state.draft.items[0].label, "");
  assert.equal(status(state).dirty, false);
  assert.equal(payload(state), null);
  const changed = edit(state);
  assert.equal(payload(changed).expectedUpdatedAt, versions[0]);
  assert.equal(payload(changed).notes, "Count in quietly");
  assert.equal(payload(changed).items[0].label, null);
  assert.equal(Object.hasOwn(payload(changed), "sourceKey"), false);
  assert.equal(state.draft.notes, "");
});

test("clean editor adopts a newer saved order, not stale responses", () => {
  const remote = saved(1, { items: [song("closer"), song("opener")] });
  const state = receive(create("set-a", saved()), remote);
  assert.equal(state.base.updatedAt, versions[1]);
  assert.equal(state.draft.items[0].songId, "closer");
  assert.equal(status(state).needsReview, false);
  assert.equal(receive(state, saved()), state);
});

test("new props cannot advance a dirty draft's reviewed receipt", () => {
  const draft = edit(create("set-a", saved()));
  const state = receive(draft, saved(1, { notes: "Another member's note" }));
  assert.equal(state.base.updatedAt, versions[0]);
  assert.equal(state.draft.notes, "Count in quietly");
  assert.equal(state.latest.notes, "Another member's note");
  assert.equal(status(state).needsReview, true);
  assert.equal(payload(state), null);
  assert.equal(begin(state), state);
});

test("two editors recover by reviewing without any automatic write or merge", () => {
  const first = begin(edit(create("set-a", saved()), { notes: "First member's notes" }));
  const firstSaved = receipt(first, 1);
  const other = edit(create("set-a", saved()), { items: [song("closer"), song("opener")].map((row) => ({ ...row, label: "", transitionNotes: "" })) });
  let second = receive(fail(begin(other), true), firstSaved);
  assert.equal(payload(second), null);
  second = review(second);
  assert.equal(second.pending, null);
  assert.equal(second.base.notes, "First member's notes");
  assert.equal(second.draft.notes, ""); // No silent field or position merge.
  assert.equal(second.draft.items[0].songId, "closer");
  assert.equal(payload(second).expectedUpdatedAt, versions[1]);
  const saving = begin(second, 2);
  const done = success(saving, receipt(saving, 2), 2);
  assert.equal(status(done).dirty, false);
  assert.equal(done.base.updatedAt, versions[2]);
});

test("use-latest explicitly discards local changes and needs no save", () => {
  const state = review(receive(edit(create("set-a", saved())), saved(1, { notes: "Saved by another member" })), "use-latest");
  assert.equal(state.draft.notes, "Saved by another member");
  assert.equal(status(state).dirty, false);
  assert.equal(payload(state), null);
});

test("a newer remote write invalidates an already displayed review choice", () => {
  const state = receive(receive(edit(create("set-a", saved())), saved(1)), saved(2));
  assert.equal(review(state, "keep-draft", versions[1]), state);
  assert.equal(state.base.updatedAt, versions[0]);
  assert.equal(review(state).base.updatedAt, versions[2]);
});

test("missing initial version preserves visible values but cannot authorize saving", () => {
  const state = create("set-a", saved(0, { updatedAt: undefined, notes: "Visible notes" }));
  assert.equal(state.draft.name, "Friday running order");
  assert.equal(state.draft.notes, "Visible notes");
  assert.equal(state.draft.items.length, 3);
  assert.equal(status(edit(state)).canSave, false);
  assert.equal(status(state).issue, "version-missing");
  assert.equal(receive(state, saved(1)).base.updatedAt, versions[1]);
  const dirty = receive(edit(state), saved(1));
  assert.equal(dirty.base, null);
  assert.equal(status(dirty).needsReview, true);
  assert.equal(payload(review(dirty)).expectedUpdatedAt, versions[1]);
});

test("malformed and wrong-record snapshots retain draft and block saving", () => {
  const state = edit(create("set-a", saved()));
  for (const bad of [null, {}, saved(1, { id: "set-b" }), saved(1, { updatedAt: "yesterday" }), saved(1, { items: null }), saved(1, { status: "invented" }), saved(1, { items: [{ songId: "opener" }] }), saved(1, { items: [{ itemType: "break", songId: "opener", label: "Invalid" }] })]) {
    const result = receive(state, bad);
    assert.deepEqual(result.draft, state.draft);
    assert.equal(result.base.updatedAt, versions[0]);
    assert.equal(result.issue, "invalid-receipt");
    assert.equal(payload(result), null);
  }
});

test("same version with different values is not a trustworthy receipt", () => {
  const state = edit(create("set-a", saved()));
  const rejected = receive(state, saved(0, { notes: "Different content under same version" }));
  assert.equal(rejected.issue, "invalid-receipt");
  assert.equal(rejected.base.notes, "");
  assert.equal(payload(rejected), null);
});

test("conflict and uncertain failures retain edits until an explicit fresh read", () => {
  for (const conflict of [false, true]) {
    const state = fail(begin(edit(create("set-a", saved()))), conflict);
    assert.equal(state.draft.notes, "Count in quietly");
    assert.equal(state.pending, null);
    assert.equal(state.issue, conflict ? "save-conflict" : "save-unconfirmed");
    assert.equal(payload(state), null);
    assert.equal(payload(receive(state, saved())).expectedUpdatedAt, versions[0]);
  }
});

test("uncertain but committed save is reviewed as authoritative before continuing", () => {
  const pending = begin(edit(create("set-a", saved())));
  const state = receive(fail(pending), receipt(pending, 1));
  assert.equal(status(state).needsReview, true);
  assert.equal(payload(state), null);
  const confirmed = review(state, "use-latest");
  assert.equal(status(confirmed).dirty, false);
  assert.equal(confirmed.base.updatedAt, versions[1]);
});

test("read failure never fabricates an empty remote order", () => {
  const state = receive(edit(create("set-a", saved())), saved(1));
  const failed = reduce(state, { type: "read-failed" });
  assert.deepEqual(failed.draft, state.draft);
  assert.deepEqual(failed.latest, state.latest);
  assert.equal(payload(failed), null);
  assert.equal(review(failed), failed);
  assert.equal(review(failed, "use-latest"), failed);
  assert.equal(review(receive(failed, saved(1))).base.updatedAt, versions[1]);
});

test("valid matching success acknowledges only its own submitted revision", () => {
  const saving = begin(edit(create("set-a", saved())));
  const lateEdit = edit(saving, { notes: "Still editing while save returns" });
  const state = success(lateEdit, receipt(saving, 1));
  assert.equal(state.base.notes, "Count in quietly");
  assert.equal(state.draft.notes, "Still editing while save returns");
  assert.equal(payload(state).expectedUpdatedAt, versions[1]);
  assert.equal(state.pending, null);
});

test("an external write observed during save remains a separate review candidate", () => {
  const saving = begin(edit(create("set-a", saved())));
  const remote = receive(saving, saved(2, { notes: "Newer peer change" }));
  const state = success(remote, receipt(saving, 1));
  assert.equal(state.base.updatedAt, versions[1]);
  assert.equal(state.latest.updatedAt, versions[2]);
  assert.equal(state.draft.notes, "Count in quietly");
  assert.equal(payload(state), null);
  assert.equal(receive(state, saved()), state);
});

test("an observed own receipt is reconciled only with a matching save response", () => {
  const saving = begin(edit(create("set-a", saved())));
  const ownReceipt = receipt(saving, 1);
  const staged = receive(saving, ownReceipt);
  assert.equal(status(staged).needsReview, true);
  assert.equal(review(staged), staged);
  const state = success(staged, ownReceipt);
  assert.equal(state.latest, null);
  assert.equal(status(state).dirty, false);
});

test("wrong, old, malformed, or unrelated success never wipes unsaved edits", () => {
  const saving = begin(edit(create("set-a", saved())));
  for (const bad of [null, {}, receipt(saving, 0), { ...receipt(saving, 1), id: "set-b" }, { ...receipt(saving, 1), notes: "Not the submitted values" }]) {
    const state = success(saving, bad);
    assert.equal(state.issue, "save-unconfirmed");
    assert.equal(state.base.updatedAt, versions[0]);
    assert.deepEqual(state.draft, saving.draft);
  }
  assert.equal(success(saving, receipt(saving, 1), 8), saving);
  assert.equal(fail(saving, false, 8), saving);
});

test("late duplicate results and reused request IDs cannot claim newer saves", () => {
  const saving = begin(edit(create("set-a", saved())));
  const done = success(saving, receipt(saving, 1));
  assert.equal(success(done, receipt(saving, 1)), done);
  const edited = edit(done, { notes: "Next revision" });
  assert.equal(begin(edited, 1), edited);
  const next = begin(edited, 2);
  assert.equal(fail(next, true, 1), next);
  assert.equal(success(next, receipt(saving, 1), 1), next);
});

test("same-version conflicting observation cannot validate a save acknowledgement", () => {
  const saving = begin(edit(create("set-a", saved())));
  const observed = receive(saving, saved(1, { notes: "Other saved content" }));
  const result = success(observed, receipt(saving, 1));
  assert.equal(result.issue, "save-unconfirmed");
  assert.equal(result.base.updatedAt, versions[0]);
  assert.equal(result.latest.notes, "Other saved content");
});

test("draft validity reuses existing schema while permitting incomplete editing", () => {
  const state = create("set-a", saved());
  for (const changes of [{ name: "" }, { items: [{ itemType: "break", songId: null, label: "", transitionNotes: "" }] }]) {
    const edited = edit(state, changes);
    assert.equal(status(edited).dirty, true);
    assert.equal(payload(edited), null);
  }
  assert.equal(edit(state, { items: Array.from({ length: 101 }, () => ({ itemType: "note", songId: null, label: "Note", transitionNotes: "" })) }), state);
  const valid = edit(state, { items: Array.from({ length: 100 }, () => ({ itemType: "note", songId: null, label: "Note", transitionNotes: "" })) });
  assert.equal(payload(valid).items.length, 100);
});

test("ordered repeated songs and markers stay exact, without index or ID merging", () => {
  const items = [song("repeat"), { itemType: "note", label: "First cue" }, song("repeat"), { itemType: "break", label: "Pause" }];
  const state = create("set-a", saved(0, { items }));
  const reordered = edit(state, { items: [...state.draft.items].reverse() });
  assert.deepEqual(payload(reordered).items.map((item) => item.itemType), ["break", "song", "note", "song"]);
  assert.equal(status(receive(reordered, saved(1, { items }))).needsReview, true);
});

test("snapshots and caller draft objects are copied, not retained by reference", () => {
  const snapshot = saved();
  const state = create("set-a", snapshot);
  snapshot.items[0].songId = "mutated-outside";
  assert.equal(state.draft.items[0].songId, "opener");
  const changed = { ...state.draft, notes: "New", items: state.draft.items.map((item) => ({ ...item })) };
  const edited = edit(state, changed);
  changed.items[0].songId = "also-mutated-outside";
  assert.equal(edited.draft.items[0].songId, "opener");
});
