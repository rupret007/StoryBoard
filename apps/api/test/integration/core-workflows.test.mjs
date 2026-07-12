import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { requireTestDatabaseUrl } from "../../../../scripts/test-database.mjs";

const testDatabaseUrl = requireTestDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl;

const dir = dirname(fileURLToPath(import.meta.url));
const load = async (path) => { const module = await import(pathToFileURL(join(dir, "..", "..", "dist", path)).href); return module.default ?? module; };

const [
  prismaMod,
  auditMod,
  contactsMod,
  bookingMod,
  tasksMod,
  profilesMod,
  prospectsMod,
  campaignsMod,
  approvalsMod,
  rolesMod,
  telegramMod,
  mockAdaptersMod,
  managerMod,
  operationsMod
] = await Promise.all([
  load("lib/prisma.js"),
  load("audit/audit.service.js"),
  load("contacts/contacts.service.js"),
  load("booking/booking-opportunities.service.js"),
  load("tasks/tasks.service.js"),
  load("booking/booking-profiles.service.js"),
  load("booking/booking-prospects.service.js"),
  load("booking/booking-campaigns.service.js"),
  load("approvals/approvals.service.js"),
  load("auth/role-policy.service.js"),
  load("workflow-automation/telegram-registration.service.js"),
  load("integrations/adapters/mock/mock-adapters.js"),
  load("manager/manager.service.js"),
  load("operations/operations.service.js")
]);

const client = prismaMod.createPrismaClient();
const prisma = { client };
const audit = new auditMod.AuditService(prisma);

async function resetDatabase() {
  await client.$executeRawUnsafe(
    'TRUNCATE TABLE "Artist", "Operator" RESTART IDENTITY CASCADE'
  );
}

before(resetDatabase);
after(async () => {
  await resetDatabase();
  await client.$disconnect();
});

test("database integration: tenant links, roles, registration binding, and audits", async () => {
  const [artistA, artistB] = await Promise.all([
    client.artist.create({ data: { name: "Artist A", slug: "artist-a-test" } }),
    client.artist.create({ data: { name: "Artist B", slug: "artist-b-test" } })
  ]);
  const [owner, viewer] = await Promise.all([
    client.operator.create({ data: { email: "owner@test.invalid" } }),
    client.operator.create({ data: { email: "viewer@test.invalid" } })
  ]);
  await client.artistMembership.createMany({
    data: [
      { artistId: artistA.id, operatorId: owner.id, role: "owner" },
      { artistId: artistA.id, operatorId: viewer.id, role: "viewer" }
    ]
  });

  const rolePolicy = new rolesMod.RolePolicyService(prisma);
  await rolePolicy.assertOwner(owner.id, artistA.id);
  await assert.rejects(
    () => rolePolicy.assertCanMutateWorkflow(viewer.id, artistA.id),
    (error) => error?.getStatus?.() === 403
  );

  const foreignVenue = await client.venue.create({
    data: { artistId: artistB.id, name: "Foreign venue", city: "Elsewhere" }
  });
  const ownedVenue = await client.venue.create({
    data: { artistId: artistA.id, name: "Owned venue", city: "Home" }
  });
  const foreignOpportunity = await client.bookingOpportunity.create({
    data: { artistId: artistB.id, title: "Foreign opportunity" }
  });
  const contacts = new contactsMod.ContactsService(prisma, audit);
  const booking = new bookingMod.BookingOpportunitiesService(prisma, audit);
  const tasks = new tasksMod.TasksService(prisma, audit);
  await assert.rejects(
    () =>
      contacts.create(artistA.id, {
        fullName: "Cross-artist contact",
        venueId: foreignVenue.id
      }),
    (error) => error?.getStatus?.() === 404
  );
  assert.equal(
    await client.contact.count({ where: { artistId: artistA.id } }),
    0
  );
  assert.equal(
    await client.auditEvent.count({ where: { artistId: artistA.id } }),
    0
  );

  const contact = await contacts.create(artistA.id, {
    fullName: "Owned contact",
    venueId: ownedVenue.id
  });
  assert.equal(contact.venueId, ownedVenue.id);
  assert.equal(
    await client.auditEvent.count({
      where: { artistId: artistA.id, action: "contact.created" }
    }),
    1
  );

  await assert.rejects(
    () =>
      booking.create(artistA.id, {
        title: "Cross-artist booking",
        venueId: foreignVenue.id
      }),
    (error) => error?.getStatus?.() === 404
  );
  assert.equal(
    await client.bookingOpportunity.count({ where: { artistId: artistA.id } }),
    0
  );
  const opportunity = await booking.create(artistA.id, {
    title: "Owned opportunity",
    venueId: ownedVenue.id
  });

  await assert.rejects(
    () =>
      tasks.create(artistA.id, {
        title: "Cross-artist task",
        opportunityId: foreignOpportunity.id
      }),
    (error) => error?.getStatus?.() === 404
  );
  assert.equal(await client.task.count({ where: { artistId: artistA.id } }), 0);
  const prerequisiteTask = await tasks.create(artistA.id, {
    title: "Confirm the performance date"
  });
  const ownedTask = await tasks.create(artistA.id, {
    title: "Owned opportunity task",
    opportunityId: opportunity.id,
    dueAt: "2026-07-15"
  });
  const foreignTask = await client.task.create({ data: { artistId: artistB.id, title: "Foreign prerequisite" } });
  const lateTask = await client.task.create({ data: { artistId: artistA.id, title: "Late prerequisite", dueAt: new Date("2026-07-20T00:00:00.000Z") } });
  await Promise.all([
    tasks.addPrerequisite(artistA.id, ownedTask.id, prerequisiteTask.id, owner.email, owner.id),
    tasks.addPrerequisite(artistA.id, ownedTask.id, prerequisiteTask.id, owner.email, owner.id)
  ]);
  assert.equal(await client.taskDependency.count({ where: { artistId: artistA.id } }), 1);
  await assert.rejects(() => tasks.addPrerequisite(artistA.id, prerequisiteTask.id, ownedTask.id, owner.email, owner.id), /create a task cycle/);
  await assert.rejects(() => tasks.addPrerequisite(artistA.id, ownedTask.id, lateTask.id, owner.email, owner.id), /due after the task/);
  await assert.rejects(() => tasks.addPrerequisite(artistA.id, ownedTask.id, foreignTask.id, owner.email, owner.id), (error) => error?.getStatus?.() === 404);
  await assert.rejects(() => tasks.patch(artistA.id, ownedTask.id, { status: "done" }, owner.email, owner.id), /Complete every prerequisite/);
  await tasks.patch(artistA.id, prerequisiteTask.id, { status: "done" }, owner.email, owner.id);
  await tasks.patch(artistA.id, ownedTask.id, { status: "done" }, owner.email, owner.id);
  await assert.rejects(() => tasks.patch(artistA.id, prerequisiteTask.id, { status: "todo" }, owner.email, owner.id), /cannot be reopened/);
  await tasks.removePrerequisite(artistA.id, ownedTask.id, prerequisiteTask.id, owner.email, owner.id);

  const registration = new telegramMod.TelegramRegistrationService(
    prisma,
    audit,
    { get: (key) => (key === "TELEGRAM_REGISTRATION_TTL_MINUTES" ? 5 : undefined) }
  );
  const issued = await registration.createRegistrationToken({
    artistId: artistA.id,
    createdByOperatorId: owner.id,
    operatorLabel: "owner@test.invalid"
  });
  await registration.handleWebhookUpdate({
    message: { text: `/start ${issued.startPayload}`, chat: { id: 987654 } }
  });
  const linkedArtist = await client.artist.findUniqueOrThrow({
    where: { id: artistA.id }
  });
  const token = await client.telegramRegistrationToken.findFirstOrThrow({
    where: { artistId: artistA.id }
  });
  assert.equal(linkedArtist.telegramChatId, "987654");
  assert.ok(token.consumedAt);
  assert.equal(token.boundChatId, "987654");

  await registration.handleWebhookUpdate({
    message: { text: `/start ${issued.startPayload}`, chat: { id: 111111 } }
  });
  const auditActions = await client.auditEvent.findMany({
    where: { artistId: artistA.id },
    select: { action: true },
    orderBy: { createdAt: "asc" }
  });
  assert.deepEqual(
    auditActions.map((event) => event.action),
    [
      "contact.created",
      "booking.created",
      "task.created",
      "task.created",
      "task.prerequisite_added",
      "task.updated",
      "task.updated",
      "task.prerequisite_removed",
      "telegram.registration.token_created",
      "telegram.registration.bound",
      "telegram.registration.failed"
    ]
  );
});

test("database integration: prospect conversion and approved campaign drafts stay tenant-scoped", async () => {
  const [artistA, artistB] = await Promise.all([
    client.artist.create({ data: { name: "Campaign Artist", slug: "campaign-artist-test" } }),
    client.artist.create({ data: { name: "Other Artist", slug: "other-artist-test" } })
  ]);
  const operator = await client.operator.create({
    data: { email: "campaign-owner@test.invalid" }
  });
  const profileAudit = new auditMod.AuditService(prisma);
  const profiles = new profilesMod.BookingProfilesService(prisma, profileAudit);
  await profiles.put(artistA.id, {
    homeCity: "Austin",
    homeRegion: "TX",
    homeCountry: "US",
    genres: ["indie rock"],
    targetCapacityMin: 100,
    targetCapacityMax: 500,
    bookingPitch: "A concise, energetic live show.",
    pressKitUrl: "https://example.test/epk"
  });
  const prospects = new prospectsMod.BookingProspectsService(
    prisma,
    profileAudit,
    profiles,
    { resolveForArtist: async () => ({ ticketmaster: { mode: "mock" } }) }
  );
  const foreignVenue = await client.venue.create({
    data: { artistId: artistB.id, name: "Foreign Room", city: "Dallas" }
  });
  await assert.rejects(
    () =>
      prospects.create(artistA.id, {
        kind: "venue",
        name: "Unsafe link",
        city: "Austin",
        venueId: foreignVenue.id
      }),
    (error) => error?.getStatus?.() === 404
  );

  const privateLead = await prospects.create(artistA.id, {
    kind: "corporate_event",
    status: "qualified",
    name: "Acme holiday party",
    city: "Austin"
  });
  const privateConverted = await prospects.convert(artistA.id, privateLead.id, {
    contact: {
      fullName: "Avery Buyer",
      email: "avery@example.test",
      role: "Events lead"
    }
  });
  assert.equal(privateConverted.venueId, null);
  assert.ok(privateConverted.opportunityId);
  assert.ok(privateConverted.contactId);
  const secondConversion = await prospects.convert(artistA.id, privateLead.id, {});
  assert.equal(secondConversion.opportunityId, privateConverted.opportunityId);
  assert.equal(
    await client.bookingOpportunity.count({
      where: { artistId: artistA.id, sourceSystem: "booking_prospect" }
    }),
    1
  );

  const venueLead = await prospects.create(artistA.id, {
    kind: "venue",
    status: "qualified",
    name: "The Useful Room",
    city: "Austin",
    capacity: 300,
    sourceSystem: "ticketmaster",
    sourceRef: "venue:test-useful-room"
  });
  const venueConverted = await prospects.convert(artistA.id, venueLead.id, {});
  assert.ok(venueConverted.venueId);
  const venue = await client.venue.findUniqueOrThrow({
    where: { id: venueConverted.venueId }
  });
  assert.equal(venue.artistId, artistA.id);
  assert.equal(venue.capacity, 300);

  const campaignLead = await prospects.create(artistA.id, {
    kind: "festival",
    status: "qualified",
    name: "Useful Festival",
    city: "Austin"
  });
  const sprint = await client.bookingMarketSprint.create({
    data: { artistId: artistA.id, name: "Austin fall sprint", city: "Austin", status: "active" }
  });
  await prospects.patch(artistA.id, campaignLead.id, { marketSprintId: sprint.id });
  const linkedBuyer = await prospects.attachContact(artistA.id, campaignLead.id, {
    contact: {
      fullName: "Morgan Promoter",
      email: "morgan@example.test",
      role: "Talent buyer"
    }
  });
  assert.equal(linkedBuyer.created, true);
  assert.ok(linkedBuyer.prospect.contactId);
  const queue = { enqueueApprovalNotify: async () => undefined };
  const approvals = new approvalsMod.ApprovalsService(
    prisma,
    profileAudit,
    { resolveForArtist: async () => mockAdaptersMod.mockAdapters },
    queue
  );
  const campaigns = new campaignsMod.BookingCampaignsService(
    prisma,
    profileAudit,
    profiles,
    approvals
  );
  const campaign = await campaigns.create(artistA.id, {
    name: "Austin fall rooms",
    subjectTemplate: "Booking inquiry — {{artistName}}",
    bodyTemplate: "Hi {{contactName}}, {{bookingPitch}} {{pressKitUrl}}",
    defaultFollowUpDays: 7,
    deliveryMode: "send_on_execution",
    marketSprintId: sprint.id
  });
  const recipient = await campaigns.addRecipient(artistA.id, campaign.id, {
    prospectId: campaignLead.id
  });
  assert.equal(recipient.status, "ready");
  const prepared = await campaigns.prepareApproval(
    artistA.id,
    campaign.id,
    {},
    operator.email,
    operator.id
  );
  assert.equal(prepared.previews.length, 1);
  assert.equal(prepared.previews[0].to, "morgan@example.test");
  await approvals.approve(artistA.id, prepared.approval.id, operator.email, operator.id);
  const executed = await approvals.executeApproved(
    artistA.id,
    prepared.approval.id,
    operator.email,
    { actorOperatorId: operator.id }
  );
  assert.equal(executed.status, "executed");
  const sentRecipient = await client.bookingCampaignRecipient.findUniqueOrThrow({
    where: { id: recipient.id }
  });
  assert.equal(sentRecipient.status, "sent");
  assert.ok(sentRecipient.followUpTaskId);
  const followUp = await client.task.findUniqueOrThrow({
    where: { id: sentRecipient.followUpTaskId }
  });
  assert.equal(followUp.artistId, artistA.id);
  assert.equal(followUp.title, "Follow up with Useful Festival");
  const delivery = await client.bookingCampaignDelivery.findUniqueOrThrow({
    where: { approvalId_recipientId: { approvalId: prepared.approval.id, recipientId: recipient.id } }
  });
  assert.equal(delivery.status, "sent");
  await campaigns.patchRecipient(artistA.id, campaign.id, recipient.id, {
    status: "replied",
    outcomeNote: "Asked for a routing hold"
  });
  const finalRecipient = await client.bookingCampaignRecipient.findUniqueOrThrow({
    where: { id: recipient.id }
  });
  assert.equal(finalRecipient.status, "replied");
  const auditActions = await client.auditEvent.findMany({
    where: { artistId: artistA.id },
    select: { action: true }
  });
  assert.ok(auditActions.some((event) => event.action === "booking_prospect.converted"));
  assert.ok(auditActions.some((event) => event.action === "booking_prospect.contact_linked"));
  assert.ok(auditActions.some((event) => event.action === "booking_campaign.sent"));
});

test("database integration: manager intake, confirmed gig, payment, and settlement remain tenant-scoped and audited", async () => {
  const [artist, foreignArtist] = await Promise.all([
    client.artist.create({ data: { name: "Manager Test Band", slug: "manager-test-band" } }),
    client.artist.create({ data: { name: "Foreign Manager Band", slug: "foreign-manager-band" } })
  ]);
  const operator = await client.operator.create({ data: { email: "manager-owner@test.invalid" } });
  await client.artistMembership.create({ data: { artistId: artist.id, operatorId: operator.id, role: "owner" } });
  const manager = new managerMod.ManagerService(prisma, audit, { get: () => false });
  const intake = await manager.completeIntake(artist.id, {
    profile: { bandMode: "hybrid", homeCity: "Chicago", homeRegion: "IL", homeCountry: "US", genres: ["rock"], revenueSources: [], currentAssets: [], constraints: ["Weeknight work schedules"], educationTopics: [], currency: "USD", twelveMonthAmbition: "Release an EP and book six profitable shows", communicationCadence: "weekly", decisionStyle: "guided" },
    members: [{ name: "Alex", instruments: ["guitar"], roles: ["bandleader"], active: true }]
  }, operator.email, operator.id);
  assert.equal(intake.cadence, "intake");
  assert.equal(intake.trace.priorityRanking.policyVersion, "manager_priority_v1");
  assert.equal(intake.inputFacts.knowledgeHealth.policyVersion, "manager_knowledge_v1");
  assert.ok(intake.trace.priorityRanking.today.length <= 5);
  assert.ok(await client.managerGoal.count({ where: { artistId: artist.id } }) >= 2);
  assert.equal(await client.managerGoal.count({ where: { artistId: artist.id, sourceKey: { startsWith: "manager_plan_v1:" } } }), 2);
  assert.equal(await client.managerInitiative.count({ where: { artistId: artist.id, sourceKey: { startsWith: "manager_plan_v1:" } } }), 2);
  assert.equal(await client.task.count({ where: { artistId: artist.id, sourceKey: { startsWith: "manager_plan_v1:" } } }), 6);
  const ensuredAgain = await manager.ensurePlan(artist.id, operator.email, operator.id);
  assert.deepEqual(ensuredAgain.created, { goals: 0, initiatives: 0, tasks: 0 });
  assert.equal(ensuredAgain.goals.length, 2);
  assert.equal(await client.task.count({ where: { artistId: artist.id, sourceKey: { startsWith: "manager_plan_v1:" } } }), 6);
  assert.equal(await client.managerMemoryFact.count({ where: { artistId: artist.id, sourceType: "operating_profile" } }), 4);
  assert.equal((await manager.knowledgeHealth(artist.id, true)).status, "healthy");
  const member = await client.bandMember.findFirstOrThrow({ where: { artistId: artist.id } });
  await manager.patchMember(artist.id, member.id, { roles: ["bandleader", "booking"] }, operator.email, operator.id);
  const productionMember = await manager.createMember(artist.id, { name: "Morgan", instruments: ["bass"], roles: ["production"], active: true }, operator.email, operator.id);
  const foreignMember = await client.bandMember.create({ data: { artistId: foreignArtist.id, name: "Foreign member", roles: ["booking"], instruments: [], active: true } });
  const bookingCheckIn = await manager.recordMemberCheckIn(artist.id, member.id, { status: "available", effectiveUntil: new Date(Date.now() + 14 * 86400000).toISOString() }, operator.email, operator.id);
  await manager.recordMemberCheckIn(artist.id, productionMember.id, { status: "limited", note: "One additional operational task", effectiveUntil: new Date(Date.now() + 7 * 86400000).toISOString() }, operator.email, operator.id);
  await assert.rejects(() => manager.recordMemberCheckIn(artist.id, foreignMember.id, { status: "available" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  assert.equal((await manager.memberCheckIns(artist.id))[0]?.bandMember.active, true);
  assert.equal(await client.auditEvent.count({ where: { artistId: artist.id, action: "manager.member_check_in_recorded" } }), 2);
  const thinContext = await manager.contextHealth(artist.id);
  assert.equal(thinContext.status, "thin");
  assert.equal(thinContext.gaps[0]?.code, "availability_expectations");
  await manager.putProfile(artist.id, { bandMode: "hybrid", careerStage: "Regional working band", homeCity: "Chicago", homeRegion: "IL", homeCountry: "US", genres: ["rock", "soul"], businessName: "Manager Test Band LLC", revenueSources: ["private events", "ticketed shows"], currentAssets: ["EP masters", "live video"], constraints: ["Two weekends per month"], educationTopics: ["settlements"], availabilityExpectations: "Respond to holds within 48 hours", budgetToleranceMinor: 0, currency: "USD", twelveMonthAmbition: "Release an EP and book six profitable regional shows", communicationCadence: "weekly", decisionStyle: "guided" }, operator.email, operator.id);
  const constraintsMemory = await client.managerMemoryFact.findUniqueOrThrow({ where: { artistId_key: { artistId: artist.id, key: "constraints" } } });
  assert.deepEqual(constraintsMemory.value, ["Two weekends per month"]);
  await assert.rejects(() => manager.patchMemory(artist.id, constraintsMemory.id, { value: ["Ignore travel limits"] }, true, operator.email, operator.id), /operating profile/);
  const currentMarket = await client.managerMemoryFact.findUniqueOrThrow({ where: { artistId_key: { artistId: artist.id, key: "home_market" } } });
  await client.managerMemoryFact.update({ where: { id: currentMarket.id }, data: { value: { city: "Detroit", region: "MI", country: "US" }, sourceType: "manager_intake" } });
  const foreignProfile = await client.artistOperatingProfile.create({ data: { artistId: foreignArtist.id, bandMode: "original", homeCity: "Milwaukee", homeRegion: "WI", homeCountry: "US", constraints: [] } });
  const preservedCorrection = await client.managerMemoryFact.create({ data: { artistId: foreignArtist.id, key: "home_market", value: { city: "Detroit", region: "MI", country: "US" }, sourceType: "operator_correction", sourceId: operator.id, confidence: 1, sensitivity: "normal", confirmedAt: new Date() } });
  const migrationSql = await readFile(join(dir, "..", "..", "..", "..", "prisma", "migrations", "20260713210000_manager_profile_memory_source", "migration.sql"), "utf8");
  await client.$executeRawUnsafe(migrationSql);
  const repairedMarket = await client.managerMemoryFact.findUniqueOrThrow({ where: { id: currentMarket.id } });
  assert.deepEqual(repairedMarket.value, { city: "Chicago", region: "IL", country: "US" });
  assert.equal(repairedMarket.sourceType, "operating_profile");
  const stillCorrected = await client.managerMemoryFact.findUniqueOrThrow({ where: { id: preservedCorrection.id } });
  assert.deepEqual(stillCorrected.value, { city: "Detroit", region: "MI", country: "US" });
  assert.equal(stillCorrected.sourceType, "operator_correction");
  assert.equal(stillCorrected.sourceId, operator.id);
  assert.equal(foreignProfile.id, (await client.artistOperatingProfile.findUniqueOrThrow({ where: { artistId: foreignArtist.id } })).id);
  assert.equal((await manager.knowledgeHealth(artist.id, true)).status, "healthy");
  const strongContext = await manager.contextHealth(artist.id);
  assert.equal(strongContext.status, "strong");
  assert.equal(strongContext.score, 82);
  assert.equal(strongContext.gaps.some((gap) => gap.code === "budget_tolerance"), false);
  const teammateOperator = await client.operator.create({ data: { email: "manager-member@test.invalid" } });
  await client.artistMembership.create({ data: { artistId: artist.id, operatorId: teammateOperator.id, role: "member" } });
  await manager.updateSettings(artist.id, { scheduleEnabled: true, scheduledAiEnabled: false, scheduleAudience: "owners", timezone: "America/Chicago", dailyHour: 9, weeklyDay: 1 }, operator.email, operator.id);
  const scheduledAt = new Date("2026-07-14T15:00:00.000Z");
  const concurrentScheduleScans = await Promise.all([manager.runScheduledBriefScan(scheduledAt), manager.runScheduledBriefScan(scheduledAt)]);
  assert.equal(concurrentScheduleScans.reduce((total, scan) => total + scan.generated, 0), 1);
  const firstScheduleScan = concurrentScheduleScans.find((scan) => scan.generated === 1);
  assert.ok(firstScheduleScan);
  assert.equal(firstScheduleScan.runs[0]?.artistId, artist.id);
  assert.equal(firstScheduleScan.runs[0]?.cadence, "weekly");
  const scheduledRun = await client.managerRun.findUniqueOrThrow({ where: { id: firstScheduleScan.runs[0].runId } });
  assert.equal(scheduledRun.mode, "deterministic");
  assert.equal(scheduledRun.trace.priorityRanking.policyVersion, "manager_priority_v1");
  assert.match(scheduledRun.scheduleKey ?? "", new RegExp(`^${artist.id}:weekly:2026-W\\d{2}$`));
  const briefNotification = await client.workflowNotification.findFirstOrThrow({ where: { artistId: artist.id, recipientOperatorId: operator.id, kind: "manager_brief_ready" } });
  assert.equal(briefNotification.metadata.href, "/manager");
  assert.equal(briefNotification.metadata.managerRunId, scheduledRun.id);
  assert.equal(await client.workflowNotification.count({ where: { artistId: artist.id, recipientOperatorId: teammateOperator.id, kind: "manager_brief_ready" } }), 0);
  const repeatedScheduleScan = await manager.runScheduledBriefScan(new Date("2026-07-14T16:00:00.000Z"));
  assert.equal(repeatedScheduleScan.generated, 0);
  assert.equal(await client.managerRun.count({ where: { scheduleKey: scheduledRun.scheduleKey } }), 1);
  assert.equal(await client.workflowNotification.count({ where: { artistId: artist.id, kind: "manager_brief_ready" } }), 1);
  await manager.updateSettings(artist.id, { scheduleAudience: "team" }, operator.email, operator.id);
  const nextWeekSchedule = await manager.runScheduledBriefScan(new Date("2026-07-21T15:00:00.000Z"));
  assert.equal(nextWeekSchedule.generated, 1);
  assert.equal(await client.workflowNotification.count({ where: { artistId: artist.id, recipientOperatorId: teammateOperator.id, kind: "manager_brief_ready" } }), 1);
  assert.equal(await client.workflowNotification.count({ where: { artistId: artist.id, kind: "manager_brief_ready" } }), 3);
  const foreignContext = await manager.contextHealth(foreignArtist.id);
  assert.equal(foreignContext.evidenceIds.includes(member.id), false);
  const rememberedAmbition = (await manager.memory(artist.id)).find((fact) => fact.key === "twelve_month_ambition");
  assert.ok(rememberedAmbition);
  await manager.putProfile(artist.id, { bandMode: "hybrid", twelveMonthAmbition: "Release an EP before the regional run" }, operator.email, operator.id);
  const correctedMemory = await client.managerMemoryFact.findUniqueOrThrow({ where: { id: rememberedAmbition.id } });
  assert.equal(correctedMemory.value, "Release an EP before the regional run");
  assert.equal(correctedMemory.sourceType, "operating_profile");
  await assert.rejects(() => manager.patchMemory(foreignArtist.id, rememberedAmbition.id, { confirmed: true }, true, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  await client.managerMemoryFact.createMany({ data: [
    { artistId: artist.id, key: "private_budget_note", value: "Do not discuss outside the band", sourceType: "owner", sensitivity: "sensitive", confirmedAt: new Date() },
    { artistId: artist.id, key: "restricted_health_note", value: "Never send to a model", sourceType: "owner", sensitivity: "restricted", confirmedAt: new Date() }
  ] });
  const privacyRun = await manager.generateBrief(artist.id, "daily", operator.email, operator.id);
  assert.ok(Array.isArray(privacyRun.inputFacts.memoryFacts));
  assert.equal(privacyRun.inputFacts.memoryFacts.every((fact) => fact.sensitivity === "normal"), true);
  assert.equal(privacyRun.inputFacts.memoryFacts.some((fact) => fact.key === "private_budget_note" || fact.key === "restricted_health_note"), false);
  assert.equal(privacyRun.trace.providerContext.mode, "disabled");
  assert.equal(privacyRun.trace.providerContext.attempted, false);
  assert.equal(privacyRun.trace.providerContext.memory.restricted, 1);
  const providerPolicy = await manager.providerContextPolicy(artist.id);
  assert.equal(providerPolicy.mode, "disabled");
  assert.equal(providerPolicy.memory.sensitive, 1);
  assert.equal(providerPolicy.memory.restricted, 1);
  assert.equal(providerPolicy.memory.included, 0);

  const memoryChat = await manager.chat(artist.id, { message: "Remember that Morgan handles production advances" }, operator.email, operator.id);
  assert.equal(memoryChat.recommendation?.proposedAction?.type, "remember_fact");
  assert.equal(memoryChat.recommendation?.proposedAction?.value, "Morgan handles production advances");
  assert.equal(memoryChat.message.proposedActions[0]?.preview, "Morgan handles production advances");
  const whyMemoryChat = await manager.chat(artist.id, { conversationId: memoryChat.conversationId, message: "Why that?" }, operator.email, operator.id);
  assert.match(whyMemoryChat.message.content, /recorded reason/i);
  assert.match(whyMemoryChat.message.content, /explicitly asked StoryBoard to remember/i);
  assert.equal(whyMemoryChat.recommendation, null);
  const whyMemoryRun = await client.managerRun.findUniqueOrThrow({ where: { id: whyMemoryChat.message.managerRunId } });
  assert.equal(whyMemoryRun.trace.conversationContinuity.policyVersion, "manager_conversation_continuity_v1");
  assert.equal(whyMemoryRun.trace.conversationContinuity.status, "resolved");
  assert.equal(whyMemoryRun.trace.conversationContinuity.intent, "explain");
  assert.equal(whyMemoryRun.trace.conversationContinuity.recommendationId, memoryChat.recommendation.id);
  assert.equal(whyMemoryRun.trace.conversationContinuity.providerBypassed, true);
  const acceptedMemory = await manager.recommendation(artist.id, memoryChat.recommendation.id, "accepted", {}, operator.email, operator.id);
  assert.equal(acceptedMemory.outcome, "completed");
  assert.ok(acceptedMemory.memoryFactId);
  const confirmedMemory = await client.managerMemoryFact.findUniqueOrThrow({ where: { id: acceptedMemory.memoryFactId } });
  assert.equal(confirmedMemory.artistId, artist.id);
  assert.equal(confirmedMemory.value, "Morgan handles production advances");
  assert.equal(confirmedMemory.sourceType, "operator_confirmation");
  assert.equal(confirmedMemory.sensitivity, "normal");
  await assert.rejects(() => manager.recommendation(artist.id, memoryChat.recommendation.id, "accepted", {}, operator.email, operator.id), /already been decided/);
  await assert.rejects(() => manager.recommendation(foreignArtist.id, memoryChat.recommendation.id, "accepted", {}, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  assert.equal(await client.auditEvent.count({ where: { artistId: artist.id, aggregateId: confirmedMemory.id, action: "manager.memory_confirmed" } }), 1);

  const trackedGoal = await client.managerGoal.findFirstOrThrow({ where: { artistId: artist.id, status: "active" } });
  await manager.patchGoal(artist.id, trackedGoal.id, { targetValue: 6, currentValue: 0 }, operator.email, operator.id);
  const initiative = await manager.createInitiative(artist.id, { goalId: trackedGoal.id, workstream: trackedGoal.workstream, title: "Measured sprint", status: "active" }, operator.email, operator.id);
  await client.task.create({ data: { artistId: artist.id, initiativeId: initiative.id, title: "Advance measured sprint", status: "in_progress", dueAt: new Date(Date.now() + 7 * 86400000) } });
  const progress = await manager.recordGoalProgress(artist.id, trackedGoal.id, { delta: 1, note: "First measurable result" }, operator.email, operator.id);
  assert.equal(progress.previousValue, 0);
  assert.equal(progress.value, 1);
  assert.equal((await manager.planHealth(artist.id)).goals.find((goal) => goal.goalId === trackedGoal.id)?.progressRatio, 1 / 6);
  await assert.rejects(() => manager.recordGoalProgress(foreignArtist.id, trackedGoal.id, { value: 2 }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);

  const capGoal = await manager.createGoal(artist.id, { workstream: "business", title: "Keep release spend under budget", targetValue: 2000, targetUnit: "USD", currentValue: 1500, targetDirection: "at_most", measurementKind: "manual", deadline: new Date(Date.now() + 90 * 86400000).toISOString(), status: "active" }, operator.email, operator.id);
  const capInitiative = await manager.createInitiative(artist.id, { goalId: capGoal.id, workstream: "business", title: "Track release spend", status: "active", dueAt: new Date(Date.now() + 85 * 86400000).toISOString() }, operator.email, operator.id);
  await client.task.create({ data: { artistId: artist.id, initiativeId: capInitiative.id, title: "Reconcile release expenses", ownerLabel: productionMember.name, dueAt: new Date(Date.now() + 7 * 86400000) } });
  const storedCap = await client.managerGoal.findUniqueOrThrow({ where: { id: capGoal.id } });
  assert.equal(storedCap.targetDirection, "at_most");
  const capHealth = (await manager.planHealth(artist.id)).goals.find((goal) => goal.goalId === capGoal.id);
  assert.equal(capHealth?.target.state, "met");
  assert.equal(capHealth?.target.finality, "provisional");
  assert.equal(capHealth?.progressRatio, null);
  const capPath = (await manager.goalPaths(artist.id)).goals.find((goal) => goal.goalId === capGoal.id);
  assert.equal(capPath?.status, "target_monitoring");
  const capChat = await manager.chat(artist.id, { message: "Are we on track with Keep release spend under budget?" }, operator.email, operator.id);
  assert.match(capChat.message.content, /final result is not known before the deadline/i);
  assert.equal(capChat.recommendation, null);
  const capChatRun = await client.managerRun.findUniqueOrThrow({ where: { id: capChat.message.managerRunId } });
  assert.equal(capChatRun.trace.goalTarget.providerBypassed, true);
  await assert.rejects(() => manager.patchGoal(foreignArtist.id, capGoal.id, { targetDirection: "exact" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);

  const measuredGoal = await manager.createGoal(artist.id, { workstream: "live", title: "Play one confirmed show", targetValue: 1, targetUnit: "confirmed gig", currentValue: 0, measurementKind: "confirmed_gigs", deadline: new Date(Date.now() + 90 * 86400000).toISOString(), status: "active" }, operator.email, operator.id);
  const measuredEvent = await client.bandEvent.create({ data: { artistId: artist.id, type: "gig", status: "confirmed", title: "Measured goal show", startsAt: new Date(Date.now() + 30 * 86400000) } });
  const measured = (await manager.goalMeasurements(artist.id)).find((measurement) => measurement.goalId === measuredGoal.id);
  assert.equal(measured?.status, "records_ahead");
  assert.equal(measured?.observedValue, 1);
  assert.ok(measured?.evidenceIds.includes(measuredEvent.id));
  const synchronized = await manager.syncGoalProgress(artist.id, measuredGoal.id, { observedValue: 1 }, operator.email, operator.id);
  assert.equal(synchronized.measurement.status, "in_sync");
  assert.equal(synchronized.progressEvent.sourceType, "manager_goal_measurement_v1");
  assert.equal((await manager.syncGoalProgress(artist.id, measuredGoal.id, { observedValue: 1 }, operator.email, operator.id)).progressEvent, null);
  assert.equal(await client.managerGoalProgressEvent.count({ where: { artistId: artist.id, goalId: measuredGoal.id, sourceType: "manager_goal_measurement_v1" } }), 1);
  assert.equal(await client.auditEvent.count({ where: { artistId: artist.id, aggregateId: measuredGoal.id, action: "manager.goal_progress_synced" } }), 1);
  await assert.rejects(() => manager.syncGoalProgress(foreignArtist.id, measuredGoal.id, { observedValue: 1 }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);

  const actionGoal = await manager.createGoal(artist.id, { workstream: "content", title: "Ship one measured campaign", targetValue: 1, targetUnit: "campaign", currentValue: 0, measurementKind: "manual", deadline: new Date(Date.now() + 60 * 86400000).toISOString(), status: "active" }, operator.email, operator.id);
  const actionInitiative = await manager.createInitiative(artist.id, { goalId: actionGoal.id, workstream: "content", title: "Build the measured campaign", status: "active", dueAt: new Date(Date.now() + 45 * 86400000).toISOString() }, operator.email, operator.id);
  const actionBrief = await manager.generateBrief(artist.id, "daily", operator.email, operator.id);
  const actionable = actionBrief.recommendations.find((recommendation) => recommendation.proposedAction?.type === "create_task" && recommendation.proposedAction.initiativeId === actionInitiative.id);
  assert.ok(actionable);
  const acceptedRecommendation = await manager.recommendation(artist.id, actionable.id, "accepted", {}, operator.email, operator.id);
  assert.ok(acceptedRecommendation.taskId);
  assert.equal((await client.task.findUniqueOrThrow({ where: { id: acceptedRecommendation.taskId } })).initiativeId, actionInitiative.id);
  const taskService = new tasksMod.TasksService(prisma, audit);
  await taskService.patch(artist.id, acceptedRecommendation.taskId, { status: "done" }, operator.email, operator.id);
  const completedRecommendation = await client.managerRecommendation.findUniqueOrThrow({ where: { id: actionable.id } });
  assert.equal(completedRecommendation.outcome, "completed");
  assert.equal(completedRecommendation.outcomeReason, "task_completed");
  const staleGoal = await manager.createGoal(artist.id, { workstream: "audience", title: "Test a second audience loop", targetValue: 1, targetUnit: "experiment", currentValue: 0, measurementKind: "manual", deadline: new Date(Date.now() + 75 * 86400000).toISOString(), status: "active" }, operator.email, operator.id);
  const staleInitiative = await manager.createInitiative(artist.id, { goalId: staleGoal.id, workstream: "audience", title: "Second audience loop", status: "active", dueAt: new Date(Date.now() + 60 * 86400000).toISOString() }, operator.email, operator.id);
  const staleBrief = await manager.generateBrief(artist.id, "daily", operator.email, operator.id);
  const staleRecommendation = staleBrief.recommendations.find((recommendation) => recommendation.proposedAction?.type === "create_task" && recommendation.proposedAction.initiativeId === staleInitiative.id);
  assert.ok(staleRecommendation);
  await client.task.create({ data: { artistId: artist.id, initiativeId: staleInitiative.id, title: "A teammate already added the next audience task" } });
  await assert.rejects(() => manager.recommendation(artist.id, staleRecommendation.id, "accepted", {}, operator.email, operator.id), /goal path changed/i);
  assert.equal((await client.managerRecommendation.findUniqueOrThrow({ where: { id: staleRecommendation.id } })).outcome, "suggested");
  assert.equal(await client.task.count({ where: { artistId: artist.id, initiativeId: staleInitiative.id } }), 1);
  const directionGoal = await manager.createGoal(artist.id, { workstream: "business", title: "Cap showcase spend", targetValue: 1000, targetUnit: "USD", currentValue: 1200, targetDirection: "at_most", measurementKind: "manual", deadline: new Date(Date.now() + 75 * 86400000).toISOString(), status: "active" }, operator.email, operator.id);
  const directionInitiative = await manager.createInitiative(artist.id, { goalId: directionGoal.id, workstream: "business", title: "Control showcase costs", status: "active", dueAt: new Date(Date.now() + 60 * 86400000).toISOString() }, operator.email, operator.id);
  assert.equal((await manager.goalPaths(artist.id)).goals.find((goal) => goal.goalId === directionGoal.id)?.status, "missing_task");
  const directionRun = await client.managerRun.create({ data: { artistId: artist.id, cadence: "daily", mode: "deterministic", promptVersion: "manager_os_v22", inputFacts: {}, output: {}, trace: {}, recommendations: { create: { stableKey: `goal-path-${directionGoal.id}-missing_task`, workstream: "business", title: "Add the next cost-control step", reason: "The initiative has no task", nextAction: "Create one linked task", priority: "med", evidence: [directionGoal.id, directionInitiative.id], proposedAction: { type: "create_task", title: "Review showcase expenses", dueAt: new Date(Date.now() + 7 * 86400000).toISOString(), initiativeId: directionInitiative.id } } } }, include: { recommendations: true } });
  await manager.patchGoal(artist.id, directionGoal.id, { currentValue: 900 }, operator.email, operator.id);
  const adjustedDirectionGoal = await client.managerGoal.findUniqueOrThrow({ where: { id: directionGoal.id } });
  assert.equal(adjustedDirectionGoal.status, "active");
  assert.equal(adjustedDirectionGoal.targetDirection, "at_most");
  await assert.rejects(() => manager.recommendation(artist.id, directionRun.recommendations[0].id, "accepted", {}, operator.email, operator.id), /goal path changed/i);
  assert.equal((await client.managerRecommendation.findUniqueOrThrow({ where: { id: directionRun.recommendations[0].id } })).outcome, "suggested");
  assert.equal(await client.task.count({ where: { artistId: artist.id, initiativeId: directionInitiative.id } }), 0);
  await assert.rejects(() => taskService.create(artist.id, { title: "Cross-tenant owner", bandMemberId: foreignMember.id }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  assert.equal(await client.task.count({ where: { artistId: artist.id, title: "Cross-tenant owner" } }), 0);
  const linkedTask = await taskService.create(artist.id, { title: "Confirm rehearsal schedule", bandMemberId: productionMember.id }, operator.email, operator.id);
  assert.equal(linkedTask.bandMemberId, productionMember.id);
  assert.equal(linkedTask.ownerLabel, productionMember.name);
  const unlinkedTask = await taskService.patch(artist.id, linkedTask.id, { bandMemberId: null }, operator.email, operator.id);
  assert.equal(unlinkedTask.bandMemberId, null);
  assert.equal(unlinkedTask.ownerLabel, null);
  const assignmentTask = await taskService.create(artist.id, { title: "Send the venue follow-up", ownerLabel: "Manager recommendation", dueAt: new Date(Date.now() + 86400000).toISOString() }, operator.email, operator.id);
  const teamSnapshot = await manager.teamLoad(artist.id);
  const teamSuggestion = teamSnapshot.suggestions.find((suggestion) => suggestion.taskId === assignmentTask.id);
  assert.equal(teamSuggestion?.memberId, member.id);
  const assignmentChat = await manager.chat(artist.id, { message: "Who should own the unassigned work?" }, operator.email, operator.id);
  assert.equal(assignmentChat.recommendation?.proposedAction?.type, "assign_task");
  assert.equal(assignmentChat.recommendation?.proposedAction?.taskId, assignmentTask.id);
  assert.equal(assignmentChat.recommendation?.proposedAction?.bandMemberId, member.id);
  assert.equal(assignmentChat.recommendation?.proposedAction?.checkInId, bookingCheckIn.id);
  assert.equal(assignmentChat.recommendation?.proposedAction?.availability, "available");
  assert.match(assignmentChat.message.content, /current voluntary check-ins/i);
  await assert.rejects(() => manager.recommendation(foreignArtist.id, assignmentChat.recommendation.id, "accepted", {}, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  await manager.recordMemberCheckIn(artist.id, member.id, { status: "unavailable", effectiveUntil: new Date(Date.now() + 86400000).toISOString() }, operator.email, operator.id);
  await assert.rejects(() => manager.recommendation(artist.id, assignmentChat.recommendation.id, "accepted", {}, operator.email, operator.id), /availability changed|unavailable/i);
  const refreshedCheckIn = await manager.recordMemberCheckIn(artist.id, member.id, { status: "available", effectiveUntil: new Date(Date.now() + 14 * 86400000).toISOString() }, operator.email, operator.id);
  const refreshedAssignmentChat = await manager.chat(artist.id, { message: "Who should own the unassigned work?" }, operator.email, operator.id);
  assert.equal(refreshedAssignmentChat.recommendation?.proposedAction?.checkInId, refreshedCheckIn.id);
  const acceptedAssignment = await manager.recommendation(artist.id, refreshedAssignmentChat.recommendation.id, "accepted", {}, operator.email, operator.id);
  assert.equal(acceptedAssignment.outcome, "completed");
  const assignedTask = await client.task.findUniqueOrThrow({ where: { id: assignmentTask.id } });
  assert.equal(assignedTask.bandMemberId, member.id);
  assert.equal(assignedTask.ownerLabel, member.name);
  assert.equal(await client.auditEvent.count({ where: { artistId: artist.id, aggregateId: assignmentTask.id, action: "task.assigned" } }), 1);
  await assert.rejects(() => manager.recommendation(artist.id, refreshedAssignmentChat.recommendation.id, "accepted", {}, operator.email, operator.id), /already been decided/);
  const commitmentTask = await taskService.create(artist.id, { title: "Confirm integration stage dimensions", ownerLabel: member.name, dueAt: new Date(Date.now() + 2 * 86400000).toISOString() }, operator.email, operator.id);
  await assert.rejects(() => taskService.patch(artist.id, commitmentTask.id, { status: "blocked" }, operator.email, operator.id), /requires a reason/);
  await assert.rejects(() => taskService.patch(foreignArtist.id, commitmentTask.id, { ownerLabel: "Foreign owner" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  const blockedCommitment = await taskService.patch(artist.id, commitmentTask.id, { status: "blocked", blockedReason: "Promoter has not supplied the stage plot", waitingOn: "Promoter", dueAt: new Date(Date.now() + 4 * 86400000).toISOString() }, operator.email, operator.id);
  assert.equal(blockedCommitment.deferralCount, 1);
  const deferredCommitment = await taskService.patch(artist.id, commitmentTask.id, { dueAt: new Date(Date.now() + 6 * 86400000).toISOString() }, operator.email, operator.id);
  assert.equal(deferredCommitment.deferralCount, 2);
  const commitmentSnapshot = await manager.commitmentHealth(artist.id);
  assert.equal(commitmentSnapshot.items[0].taskId, commitmentTask.id);
  assert.equal(commitmentSnapshot.items[0].state, "blocked");
  assert.equal(commitmentSnapshot.counts.repeatedlyDeferred, 1);
  const commitmentChat = await manager.chat(artist.id, { message: "What is blocked or slipping?" }, operator.email, operator.id);
  assert.match(commitmentChat.message.content, /Promoter has not supplied the stage plot/);
  assert.ok(commitmentChat.message.citations.includes(commitmentTask.id));
  const resumedCommitment = await taskService.patch(artist.id, commitmentTask.id, { status: "in_progress", waitingOn: null }, operator.email, operator.id);
  assert.equal(resumedCommitment.blockedReason, null);
  assert.equal(resumedCommitment.waitingOn, null);
  assert.equal(await client.auditEvent.count({ where: { artistId: artist.id, aggregateId: commitmentTask.id, action: "task.updated" } }), 3);
  const dismissible = intake.recommendations.find((recommendation) => recommendation.id !== actionable.id);
  if (dismissible) await manager.recommendation(artist.id, dismissible.id, "dismissed", { reason: "wrong_priority", note: "Release work comes first" }, operator.email, operator.id);
  const refreshedBrief = await manager.generateBrief(artist.id, "daily", operator.email, operator.id);
  assert.equal(refreshedBrief.recommendations.some((recommendation) => recommendation.stableKey === actionable.stableKey), false);
  const learning = await manager.learningSummary(artist.id);
  assert.equal(learning.completed, 3);
  if (dismissible) assert.equal(learning.dismissalReasons[0]?.reason, "wrong_priority");
  const evalExample = await manager.promoteEvalExample(artist.id, actionable.id, { label: "useful", notes: "Task was completed" }, operator.email, operator.id);
  const revisedEvalExample = await manager.promoteEvalExample(artist.id, actionable.id, { label: "needs_revision", notes: "Keep the action, improve the explanation" }, operator.email, operator.id);
  assert.equal(revisedEvalExample.id, evalExample.id);
  assert.equal(await client.managerEvalExample.count({ where: { artistId: artist.id } }), 1);
  assert.equal(Object.hasOwn(revisedEvalExample.snapshot, "inputFacts"), false);
  const blockedEvaluation = await manager.runEvaluation(artist.id, "manager_os_v22", operator.email, operator.id);
  assert.equal(blockedEvaluation.passed, false);
  await manager.promoteEvalExample(artist.id, actionable.id, { label: "useful", notes: "Task was completed" }, operator.email, operator.id);
  const passingEvaluation = await manager.runEvaluation(artist.id, "manager_os_v22", operator.email, operator.id);
  assert.equal(passingEvaluation.passed, true);
  assert.equal(await client.managerEvaluationRun.count({ where: { artistId: artist.id } }), 2);
  await assert.rejects(() => manager.promoteEvalExample(foreignArtist.id, actionable.id, { label: "useful" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);

  const decisionChat = await manager.chat(artist.id, { message: "Should we book Milwaukee or Detroit?" }, operator.email, operator.id);
  assert.equal(decisionChat.recommendation?.proposedAction?.type, "create_decision");
  const acceptedDecisionRecommendation = await manager.recommendation(artist.id, decisionChat.recommendation.id, "accepted", {}, operator.email, operator.id);
  assert.ok(acceptedDecisionRecommendation.decisionId);
  assert.equal(acceptedDecisionRecommendation.taskId, null);
  const conversationDecision = await client.managerDecision.findUniqueOrThrow({ where: { id: acceptedDecisionRecommendation.decisionId } });
  assert.equal(conversationDecision.artistId, artist.id);
  assert.equal(conversationDecision.needsFraming, true);
  assert.equal(conversationDecision.choice, null);
  await assert.rejects(() => manager.patchDecision(foreignArtist.id, conversationDecision.id, { options: [{ label: "Milwaukee", tradeoff: "Closer" }, { label: "Detroit", tradeoff: "Stronger fit" }] }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  await assert.rejects(() => manager.patchDecision(artist.id, conversationDecision.id, { choice: "Milwaukee", rationale: "Closer", expectedOutcome: "Draw 75 people", reviewAt: "2026-08-15T12:00:00.000Z" }, operator.email, operator.id), /Review and save/);
  const framedConversationDecision = await manager.patchDecision(artist.id, conversationDecision.id, { title: "Which regional market should get the next booking sprint?", context: "The band has one open travel weekend.", options: [{ label: "Milwaukee", tradeoff: "Lower travel cost and a smaller venue list" }, { label: "Detroit", tradeoff: "Higher travel cost and a stronger genre fit" }] }, operator.email, operator.id);
  assert.equal(framedConversationDecision.needsFraming, false);
  await manager.patchDecision(artist.id, conversationDecision.id, { choice: "Milwaukee", rationale: "The date fits the lineup's work schedules", expectedOutcome: "Draw at least 75 people and earn a return invitation", reviewAt: "2026-08-15T12:00:00.000Z" }, operator.email, operator.id);
  await manager.reviewDecision(artist.id, conversationDecision.id, { outcome: "mixed", note: "Attendance reached 80, but the return invitation is still unknown", evidence: [] }, operator.email, operator.id);
  const completedDecisionRecommendation = await client.managerRecommendation.findUniqueOrThrow({ where: { id: decisionChat.recommendation.id } });
  assert.equal(completedDecisionRecommendation.outcome, "completed");
  assert.equal(completedDecisionRecommendation.outcomeReason, "decision_reviewed");
  assert.equal(await client.auditEvent.count({ where: { artistId: artist.id, aggregateId: conversationDecision.id, action: "manager.decision_draft_created" } }), 1);

  const decision = await manager.createDecision(artist.id, { workstream: "live", title: "Which nearby market should get the next sprint?", context: "The band has one open weekend", options: [{ label: "Milwaukee", tradeoff: "Lower travel cost and a smaller venue list" }, { label: "Detroit", tradeoff: "Higher travel cost and a stronger genre fit" }], evidence: [] }, operator.email, operator.id);
  await assert.rejects(() => manager.patchDecision(foreignArtist.id, decision.id, { choice: "Milwaukee", rationale: "Closer", expectedOutcome: "Draw 75 people", reviewAt: "2026-08-15T12:00:00.000Z" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  const decided = await manager.patchDecision(artist.id, decision.id, { choice: "Milwaukee", rationale: "The date fits the lineup's work schedules", expectedOutcome: "Draw at least 75 people and earn a return invitation", reviewAt: "2026-08-15T12:00:00.000Z" }, operator.email, operator.id);
  assert.equal(decided.status, "decided");
  const reviewed = await manager.reviewDecision(artist.id, decision.id, { outcome: "mixed", note: "Attendance reached 80, but the return invitation is still unknown", evidence: [] }, operator.email, operator.id);
  assert.equal(reviewed.status, "reviewed");
  assert.equal(reviewed.choice, "Milwaukee");
  assert.equal(reviewed.reviewOutcome, "mixed");
  await assert.rejects(() => manager.reviewDecision(artist.id, decision.id, { outcome: "worked", note: "Rewrite the result", evidence: [] }, operator.email, operator.id), /already been reviewed/);
  assert.equal(await client.auditEvent.count({ where: { artistId: artist.id, aggregateId: decision.id, action: "manager.decision_reviewed" } }), 1);

  const firstChat = await manager.chat(artist.id, { message: "What should we focus on this week?" }, operator.email, operator.id);
  const secondChat = await manager.chat(artist.id, { conversationId: firstChat.conversationId, message: "And what about our next show?" }, operator.email, operator.id);
  assert.equal(secondChat.conversationId, firstChat.conversationId);
  assert.ok(firstChat.message.managerRunId);
  const responseReviewQueue = await manager.responseReview(artist.id, operator.id, 3);
  assert.equal(responseReviewQueue.policyVersion, "manager_response_review_v1");
  assert.equal(responseReviewQueue.items.filter((item) => item.conversationId === firstChat.conversationId).length, 1);
  assert.equal(responseReviewQueue.items.find((item) => item.conversationId === firstChat.conversationId)?.messageId, secondChat.message.id);
  assert.equal(responseReviewQueue.items.find((item) => item.messageId === secondChat.message.id)?.question, "And what about our next show?");
  await manager.messageFeedback(artist.id, secondChat.message.id, { helpful: true }, operator.email, operator.id);
  const refilledResponseReview = await manager.responseReview(artist.id, operator.id, 3);
  assert.equal(refilledResponseReview.items.find((item) => item.conversationId === firstChat.conversationId)?.messageId, firstChat.message.id);
  assert.equal((await manager.responseReview(foreignArtist.id, operator.id, 3)).items.some((item) => [firstChat.message.id, secondChat.message.id].includes(item.messageId)), false);
  const responseEvalReviewQueue = await manager.responseEvalReview(artist.id, operator.id, 3);
  assert.equal(responseEvalReviewQueue.policyVersion, "manager_response_eval_review_v1");
  assert.equal(responseEvalReviewQueue.items.find((item) => item.conversationId === firstChat.conversationId)?.messageId, secondChat.message.id);
  assert.equal(responseEvalReviewQueue.items.find((item) => item.messageId === secondChat.message.id)?.feedback.helpful, true);
  const secondResponseEval = await manager.promoteResponseEvalExample(artist.id, secondChat.message.id, { label: "useful" }, operator.email, operator.id);
  assert.equal(secondResponseEval.label, "useful");
  assert.equal((await manager.responseEvalReview(artist.id, operator.id, 3)).items.some((item) => item.messageId === secondChat.message.id), false);
  assert.equal((await manager.responseEvalReview(foreignArtist.id, operator.id, 3)).items.some((item) => [firstChat.message.id, secondChat.message.id].includes(item.messageId)), false);
  const negativeFeedback = await manager.messageFeedback(artist.id, firstChat.message.id, { helpful: false, reason: "too_vague", note: "Name the exact first step" }, operator.email, operator.id);
  assert.equal(negativeFeedback.helpful, false);
  const negativeEvalReview = await manager.responseEvalReview(artist.id, operator.id, 3);
  assert.equal(negativeEvalReview.items.find((item) => item.messageId === firstChat.message.id)?.feedback.reason, "too_vague");
  const responseEval = await manager.promoteResponseEvalExample(artist.id, firstChat.message.id, { label: "needs_revision", expectedBehavior: "Answer the exact question first and name the recorded next step." }, operator.email, operator.id);
  assert.equal(responseEval.label, "needs_revision");
  assert.equal(responseEval.snapshot.question, "What should we focus on this week?");
  assert.equal(Object.hasOwn(responseEval.snapshot, "inputFacts"), false);
  assert.equal((await manager.runEvaluation(artist.id, "manager_os_v22", operator.email, operator.id)).passed, false);
  await assert.rejects(() => manager.resolveResponseEvalExample(artist.id, responseEval.id, { candidateVersion: "manager_os_v22", note: "The response behavior has been corrected." }, operator.email, operator.id), /same Manager version/);
  await assert.rejects(() => manager.promoteResponseEvalExample(foreignArtist.id, firstChat.message.id, { label: "needs_revision", expectedBehavior: "Keep the response inside the foreign workspace." }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  const revisedFeedback = await manager.messageFeedback(artist.id, firstChat.message.id, { helpful: true }, operator.email, operator.id);
  assert.equal(revisedFeedback.id, negativeFeedback.id);
  const usefulResponseEval = await manager.promoteResponseEvalExample(artist.id, firstChat.message.id, { label: "useful" }, operator.email, operator.id);
  assert.equal(usefulResponseEval.id, responseEval.id);
  assert.equal(usefulResponseEval.label, "useful");
  assert.equal(usefulResponseEval.resolvedAt, null);
  const responseEvaluation = await manager.runEvaluation(artist.id, "manager_os_v22", operator.email, operator.id);
  assert.equal(responseEvaluation.passed, true);
  assert.equal(responseEvaluation.metrics.ownerReviewedResponseCount, 2);
  assert.equal(await client.managerResponseEvalExample.count({ where: { artistId: artist.id } }), 2);
  assert.equal(await client.managerMessageFeedback.count({ where: { artistId: artist.id } }), 2);
  await assert.rejects(() => manager.messageFeedback(foreignArtist.id, firstChat.message.id, { helpful: true }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  const feedbackLearning = await manager.learningSummary(artist.id);
  assert.equal(feedbackLearning.responseFeedback.total, 2);
  assert.equal(feedbackLearning.responseFeedback.helpfulRate, 1);
  const persistedConversation = await manager.conversation(artist.id, firstChat.conversationId, operator.id);
  assert.deepEqual(persistedConversation.messages.map((message) => message.role), ["user", "assistant", "user", "assistant"]);
  assert.equal(persistedConversation.messages.find((message) => message.id === firstChat.message.id)?.feedback?.helpful, true);
  const conversationSummaries = await manager.conversations(artist.id, 10);
  assert.equal(conversationSummaries[0].id, firstChat.conversationId);
  assert.equal(conversationSummaries[0].messageCount, 4);
  assert.equal(conversationSummaries[0].messages[0].id, secondChat.message.id);
  assert.equal((await manager.conversations(artist.id, 1)).length, 1);
  assert.equal((await manager.conversations(foreignArtist.id, 10)).some((item) => item.id === firstChat.conversationId), false);
  assert.equal(await client.managerRun.count({ where: { artistId: artist.id, cadence: "conversational" } }), 9);
  await assert.rejects(() => manager.conversation(foreignArtist.id, firstChat.conversationId, operator.id), (error) => error?.getStatus?.() === 404);

  const venue = await client.venue.create({ data: { artistId: artist.id, name: "Owned Room", city: "Chicago" } });
  const foreignVenue = await client.venue.create({ data: { artistId: foreignArtist.id, name: "Foreign Room", city: "Elsewhere" } });
  const booking = new bookingMod.BookingOpportunitiesService(prisma, audit);
  const opportunity = await booking.create(artist.id, { title: "Friday show", venueId: venue.id, targetDate: "2026-09-18T20:00:00.000Z" }, operator.email, operator.id);
  await booking.updateStage(artist.id, opportunity.id, "confirmed", operator.email, operator.id);
  await booking.updateStage(artist.id, opportunity.id, "confirmed", operator.email, operator.id);
  assert.equal(await client.bandEvent.count({ where: { artistId: artist.id, opportunityId: opportunity.id } }), 1);
  const event = await client.bandEvent.findUniqueOrThrow({ where: { opportunityId: opportunity.id } });

  const operations = new operationsMod.OperationsService(prisma, audit, {});
  const releaseProject = await operations.createProject(artist.id, { type: "release", status: "active", name: "Integration EP", dueAt: "2026-11-01T12:00:00.000Z", budgetMinor: 75000, currency: "USD", successMetrics: ["100 saves"], assets: [{ label: "Working folder", url: "https://example.test/ep" }] }, operator.email, operator.id);
  const projectPlanBrief = await manager.generateBrief(artist.id, "weekly", operator.email, operator.id);
  const projectPlanRecommendation = projectPlanBrief.recommendations.find((recommendation) => recommendation.proposedAction?.type === "generate_project_plan" && recommendation.proposedAction.projectId === releaseProject.id);
  assert.ok(projectPlanRecommendation);
  const generatedProjectPlan = await manager.recommendation(artist.id, projectPlanRecommendation.id, "accepted", {}, operator.email, operator.id);
  assert.equal(generatedProjectPlan.outcome, "completed");
  assert.equal(generatedProjectPlan.outcomeReason, "action_executed");
  assert.equal(await client.task.count({ where: { artistId: artist.id, projectId: releaseProject.id } }), 6);
  assert.equal((await operations.generateProjectPlan(artist.id, releaseProject.id, operator.email, operator.id)).createdCount, 0);
  const releaseReadiness = await operations.projectReadiness(artist.id, releaseProject.id, new Date("2026-07-12T12:00:00.000Z"));
  assert.equal(releaseReadiness.readiness.totalMilestones, 6);
  assert.equal(releaseReadiness.readiness.status, "at_risk");
  const firstMilestone = releaseReadiness.project.tasks[0];
  await taskService.patch(artist.id, firstMilestone.id, { ownerLabel: member.name, status: "done" }, operator.email, operator.id);
  await assert.rejects(() => taskService.create(foreignArtist.id, { title: "Cross-tenant milestone", projectId: releaseProject.id }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  await assert.rejects(() => operations.projectReadiness(foreignArtist.id, releaseProject.id), (error) => error?.getStatus?.() === 404);
  await assert.rejects(() => operations.createEvent(artist.id, { type: "gig", status: "draft", title: "Unsafe", venueId: foreignVenue.id, currency: "USD" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  const dayOfContact = await client.contact.create({ data: { artistId: artist.id, venueId: venue.id, fullName: "Sam Stage", contactKind: "promoter", email: "sam-stage@test.invalid" } });
  const song = await operations.createSong(artist.id, { title: "Ready Song", durationSeconds: 240, active: true }, operator.email, operator.id);
  const setlist = await operations.createSetlist(artist.id, { name: "Friday set", status: "active", items: [{ songId: song.id, itemType: "song" }] }, operator.email, operator.id);
  await operations.patchEvent(artist.id, event.id, {
    status: "confirmed", venueId: venue.id, contactId: dayOfContact.id, setlistId: setlist.id,
    locationName: "Owned Room", loadInAt: "2026-09-18T17:00:00.000Z",
    soundcheckAt: "2026-09-18T18:00:00.000Z", doorsAt: "2026-09-18T19:00:00.000Z",
    setAt: "2026-09-18T20:00:00.000Z", curfewAt: "2026-09-18T22:00:00.000Z",
    guaranteeMinor: 100000, depositMinor: 25000, productionNotes: "House PA and approved input list"
  }, operator.email, operator.id);
  await assert.rejects(() => operations.patchEvent(artist.id, event.id, { venueId: foreignVenue.id }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  await assert.rejects(() => operations.patchEvent(artist.id, event.id, { soundcheckAt: "2026-09-18T21:00:00.000Z" }, operator.email, operator.id), /Soundcheck must be before doors/i);
  const mealCheckpoint = await operations.createEventScheduleItem(artist.id, event.id, { title: "Band meal", startsAt: "2026-09-18T16:30:00.000Z", endsAt: "2026-09-18T16:50:00.000Z", location: "Green room", sortOrder: 10 }, operator.email, operator.id);
  const updatedCheckpoint = await operations.patchEventScheduleItem(artist.id, event.id, mealCheckpoint.id, { notes: "Dietary order confirmed" }, operator.email, operator.id);
  assert.equal(updatedCheckpoint.notes, "Dietary order confirmed");
  await assert.rejects(() => operations.createEventScheduleItem(foreignArtist.id, event.id, { title: "Foreign checkpoint", startsAt: "2026-09-18T16:00:00.000Z", sortOrder: 0 }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  const foreignSchedule = await client.eventScheduleItem.create({ data: { eventId: (await client.bandEvent.create({ data: { artistId: foreignArtist.id, type: "gig", status: "draft", title: "Foreign event", currency: "USD" } })).id, title: "Foreign item", startsAt: new Date("2026-09-18T16:00:00.000Z") } });
  await assert.rejects(() => operations.patchEventScheduleItem(artist.id, event.id, foreignSchedule.id, { title: "Unsafe edit" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  await operations.participant(artist.id, event.id, { bandMemberId: member.id, response: "available" }, operator.email, operator.id);
  await operations.participant(artist.id, event.id, { bandMemberId: productionMember.id, response: "available" }, operator.email, operator.id);
  await assert.rejects(() => operations.participant(foreignArtist.id, event.id, { bandMemberId: member.id, response: "available" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  const actionRun = await client.managerRun.create({ data: { artistId: artist.id, cadence: "daily", mode: "deterministic", promptVersion: "manager_os_v22", inputFacts: {}, output: {}, trace: {} } });
  const advanceRecommendation = await client.managerRecommendation.create({ data: { managerRunId: actionRun.id, stableKey: `advance-${event.id}`, workstream: "live", title: "Build the show advance", reason: "No advance tasks are recorded", nextAction: "Generate the existing checklist", priority: "high", evidence: [event.id], proposedAction: { type: "generate_event_advance", eventId: event.id } } });
  await assert.rejects(() => manager.recommendation(foreignArtist.id, advanceRecommendation.id, "accepted", {}, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  const advance = await manager.recommendation(artist.id, advanceRecommendation.id, "accepted", {}, operator.email, operator.id);
  assert.equal(advance.outcome, "completed");
  assert.equal(advance.outcomeReason, "action_executed");
  assert.equal(await client.task.count({ where: { artistId: artist.id, eventId: event.id, ownerLabel: "Show advance" } }), 4);
  assert.equal((await operations.generateAdvance(artist.id, event.id, operator.email, operator.id)).created.length, 0);
  const readiness = await operations.eventReadiness(artist.id, event.id, new Date("2026-09-01T12:00:00.000Z"));
  assert.equal(readiness.categories.find((category) => category.category === "people")?.score, 25);
  assert.equal(readiness.categories.find((category) => category.category === "contacts")?.score, 10);
  assert.equal(readiness.categories.find((category) => category.category === "schedule")?.score, 20);
  assert.ok(readiness.evidenceIds.includes(event.id));
  const dayOf = await operations.eventDayOf(artist.id, event.id, new Date("2026-09-18T16:00:00.000Z"));
  assert.equal(dayOf.dayOf.mode, "pre_show");
  assert.equal(dayOf.dayOf.nextCheckpoint.label, "Band meal");
  assert.equal(dayOf.dayOf.nextCheckpoint.minutesUntil, 30);
  assert.equal(dayOf.dayOf.nextCheckpoint.notes, "Dietary order confirmed");
  assert.equal(dayOf.dayOf.unresolvedAvailabilityCount, 0);
  assert.equal(dayOf.event.contactId, dayOfContact.id);
  await assert.rejects(() => operations.eventDayOf(foreignArtist.id, event.id), (error) => error?.getStatus?.() === 404);
  assert.deepEqual(await operations.removeEventScheduleItem(artist.id, event.id, mealCheckpoint.id, operator.email, operator.id), { id: mealCheckpoint.id, deleted: true });
  assert.equal((await operations.eventDayOf(artist.id, event.id, new Date("2026-09-18T16:00:00.000Z"))).dayOf.nextCheckpoint.label, "Load-in");

  const deal = await operations.createDeal(artist.id, { eventId: event.id, opportunityId: opportunity.id, status: "accepted", title: "Friday guarantee", offerAmountMinor: 100000, currency: "USD", depositMinor: 25000 }, operator.email, operator.id);
  const invoice = await operations.createInvoice(artist.id, { dealOfferId: deal.id, eventId: event.id, number: "TEST-001", recipientName: "Owned Room", currency: "USD", subtotalMinor: 100000, taxMinor: 0 }, operator.email, operator.id);
  const firstPayment = await operations.recordPayment(artist.id, invoice.id, { idempotencyKey: "test-deposit-001", amountMinor: 25000, currency: "USD", method: "check", receivedAt: "2026-08-01T12:00:00.000Z" }, operator.email, operator.id);
  const replay = await operations.recordPayment(artist.id, invoice.id, { idempotencyKey: "test-deposit-001", amountMinor: 25000, currency: "USD", method: "check", receivedAt: "2026-08-01T12:00:00.000Z" }, operator.email, operator.id);
  const invoiceChat = await manager.chat(artist.id, { message: "What is the balance on Invoice TEST-001?" }, operator.email, operator.id);
  assert.match(invoiceChat.message.content, /remaining balance is USD 750\.00/);
  assert.deepEqual(invoiceChat.message.citations, [invoice.id]);
  assert.equal(invoiceChat.recommendation, null);
  const invoiceChatRun = await client.managerRun.findUniqueOrThrow({ where: { id: invoiceChat.message.managerRunId } });
  assert.equal(invoiceChatRun.trace.subjectReference.policyVersion, "manager_subject_reference_v1");
  assert.equal(invoiceChatRun.trace.subjectReference.status, "resolved");
  assert.equal(invoiceChatRun.trace.subjectReference.subjectId, invoice.id);
  assert.equal(invoiceChatRun.trace.subjectReference.subjectKind, "invoice");
  assert.equal(invoiceChatRun.trace.subjectReference.providerBypassed, true);
  const foreignInvoiceChat = await manager.chat(foreignArtist.id, { message: "What is the balance on Invoice TEST-001?" }, operator.email, operator.id);
  assert.equal(foreignInvoiceChat.message.citations.includes(invoice.id), false);
  assert.equal(replay.id, firstPayment.id);
  assert.equal((await client.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidMinor, 25000);
  const fuelExpense = await client.expense.create({ data: { artistId: artist.id, eventId: event.id, category: "travel", description: "Van fuel", amountMinor: 10000, currency: "USD", incurredAt: new Date("2026-09-18T12:00:00.000Z") } });
  const settlement = await operations.createSettlement(artist.id, { eventId: event.id, currency: "USD", grossMinor: 100000, splits: [{ bandMemberId: member.id, basisPoints: 10000 }] }, operator.email, operator.id);
  assert.equal(settlement.netMinor, 90000);
  assert.equal((await client.expense.findUniqueOrThrow({ where: { id: fuelExpense.id } })).settlementId, null);
  const coachingChat = await manager.chat(artist.id, { message: "How does a show settlement work?" }, operator.email, operator.id);
  assert.match(coachingChat.message.content, /post-show money check/i);
  assert.match(coachingChat.message.content, /In StoryBoard:/);
  assert.ok(coachingChat.message.citations.includes(settlement.id));
  assert.equal(coachingChat.recommendation, null);
  const coachingRun = await client.managerRun.findUniqueOrThrow({ where: { id: coachingChat.message.managerRunId } });
  assert.equal(coachingRun.mode, "deterministic");
  assert.equal(coachingRun.trace.coaching.policyVersion, "manager_coaching_v1");
  assert.deepEqual(coachingRun.trace.coaching.topicIds, ["settlement"]);
  assert.equal(coachingRun.trace.coaching.providerBypassed, true);
  const foreignCoaching = await manager.chat(foreignArtist.id, { message: "How does a show settlement work?" }, operator.email, operator.id);
  assert.equal(foreignCoaching.message.citations.includes(settlement.id), false);
  const lateExpense = await client.expense.create({ data: { artistId: artist.id, eventId: event.id, category: "production", description: "Late parking receipt", amountMinor: 5000, currency: "usd", incurredAt: new Date("2026-09-18T23:00:00.000Z") } });
  const finalized = await operations.finalizeSettlement(artist.id, settlement.id, operator.email, operator.id);
  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.expenseMinor, 15000);
  assert.equal(finalized.netMinor, 85000);
  assert.equal((await client.expense.findUniqueOrThrow({ where: { id: lateExpense.id } })).settlementId, settlement.id);
  assert.equal(finalized.snapshots.length, 1);
  await operations.patchEvent(artist.id, event.id, { status: "completed", attendance: 140, grossRevenueMinor: 100000, postShowNotes: "Strong room response; tighten changeover next time", relationshipOutcome: "Buyer invited a return pitch" }, operator.email, operator.id);
  const outcomeReview = await manager.outcomeReview(artist.id, 90, new Date("2026-10-01T12:00:00.000Z"));
  assert.equal(outcomeReview.activity.completedShows, 1);
  assert.equal(outcomeReview.live.attendanceTotal, 140);
  assert.equal(outcomeReview.live.finalizedSettlements, 1);
  assert.equal(outcomeReview.financials.find((row) => row.currency === "USD")?.settledNetMinor, 85000);
  assert.ok(outcomeReview.evidenceIds.includes(event.id));
  const foreignOutcomeReview = await manager.outcomeReview(foreignArtist.id, 90, new Date("2026-10-01T12:00:00.000Z"));
  assert.equal(foreignOutcomeReview.activity.completedShows, 0);
  assert.equal(foreignOutcomeReview.evidenceIds.includes(event.id), false);
  const operatingEvidence = await manager.evidenceHealth(artist.id);
  assert.equal(operatingEvidence.policyVersion, "manager_evidence_v1");
  assert.equal(operatingEvidence.areas.length, 6);
  assert.ok(operatingEvidence.evidenceIds.includes(releaseProject.id));
  const foreignOperatingEvidence = await manager.evidenceHealth(foreignArtist.id);
  assert.equal(foreignOperatingEvidence.evidenceIds.includes(releaseProject.id), false);
  assert.equal(foreignOperatingEvidence.evidenceIds.includes(event.id), false);
  const evidenceChat = await manager.chat(artist.id, { message: "How sure are you, and what records are missing?" }, operator.email, operator.id);
  assert.match(evidenceChat.message.content, /operating coverage/i);
  assert.match(evidenceChat.message.content, /not a rating of the band/i);
  assert.equal(evidenceChat.recommendation, null);
  const evidenceRun = await client.managerRun.findUniqueOrThrow({ where: { id: evidenceChat.message.managerRunId } });
  assert.equal(evidenceRun.trace.evidenceHealth.policyVersion, "manager_evidence_v1");
  const sequenceGoal = await manager.createGoal(artist.id, { workstream: "releases", title: "Launch the tested release", targetValue: 1, targetUnit: "release", currentValue: 0, measurementKind: "manual", deadline: "2026-08-15T00:00:00.000Z", status: "active" }, operator.email, operator.id);
  const sequenceInitiative = await manager.createInitiative(artist.id, { goalId: sequenceGoal.id, workstream: "releases", title: "Tested release path", dueAt: "2026-08-10T00:00:00.000Z" }, operator.email, operator.id);
  const sequencePrerequisite = await taskService.create(artist.id, { title: "Confirm the release date" }, operator.email, operator.id);
  const sequenceDownstream = await client.task.create({ data: { artistId: artist.id, title: "Schedule the release announcement", dueAt: new Date("2026-08-01T00:00:00.000Z"), initiativeId: sequenceInitiative.id } });
  await taskService.addPrerequisite(artist.id, sequenceDownstream.id, sequencePrerequisite.id, operator.email, operator.id);
  const sequence = await manager.workSequence(artist.id);
  assert.equal(sequence.policyVersion, "manager_work_sequence_v1");
  assert.equal(sequence.items.find((item) => item.taskId === sequenceDownstream.id)?.state, "waiting_on_prerequisites");
  assert.ok(sequence.readyNow.find((item) => item.taskId === sequencePrerequisite.id)?.unlocksTaskIds.includes(sequenceDownstream.id));
  const foreignSequence = await manager.workSequence(foreignArtist.id);
  assert.equal(foreignSequence.evidenceIds.includes(sequencePrerequisite.id), false);
  assert.equal(foreignSequence.evidenceIds.includes(sequenceDownstream.id), false);
  const goalPaths = await manager.goalPaths(artist.id);
  assert.equal(goalPaths.policyVersion, "manager_goal_path_v1");
  const releasePath = goalPaths.goals.find((path) => path.goalId === sequenceGoal.id);
  assert.ok(releasePath, JSON.stringify(goalPaths));
  assert.equal(releasePath?.nextTask?.taskId, sequencePrerequisite.id, JSON.stringify(releasePath));
  assert.equal(releasePath?.nextTask?.pathType, "prerequisite");
  const foreignGoalPaths = await manager.goalPaths(foreignArtist.id);
  assert.equal(foreignGoalPaths.evidenceIds.includes(sequenceGoal.id), false);
  assert.equal(foreignGoalPaths.evidenceIds.includes(sequencePrerequisite.id), false);
  const sequenceChat = await manager.chat(artist.id, { message: "What can we do now, and what is waiting on another task?" }, operator.email, operator.id);
  assert.match(sequenceChat.message.content, /Ready now:/i);
  assert.match(sequenceChat.message.content, /Confirm the release date/);
  assert.match(sequenceChat.message.content, /Schedule the release announcement/);
  assert.equal(sequenceChat.recommendation, null);
  const sequenceRun = await client.managerRun.findUniqueOrThrow({ where: { id: sequenceChat.message.managerRunId } });
  assert.equal(sequenceRun.trace.workSequence.policyVersion, "manager_work_sequence_v1");
  assert.equal(sequenceRun.trace.workSequence.providerBypassed, true);
  const goalPathChat = await manager.chat(artist.id, { message: "What is the next move for our Launch the tested release goal?" }, operator.email, operator.id);
  assert.match(goalPathChat.message.content, /Confirm the release date/);
  assert.ok(goalPathChat.message.citations.includes(sequencePrerequisite.id));
  assert.equal(goalPathChat.recommendation, null);
  const goalPathRun = await client.managerRun.findUniqueOrThrow({ where: { id: goalPathChat.message.managerRunId } });
  assert.equal(goalPathRun.trace.goalPath.policyVersion, "manager_goal_path_v1");
  assert.equal(goalPathRun.trace.goalPath.providerBypassed, true);
  const actions = await client.auditEvent.findMany({ where: { artistId: artist.id }, select: { action: true } });
  for (const expected of ["manager.intake_completed", "manager.profile_updated", "manager.plan_ensured", "manager.settings_updated", "manager.goal_progress_recorded", "manager.recommendation_accepted", "manager.eval_example_promoted", "manager.evaluation_run", "manager.chat_completed", "manager.response_feedback_recorded", "project.plan_generated", "event.confirmed_from_opportunity", "event.updated", "event.schedule_item_created", "event.schedule_item_updated", "event.schedule_item_removed", "event.availability_recorded", "event.advance_generated", "invoice.payment_recorded", "settlement.finalized"]) assert.ok(actions.some((row) => row.action === expected), expected);
});
