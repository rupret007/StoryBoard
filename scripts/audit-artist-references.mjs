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
    relation: "Task → BandMember",
    query: `
      SELECT t."id" AS "recordId", t."artistId" AS "recordArtistId",
             t."bandMemberId" AS "relatedId", m."artistId" AS "relatedArtistId"
      FROM "Task" t
      INNER JOIN "BandMember" m ON m."id" = t."bandMemberId"
      WHERE t."artistId" <> m."artistId"
      ORDER BY t."id";
    `
  },
  {
    relation: "TaskDependency → dependent and prerequisite Tasks",
    query: `
      SELECT d."id" AS "recordId", d."artistId" AS "recordArtistId",
             CONCAT(d."taskId", ' -> ', d."prerequisiteTaskId") AS "relatedId",
             CONCAT(t."artistId", ' -> ', p."artistId") AS "relatedArtistId"
      FROM "TaskDependency" d
      INNER JOIN "Task" t ON t."id" = d."taskId"
      INNER JOIN "Task" p ON p."id" = d."prerequisiteTaskId"
      WHERE d."artistId" <> t."artistId"
         OR d."artistId" <> p."artistId"
         OR t."artistId" <> p."artistId"
      ORDER BY d."id";
    `
  },
  {
    relation: "TaskDependency graph cycles",
    query: `
      WITH RECURSIVE walk AS (
        SELECT d."artistId", d."taskId" AS origin, d."prerequisiteTaskId" AS current,
               ARRAY[d."taskId", d."prerequisiteTaskId"] AS path,
               d."taskId" = d."prerequisiteTaskId" AS cycle
        FROM "TaskDependency" d
        UNION ALL
        SELECT w."artistId", w.origin, d."prerequisiteTaskId",
               w.path || d."prerequisiteTaskId",
               d."prerequisiteTaskId" = ANY(w.path)
        FROM walk w
        INNER JOIN "TaskDependency" d
          ON d."artistId" = w."artistId" AND d."taskId" = w.current
        WHERE NOT w.cycle AND cardinality(w.path) < 100
      )
      SELECT DISTINCT origin AS "recordId", "artistId" AS "recordArtistId",
             array_to_string(path, ' -> ') AS "relatedId", "artistId" AS "relatedArtistId"
      FROM walk
      WHERE cycle
      ORDER BY origin;
    `
  },
  {
    relation: "TaskDependency completion and date order",
    query: `
      SELECT d."id" AS "recordId", d."artistId" AS "recordArtistId",
             CONCAT(t."id", ' -> ', p."id") AS "relatedId", d."artistId" AS "relatedArtistId"
      FROM "TaskDependency" d
      INNER JOIN "Task" t ON t."id" = d."taskId"
      INNER JOIN "Task" p ON p."id" = d."prerequisiteTaskId"
      WHERE (t."status" = 'done' AND p."status" <> 'done')
         OR (t."dueAt" IS NOT NULL AND p."dueAt" IS NOT NULL AND p."dueAt" > t."dueAt")
      ORDER BY d."id";
    `
  },
  {
    relation: "BandMemberCheckIn → BandMember",
    query: `
      SELECT c."id" AS "recordId", c."artistId" AS "recordArtistId",
             c."bandMemberId" AS "relatedId", m."artistId" AS "relatedArtistId"
      FROM "BandMemberCheckIn" c
      INNER JOIN "BandMember" m ON m."id" = c."bandMemberId"
      WHERE c."artistId" <> m."artistId"
      ORDER BY c."id";
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
    relation: "ApprovalRequest → BookingOpportunity",
    query: `
      SELECT a."id" AS "recordId", a."artistId" AS "recordArtistId",
             a."opportunityId" AS "relatedId", b."artistId" AS "relatedArtistId"
      FROM "ApprovalRequest" a
      INNER JOIN "BookingOpportunity" b ON b."id" = a."opportunityId"
      WHERE a."artistId" <> b."artistId"
      ORDER BY a."id";
    `
  },
  {
    relation: "ApprovalRequest → BandEvent",
    query: `
      SELECT a."id" AS "recordId", a."artistId" AS "recordArtistId",
             a."eventId" AS "relatedId", e."artistId" AS "relatedArtistId"
      FROM "ApprovalRequest" a
      INNER JOIN "BandEvent" e ON e."id" = a."eventId"
      WHERE a."artistId" <> e."artistId"
      ORDER BY a."id";
    `
  },
  {
    relation: "ApprovalRequest → ManagerRecommendation",
    query: `
      SELECT a."id" AS "recordId", a."artistId" AS "recordArtistId",
             a."managerRecommendationId" AS "relatedId", run."artistId" AS "relatedArtistId"
      FROM "ApprovalRequest" a
      INNER JOIN "ManagerRecommendation" r ON r."id" = a."managerRecommendationId"
      INNER JOIN "ManagerRun" run ON run."id" = r."managerRunId"
      WHERE a."artistId" <> run."artistId"
      ORDER BY a."id";
    `
  },
  {
    relation: "ApprovalReconciliation → ApprovalRequest",
    query: `
      SELECT r."id" AS "recordId", r."artistId" AS "recordArtistId",
             r."approvalId" AS "relatedId", a."artistId" AS "relatedArtistId"
      FROM "ApprovalReconciliation" r
      INNER JOIN "ApprovalRequest" a ON a."id" = r."approvalId"
      WHERE r."artistId" <> a."artistId"
      ORDER BY r."id";
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
    relation: "EventScheduleItem → BandEvent",
    query: `
      SELECT s."id" AS "recordId", e."artistId" AS "recordArtistId",
             s."eventId" AS "relatedId", e."artistId" AS "relatedArtistId"
      FROM "EventScheduleItem" s
      LEFT JOIN "BandEvent" e ON e."id" = s."eventId"
      WHERE e."id" IS NULL
      ORDER BY s."id";
    `
  },
  {
    relation: "SetlistItem → Setlist and Song",
    query: `
      SELECT i."id" AS "recordId", l."artistId" AS "recordArtistId",
             COALESCE(i."songId", i."setlistId") AS "relatedId",
             COALESCE(s."artistId", l."artistId") AS "relatedArtistId"
      FROM "SetlistItem" i
      INNER JOIN "Setlist" l ON l."id" = i."setlistId"
      LEFT JOIN "Song" s ON s."id" = i."songId"
      WHERE i."songId" IS NOT NULL
        AND (s."id" IS NULL OR l."artistId" <> s."artistId")
      ORDER BY i."id";
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
    relation: "ManagerRecommendation → task, decision, memory, project, event, initiative, and eval example",
    query: `
      SELECT r."id" AS "recordId", run."artistId" AS "recordArtistId",
             COALESCE(r."taskId", r."decisionId", r."memoryFactId", r."projectId", r."eventId", r."initiativeId", x."id") AS "relatedId",
             COALESCE(t."artistId", d."artistId", f."artistId", p."artistId", e."artistId", i."artistId", x."artistId") AS "relatedArtistId"
      FROM "ManagerRecommendation" r
      INNER JOIN "ManagerRun" run ON run."id" = r."managerRunId"
      LEFT JOIN "Task" t ON t."id" = r."taskId"
      LEFT JOIN "ManagerDecision" d ON d."id" = r."decisionId"
      LEFT JOIN "ManagerMemoryFact" f ON f."id" = r."memoryFactId"
      LEFT JOIN "ArtistProject" p ON p."id" = r."projectId"
      LEFT JOIN "BandEvent" e ON e."id" = r."eventId"
      LEFT JOIN "ManagerInitiative" i ON i."id" = r."initiativeId"
      LEFT JOIN "ManagerEvalExample" x ON x."recommendationId" = r."id"
      WHERE (t."id" IS NOT NULL AND run."artistId" <> t."artistId")
         OR (d."id" IS NOT NULL AND run."artistId" <> d."artistId")
         OR (f."id" IS NOT NULL AND run."artistId" <> f."artistId")
         OR (p."id" IS NOT NULL AND run."artistId" <> p."artistId")
         OR (e."id" IS NOT NULL AND run."artistId" <> e."artistId")
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
    relation: "Manager response eval → conversation, run, and reviewers",
    query: `
      SELECT x."id" AS "recordId", x."artistId" AS "recordArtistId",
             x."managerMessageId" AS "relatedId",
             COALESCE(c."artistId", r."artistId") AS "relatedArtistId"
      FROM "ManagerResponseEvalExample" x
      INNER JOIN "ManagerMessage" m ON m."id" = x."managerMessageId"
      INNER JOIN "ManagerConversation" c ON c."id" = m."conversationId"
      LEFT JOIN "ManagerRun" r ON r."id" = m."managerRunId"
      LEFT JOIN "ArtistMembership" p
        ON p."operatorId" = x."promotedByOperatorId" AND p."artistId" = x."artistId"
      LEFT JOIN "ArtistMembership" v
        ON v."operatorId" = x."resolvedByOperatorId" AND v."artistId" = x."artistId"
      WHERE x."artistId" <> c."artistId"
         OR (r."id" IS NOT NULL AND x."artistId" <> r."artistId")
         OR (x."promotedByOperatorId" IS NOT NULL AND p."id" IS NULL)
         OR (x."resolvedByOperatorId" IS NOT NULL AND v."id" IS NULL)
      ORDER BY x."id";
    `
  },
  {
    relation: "Manager brief notification → run and active team recipient",
    query: `
      SELECT n."id" AS "recordId", n."artistId" AS "recordArtistId",
             COALESCE(n."metadata"->>'managerRunId', n."recipientOperatorId") AS "relatedId",
             COALESCE(r."artistId", m."artistId") AS "relatedArtistId"
      FROM "WorkflowNotification" n
      LEFT JOIN "ManagerRun" r ON r."id" = n."metadata"->>'managerRunId'
      LEFT JOIN "ArtistMembership" m
        ON m."operatorId" = n."recipientOperatorId" AND m."artistId" = n."artistId"
      WHERE n."kind" = 'manager_brief_ready'
        AND (r."id" IS NULL
          OR n."artistId" <> r."artistId"
          OR m."id" IS NULL
          OR m."role" = 'viewer')
      ORDER BY n."id";
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
let issueCount = 0;

try {
  await client.connect();
  for (const check of checks) {
    let result;
    try {
      result = await client.query(check.query);
    } catch (error) {
      if (
        error.code === "42P01" &&
        typeof error.message === "string" &&
        /relation "([^"]+)" does not exist/.test(error.message)
      ) {
        const [, missingRelation] = error.message.match(/relation "([^"]+)" does not exist/) ?? [];
        console.warn(
          `${check.relation}: skipped (table ${missingRelation ?? "unknown"} missing in this database)`
        );
        continue;
      }
      throw error;
    }
    if (result.rows.length === 0) {
      console.log(`${check.relation}: no integrity issues`);
      continue;
    }
    issueCount += result.rows.length;
    console.error(`${check.relation}: ${result.rows.length} integrity issue(s)`);
    console.table(result.rows);
  }
} finally {
  await client.end().catch(() => undefined);
}

if (issueCount > 0) {
  console.error(
    "No data was changed. Resolve these records deliberately before release."
  );
  process.exitCode = 2;
}
