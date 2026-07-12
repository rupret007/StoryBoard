import type { ManagerWorkstream } from "../generated/prisma/enums";
import type { ManagerGoalMeasurement } from "./manager-goal-measurement";
import type { ManagerWorkSequence, ManagerWorkSequenceItem } from "./manager-work-sequence";

export const MANAGER_GOAL_PATH_POLICY_VERSION = "manager_goal_path_v1" as const;

type GoalInput = {
  id: string;
  title: string;
  workstream: ManagerWorkstream;
  status: string;
  deadline: Date | null;
  currentValue: number | null;
  targetValue: number | null;
};

type InitiativeInput = {
  id: string;
  goalId: string | null;
  title: string;
  status: string;
  dueAt: Date | null;
};

type TaskInput = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  initiativeId?: string | null;
};

export type ManagerGoalPathItem = {
  goalId: string;
  goalTitle: string;
  workstream: ManagerWorkstream;
  deadline: string | null;
  progressRatio: number | null;
  status: "ready" | "in_progress" | "waiting" | "blocked" | "conflicted" | "missing_initiative" | "missing_task" | "needs_measurement" | "target_reached";
  initiativeIds: string[];
  nextTask: null | {
    taskId: string;
    title: string;
    state: ManagerWorkSequenceItem["state"];
    pathType: "linked_task" | "prerequisite";
    dueAt: string | null;
    ownerLabel: string | null;
    reason: string;
    evidenceIds: string[];
  };
  contradictions: { code: "goal_deadline_passed" | "initiative_after_goal" | "task_after_goal" | "task_after_initiative" | "sequence_conflict"; detail: string; evidenceIds: string[] }[];
  reason: string;
  nextAction: string;
  evidenceIds: string[];
};

export type ManagerGoalPath = {
  policyVersion: typeof MANAGER_GOAL_PATH_POLICY_VERSION;
  observedAt: string;
  status: "clear" | "needs_attention" | "blocked" | "conflicted" | "empty";
  summary: string;
  counts: { activeGoals: number; ready: number; waiting: number; blocked: number; missingPlan: number; needsMeasurement: number; targetReached: number; conflicted: number };
  goals: ManagerGoalPathItem[];
  evidenceIds: string[];
};

function unique(values: string[]) { return [...new Set(values)]; }

function progressRatio(goal: GoalInput) {
  return goal.currentValue !== null && goal.targetValue !== null && goal.targetValue > 0
    ? Math.max(0, goal.currentValue / goal.targetValue)
    : null;
}

function asNextTask(item: ManagerWorkSequenceItem, linkedTaskIds: Set<string>): NonNullable<ManagerGoalPathItem["nextTask"]> {
  return {
    taskId: item.taskId,
    title: item.title,
    state: item.state,
    pathType: linkedTaskIds.has(item.taskId) ? "linked_task" : "prerequisite",
    dueAt: item.dueAt,
    ownerLabel: item.ownerLabel,
    reason: item.reason,
    evidenceIds: item.evidenceIds
  };
}

function sortCandidates(left: ManagerWorkSequenceItem, right: ManagerWorkSequenceItem) {
  if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
  if (left.unlocksTaskIds.length !== right.unlocksTaskIds.length) return right.unlocksTaskIds.length - left.unlocksTaskIds.length;
  const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
  return leftDue - rightDue || left.title.localeCompare(right.title);
}

export function deterministicManagerGoalPath(input: {
  goals: GoalInput[];
  measurements: ManagerGoalMeasurement[];
  initiatives: InitiativeInput[];
  tasks: TaskInput[];
  workSequence: ManagerWorkSequence;
}, now = new Date()): ManagerGoalPath {
  const activeGoals = input.goals.filter((goal) => goal.status === "active");
  const paths = activeGoals.map((goal): ManagerGoalPathItem => {
    const measurement = input.measurements.find((item) => item.goalId === goal.id);
    const initiatives = input.initiatives.filter((initiative) => initiative.goalId === goal.id && !["completed", "abandoned"].includes(initiative.status));
    const initiativeIds = new Set(initiatives.map((initiative) => initiative.id));
    const allTasks = input.tasks.filter((task) => Boolean(task.initiativeId && initiativeIds.has(task.initiativeId)));
    const openTasks = allTasks.filter((task) => task.status !== "done");
    const openTaskIds = new Set(openTasks.map((task) => task.id));
    const ratio = progressRatio(goal);
    const contradictions: ManagerGoalPathItem["contradictions"] = [];
    if (goal.deadline && goal.deadline < now && (ratio === null || ratio < 1)) contradictions.push({ code: "goal_deadline_passed", detail: "The goal deadline has passed without recorded target completion.", evidenceIds: [goal.id] });
    if (goal.deadline) {
      for (const initiative of initiatives.filter((item) => item.dueAt && item.dueAt > goal.deadline!)) {
        contradictions.push({ code: "initiative_after_goal", detail: `“${initiative.title}” is due after the goal deadline.`, evidenceIds: [goal.id, initiative.id] });
      }
      for (const task of openTasks.filter((item) => item.dueAt && item.dueAt > goal.deadline!)) {
        contradictions.push({ code: "task_after_goal", detail: `“${task.title}” is due after the goal deadline.`, evidenceIds: [goal.id, task.id] });
      }
    }
    for (const task of openTasks) {
      const initiative = task.initiativeId ? initiatives.find((item) => item.id === task.initiativeId) : null;
      if (initiative?.dueAt && task.dueAt && task.dueAt > initiative.dueAt) contradictions.push({ code: "task_after_initiative", detail: `“${task.title}” is due after its initiative.`, evidenceIds: [initiative.id, task.id] });
      const sequenceItem = input.workSequence.items.find((item) => item.taskId === task.id);
      if (sequenceItem?.state === "conflicted") contradictions.push({ code: "sequence_conflict", detail: `“${task.title}” has a conflicting prerequisite date.`, evidenceIds: sequenceItem.evidenceIds });
    }
    const candidate = input.workSequence.items
      .filter((item) => ["ready_now", "in_progress"].includes(item.state) && (openTaskIds.has(item.taskId) || item.unlocksTaskIds.some((id) => openTaskIds.has(id))))
      .sort(sortCandidates)[0];
    const nextTask = candidate ? asNextTask(candidate, openTaskIds) : null;
    if (goal.deadline && nextTask?.pathType === "prerequisite" && nextTask.dueAt && new Date(nextTask.dueAt) > goal.deadline) contradictions.push({ code: "task_after_goal", detail: `The prerequisite “${nextTask.title}” is due after the goal deadline.`, evidenceIds: [goal.id, nextTask.taskId] });
    const linkedWaiting = input.workSequence.items.filter((item) => openTaskIds.has(item.taskId) && ["waiting_on_prerequisites", "manually_blocked", "conflicted"].includes(item.state));
    const measurementDrift = Boolean(measurement && !["manual", "in_sync"].includes(measurement.status));
    const targetReached = ratio !== null && ratio >= 1;
    const blockedInitiatives = initiatives.filter((initiative) => initiative.status === "blocked");
    let status: ManagerGoalPathItem["status"];
    let reason: string;
    let nextAction: string;
    if (contradictions.length) {
      status = "conflicted";
      reason = contradictions[0]!.detail;
      nextAction = "Correct the dates or task order before treating this goal plan as credible.";
    } else if (measurementDrift) {
      status = "needs_measurement";
      reason = measurement!.summary;
      nextAction = measurement!.nextAction;
    } else if (targetReached) {
      status = "target_reached";
      reason = "The recorded current value has reached the goal target.";
      nextAction = "Review the evidence, then complete, extend, or replace the goal deliberately.";
    } else if (!initiatives.length) {
      status = "missing_initiative";
      reason = "No active initiative connects this goal to a plan.";
      nextAction = "Create or activate one initiative with a measurable result before adding standalone tasks.";
    } else if (!openTasks.length) {
      status = "missing_task";
      reason = allTasks.length ? "Every linked task is complete, but the recorded goal target has not been reached." : "The active initiative has no linked task.";
      nextAction = `Define one measurable next task inside “${initiatives[0]!.title}”.`;
    } else if (nextTask) {
      status = nextTask.state === "in_progress" ? "in_progress" : "ready";
      reason = nextTask.pathType === "prerequisite"
        ? `“${nextTask.title}” is the first ready prerequisite on the path to this goal.`
        : `“${nextTask.title}” is the first recorded goal task that can move now.`;
      nextAction = `Advance “${nextTask.title}” before creating more work for this goal.`;
    } else if (blockedInitiatives.length || linkedWaiting.some((item) => item.state === "manually_blocked")) {
      status = "blocked";
      const blocker = linkedWaiting.find((item) => item.state === "manually_blocked");
      reason = blocker?.reason ?? `“${blockedInitiatives[0]!.title}” is blocked.`;
      nextAction = blocker ? `Resolve the recorded blocker on “${blocker.title}”.` : "Record what would unblock the initiative and who owns that follow-through.";
    } else {
      status = "waiting";
      reason = linkedWaiting[0]?.reason ?? "The linked work is not currently actionable.";
      nextAction = "Review the prerequisite chain and finish the first available prerequisite.";
    }
    const evidenceIds = unique([
      goal.id,
      ...initiatives.map((initiative) => initiative.id),
      ...openTasks.map((task) => task.id),
      ...(measurement?.evidenceIds ?? []),
      ...(nextTask?.evidenceIds ?? []),
      ...contradictions.flatMap((item) => item.evidenceIds)
    ]).slice(0, 24);
    return {
      goalId: goal.id,
      goalTitle: goal.title,
      workstream: goal.workstream,
      deadline: goal.deadline?.toISOString() ?? null,
      progressRatio: ratio,
      status,
      initiativeIds: [...initiativeIds],
      nextTask,
      contradictions,
      reason,
      nextAction,
      evidenceIds
    };
  }).sort((left, right) => {
    const statusRank: Record<ManagerGoalPathItem["status"], number> = { conflicted: 0, blocked: 1, needs_measurement: 2, missing_initiative: 3, missing_task: 4, waiting: 5, ready: 6, in_progress: 7, target_reached: 8 };
    const leftDate = left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY;
    const rightDate = right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY;
    return statusRank[left.status] - statusRank[right.status] || leftDate - rightDate || left.goalTitle.localeCompare(right.goalTitle);
  });
  const counts = {
    activeGoals: paths.length,
    ready: paths.filter((path) => ["ready", "in_progress"].includes(path.status)).length,
    waiting: paths.filter((path) => path.status === "waiting").length,
    blocked: paths.filter((path) => path.status === "blocked").length,
    missingPlan: paths.filter((path) => ["missing_initiative", "missing_task"].includes(path.status)).length,
    needsMeasurement: paths.filter((path) => path.status === "needs_measurement").length,
    targetReached: paths.filter((path) => path.status === "target_reached").length,
    conflicted: paths.filter((path) => path.status === "conflicted").length
  };
  const status: ManagerGoalPath["status"] = !paths.length
    ? "empty"
    : counts.conflicted
      ? "conflicted"
      : counts.blocked
        ? "blocked"
        : counts.missingPlan || counts.needsMeasurement || counts.waiting
          ? "needs_attention"
          : "clear";
  const summary = status === "empty"
    ? "No active goal path is recorded."
    : status === "conflicted"
      ? `${counts.conflicted} active goal path${counts.conflicted === 1 ? " has" : "s have"} contradictory dates or task order.`
      : status === "blocked"
        ? `${counts.blocked} active goal path${counts.blocked === 1 ? " is" : "s are"} blocked; ${counts.ready} can still move now.`
        : status === "needs_attention"
          ? `${counts.ready} active goal path${counts.ready === 1 ? " has" : "s have"} a credible next move; ${counts.missingPlan + counts.needsMeasurement + counts.waiting} need a plan, measurement, or prerequisite review.`
          : counts.ready
            ? `${counts.ready} active goal path${counts.ready === 1 ? " has" : "s have"} a recorded next move${counts.targetReached ? `; ${counts.targetReached} target${counts.targetReached === 1 ? " is" : "s are"} ready for review` : ""}.`
            : `${counts.targetReached} active goal target${counts.targetReached === 1 ? " is" : "s are"} recorded as reached and ready for deliberate review.`;
  return {
    policyVersion: MANAGER_GOAL_PATH_POLICY_VERSION,
    observedAt: now.toISOString(),
    status,
    summary,
    counts,
    goals: paths,
    evidenceIds: unique(paths.flatMap((path) => path.evidenceIds))
  };
}

export function managerQuestionAsksAboutGoalPath(question: string) {
  return /\b(goal path|move (?:our|the|this) goal|advance (?:our|the|this) goal|reach (?:our|the|this) goal|achieve (?:our|the|this) goal|what connects|goal(?:s)? (?:to|into) (?:work|action)|work (?:toward|towards) (?:our|the) goal|next (?:step|move).*\bgoal)\b/i.test(question);
}
