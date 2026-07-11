-- CreateEnum
CREATE TYPE "BandMode" AS ENUM ('original', 'cover_event', 'hybrid');

-- CreateEnum
CREATE TYPE "ManagerWorkstream" AS ENUM ('live', 'releases', 'audience', 'content', 'business', 'relationships', 'band_operations');

-- CreateEnum
CREATE TYPE "ManagerGoalStatus" AS ENUM ('draft', 'active', 'achieved', 'paused', 'abandoned');

-- CreateEnum
CREATE TYPE "ManagerInitiativeStatus" AS ENUM ('proposed', 'active', 'completed', 'blocked', 'abandoned');

-- CreateEnum
CREATE TYPE "ManagerDecisionStatus" AS ENUM ('open', 'decided', 'superseded');

-- CreateEnum
CREATE TYPE "ManagerRunCadence" AS ENUM ('intake', 'daily', 'weekly', 'conversational');

-- CreateEnum
CREATE TYPE "ManagerRecommendationOutcome" AS ENUM ('suggested', 'accepted', 'dismissed', 'completed', 'blocked');

-- CreateEnum
CREATE TYPE "ManagerMemorySensitivity" AS ENUM ('normal', 'sensitive', 'restricted');

-- CreateEnum
CREATE TYPE "BandEventType" AS ENUM ('gig', 'rehearsal', 'studio', 'release', 'promotion', 'travel', 'meeting');

-- CreateEnum
CREATE TYPE "BandEventStatus" AS ENUM ('draft', 'hold', 'confirmed', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AvailabilityResponse" AS ENUM ('unknown', 'available', 'tentative', 'unavailable');

-- CreateEnum
CREATE TYPE "ArtistProjectType" AS ENUM ('release', 'content_campaign', 'tour', 'business');

-- CreateEnum
CREATE TYPE "ArtistProjectStatus" AS ENUM ('draft', 'active', 'completed', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('draft', 'proposed', 'negotiating', 'accepted', 'declined', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('draft', 'approval_pending', 'sent', 'viewed', 'signed', 'declined', 'voided');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'voided');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('draft', 'ready', 'finalized', 'voided');

-- CreateEnum
CREATE TYPE "SetlistStatus" AS ENUM ('draft', 'active', 'archived');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkflowNotificationKind" ADD VALUE 'manager_brief_ready';
ALTER TYPE "WorkflowNotificationKind" ADD VALUE 'event_readiness_risk';
ALTER TYPE "WorkflowNotificationKind" ADD VALUE 'invoice_overdue';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "initiativeId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "ArtistOperatingProfile" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "bandMode" "BandMode" NOT NULL DEFAULT 'hybrid',
    "careerStage" TEXT,
    "homeCity" TEXT,
    "homeRegion" TEXT,
    "homeCountry" TEXT,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "businessName" TEXT,
    "taxIdLast4" TEXT,
    "revenueSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentAssets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "constraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "educationTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availabilityExpectations" TEXT,
    "budgetToleranceMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "twelveMonthAmbition" TEXT,
    "communicationCadence" TEXT NOT NULL DEFAULT 'daily',
    "decisionStyle" TEXT NOT NULL DEFAULT 'guided',
    "intakeCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistOperatingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerSettings" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fullContextEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "dailyHour" INTEGER NOT NULL DEFAULT 9,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandMember" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "linkedOperatorId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "instruments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultSplitBasisPoints" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BandMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerGoal" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "workstream" "ManagerWorkstream" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetValue" DOUBLE PRECISION,
    "targetUnit" TEXT,
    "currentValue" DOUBLE PRECISION,
    "deadline" TIMESTAMP(3),
    "status" "ManagerGoalStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerInitiative" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "goalId" TEXT,
    "workstream" "ManagerWorkstream" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ManagerInitiativeStatus" NOT NULL DEFAULT 'proposed',
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "successMetric" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerInitiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerDecision" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "workstream" "ManagerWorkstream" NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "options" JSONB NOT NULL,
    "choice" TEXT,
    "rationale" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "status" "ManagerDecisionStatus" NOT NULL DEFAULT 'open',
    "reviewAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerMemoryFact" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sensitivity" "ManagerMemorySensitivity" NOT NULL DEFAULT 'normal',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerMemoryFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerRun" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "cadence" "ManagerRunCadence" NOT NULL,
    "mode" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "inputFacts" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "trace" JSONB NOT NULL,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerRecommendation" (
    "id" TEXT NOT NULL,
    "managerRunId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "stableKey" TEXT NOT NULL,
    "workstream" "ManagerWorkstream" NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "nextAction" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "proposedAction" JSONB,
    "outcome" "ManagerRecommendationOutcome" NOT NULL DEFAULT 'suggested',
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerConversation" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "operatorId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "proposedActions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandEvent" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "venueId" TEXT,
    "contactId" TEXT,
    "projectId" TEXT,
    "setlistId" TEXT,
    "type" "BandEventType" NOT NULL,
    "status" "BandEventStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT,
    "locationName" TEXT,
    "address" TEXT,
    "loadInAt" TIMESTAMP(3),
    "soundcheckAt" TIMESTAMP(3),
    "doorsAt" TIMESTAMP(3),
    "setAt" TIMESTAMP(3),
    "curfewAt" TIMESTAMP(3),
    "travelNotes" TEXT,
    "hospitalityNotes" TEXT,
    "productionNotes" TEXT,
    "cancellationTerms" TEXT,
    "guaranteeMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "depositMinor" INTEGER,
    "depositDueAt" TIMESTAMP(3),
    "balanceDueAt" TIMESTAMP(3),
    "stagePlotUrl" TEXT,
    "inputListUrl" TEXT,
    "techRiderUrl" TEXT,
    "hospitalityRiderUrl" TEXT,
    "driveFolderUrl" TEXT,
    "calendarEventId" TEXT,
    "parkingNotes" TEXT,
    "guestListNotes" TEXT,
    "attendance" INTEGER,
    "grossRevenueMinor" INTEGER,
    "postShowNotes" TEXT,
    "relationshipOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BandEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "bandMemberId" TEXT NOT NULL,
    "response" "AvailabilityResponse" NOT NULL DEFAULT 'unknown',
    "assignment" TEXT,
    "respondedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "EventParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventScheduleItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Song" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "musicalKey" TEXT,
    "bpm" INTEGER,
    "leadVocalist" TEXT,
    "genre" TEXT,
    "notes" TEXT,
    "lyricsUrl" TEXT,
    "chartUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setlist" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SetlistStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "publicToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetlistItem" (
    "id" TEXT NOT NULL,
    "setlistId" TEXT NOT NULL,
    "songId" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'song',
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "transitionNotes" TEXT,

    CONSTRAINT "SetlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistProject" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "goalId" TEXT,
    "type" "ArtistProjectType" NOT NULL,
    "status" "ArtistProjectStatus" NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "budgetMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "successMetrics" JSONB NOT NULL DEFAULT '[]',
    "assets" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealOffer" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "eventId" TEXT,
    "opportunityId" TEXT,
    "contactId" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "offerAmountMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "depositMinor" INTEGER,
    "depositDueAt" TIMESTAMP(3),
    "balanceDueAt" TIMESTAMP(3),
    "performanceDate" TIMESTAMP(3),
    "terms" TEXT,
    "cancellationTerms" TEXT,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealMemo" (
    "id" TEXT NOT NULL,
    "dealOfferId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "termsSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "bodyTemplate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "legalDisclaimer" TEXT NOT NULL DEFAULT 'Template only — not legal advice. Review with qualified counsel before use.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "dealOfferId" TEXT NOT NULL,
    "templateId" TEXT,
    "status" "AgreementStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "renderedText" TEXT NOT NULL,
    "signerName" TEXT,
    "signerEmail" TEXT,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signatureEvidenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSnapshot" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "agreementId" TEXT,
    "invoiceId" TEXT,
    "settlementId" TEXT,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "contentBase64" TEXT NOT NULL,
    "driveFileId" TEXT,
    "driveUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "dealOfferId" TEXT,
    "eventId" TEXT,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "evidenceUrl" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "eventId" TEXT,
    "projectId" TEXT,
    "settlementId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "grossMinor" INTEGER NOT NULL DEFAULT 0,
    "expenseMinor" INTEGER NOT NULL DEFAULT 0,
    "netMinor" INTEGER NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSplit" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "bandMemberId" TEXT NOT NULL,
    "basisPoints" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "MemberSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistOperatingProfile_artistId_key" ON "ArtistOperatingProfile"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerSettings_artistId_key" ON "ManagerSettings"("artistId");

-- CreateIndex
CREATE INDEX "BandMember_artistId_active_idx" ON "BandMember"("artistId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "BandMember_artistId_linkedOperatorId_key" ON "BandMember"("artistId", "linkedOperatorId");

-- CreateIndex
CREATE INDEX "ManagerGoal_artistId_status_deadline_idx" ON "ManagerGoal"("artistId", "status", "deadline");

-- CreateIndex
CREATE INDEX "ManagerInitiative_artistId_status_dueAt_idx" ON "ManagerInitiative"("artistId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ManagerDecision_artistId_status_reviewAt_idx" ON "ManagerDecision"("artistId", "status", "reviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerMemoryFact_artistId_key_key" ON "ManagerMemoryFact"("artistId", "key");

-- CreateIndex
CREATE INDEX "ManagerRun_artistId_cadence_createdAt_idx" ON "ManagerRun"("artistId", "cadence", "createdAt");

-- CreateIndex
CREATE INDEX "ManagerRecommendation_managerRunId_outcome_idx" ON "ManagerRecommendation"("managerRunId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerRecommendation_managerRunId_stableKey_key" ON "ManagerRecommendation"("managerRunId", "stableKey");

-- CreateIndex
CREATE INDEX "ManagerConversation_artistId_updatedAt_idx" ON "ManagerConversation"("artistId", "updatedAt");

-- CreateIndex
CREATE INDEX "ManagerMessage_conversationId_createdAt_idx" ON "ManagerMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BandEvent_opportunityId_key" ON "BandEvent"("opportunityId");

-- CreateIndex
CREATE INDEX "BandEvent_artistId_status_startsAt_idx" ON "BandEvent"("artistId", "status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipant_eventId_bandMemberId_key" ON "EventParticipant"("eventId", "bandMemberId");

-- CreateIndex
CREATE INDEX "EventScheduleItem_eventId_sortOrder_idx" ON "EventScheduleItem"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "Song_artistId_title_idx" ON "Song"("artistId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "Setlist_publicToken_key" ON "Setlist"("publicToken");

-- CreateIndex
CREATE INDEX "Setlist_artistId_status_idx" ON "Setlist"("artistId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SetlistItem_setlistId_sortOrder_key" ON "SetlistItem"("setlistId", "sortOrder");

-- CreateIndex
CREATE INDEX "ArtistProject_artistId_status_dueAt_idx" ON "ArtistProject"("artistId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "DealOffer_artistId_status_performanceDate_idx" ON "DealOffer"("artistId", "status", "performanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "DealMemo_dealOfferId_version_key" ON "DealMemo"("dealOfferId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_artistId_kind_version_key" ON "DocumentTemplate"("artistId", "kind", "version");

-- CreateIndex
CREATE INDEX "Agreement_artistId_status_idx" ON "Agreement"("artistId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_dealOfferId_version_key" ON "Agreement"("dealOfferId", "version");

-- CreateIndex
CREATE INDEX "DocumentSnapshot_artistId_kind_createdAt_idx" ON "DocumentSnapshot"("artistId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_artistId_status_dueAt_idx" ON "Invoice"("artistId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_artistId_number_key" ON "Invoice"("artistId", "number");

-- CreateIndex
CREATE INDEX "PaymentRecord_invoiceId_receivedAt_idx" ON "PaymentRecord"("invoiceId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_artistId_idempotencyKey_key" ON "PaymentRecord"("artistId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Expense_artistId_incurredAt_idx" ON "Expense"("artistId", "incurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_eventId_key" ON "Settlement"("eventId");

-- CreateIndex
CREATE INDEX "Settlement_artistId_status_idx" ON "Settlement"("artistId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSplit_settlementId_bandMemberId_key" ON "MemberSplit"("settlementId", "bandMemberId");

-- AddForeignKey
ALTER TABLE "ArtistOperatingProfile" ADD CONSTRAINT "ArtistOperatingProfile_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerSettings" ADD CONSTRAINT "ManagerSettings_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandMember" ADD CONSTRAINT "BandMember_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandMember" ADD CONSTRAINT "BandMember_linkedOperatorId_fkey" FOREIGN KEY ("linkedOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerGoal" ADD CONSTRAINT "ManagerGoal_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerInitiative" ADD CONSTRAINT "ManagerInitiative_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerInitiative" ADD CONSTRAINT "ManagerInitiative_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ManagerGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerDecision" ADD CONSTRAINT "ManagerDecision_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerMemoryFact" ADD CONSTRAINT "ManagerMemoryFact_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerRun" ADD CONSTRAINT "ManagerRun_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerRecommendation" ADD CONSTRAINT "ManagerRecommendation_managerRunId_fkey" FOREIGN KEY ("managerRunId") REFERENCES "ManagerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerRecommendation" ADD CONSTRAINT "ManagerRecommendation_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "ManagerInitiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerRecommendation" ADD CONSTRAINT "ManagerRecommendation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerConversation" ADD CONSTRAINT "ManagerConversation_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerMessage" ADD CONSTRAINT "ManagerMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ManagerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerMessage" ADD CONSTRAINT "ManagerMessage_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ArtistProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "ManagerInitiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandEvent" ADD CONSTRAINT "BandEvent_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandEvent" ADD CONSTRAINT "BandEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "BookingOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandEvent" ADD CONSTRAINT "BandEvent_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandEvent" ADD CONSTRAINT "BandEvent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandEvent" ADD CONSTRAINT "BandEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ArtistProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandEvent" ADD CONSTRAINT "BandEvent_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipant" ADD CONSTRAINT "EventParticipant_bandMemberId_fkey" FOREIGN KEY ("bandMemberId") REFERENCES "BandMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventScheduleItem" ADD CONSTRAINT "EventScheduleItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setlist" ADD CONSTRAINT "Setlist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_setlistId_fkey" FOREIGN KEY ("setlistId") REFERENCES "Setlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetlistItem" ADD CONSTRAINT "SetlistItem_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistProject" ADD CONSTRAINT "ArtistProject_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistProject" ADD CONSTRAINT "ArtistProject_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ManagerGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealOffer" ADD CONSTRAINT "DealOffer_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealOffer" ADD CONSTRAINT "DealOffer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealOffer" ADD CONSTRAINT "DealOffer_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "BookingOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealOffer" ADD CONSTRAINT "DealOffer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMemo" ADD CONSTRAINT "DealMemo_dealOfferId_fkey" FOREIGN KEY ("dealOfferId") REFERENCES "DealOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_dealOfferId_fkey" FOREIGN KEY ("dealOfferId") REFERENCES "DealOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dealOfferId_fkey" FOREIGN KEY ("dealOfferId") REFERENCES "DealOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ArtistProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSplit" ADD CONSTRAINT "MemberSplit_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSplit" ADD CONSTRAINT "MemberSplit_bandMemberId_fkey" FOREIGN KEY ("bandMemberId") REFERENCES "BandMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
