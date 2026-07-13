ALTER TABLE "ManagerRecommendation" ADD COLUMN "eventId" TEXT;

CREATE INDEX "ManagerRecommendation_eventId_idx" ON "ManagerRecommendation"("eventId");

ALTER TABLE "ManagerRecommendation"
ADD CONSTRAINT "ManagerRecommendation_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
