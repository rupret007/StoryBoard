-- CreateEnum
CREATE TYPE "BookingProspectKind" AS ENUM ('venue', 'festival', 'private_event', 'corporate_event');

-- CreateEnum
CREATE TYPE "BookingProspectStatus" AS ENUM ('discovered', 'qualified', 'disqualified', 'converted');

-- CreateEnum
CREATE TYPE "BookingCampaignStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "BookingCampaignRecipientStatus" AS ENUM ('needs_contact', 'ready', 'approval_requested', 'drafted', 'replied', 'declined', 'booked');

-- CreateTable
CREATE TABLE "ArtistBookingProfile" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "homeCity" TEXT,
    "homeRegion" TEXT,
    "homeCountry" TEXT,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetCapacityMin" INTEGER,
    "targetCapacityMax" INTEGER,
    "bookingPitch" TEXT,
    "pressKitUrl" TEXT,
    "liveVideoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistBookingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingProspect" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "kind" "BookingProspectKind" NOT NULL,
    "status" "BookingProspectStatus" NOT NULL DEFAULT 'discovered',
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "country" TEXT,
    "capacity" INTEGER,
    "websiteUrl" TEXT,
    "notes" TEXT,
    "sourceSystem" TEXT,
    "sourceRef" TEXT,
    "sourceMetadata" JSONB,
    "venueId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingCampaign" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BookingCampaignStatus" NOT NULL DEFAULT 'draft',
    "dateWindowStart" TIMESTAMP(3),
    "dateWindowEnd" TIMESTAMP(3),
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "defaultFollowUpDays" INTEGER NOT NULL DEFAULT 7,
    "approvalRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "status" "BookingCampaignRecipientStatus" NOT NULL DEFAULT 'needs_contact',
    "outcomeNote" TEXT,
    "followUpDueAt" TIMESTAMP(3),
    "followUpTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistBookingProfile_artistId_key" ON "ArtistBookingProfile"("artistId");

-- CreateIndex
CREATE INDEX "BookingProspect_artistId_status_idx" ON "BookingProspect"("artistId", "status");

-- CreateIndex
CREATE INDEX "BookingProspect_artistId_updatedAt_idx" ON "BookingProspect"("artistId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingProspect_artistId_sourceSystem_sourceRef_key" ON "BookingProspect"("artistId", "sourceSystem", "sourceRef");

-- CreateIndex
CREATE UNIQUE INDEX "BookingCampaign_approvalRequestId_key" ON "BookingCampaign"("approvalRequestId");

-- CreateIndex
CREATE INDEX "BookingCampaign_artistId_status_idx" ON "BookingCampaign"("artistId", "status");

-- CreateIndex
CREATE INDEX "BookingCampaign_artistId_updatedAt_idx" ON "BookingCampaign"("artistId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingCampaignRecipient_followUpTaskId_key" ON "BookingCampaignRecipient"("followUpTaskId");

-- CreateIndex
CREATE INDEX "BookingCampaignRecipient_campaignId_status_idx" ON "BookingCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "BookingCampaignRecipient_followUpDueAt_idx" ON "BookingCampaignRecipient"("followUpDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingCampaignRecipient_campaignId_prospectId_key" ON "BookingCampaignRecipient"("campaignId", "prospectId");

-- AddForeignKey
ALTER TABLE "ArtistBookingProfile" ADD CONSTRAINT "ArtistBookingProfile_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProspect" ADD CONSTRAINT "BookingProspect_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProspect" ADD CONSTRAINT "BookingProspect_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProspect" ADD CONSTRAINT "BookingProspect_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingProspect" ADD CONSTRAINT "BookingProspect_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "BookingOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaign" ADD CONSTRAINT "BookingCampaign_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaignRecipient" ADD CONSTRAINT "BookingCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BookingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaignRecipient" ADD CONSTRAINT "BookingCampaignRecipient_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "BookingProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaignRecipient" ADD CONSTRAINT "BookingCampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaignRecipient" ADD CONSTRAINT "BookingCampaignRecipient_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "BookingOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCampaignRecipient" ADD CONSTRAINT "BookingCampaignRecipient_followUpTaskId_fkey" FOREIGN KEY ("followUpTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
