-- Tie each delivered manager response to its run so reviewed outcomes can be
-- evaluated without duplicating conversation content.
ALTER TABLE "ManagerMessage" ADD COLUMN "managerRunId" TEXT;

CREATE UNIQUE INDEX "ManagerMessage_managerRunId_key" ON "ManagerMessage"("managerRunId");

ALTER TABLE "ManagerMessage"
ADD CONSTRAINT "ManagerMessage_managerRunId_fkey"
FOREIGN KEY ("managerRunId") REFERENCES "ManagerRun"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ManagerMessageFeedback" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "managerMessageId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerMessageFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagerMessageFeedback_managerMessageId_operatorId_key"
ON "ManagerMessageFeedback"("managerMessageId", "operatorId");

CREATE INDEX "ManagerMessageFeedback_artistId_createdAt_idx"
ON "ManagerMessageFeedback"("artistId", "createdAt");

ALTER TABLE "ManagerMessageFeedback"
ADD CONSTRAINT "ManagerMessageFeedback_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerMessageFeedback"
ADD CONSTRAINT "ManagerMessageFeedback_managerMessageId_fkey"
FOREIGN KEY ("managerMessageId") REFERENCES "ManagerMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerMessageFeedback"
ADD CONSTRAINT "ManagerMessageFeedback_operatorId_fkey"
FOREIGN KEY ("operatorId") REFERENCES "Operator"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
