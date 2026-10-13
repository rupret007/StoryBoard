import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { deterministicProjectReadiness } = require("../dist/operations/project-plan.js");

function project(overrides = {}) {
  return {
    id: "project-a",
    name: "Release",
    type: "release",
    status: "active",
    dueAt: new Date("2030-06-16T12:00:00.000Z"),
    budgetMinor: 10000,
    currency: "USD",
    successMetrics: ["100 saves"],
    assets: [{ label: "Master", url: "https://example.test/master" }],
    expenses: [],
    events: [],
    tasks: [{ id: "milestone-a", title: "Release review", status: "todo", ownerLabel: "Alex", dueAt: new Date("2030-06-16T12:00:00.000Z") }],
    ...overrides
  };
}

for (const instant of [
  "2030-06-15T23:59:59.999Z",
  "2030-06-16T00:00:00.000Z",
  "2030-06-16T11:59:59.999Z",
  "2030-06-16T12:00:00.000Z",
  "2030-06-16T13:00:00.000Z",
  "2030-06-16T23:59:59.999Z",
  "2030-06-17T08:59:59.999+09:00"
]) {
  test(`project and milestone remain on track before the next UTC day: ${instant}`, () => {
    const readiness = deterministicProjectReadiness(project(), new Date(instant));
    assert.equal(readiness.status, "on_track");
    assert.deepEqual(readiness.gaps, []);
    assert.equal(readiness.overdueMilestones, 0);
    assert.equal(readiness.nextAction, "Complete “Release review”.");
  });
}

for (const dueAt of ["2030-06-16T00:00:00.000Z", "2030-06-16T12:00:00.000Z", "2030-06-16T23:59:59.999Z"]) {
  test(`project due time does not change the UTC midnight boundary: ${dueAt}`, () => {
    // Keep the milestone in the future so only the parent can cause off_track.
    const input = project({ dueAt: new Date(dueAt), tasks: [{ ...project().tasks[0], dueAt: new Date("2030-06-18T12:00:00.000Z") }] });
    const before = deterministicProjectReadiness(input, new Date("2030-06-16T23:59:59.999Z"));
    assert.equal(before.status, "on_track");
    assert.deepEqual(before.gaps, []);

    // June 16 in Chicago, but exactly June 17 in UTC.
    const after = deterministicProjectReadiness(input, new Date("2030-06-16T19:00:00.000-05:00"));
    assert.equal(after.status, "off_track");
    assert.equal(after.overdueMilestones, 0);
    assert.deepEqual(after.gaps.map((gap) => gap.code), ["project_overdue"]);
    assert.deepEqual(after.gaps[0].evidenceIds, [input.id]);
    assert.equal(after.nextAction, "Choose a credible new date or deliberately close the project.");
  });
}

test("project and milestone both become overdue at the next UTC midnight", () => {
  const readiness = deterministicProjectReadiness(project(), new Date("2030-06-17T00:00:00.000Z"));
  assert.equal(readiness.status, "off_track");
  assert.equal(readiness.overdueMilestones, 1);
  assert.deepEqual(readiness.gaps.map((gap) => gap.code), ["milestones_overdue", "project_overdue"]);
});

test("a missing project due date remains missing rather than overdue", () => {
  const readiness = deterministicProjectReadiness(project({ dueAt: null }), new Date("2030-06-16T23:59:59.999Z"));
  assert.deepEqual(readiness.gaps.map((gap) => gap.code), ["due_date_missing"]);
});

test("completed projects stay complete and never acquire a project overdue gap", () => {
  const input = project({ status: "completed", tasks: [{ ...project().tasks[0], status: "done" }] });
  for (const instant of ["2030-06-16T13:00:00.000Z", "2030-06-17T00:00:00.000Z"]) {
    const readiness = deterministicProjectReadiness(input, new Date(instant));
    assert.equal(readiness.status, "complete");
    assert.equal(readiness.overdueMilestones, 0);
    assert.deepEqual(readiness.gaps, []);
    assert.equal(readiness.nextMilestone, null);
  }
});

test("completed projects with unfinished milestones retain the inconsistency warning", () => {
  const readiness = deterministicProjectReadiness(project({ status: "completed" }), new Date("2030-06-17T00:00:00.000Z"));
  assert.equal(readiness.status, "off_track");
  assert.equal(readiness.overdueMilestones, 1);
  assert.deepEqual(readiness.gaps.map((gap) => gap.code), ["milestones_overdue", "completion_inconsistent"]);
});

test("cancelled projects stay closed with the cancellation next action across midnight", () => {
  for (const instant of ["2030-06-16T13:00:00.000Z", "2030-06-17T00:00:00.000Z"]) {
    const readiness = deterministicProjectReadiness(project({ status: "cancelled" }), new Date(instant));
    assert.equal(readiness.status, "closed");
    assert.equal(readiness.headline, "Release is cancelled; no active project work is being recommended.");
    assert.equal(readiness.nextAction, "Keep the cancellation reason and any follow-up documented.");
  }
});
