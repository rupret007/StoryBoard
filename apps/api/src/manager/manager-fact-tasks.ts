import { Prisma } from "../generated/prisma/client";

/** Open-work rows loaded for Manager facts. Completed follow-ups must not consume this window. */
export const MANAGER_FACT_TASK_LIMIT = 100;

export type ManagerFactTaskWindowRow = {
  id: string;
  artistId: string;
  status: string;
  dueAt: Date | null;
  initiativeId: string | null;
  campaignFollowUp: boolean;
};

/**
 * Open tasks stay in the window, including open campaign follow-ups.
 * A done task stays only when it belongs to an initiative and is not a campaign follow-up.
 * Done campaign follow-ups are already excluded by the recipient query, so they are not loaded here.
 */
export function managerFactTaskWhere(artistId: string): Prisma.TaskWhereInput {
  return {
    artistId,
    OR: [
      { status: { not: "done" } },
      { initiativeId: { not: null }, bookingCampaignFollowUpFor: { is: null } }
    ]
  };
}

/** PostgreSQL ASC places null due dates last. Id breaks ties so the 100-row edge is stable. */
export function managerFactTaskOrderBy(): Prisma.TaskOrderByWithRelationInput[] {
  return [{ dueAt: "asc" }, { id: "asc" }];
}

export function managerFactTaskRowIncluded(task: ManagerFactTaskWindowRow, artistId: string) {
  if (task.artistId !== artistId) return false;
  if (task.status !== "done") return true;
  return task.initiativeId != null && !task.campaignFollowUp;
}

function dueTime(date: Date | null) {
  return date && Number.isFinite(date.getTime()) ? date.getTime() : Number.POSITIVE_INFINITY;
}

export function selectManagerFactTasks<T extends ManagerFactTaskWindowRow>(tasks: T[], artistId: string, limit = MANAGER_FACT_TASK_LIMIT) {
  return tasks
    .filter((task) => managerFactTaskRowIncluded(task, artistId))
    .sort((a, b) => dueTime(a.dueAt) - dueTime(b.dueAt) || a.id.localeCompare(b.id))
    .slice(0, limit);
}
