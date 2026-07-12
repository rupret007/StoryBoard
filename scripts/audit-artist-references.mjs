#!/usr/bin/env node
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required for the relationship audit.");
  process.exit(1);
}

const checks = [
  {
    relation: "Contact → Venue",
    query: `
      SELECT c."id" AS "recordId", c."artistId" AS "recordArtistId",
             c."venueId" AS "relatedId", v."artistId" AS "relatedArtistId"
      FROM "Contact" c
      INNER JOIN "Venue" v ON v."id" = c."venueId"
      WHERE c."artistId" <> v."artistId"
      ORDER BY c."id";
    `
  },
  {
    relation: "BookingOpportunity → Venue",
    query: `
      SELECT b."id" AS "recordId", b."artistId" AS "recordArtistId",
             b."venueId" AS "relatedId", v."artistId" AS "relatedArtistId"
      FROM "BookingOpportunity" b
      INNER JOIN "Venue" v ON v."id" = b."venueId"
      WHERE b."artistId" <> v."artistId"
      ORDER BY b."id";
    `
  },
  {
    relation: "Task → BookingOpportunity",
    query: `
      SELECT t."id" AS "recordId", t."artistId" AS "recordArtistId",
             t."opportunityId" AS "relatedId", b."artistId" AS "relatedArtistId"
      FROM "Task" t
      INNER JOIN "BookingOpportunity" b ON b."id" = t."opportunityId"
      WHERE t."artistId" <> b."artistId"
      ORDER BY t."id";
    `
  },
  {
    relation: "BookingProspect → Venue",
    query: `
      SELECT p."id" AS "recordId", p."artistId" AS "recordArtistId",
             p."venueId" AS "relatedId", v."artistId" AS "relatedArtistId"
      FROM "BookingProspect" p
      INNER JOIN "Venue" v ON v."id" = p."venueId"
      WHERE p."artistId" <> v."artistId"
      ORDER BY p."id";
    `
  },
  {
    relation: "BookingProspect → Contact",
    query: `
      SELECT p."id" AS "recordId", p."artistId" AS "recordArtistId",
             p."contactId" AS "relatedId", c."artistId" AS "relatedArtistId"
      FROM "BookingProspect" p
      INNER JOIN "Contact" c ON c."id" = p."contactId"
      WHERE p."artistId" <> c."artistId"
      ORDER BY p."id";
    `
  },
  {
    relation: "BookingProspect → BookingOpportunity",
    query: `
      SELECT p."id" AS "recordId", p."artistId" AS "recordArtistId",
             p."opportunityId" AS "relatedId", b."artistId" AS "relatedArtistId"
      FROM "BookingProspect" p
      INNER JOIN "BookingOpportunity" b ON b."id" = p."opportunityId"
      WHERE p."artistId" <> b."artistId"
      ORDER BY p."id";
    `
  },
  {
    relation: "BookingProspect → BookingMarketSprint",
    query: `
      SELECT p."id" AS "recordId", p."artistId" AS "recordArtistId",
             p."marketSprintId" AS "relatedId", s."artistId" AS "relatedArtistId"
      FROM "BookingProspect" p
      INNER JOIN "BookingMarketSprint" s ON s."id" = p."marketSprintId"
      WHERE p."artistId" <> s."artistId"
      ORDER BY p."id";
    `
  },
  {
    relation: "BookingCampaign → BookingMarketSprint",
    query: `
      SELECT k."id" AS "recordId", k."artistId" AS "recordArtistId",
             k."marketSprintId" AS "relatedId", s."artistId" AS "relatedArtistId"
      FROM "BookingCampaign" k
      INNER JOIN "BookingMarketSprint" s ON s."id" = k."marketSprintId"
      WHERE k."artistId" <> s."artistId"
      ORDER BY k."id";
    `
  },
  {
    relation: "BookingCampaign → ApprovalRequest",
    query: `
      SELECT k."id" AS "recordId", k."artistId" AS "recordArtistId",
             k."approvalRequestId" AS "relatedId", a."artistId" AS "relatedArtistId"
      FROM "BookingCampaign" k
      INNER JOIN "ApprovalRequest" a ON a."id" = k."approvalRequestId"
      WHERE k."artistId" <> a."artistId"
      ORDER BY k."id";
    `
  },
  {
    relation: "BookingCampaignRecipient → Prospect",
    query: `
      SELECT r."id" AS "recordId", k."artistId" AS "recordArtistId",
             r."prospectId" AS "relatedId", p."artistId" AS "relatedArtistId"
      FROM "BookingCampaignRecipient" r
      INNER JOIN "BookingCampaign" k ON k."id" = r."campaignId"
      INNER JOIN "BookingProspect" p ON p."id" = r."prospectId"
      WHERE k."artistId" <> p."artistId"
      ORDER BY r."id";
    `
  },
  {
    relation: "BookingCampaignRecipient → Contact",
    query: `
      SELECT r."id" AS "recordId", k."artistId" AS "recordArtistId",
             r."contactId" AS "relatedId", c."artistId" AS "relatedArtistId"
      FROM "BookingCampaignRecipient" r
      INNER JOIN "BookingCampaign" k ON k."id" = r."campaignId"
      INNER JOIN "Contact" c ON c."id" = r."contactId"
      WHERE k."artistId" <> c."artistId"
      ORDER BY r."id";
    `
  },
  {
    relation: "BookingCampaignRecipient → BookingOpportunity",
    query: `
      SELECT r."id" AS "recordId", k."artistId" AS "recordArtistId",
             r."opportunityId" AS "relatedId", b."artistId" AS "relatedArtistId"
      FROM "BookingCampaignRecipient" r
      INNER JOIN "BookingCampaign" k ON k."id" = r."campaignId"
      INNER JOIN "BookingOpportunity" b ON b."id" = r."opportunityId"
      WHERE k."artistId" <> b."artistId"
      ORDER BY r."id";
    `
  },
  {
    relation: "BookingCampaignRecipient → FollowUpTask",
    query: `
      SELECT r."id" AS "recordId", k."artistId" AS "recordArtistId",
             r."followUpTaskId" AS "relatedId", t."artistId" AS "relatedArtistId"
      FROM "BookingCampaignRecipient" r
      INNER JOIN "BookingCampaign" k ON k."id" = r."campaignId"
      INNER JOIN "Task" t ON t."id" = r."followUpTaskId"
      WHERE k."artistId" <> t."artistId"
      ORDER BY r."id";
    `
  },
  {
    relation: "BookingCampaignDelivery → ApprovalRequest and Recipient",
    query: `
      SELECT d."id" AS "recordId", d."artistId" AS "recordArtistId",
             d."approvalId" AS "relatedId", a."artistId" AS "relatedArtistId"
      FROM "BookingCampaignDelivery" d
      INNER JOIN "ApprovalRequest" a ON a."id" = d."approvalId"
      INNER JOIN "BookingCampaignRecipient" r ON r."id" = d."recipientId"
      INNER JOIN "BookingCampaign" k ON k."id" = r."campaignId"
      WHERE d."artistId" <> a."artistId" OR d."artistId" <> k."artistId"
      ORDER BY d."id";
    `
  },
  {
    relation: "BookingReply → Recipient, Delivery, and Opportunity",
    query: `
      SELECT x."id" AS "recordId", x."artistId" AS "recordArtistId",
             x."recipientId" AS "relatedId", k."artistId" AS "relatedArtistId"
      FROM "BookingReply" x
      INNER JOIN "BookingCampaignRecipient" r ON r."id" = x."recipientId"
      INNER JOIN "BookingCampaign" k ON k."id" = r."campaignId"
      LEFT JOIN "BookingCampaignDelivery" d ON d."id" = x."deliveryId"
      LEFT JOIN "BookingOpportunity" b ON b."id" = x."opportunityId"
      WHERE x."artistId" <> k."artistId"
         OR (d."id" IS NOT NULL AND x."artistId" <> d."artistId")
         OR (b."id" IS NOT NULL AND x."artistId" <> b."artistId")
      ORDER BY x."id";
    `
  },
  {
    relation: "BandEvent → artist-owned records",
    query: `
      SELECT e."id" AS "recordId", e."artistId" AS "recordArtistId",
             COALESCE(e."opportunityId", e."venueId", e."contactId", e."projectId", e."setlistId") AS "relatedId",
             COALESCE(o."artistId", v."artistId", c."artistId", p."artistId", s."artistId") AS "relatedArtistId"
      FROM "BandEvent" e
      LEFT JOIN "BookingOpportunity" o ON o."id" = e."opportunityId"
      LEFT JOIN "Venue" v ON v."id" = e."venueId"
      LEFT JOIN "Contact" c ON c."id" = e."contactId"
      LEFT JOIN "ArtistProject" p ON p."id" = e."projectId"
      LEFT JOIN "Setlist" s ON s."id" = e."setlistId"
      WHERE (o."id" IS NOT NULL AND e."artistId" <> o."artistId")
         OR (v."id" IS NOT NULL AND e."artistId" <> v."artistId")
         OR (c."id" IS NOT NULL AND e."artistId" <> c."artistId")
         OR (p."id" IS NOT NULL AND e."artistId" <> p."artistId")
         OR (s."id" IS NOT NULL AND e."artistId" <> s."artistId")
      ORDER BY e."id";
    `
  },
  {
    relation: "Task → event, project, and initiative",
    query: `
      SELECT t."id" AS "recordId", t."artistId" AS "recordArtistId",
             COALESCE(t."eventId", t."projectId", t."initiativeId") AS "relatedId",
             COALESCE(e."artistId", p."artistId", i."artistId") AS "relatedArtistId"
      FROM "Task" t
      LEFT JOIN "BandEvent" e ON e."id" = t."eventId"
      LEFT JOIN "ArtistProject" p ON p."id" = t."projectId"
      LEFT JOIN "ManagerInitiative" i ON i."id" = t."initiativeId"
      WHERE (e."id" IS NOT NULL AND t."artistId" <> e."artistId")
         OR (p."id" IS NOT NULL AND t."artistId" <> p."artistId")
         OR (i."id" IS NOT NULL AND t."artistId" <> i."artistId")
      ORDER BY t."id";
    `
  },
  {
    relation: "DealOffer → event, opportunity, and contact",
    query: `
      SELECT d."id" AS "recordId", d."artistId" AS "recordArtistId",
             COALESCE(d."eventId", d."opportunityId", d."contactId") AS "relatedId",
             COALESCE(e."artistId", o."artistId", c."artistId") AS "relatedArtistId"
      FROM "DealOffer" d
      LEFT JOIN "BandEvent" e ON e."id" = d."eventId"
      LEFT JOIN "BookingOpportunity" o ON o."id" = d."opportunityId"
      LEFT JOIN "Contact" c ON c."id" = d."contactId"
      WHERE (e."id" IS NOT NULL AND d."artistId" <> e."artistId")
         OR (o."id" IS NOT NULL AND d."artistId" <> o."artistId")
         OR (c."id" IS NOT NULL AND d."artistId" <> c."artistId")
      ORDER BY d."id";
    `
  },
  {
    relation: "Invoice and PaymentRecord → artist-owned records",
    query: `
      SELECT i."id" AS "recordId", i."artistId" AS "recordArtistId",
             COALESCE(i."dealOfferId", i."eventId", p."invoiceId") AS "relatedId",
             COALESCE(d."artistId", e."artistId", p."artistId") AS "relatedArtistId"
      FROM "Invoice" i
      LEFT JOIN "DealOffer" d ON d."id" = i."dealOfferId"
      LEFT JOIN "BandEvent" e ON e."id" = i."eventId"
      LEFT JOIN "PaymentRecord" p ON p."invoiceId" = i."id"
      WHERE (d."id" IS NOT NULL AND i."artistId" <> d."artistId")
         OR (e."id" IS NOT NULL AND i."artistId" <> e."artistId")
         OR (p."id" IS NOT NULL AND i."artistId" <> p."artistId")
      ORDER BY i."id";
    `
  },
  {
    relation: "Settlement and MemberSplit → event and member",
    query: `
      SELECT s."id" AS "recordId", s."artistId" AS "recordArtistId",
             COALESCE(s."eventId", m."bandMemberId") AS "relatedId",
             COALESCE(e."artistId", b."artistId") AS "relatedArtistId"
      FROM "Settlement" s
      INNER JOIN "BandEvent" e ON e."id" = s."eventId"
      LEFT JOIN "MemberSplit" m ON m."settlementId" = s."id"
      LEFT JOIN "BandMember" b ON b."id" = m."bandMemberId"
      WHERE s."artistId" <> e."artistId"
         OR (b."id" IS NOT NULL AND s."artistId" <> b."artistId")
      ORDER BY s."id";
    `
  },
  {
    relation: "ManagerRecommendation → task, decision, initiative, and eval example",
    query: `
      SELECT r."id" AS "recordId", run."artistId" AS "recordArtistId",
             COALESCE(r."taskId", r."decisionId", r."initiativeId", x."id") AS "relatedId",
             COALESCE(t."artistId", d."artistId", i."artistId", x."artistId") AS "relatedArtistId"
      FROM "ManagerRecommendation" r
      INNER JOIN "ManagerRun" run ON run."id" = r."managerRunId"
      LEFT JOIN "Task" t ON t."id" = r."taskId"
      LEFT JOIN "ManagerDecision" d ON d."id" = r."decisionId"
      LEFT JOIN "ManagerInitiative" i ON i."id" = r."initiativeId"
      LEFT JOIN "ManagerEvalExample" x ON x."recommendationId" = r."id"
      WHERE (t."id" IS NOT NULL AND run."artistId" <> t."artistId")
         OR (d."id" IS NOT NULL AND run."artistId" <> d."artistId")
         OR (i."id" IS NOT NULL AND run."artistId" <> i."artistId")
         OR (x."id" IS NOT NULL AND run."artistId" <> x."artistId")
      ORDER BY r."id";
    `
  },
  {
    relation: "Manager goal progress and evaluation runs → artist-owned manager records",
    query: `
      SELECT p."id" AS "recordId", p."artistId" AS "recordArtistId",
             p."goalId" AS "relatedId", g."artistId" AS "relatedArtistId"
      FROM "ManagerGoalProgressEvent" p
      INNER JOIN "ManagerGoal" g ON g."id" = p."goalId"
      WHERE p."artistId" <> g."artistId"
      UNION ALL
      SELECT e."id" AS "recordId", e."artistId" AS "recordArtistId",
             e."createdByOperatorId" AS "relatedId", m."artistId" AS "relatedArtistId"
      FROM "ManagerEvaluationRun" e
      LEFT JOIN "ArtistMembership" m
        ON m."operatorId" = e."createdByOperatorId" AND m."artistId" = e."artistId"
      WHERE e."createdByOperatorId" IS NOT NULL AND m."id" IS NULL
      ORDER BY "recordId";
    `
  },
  {
    relation: "Manager response feedback → conversation and run",
    query: `
      SELECT f."id" AS "recordId", f."artistId" AS "recordArtistId",
             f."managerMessageId" AS "relatedId",
             COALESCE(c."artistId", r."artistId") AS "relatedArtistId"
      FROM "ManagerMessageFeedback" f
      INNER JOIN "ManagerMessage" m ON m."id" = f."managerMessageId"
      INNER JOIN "ManagerConversation" c ON c."id" = m."conversationId"
      LEFT JOIN "ManagerRun" r ON r."id" = m."managerRunId"
      WHERE f."artistId" <> c."artistId"
         OR (r."id" IS NOT NULL AND f."artistId" <> r."artistId")
      ORDER BY f."id";
    `
  },
  {
    relation: "Agreement → deal and template",
    query: `
      SELECT a."id" AS "recordId", a."artistId" AS "recordArtistId",
             COALESCE(a."dealOfferId", a."templateId") AS "relatedId",
             COALESCE(d."artistId", t."artistId") AS "relatedArtistId"
      FROM "Agreement" a
      INNER JOIN "DealOffer" d ON d."id" = a."dealOfferId"
      LEFT JOIN "DocumentTemplate" t ON t."id" = a."templateId"
      WHERE a."artistId" <> d."artistId"
         OR (t."id" IS NOT NULL AND a."artistId" <> t."artistId")
      ORDER BY a."id";
    `
  }
];

const client = new Client({ connectionString });
let mismatchCount = 0;

try {
  await client.connect();
  for (const check of checks) {
    const result = await client.query(check.query);
    if (result.rows.length === 0) {
      console.log(`${check.relation}: no cross-artist references`);
      continue;
    }
    mismatchCount += result.rows.length;
    console.error(`${check.relation}: ${result.rows.length} mismatch(es)`);
    console.table(result.rows);
  }
} finally {
  await client.end().catch(() => undefined);
}

if (mismatchCount > 0) {
  console.error(
    "No data was changed. Resolve these records deliberately before release."
  );
  process.exitCode = 2;
}
