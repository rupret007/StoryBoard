-- CreateEnum
CREATE TYPE "InviteDeliveryChannel" AS ENUM ('none', 'gmail_draft', 'mock', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "WorkflowNotificationKind" AS ENUM (
  'invite_delivered',
  'approval_created',
  'approval_approved',
  'approval_rejected',
  'approval_executed',
  'approval_failed',
  'membership_invite_accepted',
  'integration_connection_changed',
  'task_overdue_digest',
  'followup_stale_digest'
);

-- AlterTable
ALTER TABLE "Operator" ADD COLUMN "workflowEmailEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ArtistMembershipInvite" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "deliveryChannel" "InviteDeliveryChannel" NOT NULL DEFAULT 'none',
ADD COLUMN "deliveryLastError" TEXT;

-- CreateTable
CREATE TABLE "WorkflowNotification" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "recipientOperatorId" TEXT NOT NULL,
    "kind" "WorkflowNotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowNotification_recipientOperatorId_artistId_readAt_idx" ON "WorkflowNotification"("recipientOperatorId", "artistId", "readAt");

-- CreateIndex
CREATE INDEX "WorkflowNotification_artistId_createdAt_idx" ON "WorkflowNotification"("artistId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkflowNotification" ADD CONSTRAINT "WorkflowNotification_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowNotification" ADD CONSTRAINT "WorkflowNotification_recipientOperatorId_fkey" FOREIGN KEY ("recipientOperatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
