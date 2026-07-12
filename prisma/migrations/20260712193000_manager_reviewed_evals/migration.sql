-- Owner-reviewed examples are local evaluation data. They never activate a
-- prompt or policy version automatically.
CREATE TABLE "ManagerEvalExample" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "promotedByOperatorId" TEXT,
  "label" TEXT NOT NULL,
  "notes" TEXT,
  "promptVersion" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagerEvalExample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagerEvalExample_recommendationId_key"
  ON "ManagerEvalExample"("recommendationId");

CREATE INDEX "ManagerEvalExample_artistId_createdAt_idx"
  ON "ManagerEvalExample"("artistId", "createdAt");

ALTER TABLE "ManagerEvalExample"
  ADD CONSTRAINT "ManagerEvalExample_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerEvalExample"
  ADD CONSTRAINT "ManagerEvalExample_recommendationId_fkey"
  FOREIGN KEY ("recommendationId") REFERENCES "ManagerRecommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerEvalExample"
  ADD CONSTRAINT "ManagerEvalExample_promotedByOperatorId_fkey"
  FOREIGN KEY ("promotedByOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
