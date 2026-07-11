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
  mockAdaptersMod
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
  load("integrations/adapters/mock/mock-adapters.js")
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
    defaultFollowUpDays: 7
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
  const draftedRecipient = await client.bookingCampaignRecipient.findUniqueOrThrow({
    where: { id: recipient.id }
  });
  assert.equal(draftedRecipient.status, "drafted");
  assert.ok(draftedRecipient.followUpTaskId);
  const followUp = await client.task.findUniqueOrThrow({
    where: { id: draftedRecipient.followUpTaskId }
  });
  assert.equal(followUp.artistId, artistA.id);
  assert.equal(followUp.title, "Follow up with Useful Festival");
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
  assert.ok(auditActions.some((event) => event.action === "booking_campaign.drafts_created"));
});
