import type { ManagerWorkstream } from "../generated/prisma/enums";
import type { ShowReadiness } from "../operations/event-readiness";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ManagerProposedAction = {
  type: "create_task";
  title: string;
  dueAt: string | null;
  initiativeId: string | null;
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
  tasks: { id: string; title: string; status: string; dueAt: Date | null; initiativeId?: string | null; ownerLabel?: string | null }[];
  opportunities: { id: string; title: string; stage: string; updatedAt: Date; targetDate: Date | null }[];
  events: {
    id: string;
    title: string;
    type: string;
    status: string;
    startsAt: Date | null;
    participants: { response: string; bandMemberId: string }[];
    readiness?: ShowReadiness | null;
  }[];
  projects: { id: string; name: string; status: string; dueAt: Date | null }[];
  deals: { id: string; title: string; status: string; expiresAt: Date | null }[];
  invoices: { id: string; number: string; status: string; currency: string; totalMinor: number; paidMinor: number; dueAt: Date | null }[];
  decisions: { id: string; title: string; context: string | null }[];
  approvals: { id: string; title: string; status: string; actionType: string; updatedAt: Date }[];
  bookingReplies: { id: string; subject: string | null; fromName: string | null; fromEmail: string; processingStatus: string; receivedAt: Date }[];
  campaignRecipients: { id: string; status: string; followUpDueAt: Date | null; followUpTaskId: string | null }[];
  prospects: { id: string; name: string; status: string; kind: string; city: string }[];
  settlements: { id: string; status: string; currency: string; grossMinor: number; expenseMinor: number; netMinor: number; event: { title: string } }[];
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
    } else if (blocked.length || overdueInitiatives.length || overdue.length || unassigned.length || behindPace || (deadlineSoon && (progressRatio === null || progressRatio < 0.75))) {
      status = "at_risk";
      if (blocked.length) reasons.push(`${blocked.length} linked initiative${blocked.length === 1 ? " is" : "s are"} blocked.`);
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

export function deterministicManagerBrief(facts: ManagerFacts, now = new Date()): ManagerBrief {
  const today: ManagerRecommendationDraft[] = [];
  const thisWeek: ManagerRecommendationDraft[] = [];
  const addToday = (item: ManagerRecommendationDraft) => {
    if (today.length < 5 && !today.some((candidate) => candidate.stableKey === item.stableKey)) today.push(item);
  };
  const addWeek = (item: ManagerRecommendationDraft) => {
    if (thisWeek.length < 10 && !thisWeek.some((candidate) => candidate.stableKey === item.stableKey)) thisWeek.push(item);
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
  if (overdueTasks[0]) {
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
    addToday({
      stableKey: `event-${upcomingEvent.id}`,
      title: upcomingEvent.readiness?.status === "ready" ? `Keep ${upcomingEvent.title} show-ready` : `Get ${upcomingEvent.title} show-ready`,
      reason: upcomingEvent.readiness ? `${eventDate(upcomingEvent.startsAt)} is within three weeks. ${upcomingEvent.readiness.headline} Confidence is ${upcomingEvent.readiness.confidenceLabel}.` : `${eventDate(upcomingEvent.startsAt)} is within three weeks. ${availabilitySummary}`,
      nextAction: upcomingEvent.readiness?.nextAction ?? "Open Band operations and review availability, schedule, contacts, payment terms, and the advance checklist.",
      workstream: "live",
      priority: upcomingEvent.readiness ? (["blocked", "not_ready"].includes(upcomingEvent.readiness.status) ? "high" : "med") : unavailable > 0 || unresolved > 0 ? "high" : "med",
      evidenceIds: upcomingEvent.readiness?.evidenceIds.slice(0, 8) ?? [upcomingEvent.id],
      proposedAction: null
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

  const overdueProject = facts.projects.find((project) => project.dueAt && project.dueAt < now);
  if (overdueProject) {
    addWeek({
      stableKey: `project-${overdueProject.id}`,
      title: `Re-plan ${overdueProject.name}`,
      reason: `Its recorded due date was ${eventDate(overdueProject.dueAt)}, so the current plan is no longer credible.`,
      nextAction: "Choose a new milestone, owner, and date or deliberately pause the project.",
      workstream: "band_operations",
      priority: "high",
      evidenceIds: [overdueProject.id],
      proposedAction: { type: "create_task", title: `Re-plan ${overdueProject.name}`, dueAt: dueAt(3, now), initiativeId: null }
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
      ...facts.decisions.map((decision) => ({ title: decision.title, explanation: decision.context ?? "A recorded decision is waiting for a choice.", evidenceIds: [decision.id] })),
      ...openApprovals.map((approval) => ({ title: approval.title, explanation: `This ${approval.actionType.replaceAll("_", " ")} is waiting for human approval.`, evidenceIds: [approval.id] }))
    ].slice(0, 8),
    waitingOn: [
      ...proposedDeals.map((deal) => ({ title: deal.title, dueAt: deal.expiresAt?.toISOString() ?? null, evidenceIds: [deal.id] })),
      ...facts.campaignRecipients.filter((recipient) => recipient.status === "sent").map((recipient) => ({ title: "Booking outreach awaiting reply", dueAt: recipient.followUpDueAt?.toISOString() ?? null, evidenceIds: [recipient.id] }))
    ].slice(0, 10),
    risksAndOpportunities: [
      ...(availabilityConflicts.length ? [{ title: "Member availability conflict", detail: `${availabilityConflicts.length} upcoming event${availabilityConflicts.length === 1 ? " has" : "s have"} an unavailable participant.`, confidence: 1, evidenceIds: availabilityConflicts.slice(0, 8).map((event) => event.id) }] : []),
      ...(readinessRisks.length ? [{ title: "Show readiness gaps", detail: `${readinessRisks.length} upcoming show${readinessRisks.length === 1 ? " has" : "s have"} unresolved operational gaps; the nearest is ${readinessRisks[0]?.readiness?.score ?? 0}/100.`, confidence: readinessRisks[0]?.readiness?.confidence ?? 0.5, evidenceIds: readinessRisks.slice(0, 8).map((event) => event.id) }] : []),
      ...(overdueInvoices.length ? [{ title: "Overdue receivables", detail: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? " is" : "s are"} past the recorded due date.`, confidence: 1, evidenceIds: overdueInvoices.slice(0, 8).map((item) => item.id) }] : []),
      ...(unreadReplies.length ? [{ title: "Fresh booking interest", detail: `${unreadReplies.length} booking repl${unreadReplies.length === 1 ? "y is" : "ies are"} waiting for review.`, confidence: 1, evidenceIds: unreadReplies.slice(0, 8).map((reply) => reply.id) }] : []),
      ...(activeOpportunities.length ? [{ title: "Active live pipeline", detail: `${activeOpportunities.length} booking opportunit${activeOpportunities.length === 1 ? "y can" : "ies can"} be advanced deliberately.`, confidence: 1, evidenceIds: activeOpportunities.slice(0, 8).map((opportunity) => opportunity.id) }] : [])
    ]
  };
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
  const externalRequest = questionHas(question, /\b(send|email|message|post|publish|pay|sign|execute|accept the contract|call them)\b/);
  const moneyQuestion = questionHas(question, /\b(money|invoice|paid|payment|deposit|deal|settlement|settle|profit|revenue|expense|cash)\b/);
  const liveQuestion = questionHas(question, /\b(show|gig|event|rehearsal|availability|available|ready|schedule|setlist|advance|load-in|soundcheck|doors|curfew)\b/);
  const bookingQuestion = questionHas(question, /\b(booking|buyer|venue|festival|prospect|campaign|reply|outreach|pitch)\b/);
  const teamQuestion = questionHas(question, /\b(member|lineup|bandmate|who|available)\b/);
  const planQuestion = questionHas(question, /\b(goal|plan|progress|track|realistic|strategy|90-day|90 day)\b/);

  if (externalRequest) {
    const recommendation = matchingRecommendation(brief);
    return {
      answer: `I can help prepare that, but I won't send, sign, pay, publish, or execute outside work from this conversation. Those actions need the exact payload reviewed in Approvals.\n\nThe useful next move is to prepare the internal work first${recommendation ? `: ${recommendation.nextAction}` : "."}`,
      citations: recommendation?.evidenceIds ?? [],
      recommendation: recommendation?.proposedAction ? recommendation : null
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
      if (event.readiness) {
        const firstGap = event.readiness.gaps[0];
        return `• ${event.title} — ${eventDate(event.startsAt)}; ${event.readiness.status.replaceAll("_", " ")} at ${event.readiness.score}/100 (${event.readiness.confidenceLabel} confidence)${firstGap ? `; first gap: ${firstGap.title.toLowerCase()}` : ""}`;
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
      citations: unique(upcoming.flatMap((event) => event.readiness?.evidenceIds ?? [event.id])).slice(0, 10),
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
