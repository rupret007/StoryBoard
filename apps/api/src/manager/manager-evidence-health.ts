import type { ManagerChatResult, ManagerFacts } from "./manager-intelligence";

const DAY_MS = 24 * 60 * 60 * 1000;

export const MANAGER_EVIDENCE_POLICY_VERSION = "manager_evidence_v1" as const;

export type ManagerEvidenceAreaKey = "live" | "booking" | "projects" | "money" | "goals" | "team";
export type ManagerEvidenceState = "current" | "needs_confirmation" | "stale" | "missing" | "conflicted";

export type ManagerEvidenceArea = {
  area: ManagerEvidenceAreaKey;
  label: string;
  state: ManagerEvidenceState;
  confidence: number;
  summary: string;
  nextQuestion: string | null;
  evidenceIds: string[];
};

export type ManagerEvidenceHealth = {
  policyVersion: typeof MANAGER_EVIDENCE_POLICY_VERSION;
  observedAt: string;
  status: "thin" | "usable" | "strong";
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  summary: string;
  areas: ManagerEvidenceArea[];
  priorityQuestions: { area: ManagerEvidenceAreaKey; question: string; reason: string; evidenceIds: string[] }[];
  evidenceIds: string[];
};

type EvidenceInput = Pick<ManagerFacts, "members" | "goals" | "goalMeasurements" | "events" | "projects" | "opportunities" | "deals" | "invoices" | "settlements" | "bookingReplies" | "prospects">;

const confidenceByState: Record<ManagerEvidenceState, number> = {
  current: 1,
  needs_confirmation: 0.6,
  stale: 0.35,
  missing: 0.25,
  conflicted: 0.2
};

const stateOrder: Record<ManagerEvidenceState, number> = {
  conflicted: 0,
  stale: 1,
  missing: 2,
  needs_confirmation: 3,
  current: 4
};

function unique(values: string[]) { return [...new Set(values)]; }
function ageDays(value: Date | null | undefined, now: Date) { return value ? Math.max(0, Math.floor((now.getTime() - value.getTime()) / DAY_MS)) : null; }
function area(area: ManagerEvidenceAreaKey, label: string, state: ManagerEvidenceState, summary: string, nextQuestion: string | null, evidenceIds: string[]): ManagerEvidenceArea {
  return { area, label, state, confidence: confidenceByState[state], summary, nextQuestion, evidenceIds: unique(evidenceIds).slice(0, 10) };
}

export function deterministicManagerEvidenceHealth(input: EvidenceInput, now = new Date()): ManagerEvidenceHealth {
  const activeEvents = input.events.filter((event) => !["completed", "cancelled"].includes(event.status));
  const datedEvents = activeEvents.filter((event) => event.startsAt && event.startsAt >= now).sort((left, right) => (left.startsAt?.getTime() ?? 0) - (right.startsAt?.getTime() ?? 0));
  const nearestEvent = datedEvents[0];
  const live = !activeEvents.length
    ? area("live", "Shows and rehearsals", "missing", "No active show, rehearsal, travel, or studio event is recorded.", "Is any hold, rehearsal, travel day, or show happening that is not in StoryBoard yet?", [])
    : !datedEvents.length
      ? area("live", "Shows and rehearsals", "needs_confirmation", `${activeEvents.length} active event record${activeEvents.length === 1 ? " has" : "s have"} no upcoming date to anchor advice.`, "Which active event should have a real date next?", activeEvents.map((event) => event.id))
      : nearestEvent?.readiness && nearestEvent.readiness.confidence < 0.6
        ? area("live", "Shows and rehearsals", "needs_confirmation", `The next show is recorded, but its readiness evidence is only ${nearestEvent.readiness.confidenceLabel} confidence.`, "Which missing lineup, schedule, contact, deal, advance, or setlist fact can be confirmed first?", nearestEvent.readiness.evidenceIds)
        : area("live", "Shows and rehearsals", "current", `${datedEvents.length} upcoming dated event${datedEvents.length === 1 ? " is" : "s are"} available for planning.`, null, datedEvents.flatMap((event) => event.readiness?.evidenceIds ?? [event.id]));

  const bookingDates = [
    ...input.opportunities.map((row) => ({ id: row.id, at: row.updatedAt })),
    ...input.prospects.map((row) => ({ id: row.id, at: row.updatedAt })),
    ...input.bookingReplies.map((row) => ({ id: row.id, at: row.receivedAt }))
  ];
  const latestBooking = bookingDates.filter((row): row is { id: string; at: Date } => row.at instanceof Date).sort((left, right) => right.at.getTime() - left.at.getTime())[0];
  const bookingAge = ageDays(latestBooking?.at, now);
  const booking = !bookingDates.length
    ? area("booking", "Booking pipeline", "missing", "No active opportunity, qualified prospect, or unread buyer reply is recorded.", "Is booking active right now, and if so which real buyer, room, or opportunity should be tracked first?", [])
    : bookingAge === null
      ? area("booking", "Booking pipeline", "needs_confirmation", "Booking records exist, but their last meaningful update cannot be established.", "Which booking lead was most recently contacted or changed?", bookingDates.map((row) => row.id))
      : bookingAge > 45
        ? area("booking", "Booking pipeline", "stale", `The newest active booking signal is ${bookingAge} days old.`, "Which opportunity is still real, and what is the current next step?", bookingDates.map((row) => row.id))
        : bookingAge > 21
          ? area("booking", "Booking pipeline", "needs_confirmation", `The newest active booking signal is ${bookingAge} days old and may need a status check.`, "Which buyer or opportunity should be confirmed before planning more outreach?", bookingDates.map((row) => row.id))
          : area("booking", "Booking pipeline", "current", `The active booking board has a recorded change within the last ${bookingAge} day${bookingAge === 1 ? "" : "s"}.`, null, bookingDates.map((row) => row.id));

  const activeProjects = input.projects.filter((project) => !["completed", "cancelled"].includes(project.status));
  const weakestProject = activeProjects.filter((project) => project.readiness).sort((left, right) => (left.readiness?.confidence ?? 1) - (right.readiness?.confidence ?? 1))[0];
  const projects = !activeProjects.length
    ? area("projects", "Releases and projects", "missing", "No active release, content, tour, or business project is recorded.", "Is any release, campaign, tour, or business project already in motion outside StoryBoard?", [])
    : weakestProject?.readiness && weakestProject.readiness.confidence < 0.6
      ? area("projects", "Releases and projects", "needs_confirmation", `${weakestProject.name} has incomplete planning evidence, so project advice should stay cautious.`, "Which missing target date, milestone, owner, metric, asset, or budget fact can be recorded first?", weakestProject.readiness.evidenceIds)
      : area("projects", "Releases and projects", "current", `${activeProjects.length} active project${activeProjects.length === 1 ? " has" : "s have"} enough recorded structure for bounded planning.`, null, activeProjects.flatMap((project) => project.readiness?.evidenceIds ?? [project.id]));

  const financialRows = [...input.deals, ...input.invoices, ...input.settlements];
  const agedDeal = input.deals.filter((deal) => ["draft", "proposed", "negotiating"].includes(deal.status) && (ageDays(deal.updatedAt, now) ?? 0) > 45).sort((left, right) => (left.updatedAt?.getTime() ?? 0) - (right.updatedAt?.getTime() ?? 0))[0];
  const agedSettlement = input.settlements.filter((settlement) => (ageDays(settlement.updatedAt, now) ?? 0) > 30).sort((left, right) => (left.updatedAt?.getTime() ?? 0) - (right.updatedAt?.getTime() ?? 0))[0];
  const money = !financialRows.length
    ? area("money", "Deals and money", "missing", "No open offer, invoice, or settlement is recorded. That does not prove that nothing is owed or expected.", "Is any offer, deposit, invoice, payment, expense, or settlement open outside StoryBoard?", [])
    : agedDeal
      ? area("money", "Deals and money", "stale", `The open deal “${agedDeal.title}” has not changed for ${ageDays(agedDeal.updatedAt, now)} days.`, "Is that deal still active, and what exact term or response is outstanding?", financialRows.map((row) => row.id))
      : agedSettlement
        ? area("money", "Deals and money", "stale", `A draft settlement has been open for ${ageDays(agedSettlement.updatedAt, now)} days.`, "What payment, expense, or split fact is still preventing final settlement?", financialRows.map((row) => row.id))
        : area("money", "Deals and money", "current", `${financialRows.length} open financial record${financialRows.length === 1 ? " is" : "s are"} available; totals still cover only what the band recorded.`, null, financialRows.map((row) => row.id));

  const drift = input.goalMeasurements.find((measurement) => ["records_ahead", "recorded_ahead"].includes(measurement.status));
  const unmeasured = input.goalMeasurements.find((measurement) => ["not_recorded", "manual"].includes(measurement.status) && measurement.recordedValue === null);
  const missingMeasurement = input.goalMeasurements.length < input.goals.length;
  const goals = !input.goals.length
    ? area("goals", "Goals and progress", "missing", "No active measurable Manager goal is recorded.", "What observable result should the band pursue first, and by when?", [])
    : drift
      ? area("goals", "Goals and progress", "conflicted", drift.summary, "Should the band reconcile the saved goal number with the selected StoryBoard source?", drift.evidenceIds)
      : missingMeasurement
        ? area("goals", "Goals and progress", "needs_confirmation", "At least one active goal has no current measurement assessment.", "Which goal still needs a progress source or an honest current value?", input.goals.map((goal) => goal.id))
      : unmeasured
        ? area("goals", "Goals and progress", "needs_confirmation", `The goal “${unmeasured.goalTitle}” has no recorded progress value yet.`, "What is the honest current value for that goal?", unmeasured.evidenceIds)
        : area("goals", "Goals and progress", "current", `${input.goals.length} active goal${input.goals.length === 1 ? " is" : "s are"} available with no detected source drift.`, null, unique([...input.goals.map((goal) => goal.id), ...input.goalMeasurements.flatMap((measurement) => measurement.evidenceIds)]));

  const team = !input.members.length
    ? area("team", "Working team", "missing", "No active working lineup is recorded.", "Who is actually in the current performing and operating lineup?", [])
    : area("team", "Working team", "current", `${input.members.length} active working member${input.members.length === 1 ? " is" : "s are"} recorded. Availability still belongs to each event and voluntary check-in.`, null, input.members.map((member) => member.id));

  const areas = [live, booking, projects, money, goals, team];
  const confidence = Number((areas.reduce((sum, item) => sum + item.confidence, 0) / areas.length).toFixed(2));
  const confidenceLabel: ManagerEvidenceHealth["confidenceLabel"] = confidence >= 0.8 ? "high" : confidence >= 0.55 ? "medium" : "low";
  const status: ManagerEvidenceHealth["status"] = confidenceLabel === "high" ? "strong" : confidenceLabel === "medium" ? "usable" : "thin";
  const attention = areas.filter((item) => item.state !== "current").sort((left, right) => stateOrder[left.state] - stateOrder[right.state]);
  const priorityQuestions = attention.filter((item) => item.nextQuestion).slice(0, 3).map((item) => ({ area: item.area, question: item.nextQuestion as string, reason: item.summary, evidenceIds: item.evidenceIds }));
  const summary = status === "strong"
    ? "StoryBoard has strong operating-record coverage for current Manager answers. Outside activity can still change the picture."
    : status === "usable"
      ? `StoryBoard can help from the recorded picture, but ${attention.length} operating area${attention.length === 1 ? " needs" : "s need"} confirmation or setup.`
      : `Manager answers are constrained because ${attention.length} operating area${attention.length === 1 ? " is" : "s are"} missing, stale, conflicted, or incomplete.`;
  return {
    policyVersion: MANAGER_EVIDENCE_POLICY_VERSION,
    observedAt: now.toISOString(),
    status,
    confidence,
    confidenceLabel,
    summary,
    areas,
    priorityQuestions,
    evidenceIds: unique(areas.flatMap((item) => item.evidenceIds))
  };
}

export function managerEvidenceAreaForQuestion(question: string): ManagerEvidenceAreaKey | null {
  const text = question.toLowerCase();
  if (/\b(money|invoice|paid|payment|deposit|deal|settlement|profit|revenue|expense|cash)\b/.test(text)) return "money";
  if (/\b(booking|buyer|venue|festival|prospect|campaign|reply|outreach|pitch)\b/.test(text)) return "booking";
  if (/\b(release|single|album|ep|recording|distribution|content campaign|project|milestone|tour)\b/.test(text)) return "projects";
  if (/\b(show|gig|event|rehearsal|setlist|advance|load-in|soundcheck|doors|curfew)\b/.test(text)) return "live";
  if (/\b(goal|plan|progress|strategy|90-day|90 day)\b/.test(text)) return "goals";
  if (/\b(member|lineup|bandmate|team|capacity|workload|who is available)\b/.test(text)) return "team";
  return null;
}

export function managerQuestionAsksAboutEvidence(question: string) {
  return /\b(how sure|how confident|can (?:we|i) trust|what (?:data|evidence|records?|information) (?:is|are) missing|what could be wrong|what do you need to confirm|is this (?:current|complete)|operating evidence)\b/i.test(question);
}

export function calibrateManagerChatResult(result: ManagerChatResult, facts: ManagerFacts, question: string): ManagerChatResult {
  const health = facts.evidenceHealth;
  if (!health) return result;
  if (managerQuestionAsksAboutEvidence(question)) {
    const attention = health.areas.filter((item) => item.state !== "current").sort((left, right) => stateOrder[left.state] - stateOrder[right.state]);
    const lines = attention.slice(0, 4).map((item) => `• ${item.label} — ${item.summary}${item.nextQuestion ? ` Next check: ${item.nextQuestion}` : ""}`);
    return {
      answer: `${health.summary} This is ${health.confidenceLabel}-confidence operating coverage, not a rating of the band or a guarantee that activity outside StoryBoard is absent.${lines.length ? `\n\nCheck these first:\n${lines.join("\n")}` : "\n\nNo operating area currently needs a record check."}`,
      citations: health.evidenceIds.slice(0, 10),
      recommendation: null
    };
  }
  const selectedArea = managerEvidenceAreaForQuestion(question);
  const broadPriorityQuestion = /\b(what (?:matters|needs|should)|priority|priorities|attention|do next|focus)\b/i.test(question);
  const assessment = selectedArea
    ? health.areas.find((item) => item.area === selectedArea)
    : broadPriorityQuestion && health.status === "thin"
      ? health.areas.filter((item) => item.state !== "current").sort((left, right) => stateOrder[left.state] - stateOrder[right.state])[0]
      : null;
  if (!assessment || assessment.state === "current" || result.answer.includes("Record check:")) return result;
  return {
    ...result,
    answer: `${result.answer}\n\nRecord check: ${assessment.summary}${assessment.nextQuestion ? ` ${assessment.nextQuestion}` : ""}`,
    citations: unique([...result.citations, ...assessment.evidenceIds]).slice(0, 10)
  };
}
