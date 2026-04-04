-- CreateEnum
CREATE TYPE "ArtistMembershipRole" AS ENUM ('owner', 'member');

-- CreateTable
CREATE TABLE "Operator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleSub" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistMembership" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "role" "ArtistMembershipRole" NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_googleSub_key" ON "Operator"("googleSub");

-- CreateIndex
CREATE INDEX "ArtistMembership_artistId_idx" ON "ArtistMembership"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistMembership_operatorId_artistId_key" ON "ArtistMembership"("operatorId", "artistId");

-- AddForeignKey
ALTER TABLE "ArtistMembership" ADD CONSTRAINT "ArtistMembership_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistMembership" ADD CONSTRAINT "ArtistMembership_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorOperatorId" TEXT;

-- CreateIndex
CREATE INDEX "AuditEvent_actorOperatorId_idx" ON "AuditEvent"("actorOperatorId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorOperatorId_fkey" FOREIGN KEY ("actorOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
