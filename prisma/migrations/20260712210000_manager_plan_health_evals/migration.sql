-- Goal progress is append-only so a manager can explain where a number came
-- from. Evaluation runs are owner-triggered records and never activate code.
CREATE TABLE "ManagerGoalProgressEvent" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "goalId" TEXT NOT NULL,
  "recordedByOperatorId" TEXT,
  "previousValue" DOUBLE PRECISION,
  "value" DOUBLE PRECISION NOT NULL,
  "delta" DOUBLE PRECISION,
  "note" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagerGoalProgressEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagerGoalProgressEvent_artistId_goalId_createdAt_idx"
  ON "ManagerGoalProgressEvent"("artistId", "goalId", "createdAt");

ALTER TABLE "ManagerGoalProgressEvent" ADD CONSTRAINT "ManagerGoalProgressEvent_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagerGoalProgressEvent" ADD CONSTRAINT "ManagerGoalProgressEvent_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "ManagerGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagerGoalProgressEvent" ADD CONSTRAINT "ManagerGoalProgressEvent_recordedByOperatorId_fkey"
  FOREIGN KEY ("recordedByOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ManagerEvaluationRun" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "createdByOperatorId" TEXT,
  "candidateVersion" TEXT NOT NULL,
  "datasetVersion" TEXT NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "metrics" JSONB NOT NULL,
  "results" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagerEvaluationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagerEvaluationRun_artistId_createdAt_idx"
  ON "ManagerEvaluationRun"("artistId", "createdAt");

ALTER TABLE "ManagerEvaluationRun" ADD CONSTRAINT "ManagerEvaluationRun_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagerEvaluationRun" ADD CONSTRAINT "ManagerEvaluationRun_createdByOperatorId_fkey"
  FOREIGN KEY ("createdByOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
