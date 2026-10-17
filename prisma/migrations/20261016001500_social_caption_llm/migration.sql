-- LLM caption drafts with template fallback and per-platform variants.

CREATE TYPE "SocialCaptionSource" AS ENUM ('template', 'llm');

ALTER TABLE "SocialPost"
ADD COLUMN "captionSource" "SocialCaptionSource" NOT NULL DEFAULT 'template',
ADD COLUMN "captionNotice" TEXT;

ALTER TABLE "SocialPostTarget"
ADD COLUMN "captionVariants" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "selectedVariantIndex" INTEGER NOT NULL DEFAULT 0;
