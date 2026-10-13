-- Stripe evt_ deliveries claimed after signature verification.
-- processing rows hold a lease so a crash before complete can be retried.
-- completed is set only after the handler finishes.

CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('processing', 'completed');

CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'processing',
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "eventType" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");
CREATE INDEX "StripeWebhookEvent_status_leaseExpiresAt_idx" ON "StripeWebhookEvent"("status", "leaseExpiresAt");
