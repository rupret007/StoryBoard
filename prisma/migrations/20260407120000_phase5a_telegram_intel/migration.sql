-- AlterTable
ALTER TABLE "Artist" ADD COLUMN     "telegramUrgentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramNotifyCategories" JSONB;

-- CreateTable
CREATE TABLE "TelegramUrgentDedupe" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "TelegramUrgentDedupe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramUrgentDedupe_artistId_idx" ON "TelegramUrgentDedupe"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUrgentDedupe_artistId_dedupeKey_key" ON "TelegramUrgentDedupe"("artistId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "TelegramUrgentDedupe" ADD CONSTRAINT "TelegramUrgentDedupe_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
