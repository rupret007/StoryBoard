CREATE TYPE "ManagerGoalTargetDirection" AS ENUM (
  'at_least',
  'at_most',
  'exact'
);

ALTER TABLE "ManagerGoal"
ADD COLUMN "targetDirection" "ManagerGoalTargetDirection" NOT NULL DEFAULT 'at_least';

-- Existing StoryBoard goals were interpreted as cumulative targets. Preserve
-- that behavior explicitly while allowing new cap and exact-value goals.
