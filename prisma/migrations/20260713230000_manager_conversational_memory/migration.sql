ALTER TABLE "ManagerRecommendation"
ADD COLUMN "memoryFactId" TEXT;

CREATE INDEX "ManagerRecommendation_memoryFactId_idx"
ON "ManagerRecommendation"("memoryFactId");

ALTER TABLE "ManagerRecommendation"
ADD CONSTRAINT "ManagerRecommendation_memoryFactId_fkey"
FOREIGN KEY ("memoryFactId") REFERENCES "ManagerMemoryFact"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
