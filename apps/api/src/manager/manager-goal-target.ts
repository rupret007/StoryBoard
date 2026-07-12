import type { ManagerGoalTargetDirection } from "../generated/prisma/enums";

export const MANAGER_GOAL_TARGET_POLICY_VERSION = "manager_goal_target_v1" as const;

export type ManagerGoalTargetInput = {
  id: string;
  title: string;
  targetValue: number | null;
  currentValue: number | null;
  targetUnit?: string | null;
  targetDirection?: ManagerGoalTargetDirection;
  deadline: Date | null;
};

export type ManagerGoalTargetAssessment = {
  policyVersion: typeof MANAGER_GOAL_TARGET_POLICY_VERSION;
  goalId: string;
  direction: ManagerGoalTargetDirection;
  state: "not_configured" | "current_unknown" | "met" | "not_met" | "invalid";
  finality: "final" | "provisional" | "unknown";
  targetValue: number | null;
  currentValue: number | null;
  gapValue: number | null;
  progressRatio: number | null;
  targetLabel: string;
  summary: string;
  nextAction: string;
  forecast: false;
  evidenceIds: string[];
  observedAt: string;
};

const DIRECTION_LABELS: Record<ManagerGoalTargetDirection, string> = {
  at_least: "at least",
  at_most: "at most",
  exact: "exactly"
};

function closeEnough(left: number, right: number) {
  const tolerance = Math.max(1, Math.abs(left), Math.abs(right)) * 1e-9;
  return Math.abs(left - right) <= tolerance;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

function amount(value: number, unit: string | null | undefined) {
  return `${formatNumber(value)}${unit?.trim() ? ` ${unit.trim()}` : ""}`;
}

export function deterministicManagerGoalTarget(
  goal: ManagerGoalTargetInput,
  now = new Date()
): ManagerGoalTargetAssessment {
  const observedAt = now.toISOString();
  const direction = goal.targetDirection ?? "at_least";
  const targetLabel = goal.targetValue === null || !Number.isFinite(goal.targetValue)
    ? `${DIRECTION_LABELS[direction]} a verified target`
    : `${DIRECTION_LABELS[direction]} ${amount(goal.targetValue, goal.targetUnit)}`;
  const base = {
    policyVersion: MANAGER_GOAL_TARGET_POLICY_VERSION,
    goalId: goal.id,
    direction,
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
    targetLabel,
    forecast: false as const,
    evidenceIds: [goal.id],
    observedAt
  };

  if (goal.targetValue !== null && !Number.isFinite(goal.targetValue)) return {
    ...base,
    state: "invalid",
    finality: "unknown",
    gapValue: null,
    progressRatio: null,
    summary: "The saved target is not a finite number and cannot be evaluated safely.",
    nextAction: "Correct the target before using this goal for Manager advice."
  };
  if (goal.currentValue !== null && !Number.isFinite(goal.currentValue)) return {
    ...base,
    state: "invalid",
    finality: "unknown",
    gapValue: null,
    progressRatio: null,
    summary: "The saved current value is not a finite number and cannot be evaluated safely.",
    nextAction: "Correct the current value before using this goal for Manager advice."
  };
  if (goal.targetValue === null) return {
    ...base,
    state: "not_configured",
    finality: "unknown",
    gapValue: null,
    progressRatio: null,
    summary: "No numeric target is recorded, so StoryBoard cannot determine whether this goal currently meets its intended result.",
    nextAction: "Record a target, choose whether it means at least, at most, or exactly, and keep the source of the current value explicit."
  };
  if (goal.currentValue === null) return {
    ...base,
    state: "current_unknown",
    finality: "unknown",
    gapValue: null,
    progressRatio: null,
    summary: `The target is ${targetLabel}, but the current value is not recorded.`,
    nextAction: "Verify and record the current value before judging this goal."
  };

  const met = direction === "at_least"
    ? goal.currentValue > goal.targetValue || closeEnough(goal.currentValue, goal.targetValue)
    : direction === "at_most"
      ? goal.currentValue < goal.targetValue || closeEnough(goal.currentValue, goal.targetValue)
      : closeEnough(goal.currentValue, goal.targetValue);
  const gapValue = met
    ? 0
    : direction === "at_least"
      ? goal.targetValue - goal.currentValue
      : direction === "at_most"
        ? goal.currentValue - goal.targetValue
        : Math.abs(goal.currentValue - goal.targetValue);
  const progressRatio = direction === "at_least" && goal.targetValue > 0 && goal.currentValue >= 0
    ? Math.max(0, goal.currentValue / goal.targetValue)
    : null;
  const deadlinePassed = Boolean(goal.deadline && goal.deadline <= now);
  const finality: ManagerGoalTargetAssessment["finality"] = deadlinePassed || (met && direction === "at_least") ? "final" : "provisional";
  const current = amount(goal.currentValue, goal.targetUnit);
  const target = amount(goal.targetValue, goal.targetUnit);
  const directionLabel = DIRECTION_LABELS[direction];
  const summary = met
    ? direction === "at_least"
      ? `The recorded value is ${current}, which meets the target of ${directionLabel} ${target}.`
      : deadlinePassed
        ? `At the recorded deadline, ${current} meets the target of ${directionLabel} ${target}.`
        : `The current value is ${current}, which is within the target of ${directionLabel} ${target}; the final result is not known before the deadline.`
    : `The recorded value is ${current}; it does not meet the target of ${directionLabel} ${target}${gapValue ? ` by ${amount(gapValue, goal.targetUnit)}` : ""}.`;
  const nextAction = met
    ? finality === "final"
      ? "Review the evidence, then mark the goal achieved, extend it, or replace it deliberately."
      : "Keep recording the same source through the deadline; being within the target now is not a completion forecast."
    : deadlinePassed
      ? "Review what happened, then change the deadline, target, or plan deliberately instead of hiding the miss."
      : "Use the linked plan and next task; StoryBoard is not predicting whether or when the target will be met.";

  return {
    ...base,
    state: met ? "met" : "not_met",
    finality,
    gapValue,
    progressRatio,
    summary,
    nextAction
  };
}
