ALTER TABLE "ManagerSettings"
ADD COLUMN "scheduledAiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scheduleAudience" TEXT NOT NULL DEFAULT 'owners',
ADD COLUMN "weeklyDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "lastScheduledPeriod" TEXT,
ADD COLUMN "scheduleClaimedAt" TIMESTAMP(3),
ADD COLUMN "lastScheduledAt" TIMESTAMP(3);

ALTER TABLE "ManagerSettings"
ADD CONSTRAINT "ManagerSettings_scheduleAudience_check"
CHECK ("scheduleAudience" IN ('owners', 'team')),
ADD CONSTRAINT "ManagerSettings_weeklyDay_check"
CHECK ("weeklyDay" BETWEEN 1 AND 7);

ALTER TABLE "ManagerRun"
ADD COLUMN "scheduleKey" TEXT;

CREATE UNIQUE INDEX "ManagerRun_scheduleKey_key" ON "ManagerRun"("scheduleKey");
