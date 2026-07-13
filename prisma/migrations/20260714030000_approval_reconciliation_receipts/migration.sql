CREATE TYPE "ApprovalReconciliationOutcome" AS ENUM (
  'still_unknown',
  'external_effect_observed',
  'no_external_effect_observed'
);

CREATE TABLE "ApprovalReconciliation" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "outcome" "ApprovalReconciliationOutcome" NOT NULL,
  "resolutionKey" TEXT,
  "note" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL DEFAULT 'approval_reconciliation_v1',
  "observedAt" TIMESTAMP(3) NOT NULL,
  "actorLabel" TEXT,
  "actorOperatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApprovalReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovalReconciliation_artistId_idempotencyKey_key"
ON "ApprovalReconciliation"("artistId", "idempotencyKey");

CREATE UNIQUE INDEX "ApprovalRequest_id_artistId_key"
ON "ApprovalRequest"("id", "artistId");

-- PostgreSQL permits multiple NULL values here, so uncertainty checks remain
-- append-only while the literal terminal key permits one conclusive receipt.
CREATE UNIQUE INDEX "ApprovalReconciliation_approvalId_resolutionKey_key"
ON "ApprovalReconciliation"("approvalId", "resolutionKey");

ALTER TABLE "ApprovalReconciliation"
ADD CONSTRAINT "ApprovalReconciliation_resolution_key_check"
CHECK (
  ("outcome" = 'still_unknown' AND "resolutionKey" IS NULL) OR
  ("outcome" IN ('external_effect_observed', 'no_external_effect_observed') AND "resolutionKey" = 'terminal')
);

CREATE INDEX "ApprovalReconciliation_approvalId_createdAt_idx"
ON "ApprovalReconciliation"("approvalId", "createdAt");

CREATE INDEX "ApprovalReconciliation_artistId_outcome_createdAt_idx"
ON "ApprovalReconciliation"("artistId", "outcome", "createdAt");

ALTER TABLE "ApprovalReconciliation"
ADD CONSTRAINT "ApprovalReconciliation_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalReconciliation"
ADD CONSTRAINT "ApprovalReconciliation_approvalId_fkey"
FOREIGN KEY ("approvalId", "artistId") REFERENCES "ApprovalRequest"("id", "artistId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalReconciliation"
ADD CONSTRAINT "ApprovalReconciliation_actorOperatorId_fkey"
FOREIGN KEY ("actorOperatorId") REFERENCES "Operator"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
