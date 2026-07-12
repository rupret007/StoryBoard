import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const load = (path) => import(pathToFileURL(join(dir, "..", "dist", path)).href);

const [contactsMod, bookingMod, tasksMod, bookingSchemaMod, taskSchemaMod] =
  await Promise.all([
    load("contacts/contacts.service.js"),
    load("booking/booking-opportunities.service.js"),
    load("tasks/tasks.service.js"),
    load("booking/booking-opportunity.schema.js"),
    load("tasks/task.schema.js")
  ]);

function auditSpy() {
  const events = [];
  return {
    events,
    audit: { log: async (event) => events.push(event) }
  };
}

function assertNotFound(error, message) {
  assert.equal(error?.getStatus?.(), 404);
  assert.equal(error?.message, message);
  return true;
}

test("contact venue links stay within the current artist and may be cleared", async () => {
  const calls = { venueLookups: 0, creates: 0, updates: 0 };
  const { audit, events } = auditSpy();
  const service = new contactsMod.ContactsService(
    {
      client: {
        venue: {
          findFirst: async ({ where }) => {
            calls.venueLookups += 1;
            return where.id === "venue-a" && where.artistId === "artist-a"
              ? { id: "venue-a" }
              : null;
          }
        },
        contact: {
          findFirst: async () => ({ id: "contact-a" }),
          create: async ({ data }) => {
            calls.creates += 1;
            return { id: "contact-a", ...data };
          },
          update: async ({ data }) => {
            calls.updates += 1;
            return { id: "contact-a", ...data };
          }
        }
      }
    },
    audit
  );

  await assert.rejects(
    () =>
      service.create("artist-a", {
        fullName: "Off-tenant link",
        venueId: "venue-b"
      }),
    (error) => assertNotFound(error, "Venue not found")
  );
  assert.equal(calls.creates, 0);
  assert.equal(events.length, 0);

  await assert.rejects(
    () => service.update("artist-a", "contact-a", { venueId: "venue-b" }),
    (error) => assertNotFound(error, "Venue not found")
  );
  assert.equal(calls.updates, 0);
  assert.equal(events.length, 0);

  await service.create("artist-a", {
    fullName: "Owned venue link",
    venueId: "venue-a"
  });
  await service.update("artist-a", "contact-a", { venueId: null });
  assert.equal(calls.creates, 1);
  assert.equal(calls.updates, 1);
  assert.equal(events.length, 2);
});

test("booking venue links stay within the current artist and may be cleared", async () => {
  const calls = { venueLookups: 0, creates: 0, updates: 0 };
  const { audit, events } = auditSpy();
  const service = new bookingMod.BookingOpportunitiesService(
    {
      client: {
        venue: {
          findFirst: async ({ where }) => {
            calls.venueLookups += 1;
            return where.id === "venue-a" && where.artistId === "artist-a"
              ? { id: "venue-a" }
              : null;
          }
        },
        bookingOpportunity: {
          findFirst: async () => ({ id: "opportunity-a", stage: "target" }),
          create: async ({ data }) => {
            calls.creates += 1;
            return { id: "opportunity-a", ...data };
          },
          update: async ({ data }) => {
            calls.updates += 1;
            return { id: "opportunity-a", ...data };
          }
        }
      }
    },
    audit
  );

  await assert.rejects(
    () =>
      service.create("artist-a", {
        title: "Off-tenant booking",
        venueId: "venue-b"
      }),
    (error) => assertNotFound(error, "Venue not found")
  );
  assert.equal(calls.creates, 0);
  assert.equal(events.length, 0);

  await assert.rejects(
    () =>
      service.patch("artist-a", "opportunity-a", { venueId: "venue-b" }),
    (error) => assertNotFound(error, "Venue not found")
  );
  assert.equal(calls.updates, 0);
  assert.equal(events.length, 0);

  await service.create("artist-a", {
    title: "Owned venue booking",
    venueId: "venue-a"
  });
  await service.patch("artist-a", "opportunity-a", { venueId: null });
  assert.equal(calls.creates, 1);
  assert.equal(calls.updates, 1);
  assert.equal(events.length, 2);
});

test("task opportunity and project links stay within the current artist and may be cleared", async () => {
  const calls = { opportunityLookups: 0, projectLookups: 0, creates: 0, updates: 0 };
  const { audit, events } = auditSpy();
  let taskRow = { id: "task-a", artistId: "artist-a", status: "todo", ownerLabel: null, dueAt: null, blockedReason: null, waitingOn: null, deferralCount: 0, updatedAt: new Date("2026-07-01T00:00:00.000Z") };
  const client = {
    managerRecommendation: { updateMany: async () => ({ count: 0 }) },
    bookingOpportunity: {
      findFirst: async ({ where }) => {
        calls.opportunityLookups += 1;
        return where.id === "opportunity-a" && where.artistId === "artist-a" ? { id: "opportunity-a" } : null;
      }
    },
    artistProject: {
      findFirst: async ({ where }) => {
        calls.projectLookups += 1;
        return where.id === "project-a" && where.artistId === "artist-a" ? { id: "project-a" } : null;
      }
    },
    task: {
      findFirst: async ({ where }) => where.id === taskRow.id && where.artistId === taskRow.artistId ? { ...taskRow } : null,
      create: async ({ data }) => {
        calls.creates += 1;
        return { id: `task-${calls.creates}`, ...data };
      },
      updateMany: async ({ data }) => {
        calls.updates += 1;
        taskRow = { ...taskRow, ...data, updatedAt: new Date(taskRow.updatedAt.getTime() + 1) };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...taskRow })
    }
  };
  client.$transaction = async (fn) => fn(client);
  const service = new tasksMod.TasksService(
    { client },
    audit
  );

  await assert.rejects(
    () =>
      service.create("artist-a", {
        title: "Off-tenant task",
        opportunityId: "opportunity-b"
      }),
    (error) => assertNotFound(error, "Booking opportunity not found")
  );
  assert.equal(calls.creates, 0);
  assert.equal(events.length, 0);

  await assert.rejects(
    () => service.patch("artist-a", "task-a", { opportunityId: "opportunity-b" }),
    (error) => assertNotFound(error, "Booking opportunity not found")
  );
  assert.equal(calls.updates, 0);
  assert.equal(events.length, 0);

  await assert.rejects(
    () => service.create("artist-a", { title: "Off-tenant project task", projectId: "project-b" }),
    (error) => assertNotFound(error, "Project not found")
  );
  await assert.rejects(
    () => service.patch("artist-a", "task-a", { projectId: "project-b" }),
    (error) => assertNotFound(error, "Project not found")
  );
  assert.equal(calls.creates, 0);
  assert.equal(calls.updates, 0);
  assert.equal(events.length, 0);

  await service.create("artist-a", {
    title: "Owned opportunity task",
    opportunityId: "opportunity-a"
  });
  await service.patch("artist-a", "task-a", { opportunityId: null });
  await service.create("artist-a", { title: "Owned project task", projectId: "project-a" });
  await service.patch("artist-a", "task-a", { projectId: null });
  assert.equal(calls.creates, 2);
  assert.equal(calls.updates, 2);
  assert.equal(events.length, 4);
});

test("booking and task request schemas reject malformed values and unknown fields", () => {
  assert.equal(
    bookingSchemaMod.bookingOpportunityCreateSchema.safeParse({
      title: "Festival hold",
      venueId: "venue-a",
      targetDate: "2026-07-10"
    }).success,
    true
  );
  assert.equal(
    bookingSchemaMod.bookingOpportunityPatchSchema.safeParse({
      venueId: null,
      unexpected: true
    }).success,
    false
  );
  assert.equal(
    bookingSchemaMod.bookingOpportunityStageSchema.safeParse({
      stage: "not-a-stage"
    }).success,
    false
  );
  assert.equal(
    taskSchemaMod.taskCreateSchema.safeParse({
      title: "Confirm backline",
      opportunityId: "opportunity-a",
      projectId: "project-a",
      dueAt: "2026-07-10"
    }).success,
    true
  );
  assert.equal(
    taskSchemaMod.taskPatchSchema.safeParse({ dueAt: "tomorrow" }).success,
    false
  );
  assert.equal(
    taskSchemaMod.taskPatchSchema.safeParse({ status: "invalid" }).success,
    false
  );
  assert.equal(taskSchemaMod.taskCreateSchema.safeParse({ title: "Blocked without context", status: "blocked" }).success, false);
  assert.equal(taskSchemaMod.taskCreateSchema.safeParse({ title: "Blocked with context", status: "blocked", blockedReason: "Waiting for the promoter's stage dimensions", waitingOn: "Promoter" }).success, true);
  assert.equal(taskSchemaMod.taskCreateSchema.safeParse({ title: "Not blocked", blockedReason: "Contradictory state" }).success, false);
  assert.equal(taskSchemaMod.taskCreateSchema.safeParse({ title: "Already done", status: "done", waitingOn: "Promoter" }).success, false);
  assert.equal(taskSchemaMod.taskPatchSchema.safeParse({ status: "in_progress", blockedReason: "Contradictory state" }).success, false);
  assert.equal(taskSchemaMod.taskPatchSchema.safeParse({ blockedReason: "Reason", surprise: true }).success, false);
});
