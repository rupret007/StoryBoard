-- Keep non-public and uncertain provider receipts distinct from public posts.
ALTER TYPE "SocialPostStatus" ADD VALUE 'simulated';
ALTER TYPE "SocialPostStatus" ADD VALUE 'draft_only';
ALTER TYPE "SocialPostStatus" ADD VALUE 'private_upload';
ALTER TYPE "SocialPostStatus" ADD VALUE 'processing';
ALTER TYPE "SocialPostStatus" ADD VALUE 'unknown';

ALTER TYPE "SocialTargetStatus" ADD VALUE 'simulated';
ALTER TYPE "SocialTargetStatus" ADD VALUE 'private_upload';
ALTER TYPE "SocialTargetStatus" ADD VALUE 'processing';
ALTER TYPE "SocialTargetStatus" ADD VALUE 'unknown';

ALTER TYPE "SocialSendOutcome" ADD VALUE 'simulated';
ALTER TYPE "SocialSendOutcome" ADD VALUE 'private_upload';
ALTER TYPE "SocialSendOutcome" ADD VALUE 'processing';
ALTER TYPE "SocialSendOutcome" ADD VALUE 'unknown';
