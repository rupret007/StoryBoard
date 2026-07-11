-- CreateEnum
CREATE TYPE "BookingMarketSprintStatus" AS ENUM ('draft', 'active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "BookingCampaignDeliveryMode" AS ENUM ('draft_only', 'send_on_execution');

-- CreateEnum
CREATE TYPE "BookingCampaignDeliveryStatus" AS ENUM ('pending', 'sending', 'sent', 'failed', 'unknown');

-- AlterEnum
ALTER TYPE "BookingCampaignRecipientStatus" ADD VALUE 'sent';

-- AlterTable
ALTER TABLE "BookingCampaign" ADD COLUMN     "deliveryMode" "BookingCampaignDeliveryMode" NOT NULL DEFAULT 'draft_only',
ADD COLUMN     "marketSprintId" TEXT;

-- AlterTable
ALTER TABLE "BookingCampaignRecipient" ADD COLUMN     "outcomeKind" TEXT;

-- AlterTable
ALTER TABLE "BookingProspect" ADD COLUMN     "marketSprintId" TEXT;

-- CreateTable
CREATE TABLE "BookingMarketSprint" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "country" TEXT,
    "targetDateWindowStart" TIMESTAMP(3),
    "targetDateWindowEnd" TIMESTAMP(3),
    "targetQualifiedCount" INTEGER,
    "targetOutreachCount" INTEGER,
    "targetBookedCount" INTEGER,
    "status" "BookingMarketSprintStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingMarketSprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingCampaignDelivery" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "BookingCampaignDeliveryStatus" NOT NULL DEFAULT 'pending',
    "providerMessageId" TEXT,
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingCampaignDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingMarketSprint_artistId_status_idx" ON "BookingMarketSprint"("artistId", "status");

-- CreateIndex
CREATE INDEX "BookingMarketSprint_artistId_updatedAt_idx" ON "BookingMarketSprint"("artistId", "updatedAt");

-- CreateIndex
CREATE INDEX "BookingCampaignDelivery_artistId_status_idx" ON "BookingCampaignDelivery"("artistId", "status");

-- CreateIndex
CREATE INDEX "BookingCampaignDelivery_recipientId_idx" ON "BookingCampaignDelivery"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingCampaignDelivery_approvalId_recipientId_key" ON "BookingCampaignDelivery"("approvalId", "recipientId");

-- CreateIndex
CREATE INDEX "BookingCampaign_marketSprintId_status_idx" ON "BookingCampaign"("marketSprintId", "status");

-- CreateIndex
CREATE INDEX "BookingProspect_marketSprintId_status_idx" ON "BookingProspect"("marketSprintId", "status");

-- AddForeignKey
ALTER TABLE "BookingProspect" ADD CONSTRAINT "BookingProspect_marketSprintId_fkey" FOREIGN KEY ("marketSprintId") REFERENCES "BookingMarketSprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingMarketSprint" ADD CONSTRAINT "BookingMarketSprint_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaign" ADD CONSTRAINT "BookingCampaign_marketSprintId_fkey" FOREIGN KEY ("marketSprintId") REFERENCES "BookingMarketSprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaignDelivery" ADD CONSTRAINT "BookingCampaignDelivery_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaignDelivery" ADD CONSTRAINT "BookingCampaignDelivery_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaignDelivery" ADD CONSTRAINT "BookingCampaignDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "BookingCampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
