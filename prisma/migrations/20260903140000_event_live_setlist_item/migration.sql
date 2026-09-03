-- AlterTable
ALTER TABLE "BandEvent" ADD COLUMN "liveSetlistItemId" TEXT;

-- CreateIndex
CREATE INDEX "BandEvent_liveSetlistItemId_idx" ON "BandEvent"("liveSetlistItemId");

-- AddForeignKey
ALTER TABLE "BandEvent" ADD CONSTRAINT "BandEvent_liveSetlistItemId_fkey" FOREIGN KEY ("liveSetlistItemId") REFERENCES "SetlistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
