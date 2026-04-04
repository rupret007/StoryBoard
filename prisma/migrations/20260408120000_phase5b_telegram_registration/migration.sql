-- CreateTable
CREATE TABLE "TelegramRegistrationToken" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "createdByOperatorId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "boundChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramRegistrationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramRegistrationToken_tokenHash_key" ON "TelegramRegistrationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramRegistrationToken_artistId_idx" ON "TelegramRegistrationToken"("artistId");

-- CreateIndex
CREATE INDEX "TelegramRegistrationToken_expiresAt_idx" ON "TelegramRegistrationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "TelegramRegistrationToken" ADD CONSTRAINT "TelegramRegistrationToken_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramRegistrationToken" ADD CONSTRAINT "TelegramRegistrationToken_createdByOperatorId_fkey" FOREIGN KEY ("createdByOperatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
