-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('general', 'promoter', 'venue_staff');

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN "lat" DOUBLE PRECISION,
ADD COLUMN "lng" DOUBLE PRECISION,
ADD COLUMN "driveMinutesFromBase" INTEGER,
ADD COLUMN "fitScore" INTEGER;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "contactKind" "ContactKind" NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE "CommandRun" ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "intent" TEXT;

-- CreateIndex
CREATE INDEX "CommandRun_artistId_createdAt_idx" ON "CommandRun"("artistId", "createdAt");

-- AddForeignKey
ALTER TABLE "CommandRun" ADD CONSTRAINT "CommandRun_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN "artistId" TEXT;
CREATE INDEX "AuditEvent_artistId_createdAt_idx" ON "AuditEvent"("artistId", "createdAt");
