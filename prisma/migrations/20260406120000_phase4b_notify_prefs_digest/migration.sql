-- AlterEnum (PostgreSQL 10+; run once per migration)
ALTER TYPE "WorkflowNotificationKind" ADD VALUE 'digest_daily';
ALTER TYPE "WorkflowNotificationKind" ADD VALUE 'digest_weekly';

-- AlterTable
ALTER TABLE "ArtistMembership" ADD COLUMN "workflowNotifyPrefs" JSONB;

-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "workflowOverdueGraceDays" INTEGER;
ALTER TABLE "Artist" ADD COLUMN "workflowStaleFollowupDays" INTEGER;
ALTER TABLE "Artist" ADD COLUMN "workflowPendingApprovalDays" INTEGER;
