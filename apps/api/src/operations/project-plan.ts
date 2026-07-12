const DAY_MS = 86400000;
export const PROJECT_PLAN_VERSION = "project_plan_v1";

export type ProjectMilestoneSpec = { key: string; title: string; dueAt: Date };
export type ProjectReadinessGap = { code: string; severity: "low" | "med" | "high"; detail: string; nextAction: string; evidenceIds: string[] };
export type ProjectReadiness = {
  projectId: string;
  score: number;
  status: "on_track" | "at_risk" | "off_track" | "blocked" | "complete" | "closed" | "needs_plan";
  confidence: number;
  headline: string;
  nextAction: string;
  nextMilestone: { id: string; title: string; dueAt: string | null; ownerLabel: string | null } | null;
  completedMilestones: number;
  totalMilestones: number;
  overdueMilestones: number;
  blockedMilestones: number;
  spendMinor: number;
  budgetRemainingMinor: number | null;
  gaps: ProjectReadinessGap[];
  evidenceIds: string[];
  observedAt: string;
};

export type ProjectReadinessInput = {
  id: string;
  name: string;
  type: "release" | "content_campaign" | "tour" | "business" | string;
  status: string;
  dueAt: Date | null;
  budgetMinor: number | null;
  currency: string;
  successMetrics: unknown;
  assets: unknown;
  tasks: { id: string; title: string; status: string; ownerLabel: string | null; dueAt: Date | null; sourceKey?: string | null }[];
  expenses: { id: string; amountMinor: number }[];
  events: { id: string }[];
};

const templates: Record<string, { key: string; title: string; daysBefore: number }[]> = {
  release: [
    { key: "positioning", title: "Lock the release goal, audience, and story", daysBefore: 70 },
    { key: "masters", title: "Complete masters, credits, and ownership details", daysBefore: 56 },
    { key: "artwork_metadata", title: "Finish artwork, metadata, and release assets", daysBefore: 49 },
    { key: "distribution", title: "Deliver the release to distribution", daysBefore: 35 },
    { key: "campaign", title: "Launch the announcement and content campaign", daysBefore: 21 },
    { key: "release_review", title: "Release and capture first-week results", daysBefore: 0 }
  ],
  content_campaign: [
    { key: "brief", title: "Lock the campaign goal, audience, and call to action", daysBefore: 28 },
    { key: "production", title: "Produce the core content assets", daysBefore: 21 },
    { key: "schedule", title: "Approve the publishing schedule and owners", daysBefore: 14 },
    { key: "launch", title: "Launch the campaign", daysBefore: 7 },
    { key: "review", title: "Review results and document the next experiment", daysBefore: 0 }
  ],
  tour: [
    { key: "scope", title: "Lock route, dates, budget, and success target", daysBefore: 90 },
    { key: "holds", title: "Secure venue holds and buyer contacts", daysBefore: 75 },
    { key: "confirm", title: "Confirm shows, travel, and member availability", daysBefore: 60 },
    { key: "promote", title: "Launch market-by-market promotion", daysBefore: 30 },
    { key: "advance", title: "Complete show advances and settlement plans", daysBefore: 14 },
    { key: "review", title: "Complete the run and review market outcomes", daysBefore: 0 }
  ],
  business: [
    { key: "decision", title: "Define the business decision and success test", daysBefore: 35 },
    { key: "evidence", title: "Collect the required facts, costs, and options", daysBefore: 28 },
    { key: "choose", title: "Choose the path and record the rationale", daysBefore: 21 },
    { key: "implement", title: "Implement the reviewed decision", daysBefore: 7 },
    { key: "review", title: "Review the result and capture the lesson", daysBefore: 0 }
  ]
};

export function projectPlanTemplate(type: string, dueAt: Date): ProjectMilestoneSpec[] {
  const selected = templates[type] ?? templates.business!;
  return selected.map((item) => ({ key: item.key, title: item.title, dueAt: new Date(dueAt.getTime() - item.daysBefore * DAY_MS) }));
}

function countArray(value: unknown) { return Array.isArray(value) ? value.length : 0; }
function unique(values: string[]) { return [...new Set(values)]; }

export function deterministicProjectReadiness(project: ProjectReadinessInput, now = new Date()): ProjectReadiness {
  const gaps: ProjectReadinessGap[] = [];
  const addGap = (gap: ProjectReadinessGap) => gaps.push(gap);
  const milestones = project.tasks;
  const open = milestones.filter((task) => task.status !== "done");
  const completed = milestones.filter((task) => task.status === "done");
  const overdue = open.filter((task) => task.dueAt && task.dueAt < now);
  const blocked = open.filter((task) => task.status === "blocked");
  const unassigned = open.filter((task) => !task.ownerLabel);
  const spendMinor = project.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0);
  const budgetRemainingMinor = project.budgetMinor === null ? null : project.budgetMinor - spendMinor;
  const metricCount = countArray(project.successMetrics);
  const assetCount = countArray(project.assets);

  let score = 0;
  if (project.dueAt) score += 10;
  else addGap({ code: "due_date_missing", severity: "high", detail: "The project has no completion or launch date.", nextAction: "Set the date the band is actually working toward.", evidenceIds: [project.id] });
  if (milestones.length) score += 10 + Math.round((completed.length / milestones.length) * 25);
  else addGap({ code: "plan_missing", severity: "high", detail: "No linked milestones are recorded.", nextAction: "Generate the starter plan or add the real milestones manually.", evidenceIds: [project.id] });
  if (milestones.length && milestones.every((task) => task.dueAt)) score += 5;
  if (open.length) score += Math.round(((open.length - unassigned.length) / open.length) * 15);
  else if (milestones.length) score += 15;
  if (metricCount) score += 15;
  else addGap({ code: "metrics_missing", severity: "med", detail: "The project has no recorded success metric.", nextAction: "Define how the band will know this project worked.", evidenceIds: [project.id] });
  if (assetCount) score += 10;
  else addGap({ code: "assets_missing", severity: project.type === "release" || project.type === "content_campaign" ? "med" : "low", detail: "No working asset links are attached.", nextAction: "Attach the current master, artwork, brief, folder, or other source-of-truth asset.", evidenceIds: [project.id] });
  if (project.budgetMinor !== null) score += budgetRemainingMinor !== null && budgetRemainingMinor < 0 ? 0 : 10;
  else addGap({ code: "budget_missing", severity: "low", detail: "No working budget is recorded.", nextAction: "Record the spending limit, even if it is zero.", evidenceIds: [project.id] });
  if (overdue.length) addGap({ code: "milestones_overdue", severity: "high", detail: `${overdue.length} open milestone${overdue.length === 1 ? " is" : "s are"} overdue.`, nextAction: "Finish, re-date, or explicitly block every overdue milestone.", evidenceIds: overdue.map((task) => task.id) });
  if (blocked.length) addGap({ code: "milestones_blocked", severity: "high", detail: `${blocked.length} milestone${blocked.length === 1 ? " is" : "s are"} blocked.`, nextAction: "Name the blocker, owner, and decision needed to move again.", evidenceIds: blocked.map((task) => task.id) });
  if (unassigned.length) addGap({ code: "milestones_unassigned", severity: "med", detail: `${unassigned.length} open milestone${unassigned.length === 1 ? " has" : "s have"} no owner.`, nextAction: "Assign a real person to each open milestone.", evidenceIds: unassigned.map((task) => task.id) });
  if (project.dueAt && project.dueAt < now && project.status !== "completed") addGap({ code: "project_overdue", severity: "high", detail: "The project due date has passed while the project remains open.", nextAction: "Choose a credible new date or deliberately close the project.", evidenceIds: [project.id] });
  if (budgetRemainingMinor !== null && budgetRemainingMinor < 0) addGap({ code: "budget_overrun", severity: "high", detail: `${project.currency} ${Math.abs(budgetRemainingMinor / 100).toFixed(2)} exceeds the recorded budget.`, nextAction: "Review the overrun and approve a revised budget or stop additional spend.", evidenceIds: [project.id, ...project.expenses.map((expense) => expense.id)] });
  if (project.status === "completed" && open.length) addGap({ code: "completion_inconsistent", severity: "med", detail: `The project is marked completed with ${open.length} milestone${open.length === 1 ? "" : "s"} still open.`, nextAction: "Close the remaining work or return the project to active status.", evidenceIds: [project.id, ...open.map((task) => task.id)] });

  gaps.sort((a, b) => ({ high: 0, med: 1, low: 2 }[a.severity] - ({ high: 0, med: 1, low: 2 }[b.severity])));
  const nextMilestone = open.sort((a, b) => (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER))[0] ?? null;
  const status: ProjectReadiness["status"] = project.status === "cancelled" ? "closed" : project.status === "completed" && !open.length ? "complete" : !milestones.length ? "needs_plan" : blocked.length ? "blocked" : overdue.length || gaps.some((gap) => gap.code === "project_overdue" || gap.code === "budget_overrun") ? "off_track" : score < 75 || gaps.some((gap) => gap.severity === "med") ? "at_risk" : "on_track";
  const confidenceSignals = [Boolean(project.dueAt), milestones.length > 0, metricCount > 0, project.budgetMinor !== null, assetCount > 0];
  const confidence = Number((confidenceSignals.filter(Boolean).length / confidenceSignals.length).toFixed(2));
  const headline = status === "complete" ? `${project.name} is recorded complete with no open milestones.` : status === "closed" ? `${project.name} is cancelled; no active project work is being recommended.` : status === "on_track" ? `${project.name} is on track from the records currently in StoryBoard.` : status === "needs_plan" ? `${project.name} needs an executable milestone plan.` : `${project.name} is ${status.replace("_", " ")}; ${gaps.length} gap${gaps.length === 1 ? " needs" : "s need"} attention.`;
  return {
    projectId: project.id,
    score: Math.min(100, score),
    status,
    confidence,
    headline,
    nextAction: status === "closed" ? "Keep the cancellation reason and any follow-up documented." : gaps[0]?.nextAction ?? (nextMilestone ? `Complete “${nextMilestone.title}”.` : "Review the outcome and close the project when the work is truly complete."),
    nextMilestone: nextMilestone ? { id: nextMilestone.id, title: nextMilestone.title, dueAt: nextMilestone.dueAt?.toISOString() ?? null, ownerLabel: nextMilestone.ownerLabel } : null,
    completedMilestones: completed.length,
    totalMilestones: milestones.length,
    overdueMilestones: overdue.length,
    blockedMilestones: blocked.length,
    spendMinor,
    budgetRemainingMinor,
    gaps,
    evidenceIds: unique([project.id, ...milestones.map((task) => task.id), ...project.expenses.map((expense) => expense.id), ...project.events.map((event) => event.id)]),
    observedAt: now.toISOString()
  };
}
