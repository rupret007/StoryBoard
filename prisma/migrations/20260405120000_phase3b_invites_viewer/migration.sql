-- AlterEnum
ALTER TYPE "ArtistMembershipRole" ADD VALUE 'viewer';

-- CreateEnum
CREATE TYPE "MembershipInviteStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateTable
CREATE TABLE "ArtistMembershipInvite" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ArtistMembershipRole" NOT NULL DEFAULT 'member',
    "tokenHash" TEXT NOT NULL,
    "status" "MembershipInviteStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByOperatorId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedOperatorId" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ArtistMembershipInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistMembershipInvite_tokenHash_key" ON "ArtistMembershipInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "ArtistMembershipInvite_artistId_idx" ON "ArtistMembershipInvite"("artistId");

-- CreateIndex
CREATE INDEX "ArtistMembershipInvite_artistId_email_idx" ON "ArtistMembershipInvite"("artistId", "email");

-- AddForeignKey
ALTER TABLE "ArtistMembershipInvite" ADD CONSTRAINT "ArtistMembershipInvite_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistMembershipInvite" ADD CONSTRAINT "ArtistMembershipInvite_createdByOperatorId_fkey" FOREIGN KEY ("createdByOperatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistMembershipInvite" ADD CONSTRAINT "ArtistMembershipInvite_acceptedOperatorId_fkey" FOREIGN KEY ("acceptedOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
