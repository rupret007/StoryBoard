CREATE TABLE "ManagerResponseEvalExample" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "managerMessageId" TEXT NOT NULL,
    "promotedByOperatorId" TEXT,
    "label" TEXT NOT NULL,
    "expectedBehavior" TEXT,
    "notes" TEXT,
    "promptVersion" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByOperatorId" TEXT,
    "resolutionVersion" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerResponseEvalExample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagerResponseEvalExample_managerMessageId_key"
ON "ManagerResponseEvalExample"("managerMessageId");

CREATE INDEX "ManagerResponseEvalExample_artistId_createdAt_idx"
ON "ManagerResponseEvalExample"("artistId", "createdAt");

CREATE INDEX "ManagerResponseEvalExample_artistId_label_resolvedAt_idx"
ON "ManagerResponseEvalExample"("artistId", "label", "resolvedAt");

ALTER TABLE "ManagerResponseEvalExample"
ADD CONSTRAINT "ManagerResponseEvalExample_artistId_fkey"
FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerResponseEvalExample"
ADD CONSTRAINT "ManagerResponseEvalExample_managerMessageId_fkey"
FOREIGN KEY ("managerMessageId") REFERENCES "ManagerMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerResponseEvalExample"
ADD CONSTRAINT "ManagerResponseEvalExample_promotedByOperatorId_fkey"
FOREIGN KEY ("promotedByOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManagerResponseEvalExample"
ADD CONSTRAINT "ManagerResponseEvalExample_resolvedByOperatorId_fkey"
FOREIGN KEY ("resolvedByOperatorId") REFERENCES "Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
