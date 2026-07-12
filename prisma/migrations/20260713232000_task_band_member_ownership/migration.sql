ALTER TABLE "Task" ADD COLUMN "bandMemberId" TEXT;

CREATE INDEX "Task_artistId_bandMemberId_idx" ON "Task"("artistId", "bandMemberId");

ALTER TABLE "Task"
ADD CONSTRAINT "Task_bandMemberId_fkey"
FOREIGN KEY ("bandMemberId") REFERENCES "BandMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
