-- CreateEnum
CREATE TYPE "BookingAdvisorTrigger" AS ENUM ('manual', 'scheduled');

-- CreateEnum
CREATE TYPE "BookingAdvisorRecommendationOutcome" AS ENUM ('suggested', 'accepted', 'dismissed', 'completed', 'blocked');

-- AlterTable
ALTER TABLE "BookingAdvisorRun" ADD COLUMN "trigger" "BookingAdvisorTrigger" NOT NULL DEFAULT 'manual',
ADD COLUMN "scheduledLocalDate" TEXT;

-- AlterTable
ALTER TABLE "BookingCampaign" ADD COLUMN "aiAutomationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BookingAdvisorSettings" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT,
    "dailyHour" INTEGER NOT NULL DEFAULT 9,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingAdvisorSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAdvisorRecommendation" (
    "id" TEXT NOT NULL,
    "advisorRunId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "outcome" "BookingAdvisorRecommendationOutcome" NOT NULL DEFAULT 'suggested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingAdvisorRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingAdvisorRun_artistId_trigger_scheduledLocalDate_key" ON "BookingAdvisorRun"("artistId", "trigger", "scheduledLocalDate");
CREATE UNIQUE INDEX "BookingAdvisorSettings_artistId_key" ON "BookingAdvisorSettings"("artistId");
CREATE UNIQUE INDEX "BookingAdvisorRecommendation_advisorRunId_stableKey_key" ON "BookingAdvisorRecommendation"("advisorRunId", "stableKey");
CREATE INDEX "BookingAdvisorRecommendation_advisorRunId_outcome_idx" ON "BookingAdvisorRecommendation"("advisorRunId", "outcome");

-- AddForeignKey
ALTER TABLE "BookingAdvisorSettings" ADD CONSTRAINT "BookingAdvisorSettings_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingAdvisorRecommendation" ADD CONSTRAINT "BookingAdvisorRecommendation_advisorRunId_fkey" FOREIGN KEY ("advisorRunId") REFERENCES "BookingAdvisorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
