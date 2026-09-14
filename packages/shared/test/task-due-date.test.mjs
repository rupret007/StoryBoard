import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const shared = await import(pathToFileURL(join(dir, "../dist/index.js")).href);
const { describeTaskDueDate } = shared;

const now = new Date("2026-09-15T18:00:00.000Z");

test("no recorded due date returns null", () => {
  for (const dueAt of [null, undefined]) {
    assert.equal(describeTaskDueDate(dueAt, now), null);
  }
});

test("an invalid due date returns null", () => {
  assert.equal(describeTaskDueDate("not-a-date", now), null);
});

test("a date-only due date is labelled by its recorded UTC calendar day, not the viewer's local day", () => {
  const result = describeTaskDueDate("2026-09-15T00:00:00.000Z", now);
  assert.equal(result.policyVersion, "task_due_date_v1");
  assert.equal(result.timing, "today");
  assert.equal(result.label, "Tue, Sep 15");
});

test("a due date earlier than the recorded now is past", () => {
  const result = describeTaskDueDate("2026-09-10T00:00:00.000Z", now);
  assert.equal(result.timing, "past");
  assert.equal(result.label, "Thu, Sep 10");
});

test("a due date after the recorded now is upcoming", () => {
  const result = describeTaskDueDate("2026-09-20T00:00:00.000Z", now);
  assert.equal(result.timing, "upcoming");
});

test("comparison is by UTC calendar day: a midnight-UTC due date is still today late in the UTC day", () => {
  const lateInDay = new Date("2026-09-15T23:30:00.000Z");
  const result = describeTaskDueDate("2026-09-15T00:00:00.000Z", lateInDay);
  assert.equal(result.timing, "today");
});

test("accepts a Date instance", () => {
  const result = describeTaskDueDate(new Date("2026-09-15T00:00:00.000Z"), now);
  assert.equal(result.timing, "today");
});

test("a noon-UTC campaign follow-up keeps its recorded UTC calendar day (not viewer-local)", () => {
  // Pitch campaigns store follow-up dates as YYYY-MM-DDT12:00:00.000Z from a plain date input.
  const result = describeTaskDueDate("2026-09-15T12:00:00.000Z", now);
  assert.equal(result.policyVersion, "task_due_date_v1");
  assert.equal(result.timing, "today");
  assert.equal(result.label, "Tue, Sep 15");
});

test("a noon-UTC follow-up earlier than today is past with the UTC calendar label", () => {
  const result = describeTaskDueDate("2026-09-10T12:00:00.000Z", now);
  assert.equal(result.timing, "past");
  assert.equal(result.label, "Thu, Sep 10");
});

test("a midnight-UTC proposed show date keeps the UTC calendar label even when a west-of-UTC clock is already on the previous local evening", () => {
  // Inbox proposedDate values can be midnight-UTC calendar days. 2026-09-15T00:00Z is
  // still Mon Sep 14 evening in America/Los_Angeles; toLocaleDateString would say Sep 14.
  const laEvening = new Date("2026-09-14T20:00:00.000-07:00"); // == 2026-09-15T03:00Z
  const result = describeTaskDueDate("2026-09-15T00:00:00.000Z", laEvening);
  assert.equal(result.timing, "today");
  assert.equal(result.label, "Tue, Sep 15");
});
