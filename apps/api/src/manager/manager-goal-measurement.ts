import type { ManagerGoalMeasurementKind } from "../generated/prisma/enums";

export const MANAGER_GOAL_MEASUREMENT_POLICY_VERSION = "manager_goal_measurement_v1" as const;

type Goal = {
  id: string;
  title: string;
  measurementKind: ManagerGoalMeasurementKind;
  currentValue: number | null;
  createdAt: Date;
  deadline: Date | null;
};

type Prospect = { id: string; status: string };
type Event = { id: string; type: string; status: string; startsAt: Date | null };
type Project = { id: string; goalId: string | null; status: string };

export type ManagerGoalMeasurementStatus = "manual" | "not_recorded" | "in_sync" | "records_ahead" | "recorded_ahead";

export type ManagerGoalMeasurement = {
  policyVersion: typeof MANAGER_GOAL_MEASUREMENT_POLICY_VERSION;
  goalId: string;
  goalTitle: string;
  kind: ManagerGoalMeasurementKind;
  status: ManagerGoalMeasurementStatus;
  recordedValue: number | null;
  observedValue: number | null;
  difference: number | null;
  label: string;
  summary: string;
  nextAction: string;
  evidenceIds: string[];
  observedAt: string;
};

const labels: Record<ManagerGoalMeasurementKind, string> = {
  manual: "Manual progress",
  qualified_prospects: "Current qualified or converted prospects",
  confirmed_gigs: "Confirmed or completed gigs in the goal window",
  completed_gigs: "Completed gigs in the goal window",
  completed_projects: "Completed projects linked to this goal"
};

function insideGoalWindow(value: Date | null, goal: Goal) {
  if (!value || value < goal.createdAt) return false;
  return !goal.deadline || value <= goal.deadline;
}

export function deterministicManagerGoalMeasurement(input: {
  goal: Goal;
  prospects: Prospect[];
  events: Event[];
  projects: Project[];
}, now = new Date()): ManagerGoalMeasurement {
  const { goal } = input;
  if (goal.measurementKind === "manual") return {
    policyVersion: MANAGER_GOAL_MEASUREMENT_POLICY_VERSION,
    goalId: goal.id,
    goalTitle: goal.title,
    kind: goal.measurementKind,
    status: "manual",
    recordedValue: goal.currentValue,
    observedValue: null,
    difference: null,
    label: labels.manual,
    summary: "This goal uses progress entered by the band; StoryBoard is not claiming an automatic source.",
    nextAction: "Record progress when the band has verified the result.",
    evidenceIds: [goal.id],
    observedAt: now.toISOString()
  };

  let evidenceIds: string[] = [];
  if (goal.measurementKind === "qualified_prospects") {
    evidenceIds = input.prospects.filter((prospect) => ["qualified", "converted"].includes(prospect.status)).map((prospect) => prospect.id);
  } else if (goal.measurementKind === "confirmed_gigs") {
    evidenceIds = input.events.filter((event) => event.type === "gig" && ["confirmed", "completed"].includes(event.status) && insideGoalWindow(event.startsAt, goal)).map((event) => event.id);
  } else if (goal.measurementKind === "completed_gigs") {
    evidenceIds = input.events.filter((event) => event.type === "gig" && event.status === "completed" && insideGoalWindow(event.startsAt, goal)).map((event) => event.id);
  } else {
    evidenceIds = input.projects.filter((project) => project.goalId === goal.id && project.status === "completed").map((project) => project.id);
  }

  const observedValue = evidenceIds.length;
  const recordedValue = goal.currentValue;
  const difference = observedValue - (recordedValue ?? 0);
  const status: ManagerGoalMeasurementStatus = recordedValue === null
    ? "not_recorded"
    : difference > 0
      ? "records_ahead"
      : difference < 0
        ? "recorded_ahead"
        : "in_sync";
  const summary = status === "in_sync"
    ? `Recorded progress matches ${observedValue} ${labels[goal.measurementKind].toLowerCase()}.`
    : status === "not_recorded"
      ? `StoryBoard can verify ${observedValue} ${labels[goal.measurementKind].toLowerCase()}, but this goal has no recorded progress value.`
      : status === "records_ahead"
        ? `StoryBoard can verify ${observedValue}, which is ${difference} more than the goal currently records.`
        : `The goal records ${recordedValue}, but the selected StoryBoard source currently verifies ${observedValue}. External or deleted work may explain the difference.`;
  const nextAction = status === "in_sync"
    ? "Keep recording the underlying work; the goal will be checked again from the same source."
    : status === "recorded_ahead"
      ? "Review whether progress happened outside StoryBoard before reconciling the goal downward."
      : `Review the evidence and reconcile the goal to ${observedValue}.`;

  return {
    policyVersion: MANAGER_GOAL_MEASUREMENT_POLICY_VERSION,
    goalId: goal.id,
    goalTitle: goal.title,
    kind: goal.measurementKind,
    status,
    recordedValue,
    observedValue,
    difference,
    label: labels[goal.measurementKind],
    summary,
    nextAction,
    evidenceIds: [goal.id, ...evidenceIds].slice(0, 100),
    observedAt: now.toISOString()
  };
}

export function deterministicManagerGoalMeasurements(input: {
  goals: Goal[];
  prospects: Prospect[];
  events: Event[];
  projects: Project[];
}, now = new Date()) {
  return input.goals.map((goal) => deterministicManagerGoalMeasurement({ ...input, goal }, now));
}
