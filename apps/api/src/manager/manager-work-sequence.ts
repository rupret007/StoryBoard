export const MANAGER_WORK_SEQUENCE_POLICY_VERSION = "manager_work_sequence_v1" as const;

export type ManagerWorkSequenceTaskInput = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  ownerLabel?: string | null;
  bandMemberId?: string | null;
  blockedReason?: string | null;
  waitingOn?: string | null;
  prerequisites?: { prerequisiteTask: { id: string; title: string; status: string; dueAt: Date | null } }[];
};

export type ManagerWorkSequenceItem = {
  taskId: string;
  title: string;
  state: "ready_now" | "in_progress" | "waiting_on_prerequisites" | "manually_blocked" | "conflicted";
  dueAt: string | null;
  overdue: boolean;
  ownerLabel: string | null;
  prerequisiteIds: string[];
  unfinishedPrerequisites: { taskId: string; title: string; status: string; dueAt: string | null }[];
  unlocksTaskIds: string[];
  reason: string;
  evidenceIds: string[];
};

export type ManagerWorkSequence = {
  policyVersion: typeof MANAGER_WORK_SEQUENCE_POLICY_VERSION;
  observedAt: string;
  status: "clear" | "waiting" | "conflicted" | "empty";
  summary: string;
  counts: { readyNow: number; inProgress: number; waitingOnPrerequisites: number; manuallyBlocked: number; conflicted: number };
  readyNow: ManagerWorkSequenceItem[];
  waiting: ManagerWorkSequenceItem[];
  items: ManagerWorkSequenceItem[];
  evidenceIds: string[];
};

function unique(values: string[]) { return [...new Set(values)]; }

function downstreamIds(taskId: string, reverse: Map<string, string[]>, openIds: Set<string>) {
  const found = new Set<string>();
  const pending = [...(reverse.get(taskId) ?? [])];
  while (pending.length) {
    const current = pending.pop()!;
    if (found.has(current)) continue;
    found.add(current);
    pending.push(...(reverse.get(current) ?? []));
  }
  return [...found].filter((id) => openIds.has(id));
}

function sortSequence(left: ManagerWorkSequenceItem, right: ManagerWorkSequenceItem) {
  if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
  if (left.unlocksTaskIds.length !== right.unlocksTaskIds.length) return right.unlocksTaskIds.length - left.unlocksTaskIds.length;
  const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
  return leftDue - rightDue || left.title.localeCompare(right.title);
}

export function deterministicManagerWorkSequence(tasks: ManagerWorkSequenceTaskInput[], now = new Date()): ManagerWorkSequence {
  const open = tasks.filter((task) => task.status !== "done");
  const openIds = new Set(open.map((task) => task.id));
  const reverse = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dependency of task.prerequisites ?? []) reverse.set(dependency.prerequisiteTask.id, [...(reverse.get(dependency.prerequisiteTask.id) ?? []), task.id]);
  }
  const items = open.map((task): ManagerWorkSequenceItem => {
    const prerequisites = (task.prerequisites ?? []).map((dependency) => dependency.prerequisiteTask);
    const unfinished = prerequisites.filter((prerequisite) => prerequisite.status !== "done");
    const dateConflict = Boolean(task.dueAt && prerequisites.some((prerequisite) => prerequisite.dueAt && prerequisite.dueAt > task.dueAt!));
    const unlocksTaskIds = downstreamIds(task.id, reverse, openIds);
    const overdue = Boolean(task.dueAt && task.dueAt.getTime() < now.getTime());
    const state: ManagerWorkSequenceItem["state"] = dateConflict
      ? "conflicted"
      : task.status === "blocked"
        ? "manually_blocked"
        : unfinished.length
          ? "waiting_on_prerequisites"
          : task.status === "in_progress"
            ? "in_progress"
            : "ready_now";
    const reason = state === "conflicted"
      ? "A prerequisite is due after this task, so the recorded order is not credible."
      : state === "manually_blocked"
        ? task.blockedReason ?? "This task is manually blocked."
        : state === "waiting_on_prerequisites"
          ? `Waiting for ${unfinished.map((prerequisite) => `“${prerequisite.title}”`).join(", ")}.`
          : unlocksTaskIds.length
            ? `Actionable now and unlocks ${unlocksTaskIds.length} downstream task${unlocksTaskIds.length === 1 ? "" : "s"}.`
            : state === "in_progress"
              ? "Already in progress with no unfinished task prerequisite."
              : "Ready to start with no unfinished task prerequisite.";
    const prerequisiteIds = prerequisites.map((prerequisite) => prerequisite.id);
    return {
      taskId: task.id,
      title: task.title,
      state,
      dueAt: task.dueAt?.toISOString() ?? null,
      overdue,
      ownerLabel: task.ownerLabel ?? null,
      prerequisiteIds,
      unfinishedPrerequisites: unfinished.map((prerequisite) => ({ taskId: prerequisite.id, title: prerequisite.title, status: prerequisite.status, dueAt: prerequisite.dueAt?.toISOString() ?? null })),
      unlocksTaskIds,
      reason,
      evidenceIds: unique([task.id, ...prerequisiteIds, ...unlocksTaskIds]).slice(0, 20)
    };
  });
  const readyNow = items.filter((item) => ["ready_now", "in_progress"].includes(item.state)).sort(sortSequence).slice(0, 10);
  const waiting = items.filter((item) => ["waiting_on_prerequisites", "manually_blocked", "conflicted"].includes(item.state)).sort(sortSequence).slice(0, 10);
  const counts = {
    readyNow: items.filter((item) => item.state === "ready_now").length,
    inProgress: items.filter((item) => item.state === "in_progress").length,
    waitingOnPrerequisites: items.filter((item) => item.state === "waiting_on_prerequisites").length,
    manuallyBlocked: items.filter((item) => item.state === "manually_blocked").length,
    conflicted: items.filter((item) => item.state === "conflicted").length
  };
  const status: ManagerWorkSequence["status"] = !items.length ? "empty" : counts.conflicted ? "conflicted" : waiting.length ? "waiting" : "clear";
  const summary = status === "empty"
    ? "No open task sequence is recorded."
    : status === "conflicted"
      ? `${counts.conflicted} task sequence conflict${counts.conflicted === 1 ? " needs" : "s need"} correction before the plan is trusted.`
      : waiting.length
        ? `${readyNow.length} task${readyNow.length === 1 ? " is" : "s are"} actionable now; ${waiting.length} ${waiting.length === 1 ? "is" : "are"} waiting on a prerequisite or recorded blocker.`
        : `${readyNow.length} open task${readyNow.length === 1 ? " is" : "s are"} actionable with no unfinished prerequisite.`;
  return {
    policyVersion: MANAGER_WORK_SEQUENCE_POLICY_VERSION,
    observedAt: now.toISOString(),
    status,
    summary,
    counts,
    readyNow,
    waiting,
    items,
    evidenceIds: unique(items.flatMap((item) => item.evidenceIds))
  };
}

export function managerQuestionAsksAboutWorkSequence(question: string) {
  return /\b(prerequisite|dependenc(?:y|ies)|what (?:can|should) (?:we|i) (?:start|do) now|ready now|work sequence|order of work|what unlocks|do first|before (?:we|i)|waiting on another task)\b/i.test(question);
}
