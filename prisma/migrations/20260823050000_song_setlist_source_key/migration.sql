-- AlterTable
ALTER TABLE "Song" ADD COLUMN "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "Setlist" ADD COLUMN "sourceKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Song_artistId_sourceKey_key" ON "Song"("artistId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Setlist_artistId_sourceKey_key" ON "Setlist"("artistId", "sourceKey");
