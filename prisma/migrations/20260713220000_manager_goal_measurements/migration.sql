CREATE TYPE "ManagerGoalMeasurementKind" AS ENUM (
  'manual',
  'qualified_prospects',
  'confirmed_gigs',
  'completed_gigs',
  'completed_projects'
);

ALTER TABLE "ManagerGoal"
ADD COLUMN "measurementKind" "ManagerGoalMeasurementKind" NOT NULL DEFAULT 'manual';

-- Starter live-pipeline goals measure the current qualified/converted prospect
-- pool. Starter release goals measure explicitly linked completed projects.
-- User-created and user-edited goals remain manual until the band chooses a
-- structured source.
UPDATE "ManagerGoal"
SET "measurementKind" = 'qualified_prospects'
WHERE "sourceKey" = 'manager_plan_v1:goal:live_pipeline';

UPDATE "ManagerGoal"
SET "measurementKind" = 'completed_projects'
WHERE "sourceKey" = 'manager_plan_v1:goal:release_cycle';
