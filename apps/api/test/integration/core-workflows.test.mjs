import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { requireTestDatabaseUrl } from "../../../../scripts/test-database.mjs";

const testDatabaseUrl = requireTestDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl;

const dir = dirname(fileURLToPath(import.meta.url));
const load = (path) => import(pathToFileURL(join(dir, "..", "..", "dist", path)).href);

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
  await tasks.create(artistA.id, {
    title: "Owned opportunity task",
    opportunityId: opportunity.id
  });

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
  assert.ok(await client.managerGoal.count({ where: { artistId: artist.id } }) >= 2);
  assert.equal(await client.managerMemoryFact.count({ where: { artistId: artist.id, sourceType: "manager_intake" } }), 4);
  const member = await client.bandMember.findFirstOrThrow({ where: { artistId: artist.id } });

  const venue = await client.venue.create({ data: { artistId: artist.id, name: "Owned Room", city: "Chicago" } });
  const foreignVenue = await client.venue.create({ data: { artistId: foreignArtist.id, name: "Foreign Room", city: "Elsewhere" } });
  const booking = new bookingMod.BookingOpportunitiesService(prisma, audit);
  const opportunity = await booking.create(artist.id, { title: "Friday show", venueId: venue.id, targetDate: "2026-09-18T20:00:00.000Z" }, operator.email, operator.id);
  await booking.updateStage(artist.id, opportunity.id, "confirmed", operator.email, operator.id);
  await booking.updateStage(artist.id, opportunity.id, "confirmed", operator.email, operator.id);
  assert.equal(await client.bandEvent.count({ where: { artistId: artist.id, opportunityId: opportunity.id } }), 1);
  const event = await client.bandEvent.findUniqueOrThrow({ where: { opportunityId: opportunity.id } });

  const operations = new operationsMod.OperationsService(prisma, audit, {});
  await assert.rejects(() => operations.createEvent(artist.id, { type: "gig", status: "draft", title: "Unsafe", venueId: foreignVenue.id, currency: "USD" }, operator.email, operator.id), (error) => error?.getStatus?.() === 404);
  await operations.participant(artist.id, event.id, { bandMemberId: member.id, response: "available" }, operator.email, operator.id);
  const advance = await operations.generateAdvance(artist.id, event.id, operator.email, operator.id);
  assert.equal(advance.created.length, 4);
  assert.equal((await operations.generateAdvance(artist.id, event.id, operator.email, operator.id)).created.length, 0);

  const deal = await operations.createDeal(artist.id, { eventId: event.id, opportunityId: opportunity.id, status: "accepted", title: "Friday guarantee", offerAmountMinor: 100000, currency: "USD", depositMinor: 25000 }, operator.email, operator.id);
  const invoice = await operations.createInvoice(artist.id, { dealOfferId: deal.id, eventId: event.id, number: "TEST-001", recipientName: "Owned Room", currency: "USD", subtotalMinor: 100000, taxMinor: 0 }, operator.email, operator.id);
  const firstPayment = await operations.recordPayment(artist.id, invoice.id, { idempotencyKey: "test-deposit-001", amountMinor: 25000, currency: "USD", method: "check", receivedAt: "2026-08-01T12:00:00.000Z" }, operator.email, operator.id);
  const replay = await operations.recordPayment(artist.id, invoice.id, { idempotencyKey: "test-deposit-001", amountMinor: 25000, currency: "USD", method: "check", receivedAt: "2026-08-01T12:00:00.000Z" }, operator.email, operator.id);
  assert.equal(replay.id, firstPayment.id);
  assert.equal((await client.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidMinor, 25000);
  await client.expense.create({ data: { artistId: artist.id, eventId: event.id, category: "travel", description: "Van fuel", amountMinor: 10000, currency: "USD", incurredAt: new Date("2026-09-18T12:00:00.000Z") } });
  const settlement = await operations.createSettlement(artist.id, { eventId: event.id, currency: "USD", grossMinor: 100000, splits: [{ bandMemberId: member.id, basisPoints: 10000 }] }, operator.email, operator.id);
  assert.equal(settlement.netMinor, 90000);
  const finalized = await operations.finalizeSettlement(artist.id, settlement.id, operator.email, operator.id);
  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.snapshots.length, 1);
  const actions = await client.auditEvent.findMany({ where: { artistId: artist.id }, select: { action: true } });
  for (const expected of ["manager.intake_completed", "event.confirmed_from_opportunity", "event.advance_generated", "invoice.payment_recorded", "settlement.finalized"]) assert.ok(actions.some((row) => row.action === expected), expected);
});
