-- Preserve structured recommendation feedback for reviewed learning and allow
-- incorrect memory to be archived without deleting its audit history.
ALTER TABLE "ManagerMemoryFact"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "ManagerRecommendation"
  ADD COLUMN "outcomeReason" TEXT,
  ADD COLUMN "outcomeNote" TEXT,
  ADD COLUMN "outcomeAt" TIMESTAMP(3);

CREATE INDEX "ManagerMemoryFact_artistId_archivedAt_updatedAt_idx"
  ON "ManagerMemoryFact"("artistId", "archivedAt", "updatedAt");

CREATE INDEX "ManagerRecommendation_stableKey_outcome_updatedAt_idx"
  ON "ManagerRecommendation"("stableKey", "outcome", "updatedAt");
