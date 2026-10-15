-- Phase 1 social manager plus unused Phase 2/3 tables so inbox and weekly
-- plan can land later without another identity redesign.

CREATE TYPE "SocialPlatform" AS ENUM ('facebook', 'instagram', 'youtube', 'tiktok');
CREATE TYPE "SocialVoiceKey" AS ENUM ('stalemate', 'rad_dad', 'unknown');
CREATE TYPE "SocialMediaKind" AS ENUM ('photo', 'video');
CREATE TYPE "SocialPostStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'posting', 'posted', 'partial', 'failed', 'cancelled');
CREATE TYPE "SocialTargetStatus" AS ENUM ('draft', 'skipped', 'pending', 'sending', 'posted', 'draft_only', 'failed', 'refused');
CREATE TYPE "SocialSendOutcome" AS ENUM ('sent', 'draft_only', 'failed', 'refused_no_approval', 'refused_account_mismatch', 'refused_no_id', 'refused_voice_mismatch');
CREATE TYPE "SocialInboxKind" AS ENUM ('comment', 'dm');
CREATE TYPE "SocialInboxTriage" AS ENUM ('thanks', 'question', 'booking', 'troll', 'spam', 'unknown');
CREATE TYPE "SocialReplyStatus" AS ENUM ('drafted', 'pending_approval', 'approved', 'sent', 'failed', 'skipped');
CREATE TYPE "SocialWeeklyPlanStatus" AS ENUM ('drafted', 'pending_approval', 'approved');

CREATE TABLE "SocialVoiceProfile" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "voiceKey" "SocialVoiceKey" NOT NULL,
    "toneDescription" TEXT NOT NULL,
    "toneRules" TEXT[] NOT NULL,
    "bannedPhrases" TEXT[] NOT NULL,
    "bannedTopics" TEXT[] NOT NULL,
    "emojiTolerance" INTEGER NOT NULL DEFAULT 3,
    "confirmedFacts" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialVoiceProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialVoiceProfile_artistId_key" ON "SocialVoiceProfile"("artistId");

CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "voiceKey" "SocialVoiceKey" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "scopes" TEXT[],
    "handle" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialAccount_artistId_platform_key" ON "SocialAccount"("artistId", "platform");
CREATE INDEX "SocialAccount_artistId_status_idx" ON "SocialAccount"("artistId", "status");

CREATE TABLE "SocialMediaAsset" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "publicUrl" TEXT NOT NULL,
    "kind" "SocialMediaKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialMediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialMediaAsset_artistId_createdAt_idx" ON "SocialMediaAsset"("artistId", "createdAt");

CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "approvalRequestId" TEXT,
    "mediaAssetId" TEXT,
    "eventId" TEXT,
    "note" TEXT NOT NULL,
    "voiceKey" "SocialVoiceKey" NOT NULL,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'draft',
    "createdByOperatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialPost_approvalRequestId_key" ON "SocialPost"("approvalRequestId");
CREATE INDEX "SocialPost_artistId_status_createdAt_idx" ON "SocialPost"("artistId", "status", "createdAt");

CREATE TABLE "SocialPostTarget" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "accountId" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "caption" TEXT NOT NULL,
    "title" TEXT,
    "tags" TEXT[],
    "mediaKind" "SocialMediaKind",
    "includeFacebookEvent" BOOLEAN NOT NULL DEFAULT false,
    "facebookEventName" TEXT,
    "facebookEventStartsAt" TIMESTAMP(3),
    "facebookEventPlace" TEXT,
    "status" "SocialTargetStatus" NOT NULL DEFAULT 'draft',
    "externalPostId" TEXT,
    "externalPostUrl" TEXT,
    "isDraftOnly" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPostTarget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialPostTarget_postId_platform_idx" ON "SocialPostTarget"("postId", "platform");

CREATE TABLE "SocialSendLog" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "targetId" TEXT,
    "approvalRequestId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "accountExternalId" TEXT,
    "voiceKey" "SocialVoiceKey" NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "SocialSendOutcome" NOT NULL,
    "requestSummary" JSONB NOT NULL,
    "responseCode" INTEGER,
    "externalPostId" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL,
    "adapterMode" TEXT NOT NULL,

    CONSTRAINT "SocialSendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialSendLog_artistId_attemptedAt_idx" ON "SocialSendLog"("artistId", "attemptedAt");
CREATE INDEX "SocialSendLog_approvalRequestId_idx" ON "SocialSendLog"("approvalRequestId");
CREATE INDEX "SocialSendLog_postId_attemptedAt_idx" ON "SocialSendLog"("postId", "attemptedAt");

CREATE TABLE "SocialInboxItem" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "kind" "SocialInboxKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "authorLabel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "triage" "SocialInboxTriage" NOT NULL DEFAULT 'unknown',
    "needsReply" BOOLEAN NOT NULL DEFAULT true,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialInboxItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialInboxItem_artistId_platform_kind_externalId_key" ON "SocialInboxItem"("artistId", "platform", "kind", "externalId");
CREATE INDEX "SocialInboxItem_artistId_needsReply_receivedAt_idx" ON "SocialInboxItem"("artistId", "needsReply", "receivedAt");

CREATE TABLE "SocialReplyDraft" (
    "id" TEXT NOT NULL,
    "inboxItemId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SocialReplyStatus" NOT NULL DEFAULT 'drafted',
    "approvalRequestId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialReplyDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialReplyDraft_inboxItemId_status_idx" ON "SocialReplyDraft"("inboxItemId", "status");

CREATE TABLE "SocialWeeklyPlan" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "status" "SocialWeeklyPlanStatus" NOT NULL DEFAULT 'drafted',
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialWeeklyPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialWeeklyPlan_artistId_weekStart_key" ON "SocialWeeklyPlan"("artistId", "weekStart");

CREATE TABLE "SocialAnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialAnalyticsSnapshot_artistId_platform_capturedAt_idx" ON "SocialAnalyticsSnapshot"("artistId", "platform", "capturedAt");

ALTER TABLE "SocialVoiceProfile"
ADD CONSTRAINT "SocialVoiceProfile_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialAccount"
ADD CONSTRAINT "SocialAccount_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialMediaAsset"
ADD CONSTRAINT "SocialMediaAsset_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialPost"
ADD CONSTRAINT "SocialPost_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialPost"
ADD CONSTRAINT "SocialPost_approvalRequestId_fkey"
FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialPost"
ADD CONSTRAINT "SocialPost_mediaAssetId_fkey"
FOREIGN KEY ("mediaAssetId") REFERENCES "SocialMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialPost"
ADD CONSTRAINT "SocialPost_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialPost"
ADD CONSTRAINT "SocialPost_createdByOperatorId_fkey"
FOREIGN KEY ("createdByOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialPostTarget"
ADD CONSTRAINT "SocialPostTarget_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialPostTarget"
ADD CONSTRAINT "SocialPostTarget_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialSendLog"
ADD CONSTRAINT "SocialSendLog_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialSendLog"
ADD CONSTRAINT "SocialSendLog_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialSendLog"
ADD CONSTRAINT "SocialSendLog_targetId_fkey"
FOREIGN KEY ("targetId") REFERENCES "SocialPostTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialInboxItem"
ADD CONSTRAINT "SocialInboxItem_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialReplyDraft"
ADD CONSTRAINT "SocialReplyDraft_inboxItemId_fkey"
FOREIGN KEY ("inboxItemId") REFERENCES "SocialInboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialWeeklyPlan"
ADD CONSTRAINT "SocialWeeklyPlan_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialAnalyticsSnapshot"
ADD CONSTRAINT "SocialAnalyticsSnapshot_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
