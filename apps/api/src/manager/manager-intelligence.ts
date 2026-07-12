import type { ManagerWorkstream } from "../generated/prisma/enums";
import type { ShowReadiness } from "../operations/event-readiness";
import type { EventDayOfView } from "../operations/event-day-of";
import type { ProjectReadiness } from "../operations/project-plan";
import type { ManagerOutcomeReview } from "./manager-outcome-review";
import type { ManagerContextHealth } from "./manager-context-health";
import type { ManagerKnowledgeHealth } from "./manager-knowledge-health";
import { managerQuestionAsksAboutCommitments, type ManagerCommitmentHealth } from "./manager-commitment-health";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ManagerProposedAction = {
  type: "create_task";
  title: string;
  dueAt: string | null;
  initiativeId: string | null;
} | {
  type: "create_decision";
  workstream: ManagerWorkstream;
  title: string;
  context: string | null;
  options: { label: string; tradeoff: string }[];
} | {
  type: "generate_event_advance";
  eventId: string;
} | {
  type: "generate_project_plan";
  projectId: string;
};

export type ManagerRecommendationDraft = {
  stableKey: string;
  title: string;
  reason: string;
  nextAction: string;
  workstream: ManagerWorkstream;
  priority: "low" | "med" | "high";
  evidenceIds: string[];
  proposedAction: ManagerProposedAction | null;
};

export type ManagerBrief = {
  summary: string;
  today: ManagerRecommendationDraft[];
  thisWeek: ManagerRecommendationDraft[];
  decisionsNeeded: { title: string; explanation: string; evidenceIds: string[] }[];
  waitingOn: { title: string; dueAt: string | null; evidenceIds: string[] }[];
  risksAndOpportunities: { title: string; detail: string; confidence: number; evidenceIds: string[] }[];
};

export type ManagerFacts = {
  artist: { id: string; name: string };
  profile: {
    intakeCompletedAt: Date | null;
    decisionStyle: string;
    twelveMonthAmbition: string | null;
  } | null;
  members: { id: string; name: string }[];
  goals: { id: string; title: string; workstream: ManagerWorkstream; status: string; deadline: Date | null; currentValue: number | null; targetValue: number | null; createdAt?: Date }[];
  initiatives: { id: string; goalId: string | null; title: string; status: string; dueAt: Date | null }[];
  tasks: { id: string; title: string; status: string; dueAt: Date | null; initiativeId?: string | null; ownerLabel?: string | null; blockedReason?: string | null; waitingOn?: string | null; deferralCount?: number; lastDeferredAt?: Date | null }[];
  opportunities: { id: string; title: string; stage: string; updatedAt: Date; targetDate: Date | null }[];
  events: {
    id: string;
    title: string;
    type: string;
    status: string;
    startsAt: Date | null;
    participants: { response: string; bandMemberId: string }[];
    readiness?: ShowReadiness | null;
    dayOf?: EventDayOfView | null;
  }[];
  projects: { id: string; name: string; type?: string; status: string; dueAt: Date | null; readiness?: ProjectReadiness | null }[];
  deals: { id: string; title: string; status: string; expiresAt: Date | null }[];
  invoices: { id: string; number: string; status: string; currency: string; totalMinor: number; paidMinor: number; dueAt: Date | null }[];
  decisions: { id: string; workstream: ManagerWorkstream; title: string; context: string | null; options: unknown; choice: string | null; rationale: string | null; expectedOutcome: string | null; needsFraming?: boolean; evidence: unknown; status: string; reviewAt: Date | null; decidedAt: Date | null; reviewOutcome?: string | null; reviewNote?: string | null; reviewedAt?: Date | null }[];
  approvals: { id: string; title: string; status: string; actionType: string; updatedAt: Date }[];
  bookingReplies: { id: string; subject: string | null; fromName: string | null; fromEmail: string; processingStatus: string; receivedAt: Date }[];
  campaignRecipients: { id: string; status: string; followUpDueAt: Date | null; followUpTaskId: string | null }[];
  prospects: { id: string; name: string; status: string; kind: string; city: string }[];
  settlements: { id: string; status: string; currency: string; grossMinor: number; expenseMinor: number; netMinor: number; event: { title: string } }[];
  outcomeReview?: ManagerOutcomeReview;
  contextHealth?: ManagerContextHealth;
  knowledgeHealth?: ManagerKnowledgeHealth;
  commitmentHealth?: ManagerCommitmentHealth;
  recommendationHistory: { id: string; stableKey: string; outcome: string; outcomeReason: string | null; outcomeAt: Date | null; updatedAt: Date; task: { status: string } | null }[];
};

export type ManagerChatResult = {
  answer: string;
  citations: string[];
  recommendation: ManagerRecommendationDraft | null;
};

export type ManagerPlanHealth = {
  score: number;
  status: "on_track" | "at_risk" | "off_track" | "needs_plan";
  summary: string;
  goals: {
    goalId: string;
    title: string;
    status: "on_track" | "at_risk" | "off_track" | "needs_measurement";
    progressRatio: number | null;
    completedTasks: number;
    openTasks: number;
    reasons: string[];
    evidenceIds: string[];
  }[];
  gaps: { code: string; detail: string; evidenceIds: string[] }[];
};

const DISMISSAL_COOLDOWN_MS = 7 * DAY_MS;
const COMPLETION_COOLDOWN_MS = 14 * DAY_MS;

export function managerRecommendationIsSuppressed(
  recommendation: ManagerRecommendationDraft,
  history: ManagerFacts["recommendationHistory"],
  now = new Date()
) {
  return history.some((prior) => {
    if (prior.stableKey !== recommendation.stableKey) return false;
    if (prior.outcome === "accepted" && prior.task?.status !== "done") return true;
    const outcomeAt = prior.outcomeAt ?? prior.updatedAt;
    const age = now.getTime() - outcomeAt.getTime();
    if ((prior.outcome === "completed" || prior.task?.status === "done") && age < COMPLETION_COOLDOWN_MS) return true;
    return prior.outcome === "dismissed" && age < DISMISSAL_COOLDOWN_MS;
  });
}

export function suppressRepeatedManagerAdvice(brief: ManagerBrief, history: ManagerFacts["recommendationHistory"], now = new Date()): ManagerBrief {
  const today = brief.today.filter((item) => !managerRecommendationIsSuppressed(item, history, now));
  const thisWeek = brief.thisWeek.filter((item) => !managerRecommendationIsSuppressed(item, history, now));
  const removed = today.length !== brief.today.length || thisWeek.length !== brief.thisWeek.length;
  return {
    ...brief,
    summary: removed && !today.length
      ? "Previously accepted, completed, or recently dismissed advice is hidden. No new manager action is pressing right now."
      : brief.summary,
    today,
    thisWeek
  };
}

export type ManagerPriorityFactor = {
  code: string;
  impact: number;
  detail: string;
};

export type ManagerPriorityRank = {
  stableKey: string;
  title: string;
  score: number;
  factors: ManagerPriorityFactor[];
};

export type ManagerPriorityTrace = {
  policyVersion: "manager_priority_v1";
  today: ManagerPriorityRank[];
  thisWeek: ManagerPriorityRank[];
  omittedToday: ManagerPriorityRank[];
  omittedThisWeek: ManagerPriorityRank[];
};

const PRIORITY_BASE = { high: 300, med: 200, low: 100 } as const;

function recommendationRank(
  item: ManagerRecommendationDraft,
  facts: ManagerFacts,
  now: Date,
  originalIndex: number
) {
  const factors: ManagerPriorityFactor[] = [];
  const add = (code: string, impact: number, detail: string) => factors.push({ code, impact, detail });
  add(`declared_${item.priority}`, PRIORITY_BASE[item.priority], `${item.priority} declared priority`);
  const evidence = new Set(item.evidenceIds);

  const event = facts.events.find((row) => evidence.has(row.id));
  if (event?.startsAt) {
    const hoursUntil = (event.startsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
    if (hoursUntil >= 0) {
      if (hoursUntil <= 24) add("show_within_24h", 140, "show starts within 24 hours");
      else if (hoursUntil <= 72) add("show_within_3d", 105, "show starts within three days");
      else if (hoursUntil <= 7 * 24) add("show_within_7d", 70, "show starts within seven days");
      else if (hoursUntil <= 21 * 24) add("show_within_21d", 30, "show starts within three weeks");
    }
    const unavailable = event.participants.filter((participant) => participant.response === "unavailable").length;
    if (unavailable) add("member_unavailable", 75, `${unavailable} unavailable member${unavailable === 1 ? "" : "s"}`);
    if (event.readiness?.status === "blocked") add("show_blocked", 80, "show readiness is blocked");
    else if (event.readiness?.status === "not_ready") add("show_not_ready", 55, "show is not ready");
    else if (event.readiness?.status === "attention") add("show_attention", 20, "show still needs attention");
    if ((event.dayOf?.overdueTaskCount ?? 0) > 0) add("day_of_overdue", 65, "day-of work is overdue");
  }

  const approval = facts.approvals.find((row) => evidence.has(row.id));
  if (approval?.status === "approved") add("approved_action_waiting", 100, "approved work is waiting to execute");
  else if (approval?.status === "pending") add("human_decision_waiting", 70, "a human decision is waiting");

  const reply = facts.bookingReplies.find((row) => evidence.has(row.id));
  if (reply) {
    const ageHours = Math.max(0, (now.getTime() - reply.receivedAt.getTime()) / (60 * 60 * 1000));
    if (ageHours <= 24) add("fresh_booking_reply", 90, "booking reply arrived within 24 hours");
    else if (ageHours <= 72) add("recent_booking_reply", 70, "booking reply arrived within three days");
    else add("unread_booking_reply", 45, "booking reply is unread");
  }

  const commitment = facts.commitmentHealth?.items.find((row) => evidence.has(row.taskId));
  if (commitment) {
    const weights = { blocked: 85, overdue: 75, repeatedly_deferred: 55, waiting: 45, unassigned: 35, due_soon: 25, unscheduled: 10, active: 0 } as const;
    const impact = weights[commitment.state];
    if (impact) add(`commitment_${commitment.state}`, impact, commitment.state.replaceAll("_", " "));
  }

  const invoice = facts.invoices.find((row) => evidence.has(row.id));
  if (invoice) {
    const balance = Math.max(0, invoice.totalMinor - invoice.paidMinor);
    if (invoice.dueAt && invoice.dueAt < now) {
      const overdueDays = Math.max(1, Math.floor((now.getTime() - invoice.dueAt.getTime()) / DAY_MS));
      add("invoice_overdue", 70 + Math.min(30, overdueDays), `invoice is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`);
    } else if (balance > 0) add("invoice_open_balance", 25, "invoice has an open balance");
  }

  const decision = facts.decisions.find((row) => evidence.has(row.id));
  if (decision?.status === "decided" && decision.reviewAt && decision.reviewAt <= now) add("decision_review_due", 50, "decision review is due");

  const recipient = facts.campaignRecipients.find((row) => evidence.has(row.id));
  if (recipient?.followUpDueAt && recipient.followUpDueAt < now) add("campaign_followup_overdue", 60, "booking follow-up is overdue");

  const project = facts.projects.find((row) => evidence.has(row.id));
  if (project) {
    if (project.dueAt && project.dueAt < now) add("project_overdue", 75, "project target date has passed");
    if (project.readiness?.status === "blocked") add("project_blocked", 70, "project is blocked");
    else if (project.readiness?.status === "off_track") add("project_off_track", 55, "project is off track");
    else if (project.readiness?.status === "at_risk") add("project_at_risk", 30, "project is at risk");
    else if (project.readiness?.status === "needs_plan") add("project_needs_plan", 25, "project has no milestone plan");
  }

  if (item.stableKey === "complete-intake") add("manager_setup_missing", 35, "manager setup is incomplete");
  if (item.stableKey.startsWith("context-")) add("context_can_wait", -60, "context improvement can wait behind active delivery pressure");
  if (item.stableKey === "knowledge-refresh") add(facts.knowledgeHealth?.status === "conflicted" ? "knowledge_conflict" : "knowledge_refresh_can_wait", facts.knowledgeHealth?.status === "conflicted" ? 45 : -45, facts.knowledgeHealth?.status === "conflicted" ? "authoritative band facts conflict" : "knowledge refresh can wait behind active delivery pressure");
  if (item.stableKey === "weekly-focus") add("fallback_focus", -25, "fallback focus has no recorded urgency");
  if (item.evidenceIds.length) add("recorded_evidence", 5, "supported by StoryBoard records");

  const score = factors.reduce((total, factor) => total + factor.impact, 0);
  return { item, score, originalIndex, factors };
}

export function rankManagerRecommendations(
  items: ManagerRecommendationDraft[],
  facts: ManagerFacts,
  now = new Date()
) {
  return items
    .map((item, index) => recommendationRank(item, facts, now, index))
    .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex || left.item.stableKey.localeCompare(right.item.stableKey));
}

function mergeByKey<T>(base: T[], proposed: T[], key: (value: T) => string) {
  const merged = new Map(base.map((value) => [key(value), value]));
  for (const value of proposed) merged.set(key(value), value);
  return [...merged.values()];
}

function sameRecommendation(left: ManagerRecommendationDraft, right: ManagerRecommendationDraft) {
  if (left.stableKey === right.stableKey) return true;
  if (left.workstream !== right.workstream || !left.evidenceIds.length || !right.evidenceIds.length) return false;
  const rightEvidence = new Set(right.evidenceIds);
  return left.evidenceIds.some((id) => rightEvidence.has(id));
}

function mergeRecommendations(base: ManagerRecommendationDraft[], proposed: ManagerRecommendationDraft[]) {
  const merged = [...base];
  const priorityLevel = { low: 0, med: 1, high: 2 } as const;
  for (const value of proposed) {
    const existingIndex = merged.findIndex((candidate) => sameRecommendation(candidate, value));
    if (existingIndex === -1) merged.push(value);
    else {
      const existing = merged[existingIndex]!;
      merged[existingIndex] = {
        ...value,
        stableKey: existing.stableKey,
        workstream: existing.workstream,
        priority: priorityLevel[existing.priority] >= priorityLevel[value.priority] ? existing.priority : value.priority,
        evidenceIds: unique([...existing.evidenceIds, ...value.evidenceIds]).slice(0, 8),
        proposedAction: existing.proposedAction ?? value.proposedAction
      };
    }
  }
  return merged;
}

export function mergeManagerBriefCandidates(base: ManagerBrief, proposed: ManagerBrief): ManagerBrief {
  const today = mergeRecommendations(base.today, proposed.today);
  const thisWeek = mergeRecommendations(base.thisWeek, proposed.thisWeek).filter((item) => !today.some((todayItem) => sameRecommendation(todayItem, item)));
  const evidenceKey = (item: { title: string; evidenceIds: string[] }) => `${item.title.toLocaleLowerCase()}|${[...item.evidenceIds].sort().join(",")}`;
  return {
    summary: proposed.summary,
    today,
    thisWeek,
    decisionsNeeded: mergeByKey(base.decisionsNeeded, proposed.decisionsNeeded, evidenceKey),
    waitingOn: mergeByKey(base.waitingOn, proposed.waitingOn, evidenceKey),
    risksAndOpportunities: mergeByKey(base.risksAndOpportunities, proposed.risksAndOpportunities, evidenceKey)
  };
}

export function prioritizeManagerBrief(
  brief: ManagerBrief,
  facts: ManagerFacts,
  now = new Date()
): { brief: ManagerBrief; trace: ManagerPriorityTrace } {
  const todayRanks = rankManagerRecommendations(brief.today, facts, now);
  const weekRanks = rankManagerRecommendations(brief.thisWeek, facts, now);
  const today = todayRanks.slice(0, 5).map((rank) => rank.item);
  const thisWeek = weekRanks.slice(0, 10).map((rank) => rank.item);
  const asTrace = (rank: ReturnType<typeof recommendationRank>): ManagerPriorityRank => ({ stableKey: rank.item.stableKey, title: rank.item.title, score: rank.score, factors: rank.factors });
  return {
    brief: {
      ...brief,
      summary: today[0]
        ? `${facts.artist.name}'s first move is ${today[0].title.toLowerCase()}. ${today.length > 1 ? `${today.length - 1} other item${today.length === 2 ? "" : "s"} also need attention.` : "The rest of the board is currently stable."}`
        : `${facts.artist.name} has no urgent recorded work.`,
      today,
      thisWeek
    },
    trace: {
      policyVersion: "manager_priority_v1",
      today: todayRanks.slice(0, 5).map(asTrace),
      thisWeek: weekRanks.slice(0, 10).map(asTrace),
      omittedToday: todayRanks.slice(5).map(asTrace),
      omittedThisWeek: weekRanks.slice(10).map(asTrace)
    }
  };
}

function dueAt(daysFromNow: number, now: Date) {
  return new Date(now.getTime() + daysFromNow * DAY_MS).toISOString();
}

function money(minor: number, currency: string) {
  return `${currency} ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function eventDate(value: Date | null) {
  if (!value) return "date not set";
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function decisionOptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const label = "label" in item && typeof item.label === "string" ? item.label : null;
    const tradeoff = "tradeoff" in item && typeof item.tradeoff === "string" ? item.tradeoff : null;
    return label && tradeoff ? [{ label, tradeoff }] : [];
  }).slice(0, 6);
}

const MISSING_TRADEOFF = "Not recorded yet—add the real cost, benefit, or risk before choosing.";

function questionWorkstream(question: string): ManagerWorkstream {
  if (/\b(show|gig|book|booking|venue|festival|tour|market)\b/i.test(question)) return "live";
  if (/\b(release|single|album|ep|recording|distribution)\b/i.test(question)) return "releases";
  if (/\b(content|social|video|photo|post)\b/i.test(question)) return "content";
  if (/\b(fan|audience|mailing list|stream)\b/i.test(question)) return "audience";
  if (/\b(money|budget|pay|price|fee|business|contract)\b/i.test(question)) return "business";
  if (/\b(buyer|contact|promoter|relationship)\b/i.test(question)) return "relationships";
  return "band_operations";
}

function decisionDraftFromQuestion(question: string): ManagerRecommendationDraft | null {
  const trimmed = question.trim();
  const match = /^(?:should we|do we|would it be better to|is it better to|help us (?:choose|decide) between|(?:choose|decide) between)\s+(.{2,100}?)\s+or\s+(.{2,100}?)[?.!]*$/i.exec(trimmed);
  if (!match) return null;
  const clean = (value: string) => value.trim().replace(/^["“]|["”?.!]$/g, "").trim();
  const first = clean(match[1] ?? "");
  const second = clean(match[2] ?? "");
  if (!first || !second || first.toLocaleLowerCase() === second.toLocaleLowerCase()) return null;
  const title = trimmed.replace(/[?.!]+$/, "").slice(0, 200);
  const stable = title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 56) || "band-choice";
  const workstream = questionWorkstream(trimmed);
  return {
    stableKey: `decision-draft-${stable}`,
    title: `Frame the decision: ${title}`.slice(0, 200),
    reason: "The conversation contains two real options, but the band has not recorded their tradeoffs or made a choice.",
    nextAction: "Add an open decision draft, correct the framing and tradeoffs, then choose only when the band is ready.",
    workstream,
    priority: "med",
    evidenceIds: [],
    proposedAction: {
      type: "create_decision",
      workstream,
      title,
      context: "Prepared from this conversation. Review every option and tradeoff before the band chooses.",
      options: [{ label: first, tradeoff: MISSING_TRADEOFF }, { label: second, tradeoff: MISSING_TRADEOFF }]
    }
  };
}

export function deterministicManagerPlanHealth(facts: ManagerFacts, now = new Date()): ManagerPlanHealth {
  const activeGoals = facts.goals.filter((goal) => goal.status === "active");
  if (!activeGoals.length) return {
    score: 0,
    status: "needs_plan",
    summary: "There is no active goal to manage against yet.",
    goals: [],
    gaps: [{ code: "no_active_goal", detail: "Record at least one measurable active goal before judging whether the band is on track.", evidenceIds: [] }]
  };

  const gaps: ManagerPlanHealth["gaps"] = [];
  const goals = activeGoals.map((goal) => {
    const initiatives = facts.initiatives.filter((initiative) => initiative.goalId === goal.id && !["completed", "abandoned"].includes(initiative.status));
    const initiativeIds = new Set(initiatives.map((initiative) => initiative.id));
    const tasks = facts.tasks.filter((task) => task.initiativeId && initiativeIds.has(task.initiativeId));
    const completedTasks = tasks.filter((task) => task.status === "done").length;
    const openTasks = tasks.length - completedTasks;
    const blocked = initiatives.filter((initiative) => initiative.status === "blocked");
    const blockedTasks = tasks.filter((task) => task.status === "blocked");
    const overdueInitiatives = initiatives.filter((initiative) => initiative.status !== "completed" && initiative.dueAt && initiative.dueAt < now);
    const overdue = tasks.filter((task) => task.status !== "done" && task.dueAt && task.dueAt < now);
    const unassigned = tasks.filter((task) => task.status !== "done" && !task.ownerLabel?.trim());
    const deadlinePast = Boolean(goal.deadline && goal.deadline < now);
    const deadlineSoon = Boolean(goal.deadline && goal.deadline >= now && goal.deadline.getTime() - now.getTime() <= 30 * DAY_MS);
    const progressRatio = goal.targetValue !== null && goal.currentValue !== null && goal.targetValue > 0
      ? Math.max(0, goal.currentValue / goal.targetValue)
      : null;
    const expectedProgress = goal.createdAt && goal.deadline && goal.deadline > goal.createdAt && now > goal.createdAt
      ? Math.min(1, (now.getTime() - goal.createdAt.getTime()) / (goal.deadline.getTime() - goal.createdAt.getTime()))
      : null;
    const behindPace = progressRatio !== null && expectedProgress !== null && progressRatio + 0.15 < expectedProgress;
    const reasons: string[] = [];
    let status: ManagerPlanHealth["goals"][number]["status"] = "on_track";
    if (deadlinePast && (progressRatio === null || progressRatio < 1)) {
      status = "off_track";
      reasons.push("The goal deadline has passed without recorded completion.");
    } else if (blocked.length || blockedTasks.length || overdueInitiatives.length || overdue.length || unassigned.length || behindPace || (deadlineSoon && (progressRatio === null || progressRatio < 0.75))) {
      status = "at_risk";
      if (blocked.length) reasons.push(`${blocked.length} linked initiative${blocked.length === 1 ? " is" : "s are"} blocked.`);
      if (blockedTasks.length) reasons.push(`${blockedTasks.length} linked task${blockedTasks.length === 1 ? " is" : "s are"} blocked${blockedTasks[0]?.blockedReason ? `: ${blockedTasks[0].blockedReason}` : "."}`);
      if (overdueInitiatives.length) reasons.push(`${overdueInitiatives.length} linked initiative${overdueInitiatives.length === 1 ? " is" : "s are"} overdue.`);
      if (overdue.length) reasons.push(`${overdue.length} linked task${overdue.length === 1 ? " is" : "s are"} overdue.`);
      if (unassigned.length) reasons.push(`${unassigned.length} linked task${unassigned.length === 1 ? " needs" : "s need"} a real owner.`);
      if (behindPace) reasons.push(`Recorded progress is behind the elapsed share of the goal timeline.`);
      if (deadlineSoon && (progressRatio === null || progressRatio < 0.75)) reasons.push("The deadline is within 30 days and recorded progress is below 75% or unknown.");
    } else if (progressRatio === null) {
      status = "needs_measurement";
      reasons.push("A target and current value are not both recorded.");
    }
    if (!initiatives.length) {
      reasons.push("No active initiative is linked to this goal.");
      gaps.push({ code: "goal_without_initiative", detail: `“${goal.title}” has no active initiative.`, evidenceIds: [goal.id] });
      if (status === "on_track") status = "at_risk";
    } else if (!tasks.length) {
      reasons.push("The linked initiative has no assigned task.");
      gaps.push({ code: "initiative_without_task", detail: `“${goal.title}” has a plan but no linked task.`, evidenceIds: [goal.id, ...initiatives.map((initiative) => initiative.id)] });
      if (status === "on_track") status = "at_risk";
    }
    if (unassigned.length) gaps.push({ code: "task_without_owner", detail: `“${goal.title}” has ${unassigned.length} open task${unassigned.length === 1 ? "" : "s"} without an owner.`, evidenceIds: [goal.id, ...unassigned.map((task) => task.id)] });
    if (progressRatio === null) gaps.push({ code: "goal_without_measurement", detail: `“${goal.title}” needs a target and current value.`, evidenceIds: [goal.id] });
    if (!goal.deadline) gaps.push({ code: "goal_without_deadline", detail: `“${goal.title}” has no deadline.`, evidenceIds: [goal.id] });
    if (!reasons.length) reasons.push(progressRatio !== null ? `Recorded progress is ${Math.round(progressRatio * 100)}% with no linked overdue or blocked work.` : "No blocking condition is recorded.");
    return { goalId: goal.id, title: goal.title, status, progressRatio, completedTasks, openTasks, reasons, evidenceIds: unique([goal.id, ...initiatives.map((initiative) => initiative.id), ...overdue.map((task) => task.id)]) };
  });
  const weights = { on_track: 100, needs_measurement: 55, at_risk: 65, off_track: 15 } as const;
  const score = Math.round(goals.reduce((sum, goal) => sum + weights[goal.status], 0) / goals.length);
  const status: ManagerPlanHealth["status"] = goals.some((goal) => goal.status === "off_track") ? "off_track" : goals.some((goal) => goal.status === "at_risk" || goal.status === "needs_measurement") ? "at_risk" : "on_track";
  const summary = status === "on_track"
    ? `The active plan is on track based on ${goals.length} recorded goal${goals.length === 1 ? "" : "s"}.`
    : status === "off_track"
      ? "At least one active goal is past its deadline without recorded completion."
      : `${goals.filter((goal) => goal.status !== "on_track").length} active goal${goals.filter((goal) => goal.status !== "on_track").length === 1 ? " needs" : "s need"} attention or better measurement.`;
  return { score, status, summary, goals, gaps };
}

export function deterministicManagerBriefCandidates(facts: ManagerFacts, now = new Date()): ManagerBrief {
  const today: ManagerRecommendationDraft[] = [];
  const thisWeek: ManagerRecommendationDraft[] = [];
  const addToday = (item: ManagerRecommendationDraft) => {
    if (!today.some((candidate) => candidate.stableKey === item.stableKey)) today.push(item);
  };
  const addWeek = (item: ManagerRecommendationDraft) => {
    if (!thisWeek.some((candidate) => candidate.stableKey === item.stableKey)) thisWeek.push(item);
  };

  if (!facts.profile?.intakeCompletedAt) {
    addToday({
      stableKey: "complete-intake",
      title: "Finish the manager setup",
      reason: "Your goals, lineup, constraints, and band type are needed before StoryBoard can weigh tradeoffs well.",
      nextAction: "Complete the guided Manager setup.",
      workstream: "band_operations",
      priority: "high",
      evidenceIds: [],
      proposedAction: null
    });
  }

  const unreadReplies = facts.bookingReplies.filter((reply) => reply.processingStatus === "unread");
  if (unreadReplies[0]) {
    const reply = unreadReplies[0];
    addToday({
      stableKey: `booking-reply-${reply.id}`,
      title: `Review ${unreadReplies.length === 1 ? "a new booking reply" : `${unreadReplies.length} new booking replies`}`,
      reason: `${reply.fromName ?? reply.fromEmail} replied${reply.subject ? ` about “${reply.subject}”` : ""}. A timely, reviewed response protects the opportunity.`,
      nextAction: "Open Booking inbox, verify the reply, and prepare the next response for approval.",
      workstream: "relationships",
      priority: "high",
      evidenceIds: unreadReplies.slice(0, 8).map((item) => item.id),
      proposedAction: null
    });
  }

  const overdueTasks = facts.tasks.filter((task) => task.status !== "done" && task.dueAt && task.dueAt < now);
  const commitment = facts.commitmentHealth?.items[0];
  if (commitment && commitment.state !== "active") {
    const item = {
      stableKey: `commitment-${commitment.state}-${commitment.taskId}`,
      title: commitment.state === "blocked" ? `Unblock ${commitment.title}` : commitment.state === "overdue" ? `Recommit ${commitment.title}` : commitment.state === "repeatedly_deferred" ? `Re-scope ${commitment.title}` : commitment.state === "waiting" ? `Close the wait on ${commitment.title}` : commitment.state === "unassigned" ? `Assign ${commitment.title}` : `Make ${commitment.title} credible`,
      reason: commitment.reasons.join(" "),
      nextAction: facts.commitmentHealth!.nextAction,
      workstream: "band_operations" as const,
      priority: commitment.severity === "high" ? "high" as const : "med" as const,
      evidenceIds: [commitment.taskId],
      proposedAction: null
    };
    if (commitment.severity === "high") addToday(item); else addWeek(item);
  } else if (!facts.commitmentHealth && overdueTasks[0]) {
    addToday({
      stableKey: "overdue-work",
      title: `Clear ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? "" : "s"}`,
      reason: "Old commitments hide delivery risk and make the band's real capacity hard to judge.",
      nextAction: `Start with “${overdueTasks[0].title}”; finish it, reschedule it, or mark the blocker.`,
      workstream: "band_operations",
      priority: "high",
      evidenceIds: overdueTasks.slice(0, 8).map((task) => task.id),
      proposedAction: null
    });
  }

  const pendingApprovals = facts.approvals.filter((approval) => approval.status === "pending" || approval.status === "approved");
  if (pendingApprovals[0]) {
    const approval = pendingApprovals[0];
    addToday({
      stableKey: `approval-${approval.id}`,
      title: approval.status === "approved" ? `Execute approved work: ${approval.title}` : `Review approval: ${approval.title}`,
      reason: approval.status === "approved" ? "A band-approved action is ready, but it has not been executed." : "External work is waiting for a human decision.",
      nextAction: "Open Approvals, inspect the exact payload, and approve, reject, or execute it there.",
      workstream: "band_operations",
      priority: "high",
      evidenceIds: [approval.id],
      proposedAction: null
    });
  }

  const dueDecisionReview = facts.decisions.find((decision) => decision.status === "decided" && decision.reviewAt && decision.reviewAt <= now);
  if (dueDecisionReview) {
    addToday({
      stableKey: `decision-review-${dueDecisionReview.id}`,
      title: `Review the result of “${dueDecisionReview.title}”`,
      reason: `The band chose “${dueDecisionReview.choice}”${dueDecisionReview.expectedOutcome ? ` expecting ${dueDecisionReview.expectedOutcome.toLowerCase()}` : ""}. The review date has arrived, so the result should be recorded before this lesson gets lost.`,
      nextAction: "Open Manager decisions, compare the actual result with the expected result, and record what the band learned.",
      workstream: dueDecisionReview.workstream,
      priority: "med",
      evidenceIds: [dueDecisionReview.id],
      proposedAction: null
    });
  }

  const contextGap = facts.contextHealth?.gaps[0];
  if (contextGap && facts.profile?.intakeCompletedAt) {
    const item: ManagerRecommendationDraft = {
      stableKey: `context-${contextGap.code}`,
      title: "Give the Manager one missing band fact",
      reason: `${facts.contextHealth!.summary} The first unanswered question is: ${contextGap.question}`,
      nextAction: "Open Band context in Manager and record the band's real answer.",
      workstream: contextGap.section === "business" ? "business" : contextGap.section === "people" ? "band_operations" : "band_operations",
      priority: contextGap.importance === "high" ? "med" : "low",
      evidenceIds: facts.contextHealth!.evidenceIds.slice(0, 8),
      proposedAction: null
    };
    if (facts.contextHealth!.status === "thin") addToday(item); else addWeek(item);
  }

  if (facts.profile?.intakeCompletedAt && facts.knowledgeHealth && facts.knowledgeHealth.status !== "healthy") {
    const conflicted = facts.knowledgeHealth.status === "conflicted";
    const item: ManagerRecommendationDraft = {
      stableKey: "knowledge-refresh",
      title: conflicted ? "Resolve conflicting band knowledge" : "Refresh an aging band fact",
      reason: facts.knowledgeHealth.summary,
      nextAction: facts.knowledgeHealth.nextAction,
      workstream: "band_operations",
      priority: conflicted ? "med" : "low",
      evidenceIds: facts.knowledgeHealth.evidenceIds.slice(0, 8),
      proposedAction: null
    };
    if (conflicted) addToday(item); else addWeek(item);
  }

  const upcomingEvent = facts.events.find((event) => event.startsAt && event.startsAt >= now && event.startsAt.getTime() <= now.getTime() + 21 * DAY_MS);
  if (upcomingEvent) {
    const responses = new Map(upcomingEvent.participants.map((participant) => [participant.bandMemberId, participant.response]));
    const unavailable = upcomingEvent.participants.filter((participant) => participant.response === "unavailable").length;
    const unresolved = facts.members.filter((member) => !responses.has(member.id) || ["unknown", "tentative"].includes(responses.get(member.id) ?? "unknown")).length;
    const availabilitySummary = unavailable > 0
      ? `${unavailable} member${unavailable === 1 ? " is" : "s are"} unavailable.`
      : unresolved > 0
        ? `${unresolved} member response${unresolved === 1 ? " is" : "s are"} still unresolved.`
        : "Availability is clear; logistics still need a final pass.";
    const showDay = upcomingEvent.dayOf && upcomingEvent.startsAt && upcomingEvent.startsAt.getTime() <= now.getTime() + DAY_MS;
    addToday({
      stableKey: `event-${upcomingEvent.id}`,
      title: showDay ? `Run ${upcomingEvent.title} day-of` : upcomingEvent.readiness?.status === "ready" ? `Keep ${upcomingEvent.title} show-ready` : `Get ${upcomingEvent.title} show-ready`,
      reason: showDay ? `${upcomingEvent.dayOf!.headline} ${upcomingEvent.readiness?.headline ?? availabilitySummary}` : upcomingEvent.readiness ? `${eventDate(upcomingEvent.startsAt)} is within three weeks. ${upcomingEvent.readiness.headline} Confidence is ${upcomingEvent.readiness.confidenceLabel}.` : `${eventDate(upcomingEvent.startsAt)} is within three weeks. ${availabilitySummary}`,
      nextAction: showDay ? upcomingEvent.dayOf!.nextAction : upcomingEvent.readiness?.nextAction ?? "Open Band operations and review availability, schedule, contacts, payment terms, and the advance checklist.",
      workstream: "live",
      priority: showDay || upcomingEvent.readiness ? (["blocked", "not_ready"].includes(upcomingEvent.readiness?.status ?? "") || (upcomingEvent.dayOf?.overdueTaskCount ?? 0) > 0 ? "high" : "med") : unavailable > 0 || unresolved > 0 ? "high" : "med",
      evidenceIds: (showDay ? upcomingEvent.dayOf?.evidenceIds : upcomingEvent.readiness?.evidenceIds)?.slice(0, 8) ?? [upcomingEvent.id],
      proposedAction: !showDay && upcomingEvent.startsAt && upcomingEvent.readiness?.gaps.some((gap) => gap.code === "advance_missing")
        ? { type: "generate_event_advance", eventId: upcomingEvent.id }
        : null
    });
  }

  const unpaidInvoices = facts.invoices.filter((invoice) => invoice.totalMinor > invoice.paidMinor);
  const overdueInvoices = unpaidInvoices.filter((invoice) => invoice.dueAt && invoice.dueAt < now);
  const invoice = overdueInvoices[0] ?? unpaidInvoices[0];
  if (invoice) {
    const balance = invoice.totalMinor - invoice.paidMinor;
    addToday({
      stableKey: `invoice-${invoice.id}`,
      title: `${invoice.dueAt && invoice.dueAt < now ? "Collect overdue" : "Track"} invoice ${invoice.number}`,
      reason: `${money(balance, invoice.currency)} remains unpaid${invoice.dueAt ? `; the recorded due date is ${eventDate(invoice.dueAt)}` : " and no due date is recorded"}.`,
      nextAction: "Verify whether payment arrived, then prepare a reviewed reminder if it is still outstanding.",
      workstream: "business",
      priority: invoice.dueAt && invoice.dueAt < now ? "high" : "med",
      evidenceIds: [invoice.id],
      proposedAction: {
        type: "create_task",
        title: `Follow up on invoice ${invoice.number}`,
        dueAt: dueAt(1, now),
        initiativeId: null
      }
    });
  }

  const overdueFollowUps = facts.campaignRecipients.filter((recipient) => recipient.followUpDueAt && recipient.followUpDueAt < now && ["drafted", "sent"].includes(recipient.status));
  if (overdueFollowUps[0] && !overdueTasks.some((task) => task.id === overdueFollowUps[0]?.followUpTaskId)) {
    addToday({
      stableKey: "campaign-follow-ups",
      title: `Handle ${overdueFollowUps.length} overdue booking follow-up${overdueFollowUps.length === 1 ? "" : "s"}`,
      reason: "These prospects have passed their planned follow-up date without a recorded outcome.",
      nextAction: "Review each recipient and prepare any message through the approval flow.",
      workstream: "relationships",
      priority: "high",
      evidenceIds: overdueFollowUps.slice(0, 8).map((recipient) => recipient.id),
      proposedAction: null
    });
  }

  const outcomeAttention = facts.outcomeReview?.attention[0];
  if (outcomeAttention && outcomeAttention.code !== "no_recorded_outcomes") {
    addWeek({
      stableKey: `outcome-${outcomeAttention.code}`,
      title: outcomeAttention.title,
      reason: facts.outcomeReview!.headline,
      nextAction: outcomeAttention.detail,
      workstream: outcomeAttention.code === "settlement_incomplete" || outcomeAttention.code === "event_invoice_open" ? "business" : "live",
      priority: outcomeAttention.code === "event_invoice_open" ? "high" : "med",
      evidenceIds: outcomeAttention.evidenceIds.slice(0, 8),
      proposedAction: null
    });
  }

  const projectAttention = facts.projects.find((project) => ["blocked", "off_track"].includes(project.readiness?.status ?? ""))
    ?? facts.projects.find((project) => ["needs_plan", "at_risk"].includes(project.readiness?.status ?? ""))
    ?? facts.projects.find((project) => project.dueAt && project.dueAt < now);
  if (projectAttention) {
    const projectWorkstream: ManagerWorkstream = projectAttention.type === "release" ? "releases" : projectAttention.type === "content_campaign" ? "content" : "band_operations";
    addWeek({
      stableKey: `project-${projectAttention.id}`,
      title: projectAttention.readiness?.status === "needs_plan" ? `Build the plan for ${projectAttention.name}` : `Move ${projectAttention.name}`,
      reason: projectAttention.readiness?.headline ?? `Its recorded due date was ${eventDate(projectAttention.dueAt)}, so the current plan is no longer credible.`,
      nextAction: projectAttention.readiness?.nextAction ?? "Choose a new milestone, owner, and date or deliberately pause the project.",
      workstream: projectWorkstream,
      priority: ["blocked", "off_track"].includes(projectAttention.readiness?.status ?? "") || Boolean(projectAttention.dueAt && projectAttention.dueAt < now) ? "high" : "med",
      evidenceIds: projectAttention.readiness?.evidenceIds.slice(0, 8) ?? [projectAttention.id],
      proposedAction: projectAttention.readiness?.status === "needs_plan" && projectAttention.dueAt
        ? { type: "generate_project_plan", projectId: projectAttention.id }
        : null
    });
  }

  const qualifiedProspects = facts.prospects.filter((prospect) => prospect.status === "qualified");
  if (qualifiedProspects.length) {
    addWeek({
      stableKey: "qualified-prospects",
      title: `Move ${qualifiedProspects.length} qualified booking prospect${qualifiedProspects.length === 1 ? "" : "s"}`,
      reason: "Qualified leads only become useful when they have a contact, a concrete pitch, and a next date.",
      nextAction: `Start with ${qualifiedProspects[0]?.name} in ${qualifiedProspects[0]?.city}.`,
      workstream: "live",
      priority: "med",
      evidenceIds: qualifiedProspects.slice(0, 8).map((prospect) => prospect.id),
      proposedAction: { type: "create_task", title: `Advance ${qualifiedProspects[0]?.name}`, dueAt: dueAt(3, now), initiativeId: null }
    });
  }

  const goal = facts.goals.find((candidate) => candidate.status === "active");
  if (goal) {
    const progress = goal.targetValue && goal.currentValue !== null
      ? ` Current recorded progress is ${goal.currentValue} of ${goal.targetValue}.`
      : " No measurable current value is recorded yet.";
    addWeek({
      stableKey: `goal-${goal.id}`,
      title: `Move ${goal.title}`,
      reason: `Active goals need a concrete weekly commitment.${progress}`,
      nextAction: "Choose the smallest measurable action that advances this goal and assign it.",
      workstream: goal.workstream,
      priority: "med",
      evidenceIds: [goal.id],
      proposedAction: { type: "create_task", title: `Next step for ${goal.title}`, dueAt: dueAt(7, now), initiativeId: null }
    });
  }

  if (!today.length) {
    const plannedTask = facts.tasks
      .filter((task) => task.status !== "done" && task.initiativeId)
      .sort((a, b) => (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER))[0];
    const plannedInitiative = plannedTask?.initiativeId ? facts.initiatives.find((initiative) => initiative.id === plannedTask.initiativeId) : null;
    const plannedGoal = plannedInitiative?.goalId ? facts.goals.find((candidate) => candidate.id === plannedInitiative.goalId) : null;
    addToday(plannedTask ? {
      stableKey: `planned-task-${plannedTask.id}`,
      title: `Move the 90-day plan: ${plannedTask.title}`,
      reason: `${plannedGoal ? `This advances “${plannedGoal.title}”. ` : ""}No more urgent recorded work is ahead of it.`,
      nextAction: "Open Tasks, assign a real owner if needed, and finish or deliberately reschedule this step.",
      workstream: plannedGoal?.workstream ?? "band_operations",
      priority: "med",
      evidenceIds: unique([plannedTask.id, ...(plannedInitiative ? [plannedInitiative.id] : []), ...(plannedGoal ? [plannedGoal.id] : [])]),
      proposedAction: null
    } : {
      stableKey: "weekly-focus",
      title: "Choose one meaningful outcome for today",
      reason: "No urgent operational gap is visible in StoryBoard right now.",
      nextAction: goal ? `Advance “${goal.title}” before opening new work.` : "Record one measurable 90-day goal, then define its next action.",
      workstream: goal?.workstream ?? "band_operations",
      priority: "low",
      evidenceIds: goal ? [goal.id] : [],
      proposedAction: goal ? { type: "create_task", title: `Advance ${goal.title}`, dueAt: dueAt(1, now), initiativeId: null } : null
    });
  }

  const openApprovals = facts.approvals.filter((approval) => approval.status === "pending");
  const proposedDeals = facts.deals.filter((deal) => deal.status === "proposed" || deal.status === "negotiating");
  const availabilityConflicts = facts.events.filter((event) => event.participants.some((participant) => participant.response === "unavailable"));
  const readinessRisks = facts.events.filter((event) => event.readiness && event.readiness.status !== "ready");
  const activeOpportunities = facts.opportunities.filter((opportunity) => opportunity.stage !== "closed");

  return {
    summary: today[0]
      ? `${facts.artist.name}'s first move is ${today[0].title.toLowerCase()}. ${today.length > 1 ? `${today.length - 1} other item${today.length === 2 ? "" : "s"} also need attention.` : "The rest of the board is currently stable."}`
      : `${facts.artist.name} has no urgent recorded work.`,
    today,
    thisWeek,
    decisionsNeeded: [
      ...facts.decisions.filter((decision) => decision.status === "open").map((decision) => ({ title: decision.title, explanation: decision.context ?? "A recorded decision is waiting for a choice.", evidenceIds: [decision.id] })),
      ...facts.decisions.filter((decision) => decision.status === "decided" && decision.reviewAt && decision.reviewAt <= now).map((decision) => ({ title: `Review: ${decision.title}`, explanation: `The recorded choice was “${decision.choice}”. Compare the actual result with ${decision.expectedOutcome ? `the expected result: ${decision.expectedOutcome}` : "what the band expected"}.`, evidenceIds: [decision.id] })),
      ...openApprovals.map((approval) => ({ title: approval.title, explanation: `This ${approval.actionType.replaceAll("_", " ")} is waiting for human approval.`, evidenceIds: [approval.id] }))
    ].slice(0, 8),
    waitingOn: [
      ...(facts.commitmentHealth?.items.filter((item) => item.waitingOn).map((item) => ({ title: `${item.title} — waiting on ${item.waitingOn}`, dueAt: item.dueAt, evidenceIds: [item.taskId] })) ?? []),
      ...proposedDeals.map((deal) => ({ title: deal.title, dueAt: deal.expiresAt?.toISOString() ?? null, evidenceIds: [deal.id] })),
      ...facts.campaignRecipients.filter((recipient) => recipient.status === "sent").map((recipient) => ({ title: "Booking outreach awaiting reply", dueAt: recipient.followUpDueAt?.toISOString() ?? null, evidenceIds: [recipient.id] }))
    ].slice(0, 10),
    risksAndOpportunities: [
      ...(facts.knowledgeHealth && facts.knowledgeHealth.status !== "healthy" ? [{ title: facts.knowledgeHealth.status === "conflicted" ? "Conflicting manager knowledge" : "Band knowledge needs review", detail: facts.knowledgeHealth.summary, confidence: 1, evidenceIds: facts.knowledgeHealth.evidenceIds.slice(0, 8) }] : []),
      ...(availabilityConflicts.length ? [{ title: "Member availability conflict", detail: `${availabilityConflicts.length} upcoming event${availabilityConflicts.length === 1 ? " has" : "s have"} an unavailable participant.`, confidence: 1, evidenceIds: availabilityConflicts.slice(0, 8).map((event) => event.id) }] : []),
      ...(readinessRisks.length ? [{ title: "Show readiness gaps", detail: `${readinessRisks.length} upcoming show${readinessRisks.length === 1 ? " has" : "s have"} unresolved operational gaps; the nearest is ${readinessRisks[0]?.readiness?.score ?? 0}/100.`, confidence: readinessRisks[0]?.readiness?.confidence ?? 0.5, evidenceIds: readinessRisks.slice(0, 8).map((event) => event.id) }] : []),
      ...(overdueInvoices.length ? [{ title: "Overdue receivables", detail: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? " is" : "s are"} past the recorded due date.`, confidence: 1, evidenceIds: overdueInvoices.slice(0, 8).map((item) => item.id) }] : []),
      ...(facts.commitmentHealth?.counts.blocked ? [{ title: "Blocked commitments", detail: `${facts.commitmentHealth.counts.blocked} task${facts.commitmentHealth.counts.blocked === 1 ? " is" : "s are"} blocked with a recorded reason.`, confidence: 1, evidenceIds: facts.commitmentHealth.items.filter((item) => item.state === "blocked").slice(0, 8).map((item) => item.taskId) }] : []),
      ...(facts.commitmentHealth?.counts.repeatedlyDeferred ? [{ title: "Repeatedly deferred work", detail: `${facts.commitmentHealth.counts.repeatedlyDeferred} task${facts.commitmentHealth.counts.repeatedlyDeferred === 1 ? " has" : "s have"} moved at least twice and should be re-scoped before another date change.`, confidence: 1, evidenceIds: facts.commitmentHealth.items.filter((item) => item.deferralCount >= 2).slice(0, 8).map((item) => item.taskId) }] : []),
      ...(unreadReplies.length ? [{ title: "Fresh booking interest", detail: `${unreadReplies.length} booking repl${unreadReplies.length === 1 ? "y is" : "ies are"} waiting for review.`, confidence: 1, evidenceIds: unreadReplies.slice(0, 8).map((reply) => reply.id) }] : []),
      ...(activeOpportunities.length ? [{ title: "Active live pipeline", detail: `${activeOpportunities.length} booking opportunit${activeOpportunities.length === 1 ? "y can" : "ies can"} be advanced deliberately.`, confidence: 1, evidenceIds: activeOpportunities.slice(0, 8).map((opportunity) => opportunity.id) }] : [])
    ]
  };
}

export function deterministicManagerBrief(facts: ManagerFacts, now = new Date()): ManagerBrief {
  const candidates = deterministicManagerBriefCandidates(facts, now);
  const unsuppressed = suppressRepeatedManagerAdvice(candidates, facts.recommendationHistory, now);
  return prioritizeManagerBrief(unsuppressed, facts, now).brief;
}

function matchingRecommendation(brief: ManagerBrief, workstreams?: ManagerWorkstream[]) {
  const candidates = [...brief.today, ...brief.thisWeek];
  return candidates.find((item) => !workstreams || workstreams.includes(item.workstream)) ?? candidates[0] ?? null;
}

function actionableRecommendation(recommendation: ManagerRecommendationDraft | null) {
  return recommendation?.proposedAction ? recommendation : null;
}

function questionHas(question: string, words: RegExp) {
  return words.test(question.toLowerCase());
}

export function deterministicManagerChat(facts: ManagerFacts, question: string, now = new Date()): ManagerChatResult {
  const brief = suppressRepeatedManagerAdvice(deterministicManagerBrief(facts, now), facts.recommendationHistory, now);
  const proposedDecisionDraft = decisionDraftFromQuestion(question);
  const externalRequest = questionHas(question, /\b(send|email|message|post|publish|pay|sign|execute|accept the contract|call them)\b/);
  const moneyQuestion = questionHas(question, /\b(money|invoice|paid|payment|deposit|deal|settlement|settle|profit|revenue|expense|cash)\b/);
  const liveQuestion = questionHas(question, /\b(show|gig|event|rehearsal|availability|available|ready|schedule|setlist|advance|load-in|soundcheck|doors|curfew)\b/);
  const bookingQuestion = questionHas(question, /\b(booking|buyer|venue|festival|prospect|campaign|reply|outreach|pitch)\b/);
  const teamQuestion = questionHas(question, /\b(member|lineup|bandmate|who|available)\b/);
  const planQuestion = questionHas(question, /\b(goal|plan|progress|track|realistic|strategy|90-day|90 day)\b/);
  const releaseQuestion = questionHas(question, /\b(release|single|album|ep|recording|distribution|content campaign|project|milestone)\b/);
  const commitmentQuestion = managerQuestionAsksAboutCommitments(question);
  const outcomeQuestion = questionHas(question, /\b(last show|recent shows?|what worked|what did(?:n't| not) work|how did we do|outcomes?|learn(?:ed|ing)|post-show|review the show|recent results?|show results?|campaign results?)\b/);
  const decisionQuestion = Boolean(proposedDecisionDraft) || questionHas(question, /\b(decision|decide|choice|choose|option|tradeoff|what did we decide|why did we choose|review that choice)\b/);
  const contextQuestion = questionHas(question, /\b(what do you (?:still )?(?:need|know)|what are you missing|missing context|band context|about (?:us|the band)|know about (?:us|the band)|setup|profile completeness)\b/);
  const knowledgeQuestion = questionHas(question, /\b(what do you remember|manager memory|saved memory|is (?:that|this) current|stale|out of date|trust your memory|confirm(?:ed|ation)? facts?)\b/);

  if (externalRequest) {
    const recommendation = matchingRecommendation(brief);
    return {
      answer: `I can help prepare that, but I won't send, sign, pay, publish, or execute outside work from this conversation. Those actions need the exact payload reviewed in Approvals.\n\nThe useful next move is to prepare the internal work first${recommendation ? `: ${recommendation.nextAction}` : "."}`,
      citations: recommendation?.evidenceIds ?? [],
      recommendation: recommendation?.proposedAction ? recommendation : null
    };
  }

  if (knowledgeQuestion && facts.knowledgeHealth) {
    const health = facts.knowledgeHealth;
    const attention = health.items.filter((item) => item.state !== "current").slice(0, 3);
    const lines = attention.map((item) => `• ${item.key.replaceAll("_", " ")} — ${item.reason}`);
    return {
      answer: `${health.summary} Knowledge health is ${health.score}/100; that measures consistency, confirmation, confidence, and age—not whether the band is doing well.${lines.length ? `\n\nCheck these first:\n${lines.join("\n")}\n\n${health.nextAction}` : " Nothing currently needs reconfirmation."}`,
      citations: health.evidenceIds.slice(0, 10),
      recommendation: null
    };
  }

  if (contextQuestion && facts.contextHealth) {
    const health = facts.contextHealth;
    const questions = health.gaps.slice(0, 3).map((gap, index) => `${index + 1}. ${gap.question} ${gap.reason}`);
    return {
      answer: `${health.summary} Context coverage is ${health.score}/100; that measures recorded facts, not the band's quality or potential.${questions.length ? `\n\nThe next useful answers are:\n${questions.join("\n")}` : "\n\nNothing essential is missing for the current plan. Keep show, project, and business results current as they change."}`,
      citations: health.evidenceIds.slice(0, 10),
      recommendation: null
    };
  }

  if (outcomeQuestion && !decisionQuestion && facts.outcomeReview) {
    const review = facts.outcomeReview;
    const snippet = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit);
    const moneyLines = review.financials.map((row) => {
      const gross = row.showsWithGross ? `gross ${money(row.grossMinor, row.currency)}` : "gross not recorded";
      const net = row.netKnownShows ? `${row.finalizedSettlements === row.netKnownShows ? "finalized net" : "recorded settlement net including draft work"} ${money(row.settledNetMinor, row.currency)}` : "net not established";
      return `${row.currency}: ${gross}; expenses ${money(row.expenseMinor, row.currency)}; ${net}`;
    });
    const attendance = review.live.attendanceRecordedShows
      ? `Recorded attendance totals ${review.live.attendanceTotal} across ${review.live.attendanceRecordedShows} show${review.live.attendanceRecordedShows === 1 ? "" : "s"}.`
      : "No completed show has recorded attendance.";
    const booking = review.activity.booking.booked ? ` ${review.activity.booking.booked} campaign prospect${review.activity.booking.booked === 1 ? " was" : "s were"} explicitly marked booked.` : "";
    const lessonLines = review.recordedLessons.slice(0, 2).map((lesson) => {
      const note = lesson.postShowNotes ? `the post-show note says “${snippet(lesson.postShowNotes, 160)}”` : null;
      const relationship = lesson.relationshipOutcome ? `the relationship outcome says “${snippet(lesson.relationshipOutcome, 120)}”` : null;
      return `For ${lesson.title}, ${[note, relationship].filter(Boolean).join("; ")}.`;
    });
    return {
      answer: `${review.headline}\n\n${attendance}${booking}${lessonLines.length ? `\n${lessonLines.join("\n")}` : ""}${moneyLines.length ? `\n${moneyLines.join("\n")}` : "\nNo show financial result is established yet."}\n\n${review.attention[0] ? `The first gap to close is ${review.attention[0].title.toLowerCase()}: ${review.attention[0].detail}` : review.nextAction}`,
      citations: review.evidenceIds.slice(0, 10),
      recommendation: null
    };
  }

  if (decisionQuestion) {
    const proposedDraft = proposedDecisionDraft;
    const proposedDecisionAction = proposedDraft?.proposedAction?.type === "create_decision" ? proposedDraft.proposedAction : null;
    const matchingOpen = proposedDecisionAction ? facts.decisions.find((decision) => {
      if (decision.status !== "open") return false;
      const existing = decisionOptions(decision.options).map((option) => option.label.toLocaleLowerCase());
      return proposedDecisionAction.options.every((option) => existing.includes(option.label.toLocaleLowerCase()));
    }) : null;
    if (proposedDraft && !matchingOpen) return {
      answer: `This is a real decision, not a task: “${proposedDecisionAction?.title ?? question}”. I can add the two options as an open draft. The tradeoffs are still unknown, so the draft must be corrected before anyone can record a choice.`,
      citations: [],
      recommendation: proposedDraft
    };
    const open = [matchingOpen, ...facts.decisions.filter((decision) => decision.status === "open" && decision.id !== matchingOpen?.id)].filter((decision): decision is ManagerFacts["decisions"][number] => Boolean(decision));
    const due = facts.decisions.filter((decision) => decision.status === "decided" && decision.reviewAt && decision.reviewAt <= now);
    const upcoming = facts.decisions.filter((decision) => decision.status === "decided" && (!decision.reviewAt || decision.reviewAt > now));
    const reviewed = facts.decisions.filter((decision) => decision.status === "reviewed").sort((a, b) => (b.reviewedAt?.getTime() ?? 0) - (a.reviewedAt?.getTime() ?? 0));
    const target = due[0] ?? open[0] ?? upcoming[0] ?? reviewed[0];
    if (!target) return { answer: "There is no open or scheduled band decision in StoryBoard. When the band faces a real tradeoff, record the options, what you choose, what you expect to happen, and when you will check the result.", citations: [], recommendation: null };
    const citations = [target.id];
    if (target.status === "open") {
      const options = decisionOptions(target.options);
      const optionLines = options.map((option) => `• ${option.label} — ${option.tradeoff}`);
      return {
        answer: `The open decision is “${target.title}”.${target.context ? ` ${target.context}` : ""}${optionLines.length ? `\n\nThe recorded options are:\n${optionLines.join("\n")}` : ""}\n\nDo not choose from instinct alone. Pick the option the band can explain, write down the expected result, and set a review date. That turns this into a testable decision instead of a permanent argument.`,
        citations,
        recommendation: null
      };
    }
    if (target.status === "reviewed") return {
      answer: `For “${target.title}”, the band chose “${target.choice}”${target.expectedOutcome ? ` expecting ${target.expectedOutcome.toLowerCase()}` : ""}. The recorded result is ${target.reviewOutcome?.replaceAll("_", " ") ?? "reviewed"}.${target.reviewNote ? `\n\nWhat actually happened: ${target.reviewNote}` : ""}\n\nKeep that as evidence for the next similar choice. It is one observed result, not a universal rule.`,
      citations,
      recommendation: null
    };
    const reviewDue = Boolean(target.reviewAt && target.reviewAt <= now);
    return {
      answer: `For “${target.title}”, the band chose “${target.choice}”.${target.rationale ? ` The recorded reason was: ${target.rationale}` : ""}${target.expectedOutcome ? ` The expected result was: ${target.expectedOutcome}` : ""}\n\n${reviewDue ? "The review date has arrived. Record what actually happened—even if the result is mixed or inconclusive—before changing the story after the fact." : target.reviewAt ? `The review is scheduled for ${eventDate(target.reviewAt)}. Keep the choice intact until there is enough outcome evidence to judge it.` : "No review date is recorded, so this choice does not yet have a reliable learning checkpoint."}`,
      citations,
      recommendation: null
    };
  }

  if (commitmentQuestion && facts.commitmentHealth) {
    const pressure = facts.commitmentHealth.items.filter((item) => item.state !== "active").slice(0, 3);
    const lines = pressure.map((item) => `• ${item.title} — ${item.reasons.join(" ")} ${item.ownerLabel ? `Owner: ${item.ownerLabel}.` : "No owner is recorded."}`);
    return {
      answer: `${facts.commitmentHealth.summary}${lines.length ? `\n\n${lines.join("\n")}` : ""}\n\n${facts.commitmentHealth.nextAction}`,
      citations: pressure.map((item) => item.taskId),
      recommendation: null
    };
  }

  if (releaseQuestion) {
    const activeProjects = facts.projects.filter((project) => !["completed", "cancelled"].includes(project.status));
    const lines = activeProjects.slice(0, 5).map((project) => project.readiness
      ? `• ${project.name} — ${project.readiness.status.replaceAll("_", " ")} at ${project.readiness.score}/100; ${project.readiness.nextMilestone ? `next: ${project.readiness.nextMilestone.title}` : project.readiness.nextAction}`
      : `• ${project.name} — ${project.status}${project.dueAt ? `; due ${eventDate(project.dueAt)}` : "; no due date recorded"}`);
    const recommendation = matchingRecommendation(brief, ["releases", "content", "band_operations"]);
    return {
      answer: activeProjects.length ? `Here is the recorded project picture:\n${lines.join("\n")}\n\n${recommendation ? recommendation.nextAction : "Open the highest-risk project and assign its next milestone."}` : "There is no active release, content, tour, or business project in StoryBoard. Create the real project and its target date before relying on a release plan.",
      citations: unique(activeProjects.flatMap((project) => project.readiness?.evidenceIds ?? [project.id])).slice(0, 10),
      recommendation: actionableRecommendation(recommendation)
    };
  }

  if (planQuestion) {
    const health = deterministicManagerPlanHealth(facts, now);
    const ambition = facts.profile?.twelveMonthAmbition?.toLowerCase() ?? "";
    const unrealistic = /\b(globally famous|overnight|next month|guaranteed|no budget)\b/.test(ambition);
    const attention = health.goals.find((goal) => goal.status === "off_track") ?? health.goals.find((goal) => goal.status === "at_risk" || goal.status === "needs_measurement");
    const nextPlannedTask = facts.tasks
      .filter((task) => task.status !== "done" && task.initiativeId)
      .sort((a, b) => (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER))[0];
    return {
      answer: `${unrealistic ? "The ambition is useful as a direction, but the recorded timeframe or constraints do not support treating it as a forecast. " : ""}${health.summary} The plan-health score is ${health.score}/100; that is an operating signal from deadlines, measurements, linked work, and blockers—not a prediction.${attention ? `\n\nStart with “${attention.title}”: ${attention.reasons[0]}` : nextPlannedTask ? `\n\nThe next recorded step is “${nextPlannedTask.title}”. Assign a real owner if it still says the band generally.` : "\n\nSet one measurable goal with a deadline, then link an initiative and a next task."}`,
      citations: unique([...health.goals.flatMap((goal) => goal.evidenceIds), ...(nextPlannedTask ? [nextPlannedTask.id] : [])]).slice(0, 10),
      recommendation: actionableRecommendation(matchingRecommendation(brief))
    };
  }

  if (moneyQuestion) {
    const balances = new Map<string, number>();
    for (const invoice of facts.invoices) {
      const balance = Math.max(0, invoice.totalMinor - invoice.paidMinor);
      if (balance) balances.set(invoice.currency, (balances.get(invoice.currency) ?? 0) + balance);
    }
    const balanceText = balances.size
      ? [...balances.entries()].map(([currency, total]) => money(total, currency)).join(" and ")
      : "no unpaid invoice balance";
    const draftSettlements = facts.settlements.filter((settlement) => settlement.status === "draft");
    const recommendation = matchingRecommendation(brief, ["business"]);
    return {
      answer: `The books currently show ${balanceText}. ${facts.invoices.length ? `${facts.invoices.length} open invoice record${facts.invoices.length === 1 ? " is" : "s are"} in view.` : "No open invoices are recorded."} ${draftSettlements.length ? `${draftSettlements.length} settlement${draftSettlements.length === 1 ? " still needs" : "s still need"} final review.` : "No draft settlement is waiting."}\n\n${recommendation ? `My next move would be: ${recommendation.nextAction}` : "If money is expected but missing here, record the deal or invoice before making a decision from these totals."}`,
      citations: unique([...facts.invoices.map((invoice) => invoice.id), ...draftSettlements.map((settlement) => settlement.id)]).slice(0, 10),
      recommendation: actionableRecommendation(recommendation)
    };
  }

  if (liveQuestion) {
    const upcoming = facts.events.filter((event) => event.startsAt && event.startsAt >= now).slice(0, 3);
    const lines = upcoming.map((event) => {
      const showDay = event.dayOf && event.startsAt && event.startsAt.getTime() <= now.getTime() + DAY_MS;
      if (event.readiness) {
        const firstGap = event.readiness.gaps[0];
        return `• ${event.title} — ${eventDate(event.startsAt)}; ${event.readiness.status.replaceAll("_", " ")} at ${event.readiness.score}/100 (${event.readiness.confidenceLabel} confidence)${showDay ? `; ${event.dayOf!.headline.toLowerCase()}` : firstGap ? `; first gap: ${firstGap.title.toLowerCase()}` : ""}`;
      }
      const unavailable = event.participants.filter((participant) => participant.response === "unavailable").length;
      const responses = new Set(event.participants.map((participant) => participant.bandMemberId));
      const unresolved = facts.members.filter((member) => !responses.has(member.id)).length + event.participants.filter((participant) => ["unknown", "tentative"].includes(participant.response)).length;
      return `• ${event.title} — ${eventDate(event.startsAt)}${unavailable ? `; ${unavailable} unavailable` : unresolved ? `; ${unresolved} availability response${unresolved === 1 ? "" : "s"} unresolved` : "; recorded availability is clear"}`;
    });
    const recommendation = matchingRecommendation(brief, ["live"]);
    return {
      answer: upcoming.length
        ? `Here is the live calendar I would manage first:\n${lines.join("\n")}\n\n${recommendation ? recommendation.nextAction : "No immediate live action is recorded."}`
        : "There are no upcoming shows, rehearsals, or other band events with a date in StoryBoard. If something is actually booked, add it before relying on this schedule.",
      citations: unique(upcoming.flatMap((event) => event.dayOf && event.startsAt && event.startsAt.getTime() <= now.getTime() + DAY_MS ? event.dayOf.evidenceIds : event.readiness?.evidenceIds ?? [event.id])).slice(0, 10),
      recommendation: actionableRecommendation(recommendation)
    };
  }

  if (bookingQuestion) {
    const unread = facts.bookingReplies.filter((reply) => reply.processingStatus === "unread");
    const qualified = facts.prospects.filter((prospect) => prospect.status === "qualified");
    const overdueFollowUps = facts.campaignRecipients.filter((recipient) => recipient.followUpDueAt && recipient.followUpDueAt < now && ["drafted", "sent"].includes(recipient.status));
    const recommendation = matchingRecommendation(brief, ["live", "relationships"]);
    return {
      answer: `The booking board has ${facts.opportunities.length} active opportunit${facts.opportunities.length === 1 ? "y" : "ies"}, ${qualified.length} qualified prospect${qualified.length === 1 ? "" : "s"}, ${unread.length} unread repl${unread.length === 1 ? "y" : "ies"}, and ${overdueFollowUps.length} overdue follow-up${overdueFollowUps.length === 1 ? "" : "s"}.\n\n${recommendation ? `The highest-leverage next move is: ${recommendation.nextAction}` : "There is no recorded booking action to prioritize. Start by qualifying one real prospect in a target market."}`,
      citations: unique([
        ...unread.map((reply) => reply.id),
        ...overdueFollowUps.map((recipient) => recipient.id),
        ...qualified.map((prospect) => prospect.id),
        ...facts.opportunities.map((opportunity) => opportunity.id)
      ]).slice(0, 10),
      recommendation: actionableRecommendation(recommendation)
    };
  }

  if (teamQuestion) {
    const conflicts = facts.events.filter((event) => event.participants.some((participant) => participant.response === "unavailable"));
    return {
      answer: `${facts.members.length ? `The active lineup is ${facts.members.map((member) => member.name).join(", ")}.` : "No active band members are recorded yet."} ${conflicts.length ? `${conflicts.length} upcoming event${conflicts.length === 1 ? " has" : "s have"} a recorded availability conflict.` : "I do not see a recorded unavailable response on an upcoming event."}\n\n${facts.members.length ? "For a reliable answer on any specific date, make sure every member has a response on that event." : "Add the lineup before using StoryBoard for availability decisions."}`,
      citations: unique([...facts.members.map((member) => member.id), ...conflicts.map((event) => event.id)]).slice(0, 10),
      recommendation: actionableRecommendation(matchingRecommendation(brief, ["band_operations", "live"]))
    };
  }

  const recommendation = matchingRecommendation(brief);
  const top = brief.today.slice(0, 3);
  return {
    answer: top.length
      ? `I would keep this simple. ${brief.summary}\n\n${top.map((item, index) => `${index + 1}. ${item.title} — ${item.nextAction}`).join("\n")}\n\nI am basing that on what is recorded now. Anything happening outside StoryBoard may change the order.`
      : "I do not have enough recorded context to give you a responsible priority yet. Complete the operating profile and add the band's current commitments first.",
    citations: unique(top.flatMap((item) => item.evidenceIds)).slice(0, 10),
    recommendation: actionableRecommendation(recommendation)
  };
}
