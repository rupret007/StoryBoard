-- Claim-first inbound webhook deliveries (Telegram update_id, Stripe event id).
-- New rows default to attempted; processed is set only after the handler finishes.

CREATE TYPE "InboundWebhookClaimStatus" AS ENUM ('attempted', 'processed');

CREATE TABLE "InboundWebhookClaim" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "InboundWebhookClaimStatus" NOT NULL DEFAULT 'attempted',
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundWebhookClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundWebhookClaim_provider_eventId_key" ON "InboundWebhookClaim"("provider", "eventId");
CREATE INDEX "InboundWebhookClaim_provider_idx" ON "InboundWebhookClaim"("provider");
