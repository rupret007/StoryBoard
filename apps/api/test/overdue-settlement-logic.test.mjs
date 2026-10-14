import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const loadApi = async (path) => {
  const module = await import(pathToFileURL(join(dir, "..", "dist", path)).href);
  return module.default ?? module;
};
const [operationsMod, tasksMod, eventDayOf, eventReadiness, projectPlan, teamLoad] = await Promise.all([
  loadApi("operations/operations.service.js"),
  loadApi("tasks/tasks.service.js"),
  loadApi("operations/event-day-of.js"),
  loadApi("operations/event-readiness.js"),
  loadApi("operations/project-plan.js"),
  loadApi("manager/manager-team-load.js")
]);

const now = new Date("2026-09-15T18:00:00.000Z");
const dueToday = new Date("2026-09-15T00:00:00.000Z");
const dueYesterday = new Date("2026-09-14T00:00:00.000Z");

test("S09 day-of, readiness, project readiness, and team-load treat later-today as not overdue", () => {
  const dayEvent = {
    id: "event-day",
    status: "confirmed",
    startsAt: new Date("2026-09-16T21:00:00.000Z"),
    endsAt: null,
    loadInAt: new Date("2026-09-16T17:00:00.000Z"),
    soundcheckAt: null,
    doorsAt: null,
    setAt: null,
    curfewAt: null,
    guaranteeMinor: null,
    depositMinor: 0,
    currency: "USD",
    participants: [],
    tasks: [
      { id: "today", title: "Confirm parking", status: "todo", dueAt: dueToday },
      { id: "past", title: "Send the rider", status: "todo", dueAt: dueYesterday }
    ],
    schedule: [],
    deals: [],
    invoices: []
  };
  const readinessStub = {
    eventId: dayEvent.id,
    title: "Show",
    startsAt: dayEvent.startsAt.toISOString(),
    daysUntil: 1,
    score: 80,
    status: "attention",
    confidence: 1,
    confidenceLabel: "high",
    observedAt: now.toISOString(),
    headline: "Open.",
    nextAction: null,
    categories: [],
    gaps: [],
    evidenceIds: [dayEvent.id]
  };
  const dayOf = eventDayOf.deterministicEventDayOf(dayEvent, readinessStub, [], now);
  assert.equal(dayOf.overdueTaskCount, 1);
  assert.match(dayOf.nextAction, /Send the rider/);

  const show = eventReadiness.deterministicShowReadiness({
    id: "event-a",
    title: "Saturday show",
    startsAt: new Date("2026-09-20T01:00:00.000Z"),
    venueId: "venue-a",
    contactId: "contact-a",
    loadInAt: new Date("2026-09-20T00:00:00.000Z"),
    soundcheckAt: new Date("2026-09-20T00:30:00.000Z"),
    doorsAt: new Date("2026-09-20T01:00:00.000Z"),
    setAt: new Date("2026-09-20T02:00:00.000Z"),
    curfewAt: new Date("2026-09-20T04:00:00.000Z"),
    productionNotes: "Ready",
    guaranteeMinor: 100000,
    depositMinor: 0,
    currency: "USD",
    participants: [{ id: "p-a", bandMemberId: "member-a", response: "available" }],
    tasks: [
      { id: "today", title: "Confirm production", status: "todo", dueAt: dueToday, ownerLabel: "Show advance" },
      { id: "past", title: "Confirm hospitality", status: "todo", dueAt: dueYesterday, ownerLabel: "Show advance" }
    ],
    setlist: { id: "set-a", items: [{ id: "item-a", itemType: "song", song: { id: "song-a", title: "Opener", durationSeconds: 180 } }] },
    deals: [{ id: "deal-a", status: "accepted", offerAmountMinor: 100000, depositMinor: 0, agreements: [{ id: "ag-a", status: "signed" }], invoices: [] }],
    invoices: []
  }, [{ id: "member-a" }], now);
  const advanceGap = show.gaps.find((gap) => gap.code === "advance_overdue");
  assert.ok(advanceGap);
  assert.match(advanceGap.detail, /1 show-advance task is overdue/);
  assert.ok(advanceGap.evidenceIds.includes("past"));
  assert.equal(advanceGap.evidenceIds.includes("today"), false);

  const project = projectPlan.deterministicProjectReadiness({
    id: "project-a",
    name: "Release",
    type: "release",
    status: "active",
    dueAt: new Date("2026-10-01T00:00:00.000Z"),
    budgetMinor: 10000,
    currency: "USD",
    successMetrics: ["streams"],
    assets: ["folder"],
    expenses: [],
    events: [],
    tasks: [
      { id: "today", title: "Master", status: "todo", dueAt: dueToday, ownerLabel: "Alex" },
      { id: "past", title: "Artwork", status: "todo", dueAt: dueYesterday, ownerLabel: "Alex" }
    ]
  }, now);
  assert.equal(project.overdueMilestones, 1);
  const milestoneGap = project.gaps.find((gap) => gap.code === "milestones_overdue");
  assert.ok(milestoneGap);
  assert.deepEqual(milestoneGap.evidenceIds, ["past"]);

  const load = teamLoad.deterministicManagerTeamLoad({
    members: [{ id: "member-a", name: "Alex", roles: ["booking"] }],
    tasks: [
      { id: "today", title: "Confirm parking", status: "todo", bandMemberId: "member-a", ownerLabel: "Alex", dueAt: dueToday },
      { id: "past", title: "Send the rider", status: "todo", bandMemberId: "member-a", ownerLabel: "Alex", dueAt: dueYesterday }
    ],
    now
  });
  assert.equal(load.members[0].overdue, 1);
  assert.match(load.members[0].reasons.join(" "), /1 overdue/);
});

test("S09 insights and escalation overdue queries use the UTC calendar-day cutoff", async () => {
  let where = null;
  const service = new tasksMod.TasksService({
    client: {
      task: {
        findMany: async (args) => {
          where = args.where;
          return [];
        }
      }
    }
  }, { log: async () => undefined });
  await service.overdueByDueDate("artist-a", null, now);
  assert.deepEqual(where.dueAt, { lt: new Date("2026-09-15T00:00:00.000Z") });
  await service.overdueByDueDate("artist-a", 1, now);
  assert.deepEqual(where.dueAt, { lt: new Date("2026-09-14T00:00:00.000Z") });
});

test("S10 create and finalize settlement amounts sum to net after leftover cents", async () => {
  let createdSplits = null;
  let finalizedBody = null;
  let updatedAmounts = [];
  const members = {
    a: { id: "a", active: true, name: "Alex" },
    b: { id: "b", active: true, name: "Morgan" },
    c: { id: "c", active: true, name: "Riley" }
  };
  const splits = [
    { bandMemberId: "a", basisPoints: 3333 },
    { bandMemberId: "b", basisPoints: 3333 },
    { bandMemberId: "c", basisPoints: 3334 }
  ];
  const createTx = {
    expense: { aggregate: async () => ({ _sum: { amountMinor: 0 } }) },
    settlement: {
      create: async ({ data }) => {
        createdSplits = data.splits.create;
        return { id: "settlement-a", ...data, splits: createdSplits };
      }
    }
  };
  const createService = new operationsMod.OperationsService({
    client: {
      bandEvent: { findFirst: async () => ({ id: "event-a" }) },
      bandMember: {
        findMany: async () => Object.values(members)
      },
      $transaction: async (work, options) => {
        assert.equal(options?.isolationLevel, "Serializable");
        return work(createTx);
      }
    }
  }, { log: async () => undefined }, {});
  const created = await createService.createSettlement(
    "artist-a",
    { eventId: "event-a", currency: "USD", grossMinor: 100, splits },
    "owner@test",
    "operator-a"
  );
  assert.equal(created.netMinor, 100);
  assert.equal(createdSplits.reduce((sum, split) => sum + split.amountMinor, 0), 100);
  assert.equal(createdSplits.reduce((sum, split) => sum + split.basisPoints, 0), 10000);
  assert.deepEqual(createdSplits.map((split) => split.amountMinor), [33, 33, 34]);

  const finalizeTx = {
    settlement: {
      findFirst: async () => ({
        id: "settlement-a",
        artistId: "artist-a",
        eventId: "event-a",
        status: "draft",
        currency: "USD",
        grossMinor: 100,
        event: { title: "Friday show" },
        splits: createdSplits.map((split) => ({ ...split, bandMember: members[split.bandMemberId] })),
        snapshots: []
      }),
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ id: "settlement-a", expenseMinor: 0, netMinor: 100, splits: createdSplits, snapshots: [{ sha256: "abc" }] })
    },
    expense: {
      aggregate: async () => ({ _sum: { amountMinor: 0 } }),
      updateMany: async () => ({ count: 0 })
    },
    memberSplit: {
      update: async ({ data }) => {
        updatedAmounts.push(data.amountMinor);
        return data;
      }
    },
    documentSnapshot: {
      create: async ({ data }) => {
        finalizedBody = Buffer.from(data.contentBase64, "base64").toString("utf8");
        return data;
      }
    }
  };
  const finalizeService = new operationsMod.OperationsService({
    client: {
      $transaction: async (work, options) => {
        assert.equal(options?.isolationLevel, "Serializable");
        return work(finalizeTx);
      }
    }
  }, { log: async () => undefined }, {});
  const finalized = await finalizeService.finalizeSettlement("artist-a", "settlement-a", "owner@test", "operator-a");
  assert.equal(finalized.netMinor, 100);
  assert.equal(updatedAmounts.reduce((sum, amount) => sum + amount, 0), 100);
  assert.match(finalizedBody, /Net: USD 1\.00/);
  assert.match(finalizedBody, /Alex: USD 0\.33/);
  assert.match(finalizedBody, /Morgan: USD 0\.33/);
  assert.match(finalizedBody, /Riley: USD 0\.34/);
});

test("S11 POST with an inactive bandMemberId returns 400 and finalize PDF omits inactive names", async () => {
  const service = new operationsMod.OperationsService({
    client: {
      bandEvent: { findFirst: async () => ({ id: "event-a" }) },
      bandMember: {
        findMany: async () => [
          { id: "active-a", active: true },
          { id: "inactive", active: false }
        ]
      }
    }
  }, { log: async () => undefined }, {});
  await assert.rejects(
    () => service.createSettlement(
      "artist-a",
      {
        eventId: "event-a",
        currency: "USD",
        grossMinor: 10000,
        splits: [
          { bandMemberId: "active-a", basisPoints: 5000 },
          { bandMemberId: "inactive", basisPoints: 5000 }
        ]
      },
      "owner@test",
      "operator-a"
    ),
    (error) => error?.status === 400 || /Inactive members cannot receive settlement splits/i.test(error?.message ?? "")
  );

  let snapshot = null;
  const finalizeTx = {
    settlement: {
      findFirst: async () => ({
        id: "settlement-b",
        artistId: "artist-a",
        eventId: "event-a",
        status: "draft",
        currency: "USD",
        grossMinor: 10000,
        event: { title: "Friday show" },
        splits: [
          { bandMemberId: "active-a", basisPoints: 10000, bandMember: { name: "Alex", active: true } },
          { bandMemberId: "inactive", basisPoints: 0, bandMember: { name: "Inactive Pat", active: false } }
        ],
        snapshots: []
      })
    }
  };
  const finalizeService = new operationsMod.OperationsService({
    client: {
      $transaction: async (work) => work(finalizeTx)
    }
  }, { log: async () => undefined }, {});
  await assert.rejects(
    () => finalizeService.finalizeSettlement("artist-a", "settlement-b", "owner@test", "operator-a"),
    /Inactive members cannot receive settlement splits/i
  );
  assert.equal(snapshot, null);
});
