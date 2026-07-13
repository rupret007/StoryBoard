ALTER TABLE "ApprovalRequest"
ADD COLUMN "eventId" TEXT,
ADD COLUMN "managerRecommendationId" TEXT,
ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "ApprovalRequest_artistId_sourceKey_key"
ON "ApprovalRequest"("artistId", "sourceKey");

CREATE INDEX "ApprovalRequest_artistId_status_createdAt_idx"
ON "ApprovalRequest"("artistId", "status", "createdAt");

CREATE INDEX "ApprovalRequest_eventId_actionType_status_idx"
ON "ApprovalRequest"("eventId", "actionType", "status");

CREATE INDEX "ApprovalRequest_managerRecommendationId_idx"
ON "ApprovalRequest"("managerRecommendationId");

ALTER TABLE "ApprovalRequest"
ADD CONSTRAINT "ApprovalRequest_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "BandEvent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApprovalRequest"
ADD CONSTRAINT "ApprovalRequest_managerRecommendationId_fkey"
FOREIGN KEY ("managerRecommendationId") REFERENCES "ManagerRecommendation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
