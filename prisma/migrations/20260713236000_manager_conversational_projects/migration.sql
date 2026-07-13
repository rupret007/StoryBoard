ALTER TABLE "ManagerRecommendation" ADD COLUMN "projectId" TEXT;

CREATE INDEX "ManagerRecommendation_projectId_idx" ON "ManagerRecommendation"("projectId");

ALTER TABLE "ManagerRecommendation"
ADD CONSTRAINT "ManagerRecommendation_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "ArtistProject"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
