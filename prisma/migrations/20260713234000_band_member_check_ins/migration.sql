CREATE TYPE "BandMemberCheckInStatus" AS ENUM ('available', 'limited', 'unavailable');

CREATE TABLE "BandMemberCheckIn" (
  "id" TEXT NOT NULL,
  "artistId" TEXT NOT NULL,
  "bandMemberId" TEXT NOT NULL,
  "recordedByOperatorId" TEXT,
  "status" "BandMemberCheckInStatus" NOT NULL,
  "note" TEXT,
  "effectiveUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BandMemberCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BandMemberCheckIn_artistId_createdAt_idx" ON "BandMemberCheckIn"("artistId", "createdAt");
CREATE INDEX "BandMemberCheckIn_bandMemberId_createdAt_idx" ON "BandMemberCheckIn"("bandMemberId", "createdAt");

ALTER TABLE "BandMemberCheckIn"
ADD CONSTRAINT "BandMemberCheckIn_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BandMemberCheckIn"
ADD CONSTRAINT "BandMemberCheckIn_bandMemberId_fkey"
FOREIGN KEY ("bandMemberId") REFERENCES "BandMember"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BandMemberCheckIn"
ADD CONSTRAINT "BandMemberCheckIn_recordedByOperatorId_fkey"
FOREIGN KEY ("recordedByOperatorId") REFERENCES "Operator"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
