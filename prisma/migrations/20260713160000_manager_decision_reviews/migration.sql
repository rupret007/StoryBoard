ALTER TYPE "ManagerDecisionStatus" ADD VALUE 'reviewed';

CREATE TYPE "ManagerDecisionReviewOutcome" AS ENUM ('worked', 'mixed', 'did_not_work', 'inconclusive');

ALTER TABLE "ManagerDecision"
ADD COLUMN "expectedOutcome" TEXT,
ADD COLUMN "reviewOutcome" "ManagerDecisionReviewOutcome",
ADD COLUMN "reviewNote" TEXT,
ADD COLUMN "reviewEvidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "reviewedAt" TIMESTAMP(3);
