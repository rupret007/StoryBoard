const DAY_MS = 24 * 60 * 60 * 1000;

export type CommitmentTask = {
  id: string;
  title: string;
  status: string;
  ownerLabel?: string | null;
  bandMemberId?: string | null;
  dueAt?: Date | null;
  blockedReason?: string | null;
  waitingOn?: string | null;
  deferralCount?: number;
  lastDeferredAt?: Date | null;
};

export type ManagerCommitmentItem = {
  taskId: string;
  title: string;
  state: "blocked" | "overdue" | "repeatedly_deferred" | "waiting" | "unassigned" | "due_soon" | "unscheduled" | "active";
  severity: "high" | "med" | "low";
  status: string;
  ownerLabel: string | null;
  dueAt: string | null;
  blockedReason: string | null;
  waitingOn: string | null;
  deferralCount: number;
  lastDeferredAt: string | null;
  reasons: string[];
  evidenceIds: string[];
};

export type ManagerCommitmentHealth = {
  observedAt: string;
  summary: string;
  counts: {
    open: number;
    blocked: number;
    overdue: number;
    waiting: number;
    unassigned: number;
    repeatedlyDeferred: number;
    dueSoon: number;
    unscheduled: number;
  };
  items: ManagerCommitmentItem[];
  nextAction: string;
  evidenceIds: string[];
};

export function managerQuestionAsksAboutCommitments(question: string) {
  return /\b(blocked|blocker|stuck|waiting on|follow[- ]?through|commitments?|deferred|slipping|overdue|unassigned|ownerless|task owners?)\b/i.test(question);
}

function primaryState(input: { blocked: boolean; overdue: boolean; repeated: boolean; waiting: boolean; unassigned: boolean; dueSoon: boolean; unscheduled: boolean }): ManagerCommitmentItem["state"] {
  if (input.blocked) return "blocked";
  if (input.overdue) return "overdue";
  if (input.repeated) return "repeatedly_deferred";
  if (input.waiting) return "waiting";
  if (input.unassigned) return "unassigned";
  if (input.dueSoon) return "due_soon";
  if (input.unscheduled) return "unscheduled";
  return "active";
}

function nextAction(item: ManagerCommitmentItem | undefined) {
  if (!item) return "Keep completed work closed and record new commitments only when the band agrees to own them.";
  if (item.state === "blocked") return `Resolve “${item.title}”: ${item.blockedReason}${item.waitingOn ? ` The band is waiting on ${item.waitingOn}.` : ""} Change the owner or date only if the commitment itself has changed.`;
  if (item.state === "overdue") return `Recommit “${item.title}”: finish it, record the blocker, or move it to a date the owner can actually meet.`;
  if (item.state === "repeatedly_deferred") return `Re-scope “${item.title}” before moving it again; it has already been deferred ${item.deferralCount} times.`;
  if (item.state === "waiting") return `Check whether ${item.waitingOn} has responded on “${item.title}”, then set the next date or close the loop.`;
  if (item.state === "unassigned") return `Assign “${item.title}” to one real owner before treating it as planned work.`;
  if (item.state === "due_soon") return `Confirm that ${item.ownerLabel ?? "an owner"} can finish “${item.title}” by the recorded date.`;
  if (item.state === "unscheduled") return `Give “${item.title}” a real date or deliberately remove it from the active commitment list.`;
  return `Move “${item.title}” to its next observable result.`;
}

export function deterministicManagerCommitmentHealth(tasks: CommitmentTask[], now = new Date()): ManagerCommitmentHealth {
  const open = tasks.filter((task) => task.status !== "done");
  const dueSoonLimit = now.getTime() + 7 * DAY_MS;
  const counts = { open: open.length, blocked: 0, overdue: 0, waiting: 0, unassigned: 0, repeatedlyDeferred: 0, dueSoon: 0, unscheduled: 0 };
  const items = open.map((task): ManagerCommitmentItem => {
    const blocked = task.status === "blocked";
    const overdue = Boolean(task.dueAt && task.dueAt.getTime() < now.getTime());
    const waiting = Boolean(task.waitingOn?.trim());
    const ownerLabel = task.ownerLabel?.trim() ?? "";
    const unassigned = !task.bandMemberId && (!ownerLabel || ["show advance", "manager recommendation"].includes(ownerLabel.toLowerCase()));
    const deferralCount = Math.max(0, task.deferralCount ?? 0);
    const repeated = deferralCount >= 2;
    const dueSoon = Boolean(task.dueAt && task.dueAt.getTime() >= now.getTime() && task.dueAt.getTime() <= dueSoonLimit);
    const unscheduled = !task.dueAt;
    if (blocked) counts.blocked += 1;
    if (overdue) counts.overdue += 1;
    if (waiting) counts.waiting += 1;
    if (unassigned) counts.unassigned += 1;
    if (repeated) counts.repeatedlyDeferred += 1;
    if (dueSoon) counts.dueSoon += 1;
    if (unscheduled) counts.unscheduled += 1;
    const blocker = task.blockedReason?.trim() || "no reason recorded";
    const reasons = [
      ...(blocked ? [`Blocked: ${blocker}${/[.!?]$/.test(blocker) ? "" : "."}`] : []),
      ...(overdue ? ["Past its recorded due date."] : []),
      ...(repeated ? [`Deferred ${deferralCount} times.`] : []),
      ...(waiting ? [`Waiting on ${task.waitingOn!.trim()}.`] : []),
      ...(unassigned ? ["No owner is recorded."] : []),
      ...(dueSoon ? ["Due within seven days."] : []),
      ...(unscheduled ? ["No due date is recorded."] : [])
    ];
    const state = primaryState({ blocked, overdue, repeated, waiting, unassigned, dueSoon, unscheduled });
    return {
      taskId: task.id,
      title: task.title,
      state,
      severity: blocked || overdue ? "high" : repeated || unassigned || dueSoon ? "med" : "low",
      status: task.status,
      ownerLabel: task.ownerLabel?.trim() || null,
      dueAt: task.dueAt?.toISOString() ?? null,
      blockedReason: task.blockedReason?.trim() || null,
      waitingOn: task.waitingOn?.trim() || null,
      deferralCount,
      lastDeferredAt: task.lastDeferredAt?.toISOString() ?? null,
      reasons: reasons.length ? reasons : ["Active with an owner and a future date."],
      evidenceIds: [task.id]
    };
  }).sort((a, b) => {
    const severity = { high: 0, med: 1, low: 2 } as const;
    const severityDiff = severity[a.severity] - severity[b.severity];
    if (severityDiff) return severityDiff;
    const state = { blocked: 0, overdue: 1, repeatedly_deferred: 2, waiting: 3, unassigned: 4, due_soon: 5, unscheduled: 6, active: 7 } as const;
    const stateDiff = state[a.state] - state[b.state];
    if (stateDiff) return stateDiff;
    const dueDiff = (a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER) - (b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER);
    return dueDiff || b.deferralCount - a.deferralCount || a.title.localeCompare(b.title);
  });
  const pressure = items.filter((item) => item.severity === "high").length;
  const summary = !open.length
    ? "There is no open task commitment in StoryBoard."
    : pressure
      ? `${pressure} open commitment${pressure === 1 ? " needs" : "s need"} intervention now: ${counts.blocked} blocked and ${counts.overdue} overdue.`
      : counts.repeatedlyDeferred
        ? `${counts.repeatedlyDeferred} commitment${counts.repeatedlyDeferred === 1 ? " has" : "s have"} been deferred repeatedly; re-scope before moving dates again.`
        : `${open.length} open commitment${open.length === 1 ? " is" : "s are"} recorded with no blocked or overdue work.`;
  return { observedAt: now.toISOString(), summary, counts, items: items.slice(0, 50), nextAction: nextAction(items[0]), evidenceIds: items.slice(0, 50).map((item) => item.taskId) };
}
