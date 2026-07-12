ALTER TABLE "ManagerDecision"
ADD COLUMN "needsFraming" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ManagerRecommendation"
ADD COLUMN "decisionId" TEXT;

CREATE UNIQUE INDEX "ManagerRecommendation_decisionId_key"
ON "ManagerRecommendation"("decisionId");

ALTER TABLE "ManagerRecommendation"
ADD CONSTRAINT "ManagerRecommendation_decisionId_fkey"
FOREIGN KEY ("decisionId") REFERENCES "ManagerDecision"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
