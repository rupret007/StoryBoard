-- Stable nullable source keys let StoryBoard fill missing starter-plan steps
-- without replacing user-edited goals, initiatives, or tasks.
ALTER TABLE "ManagerGoal" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "ManagerInitiative" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "Task" ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "ManagerGoal_artistId_sourceKey_key"
  ON "ManagerGoal"("artistId", "sourceKey");
CREATE UNIQUE INDEX "ManagerInitiative_artistId_sourceKey_key"
  ON "ManagerInitiative"("artistId", "sourceKey");
CREATE UNIQUE INDEX "Task_artistId_sourceKey_key"
  ON "Task"("artistId", "sourceKey");
