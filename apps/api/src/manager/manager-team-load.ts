const DAY_MS = 24 * 60 * 60 * 1000;

export const MANAGER_TEAM_LOAD_POLICY_VERSION = "manager_team_load_v2";
export const MANAGER_TEAM_LOAD_HORIZON_DAYS = 14;

export type ManagerTeamLoadMemberInput = {
  id: string;
  name: string;
  roles?: string[];
  instruments?: string[];
  checkIn?: {
    id: string;
    status: "available" | "limited" | "unavailable";
    note?: string | null;
    effectiveUntil?: Date | null;
    createdAt: Date;
  } | null;
};

export type ManagerTeamLoadTaskInput = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  ownerLabel?: string | null;
  bandMemberId?: string | null;
  blockedReason?: string | null;
};

export type ManagerTeamLoad = {
  policyVersion: typeof MANAGER_TEAM_LOAD_POLICY_VERSION;
  observedAt: string;
  horizonDays: number;
  status: "needs_context" | "needs_owners" | "concentrated" | "distributed";
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  summary: string;
  members: {
    memberId: string;
    name: string;
    roles: string[];
    openTasks: number;
    dueWithinHorizon: number;
    overdue: number;
    blocked: number;
    unscheduled: number;
    pressure: "clear" | "steady" | "high" | "urgent";
    availability: "available" | "limited" | "unavailable" | "unknown";
    availabilityFreshness: "current" | "expired" | "missing";
    availabilityCheckInId: string | null;
    availabilityNote: string | null;
    availabilityUntil: string | null;
    checkedInAt: string | null;
    reasons: string[];
    evidenceIds: string[];
  }[];
  unassigned: {
    taskId: string;
    title: string;
    dueAt: string | null;
    state: "unassigned" | "system_placeholder" | "unknown_owner";
    ownerLabel: string | null;
    evidenceIds: string[];
  }[];
  suggestions: {
    taskId: string;
    taskTitle: string;
    memberId: string;
    memberName: string;
    confidence: "medium" | "high";
    reason: string;
    availability: "available" | "limited" | "unknown";
    checkInId: string | null;
    evidenceIds: string[];
  }[];
  gaps: { code: string; detail: string; nextAction: string; evidenceIds: string[] }[];
  nextAction: string;
  evidenceIds: string[];
};

const systemOwnerLabels = new Set(["manager recommendation", "show advance"]);

export function currentManagerMemberCheckIn(member: ManagerTeamLoadMemberInput, now = new Date()) {
  const checkIn = member.checkIn;
  if (!checkIn) return { status: "unknown" as const, freshness: "missing" as const, checkInId: null, note: null, effectiveUntil: null, createdAt: null };
  if (checkIn.effectiveUntil && checkIn.effectiveUntil <= now) return { status: "unknown" as const, freshness: "expired" as const, checkInId: checkIn.id, note: null, effectiveUntil: checkIn.effectiveUntil, createdAt: checkIn.createdAt };
  return { status: checkIn.status, freshness: "current" as const, checkInId: checkIn.id, note: checkIn.note?.trim() || null, effectiveUntil: checkIn.effectiveUntil ?? null, createdAt: checkIn.createdAt };
}

const roleDomains = [
  { task: ["book", "booking", "buyer", "campaign", "contact", "follow", "followup", "outreach", "pitch", "promoter", "prospect", "venue"], roles: ["booking", "business", "manager", "management", "relationships"] },
  { task: ["advance", "backline", "input", "loadin", "rider", "sound", "stage", "tech", "technical"], roles: ["audio", "production", "sound", "stage", "tech", "technical"] },
  { task: ["budget", "deposit", "expense", "finance", "invoice", "payment", "payout", "settlement", "tax"], roles: ["accounting", "business", "finance", "finances", "treasurer"] },
  { task: ["artwork", "credit", "distribution", "isrc", "master", "publishing", "release"], roles: ["label", "producer", "release", "releases"] },
  { task: ["content", "epk", "marketing", "photo", "press", "social", "video"], roles: ["content", "marketing", "media", "photo", "social", "video"] },
  { task: ["availability", "rehearsal", "schedule", "setlist", "song", "travel"], roles: ["bandleader", "logistics", "musicdirector", "operations", "tourmanager"] }
];

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokens(value: string) {
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((item) => item.length > 2))];
}

export function managerTaskOwnerState(task: ManagerTeamLoadTaskInput, members: ManagerTeamLoadMemberInput[]) {
  const linked = task.bandMemberId ? members.find((member) => member.id === task.bandMemberId) : null;
  if (linked) return { state: "linked" as const, member: linked };
  const owner = task.ownerLabel?.trim() ?? "";
  if (!owner) return { state: "unassigned" as const, member: null };
  if (systemOwnerLabels.has(owner.toLowerCase())) return { state: "system_placeholder" as const, member: null };
  const matching = members.filter((member) => normalized(member.name) === normalized(owner));
  if (matching.length === 1) return { state: "legacy_match" as const, member: matching[0]! };
  return { state: "unknown_owner" as const, member: null };
}

export function managerTaskMayReceiveAssignment(task: ManagerTeamLoadTaskInput, members: ManagerTeamLoadMemberInput[]) {
  const owner = managerTaskOwnerState(task, members);
  return task.status !== "done" && (owner.state === "unassigned" || owner.state === "system_placeholder");
}

function matchScore(task: ManagerTeamLoadTaskInput, member: ManagerTeamLoadMemberInput) {
  const taskTokens = tokens(task.title).map(normalized);
  const responsibilities = [...(member.roles ?? []), ...(member.instruments ?? [])];
  const roleTokens = responsibilities.flatMap((value) => [normalized(value), ...tokens(value).map(normalized)]);
  const roleSet = new Set(roleTokens);
  let score = taskTokens.filter((token) => roleSet.has(token)).length;
  const matchedDomains: string[] = [];
  for (const domain of roleDomains) {
    if (!taskTokens.some((token) => domain.task.includes(token))) continue;
    if (!domain.roles.some((role) => roleSet.has(role))) continue;
    score += 3;
    matchedDomains.push(domain.roles.find((role) => roleSet.has(role)) ?? "recorded role");
  }
  return { score, matchedDomains };
}

function availabilityRank(status: "available" | "limited" | "unavailable" | "unknown") {
  return status === "available" ? 0 : status === "unknown" ? 1 : status === "limited" ? 2 : 3;
}

export function deterministicManagerTeamLoad(input: { members: ManagerTeamLoadMemberInput[]; tasks: ManagerTeamLoadTaskInput[]; now?: Date; horizonDays?: number }): ManagerTeamLoad {
  const now = input.now ?? new Date();
  const horizonDays = input.horizonDays ?? MANAGER_TEAM_LOAD_HORIZON_DAYS;
  const horizon = new Date(now.getTime() + horizonDays * DAY_MS);
  const members = input.members;
  const open = input.tasks.filter((task) => task.status !== "done");
  const assigned = new Map(members.map((member) => [member.id, [] as ManagerTeamLoadTaskInput[]]));
  const unassigned: ManagerTeamLoad["unassigned"] = [];

  for (const task of open) {
    const owner = managerTaskOwnerState(task, members);
    if (owner.member) assigned.get(owner.member.id)?.push(task);
    else unassigned.push({ taskId: task.id, title: task.title, dueAt: task.dueAt?.toISOString() ?? null, state: owner.state, ownerLabel: task.ownerLabel?.trim() || null, evidenceIds: [task.id] });
  }

  const memberRows = members.map((member) => {
    const tasks = assigned.get(member.id) ?? [];
    const overdue = tasks.filter((task) => task.dueAt && task.dueAt < now).length;
    const blocked = tasks.filter((task) => task.status === "blocked").length;
    const dueWithinHorizon = tasks.filter((task) => task.dueAt && task.dueAt >= now && task.dueAt <= horizon).length;
    const unscheduled = tasks.filter((task) => !task.dueAt).length;
    const pressure = blocked || overdue ? "urgent" as const : dueWithinHorizon >= 4 || tasks.length >= 6 ? "high" as const : tasks.length ? "steady" as const : "clear" as const;
    const checkIn = currentManagerMemberCheckIn(member, now);
    const reasons = [
      ...(overdue ? [`${overdue} overdue.`] : []),
      ...(blocked ? [`${blocked} blocked.`] : []),
      ...(dueWithinHorizon ? [`${dueWithinHorizon} due within ${horizonDays} days.`] : []),
      ...(unscheduled ? [`${unscheduled} has no date.`] : []),
      ...(!tasks.length ? ["No open linked task is recorded."] : [])
    ];
    return { memberId: member.id, name: member.name, roles: member.roles ?? [], openTasks: tasks.length, dueWithinHorizon, overdue, blocked, unscheduled, pressure, availability: checkIn.status, availabilityFreshness: checkIn.freshness, availabilityCheckInId: checkIn.checkInId, availabilityNote: checkIn.note, availabilityUntil: checkIn.effectiveUntil?.toISOString() ?? null, checkedInAt: checkIn.createdAt?.toISOString() ?? null, reasons, evidenceIds: [member.id, ...(checkIn.checkInId ? [checkIn.checkInId] : []), ...tasks.map((task) => task.id)].slice(0, 12) };
  });

  const assignable = open.filter((task) => managerTaskMayReceiveAssignment(task, members));
  const suggestions: ManagerTeamLoad["suggestions"] = [];
  for (const task of assignable) {
    const candidates = members.map((member) => {
      const match = matchScore(task, member);
      const load = memberRows.find((row) => row.memberId === member.id)!;
      return { member, ...match, load };
    }).filter((candidate) => candidate.score > 0 && candidate.load.pressure !== "urgent" && candidate.load.availability !== "unavailable")
      .sort((left, right) => right.score - left.score || availabilityRank(left.load.availability) - availabilityRank(right.load.availability) || left.load.dueWithinHorizon - right.load.dueWithinHorizon || left.load.openTasks - right.load.openTasks || left.member.name.localeCompare(right.member.name));
    const first = candidates[0];
    const second = candidates[1];
    if (!first || (second && second.score === first.score && availabilityRank(second.load.availability) === availabilityRank(first.load.availability) && second.load.dueWithinHorizon === first.load.dueWithinHorizon && second.load.openTasks === first.load.openTasks)) continue;
    if (first.load.availability === "unavailable") continue;
    const role = first.matchedDomains[0] ?? "recorded responsibilities";
    const availabilityReason = first.load.availability === "available"
      ? `Their current check-in says available${first.load.availabilityUntil ? ` through ${first.load.availabilityUntil.slice(0, 10)}` : ""}.`
      : first.load.availability === "limited"
        ? `Their current check-in says limited${first.load.availabilityUntil ? ` through ${first.load.availabilityUntil.slice(0, 10)}` : ""}; review the constraint before assigning.`
        : "No current capacity check-in is recorded; confirm before assigning.";
    suggestions.push({ taskId: task.id, taskTitle: task.title, memberId: first.member.id, memberName: first.member.name, confidence: first.score >= 3 && first.load.availability === "available" ? "high" : "medium", reason: `${first.member.name}'s ${role} role matches this work. ${availabilityReason} ${first.load.dueWithinHorizon} task${first.load.dueWithinHorizon === 1 ? " is" : "s are"} due within ${horizonDays} days.`, availability: first.load.availability, checkInId: first.load.availabilityCheckInId, evidenceIds: [task.id, first.member.id, ...first.load.evidenceIds.filter((id) => id !== first.member.id)].slice(0, 8) });
  }

  const assignedCount = memberRows.reduce((sum, member) => sum + member.openTasks, 0);
  const maxAssigned = Math.max(0, ...memberRows.map((member) => member.openTasks));
  const concentrated = assignedCount >= 4 && maxAssigned / assignedCount >= 0.6;
  const unknownOwners = unassigned.filter((task) => task.state === "unknown_owner");
  const missingDates = open.filter((task) => !task.dueAt).length;
  const availabilityKnown = memberRows.filter((member) => member.availabilityFreshness === "current").length;
  const expiredCheckIns = memberRows.filter((member) => member.availabilityFreshness === "expired");
  const missingCheckIns = memberRows.filter((member) => member.availabilityFreshness === "missing");
  const coverage = open.length ? assignedCount / open.length : members.length ? 1 : 0;
  const availabilityCoverage = members.length ? availabilityKnown / members.length : 0;
  const confidence = Math.max(0.2, Math.min(0.9, 0.4 + coverage * 0.3 + availabilityCoverage * 0.15 - (unknownOwners.length ? 0.15 : 0) - (open.length ? missingDates / open.length * 0.15 : 0)));
  const confidenceLabel = confidence >= 0.75 ? "high" as const : confidence >= 0.5 ? "medium" as const : "low" as const;
  const status = !members.length ? "needs_context" as const : unassigned.length ? "needs_owners" as const : concentrated ? "concentrated" as const : "distributed" as const;
  const gaps: ManagerTeamLoad["gaps"] = [
    ...(!members.length ? [{ code: "lineup_missing", detail: "No active working lineup is recorded.", nextAction: "Add the real working members and their responsibilities in Manager.", evidenceIds: [] }] : []),
    ...(unassigned.length ? [{ code: "ownership_missing", detail: `${unassigned.length} open task${unassigned.length === 1 ? " does" : "s do"} not resolve to an active band member.`, nextAction: "Review the suggested match when one exists; otherwise choose an owner in Tasks.", evidenceIds: unassigned.map((task) => task.taskId).slice(0, 8) }] : []),
    ...(members.some((member) => !(member.roles?.length || member.instruments?.length)) ? [{ code: "responsibilities_missing", detail: "At least one member has no recorded responsibilities or instruments.", nextAction: "Record what each person actually handles before relying on assignment suggestions.", evidenceIds: members.filter((member) => !(member.roles?.length || member.instruments?.length)).map((member) => member.id).slice(0, 8) }] : []),
    ...((missingCheckIns.length || expiredCheckIns.length) ? [{ code: "capacity_check_ins_missing", detail: `${missingCheckIns.length} active member${missingCheckIns.length === 1 ? " has" : "s have"} no capacity check-in and ${expiredCheckIns.length} check-in${expiredCheckIns.length === 1 ? " has" : "s have"} expired.`, nextAction: "Ask for a simple available, limited, or unavailable check-in; no private explanation is required.", evidenceIds: [...missingCheckIns.map((member) => member.memberId), ...expiredCheckIns.map((member) => member.availabilityCheckInId).filter((id): id is string => Boolean(id))].slice(0, 8) }] : []),
    ...(missingDates ? [{ code: "dates_missing", detail: `${missingDates} open task${missingDates === 1 ? " has" : "s have"} no due date, so near-term pressure is incomplete.`, nextAction: "Give real commitments credible dates or deliberately leave non-commitments unscheduled.", evidenceIds: open.filter((task) => !task.dueAt).map((task) => task.id).slice(0, 8) }] : [])
  ];
  const summary = !members.length
    ? "StoryBoard cannot review team workload until the working lineup is recorded."
    : `${open.length} open task${open.length === 1 ? " is" : "s are"} recorded: ${assignedCount} resolve to active members and ${unassigned.length} still need ownership review. ${availabilityKnown} of ${members.length} active member${members.length === 1 ? " has" : "s have"} a current capacity check-in.${concentrated ? " Recorded work is concentrated with one member." : ""}`;
  const nextAction = suggestions[0]
    ? `Review whether ${suggestions[0].memberName} should own “${suggestions[0].taskTitle}”; the role match is evidence, not an automatic assignment.`
    : unassigned[0]
      ? `Choose a real owner for “${unassigned[0].title}” after checking responsibilities and outside commitments.`
      : memberRows.find((member) => member.pressure === "urgent")
        ? `Review ${memberRows.find((member) => member.pressure === "urgent")!.name}'s overdue or blocked work before adding another commitment.`
        : "Keep owners and dates current as commitments change.";
  return { policyVersion: MANAGER_TEAM_LOAD_POLICY_VERSION, observedAt: now.toISOString(), horizonDays, status, confidence, confidenceLabel, summary, members: memberRows, unassigned, suggestions, gaps, nextAction, evidenceIds: [...new Set([...members.map((member) => member.id), ...open.map((task) => task.id)])] };
}

export function managerQuestionAsksAboutTeamLoad(question: string) {
  return /\b(who (?:owns|is doing|should own|should do|has|is (?:available|limited|unavailable|free))|availability|workload|work load|overload|overloaded|capacity|delegate|delegation|assign|assignment|split (?:the )?work|team load|everyone doing|carrying too much)\b/i.test(question);
}
