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
