-- CreateEnum
CREATE TYPE "BookingReplyProcessingStatus" AS ENUM ('unread', 'reviewed', 'archived');

-- CreateEnum
CREATE TYPE "BookingReplyIntent" AS ENUM ('interested', 'offer', 'needs_info', 'decline', 'out_of_office', 'unknown');

ALTER TYPE "BookingCampaignDeliveryStatus" ADD VALUE 'drafted';
ALTER TYPE "WorkflowNotificationKind" ADD VALUE 'booking_reply_detected';

-- AlterTable
ALTER TABLE "BookingCampaignDelivery" ADD COLUMN     "providerDraftId" TEXT,
ADD COLUMN     "providerThreadId" TEXT;

-- AlterTable
ALTER TABLE "BookingOpportunity" ADD COLUMN     "depositDueAt" TIMESTAMP(3),
ADD COLUMN     "negotiationConditions" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "proposedCurrency" TEXT,
ADD COLUMN     "proposedFeeMinor" INTEGER;

-- CreateTable
CREATE TABLE "ArtistBookingReplySettings" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistBookingReplySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingReply" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "providerMessageId" TEXT NOT NULL,
    "providerThreadId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processingStatus" "BookingReplyProcessingStatus" NOT NULL DEFAULT 'unread',
    "intent" "BookingReplyIntent",
    "summary" TEXT,
    "proposedDate" TIMESTAMP(3),
    "proposedFeeMinor" INTEGER,
    "proposedCurrency" TEXT,
    "proposedVenue" TEXT,
    "materialConditions" TEXT,
    "questions" JSONB,
    "recommendedNextAction" TEXT,
    "suggestedReplySubject" TEXT,
    "suggestedReplyBody" TEXT,
    "confidence" DOUBLE PRECISION,
    "evidence" JSONB,
    "analysisMode" TEXT,
    "analysisModel" TEXT,
    "promptVersion" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "termsAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "opportunityId" TEXT,

    CONSTRAINT "BookingReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistBookingReplySettings_artistId_key" ON "ArtistBookingReplySettings"("artistId");

-- CreateIndex
CREATE INDEX "BookingReply_artistId_processingStatus_receivedAt_idx" ON "BookingReply"("artistId", "processingStatus", "receivedAt");

-- CreateIndex
CREATE INDEX "BookingReply_recipientId_receivedAt_idx" ON "BookingReply"("recipientId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingReply_artistId_providerMessageId_key" ON "BookingReply"("artistId", "providerMessageId");

-- AddForeignKey
ALTER TABLE "ArtistBookingReplySettings" ADD CONSTRAINT "ArtistBookingReplySettings_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReply" ADD CONSTRAINT "BookingReply_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReply" ADD CONSTRAINT "BookingReply_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "BookingCampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReply" ADD CONSTRAINT "BookingReply_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "BookingCampaignDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReply" ADD CONSTRAINT "BookingReply_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "BookingOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
