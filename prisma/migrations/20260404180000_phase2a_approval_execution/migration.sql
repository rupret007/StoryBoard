-- AlterEnum
ALTER TYPE "ApprovalStatus" ADD VALUE 'executed';
ALTER TYPE "ApprovalStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "ApprovalRequest" ADD COLUMN "executionAttemptedAt" TIMESTAMP(3);
