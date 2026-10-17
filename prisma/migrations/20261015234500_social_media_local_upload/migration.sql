-- Local disk storage + chunked upload progress for phone/desktop drops.

CREATE TYPE "SocialMediaUploadStatus" AS ENUM ('pending', 'uploading', 'ready', 'failed');

ALTER TABLE "SocialMediaAsset"
ADD COLUMN "receivedBytes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "storageKey" TEXT,
ADD COLUMN "uploadStatus" "SocialMediaUploadStatus" NOT NULL DEFAULT 'ready',
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "SocialMediaAsset_artistId_uploadStatus_idx" ON "SocialMediaAsset"("artistId", "uploadStatus");
