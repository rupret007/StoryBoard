import { describeTaskDueDate, formatRecordedShowTime } from "@storyboard/shared";
import type { ManagerChatResult, ManagerFacts } from "./manager-intelligence";

// Small, read-only answers for the pilot's daily questions. Facts are loaded for
// one authenticated band; names never stand in for the caller's account link.
export function managerPilotQuestion(question: string) {
  const text = question.trim().replace(/[?!.]+$/, "").replaceAll("’", "'");
  if (/^(?:what do i need to do|what are my (?:tasks|next actions)|what should i do next)$/i.test(text)) return "my_tasks";
  if (/^what(?:'s| is) blocking (?:our |the )?next (?:show|gig)$/i.test(text)) return "next_show";
  if (/^who (?:has not|hasn't|hasn't yet|has not yet) responded(?: (?:for|to) (?:our |the )?next (?:show|gig|rehearsal|event))?$/i.test(text)) return "responses";
  if (/^what(?:'s| is) travis waiting (?:on|for)$/i.test(text)) return "travis";
  if (/^what money is (?:still )?outstanding$/i.test(text)) return "money";
  return null;
}

function due(date: Date | null, now: Date) {
  const value = describeTaskDueDate(date, now);
  return value ? `${value.label}, ${date!.getUTCFullYear()} (UTC calendar day${value.timing === "past" ? ", overdue" : value.timing === "today" ? ", today" : ""})` : "no due date recorded";
}

function nextEvents(facts: ManagerFacts, now: Date, type?: string) {
  return facts.events.filter((event) => {
    if (["completed", "cancelled"].includes(event.status) || (type && event.type !== type) || !event.startsAt) return false;
    if (event.endsAt && event.endsAt < now) return false;
    if (event.startsAt >= now || (event.endsAt && event.endsAt >= now)) return true;
    try {
      const day = new Intl.DateTimeFormat("en-US", { timeZone: event.timezone || "UTC", year: "numeric", month: "numeric", day: "numeric" });
      return day.format(event.startsAt) === day.format(now);
    } catch { return false; }
  }).sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime() || a.id.localeCompare(b.id));
}

function taskLine(task: ManagerFacts["tasks"][number], now: Date) {
  const prerequisites = task.prerequisites?.filter((item) => item.prerequisiteTask.status !== "done") ?? [];
  const blocker = task.blockedReason?.trim() || (task.status === "blocked" ? "blocker reason not recorded" : null);
  return `• ${task.title} — ${due(task.dueAt, now)}; ${blocker ? `blocked: ${blocker}` : prerequisites.length ? "waiting on prerequisites" : task.status.replaceAll("_", " ")}${task.waitingOn ? `; waiting on ${task.waitingOn}` : ""}.${prerequisites.length ? ` First resolve: ${prerequisites.map((item) => item.prerequisiteTask.title).join("; ")}.` : ""}`;
}

export function recordedPilotDesk(facts: ManagerFacts, question: string, now: Date): ManagerChatResult | null {
  const intent = managerPilotQuestion(question);
  if (!intent) return null;
  const result = (answer: string, citations: string[] = []): ManagerChatResult => ({
    answer: `${facts.artist.name}: ${answer}`,
    citations: [...new Set(citations)].slice(0, 10), recommendation: null
  });
  const scope = "This is a bounded view of this band's recorded work; missing records and work outside StoryBoard are not included.";
  if (intent === "my_tasks") {
    const member = facts.members.find((item) => item.id === facts.currentMemberId);
    if (!member) return result("Your signed-in account is not linked to an active performer here. Ask a band owner to link your account in Manager → Band context before using My tasks. A name match does not establish ownership.");
    const mine = facts.tasks.filter((task) => task.status !== "done" && task.bandMemberId === member.id)
      .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || a.id.localeCompare(b.id));
    const shown = mine.slice(0, 4);
    return result(`${member.name}, ${mine.length ? `${mine.length} open task${mine.length === 1 ? " is" : "s are"} assigned to you in the current view${mine.length > shown.length ? `; showing the first ${shown.length} by recorded due date` : ""}:\n${shown.map((task) => taskLine(task, now)).join("\n")}` : "no open task is assigned to you in the current view."}\n\nOpen Tasks → My tasks to review the owner, deadline, and blocker before updating work. ${scope} Manager reads at most 100 tasks.`, [member.id, ...shown.flatMap((task) => [task.id, ...(task.prerequisites?.filter((item) => item.prerequisiteTask.status !== "done").map((item) => item.prerequisiteTask.id) ?? [])])]);
  }
  if (intent === "next_show" || intent === "responses") {
    const type = intent === "next_show" || /\b(show|gig)\b/i.test(question) ? "gig" : /\brehearsal\b/i.test(question) ? "rehearsal" : undefined;
    const event = nextEvents(facts, now, type)[0];
    const kind = type === "gig" ? "show" : type ?? "event";
    if (!event) return result(`No current or upcoming dated ${kind} is available in this view. Add or correct the real event date and timezone in Band operations → Events. Undated records cannot establish which event comes next. ${scope}`);
    const label = `“${event.title}” (${formatRecordedShowTime(event.startsAt?.toISOString(), event.timezone)}; ${event.status})`;
    if (intent === "next_show") {
      const gaps = event.readiness?.gaps ?? [];
      const shown = gaps.slice(0, 3);
      const blockers = facts.tasks.filter((task) => task.eventId === event.id && task.status !== "done" && (task.status === "blocked" || task.blockedReason || task.waitingOn || task.prerequisites?.some((item) => item.prerequisiteTask.status !== "done"))).slice(0, 2);
      const blockerLines = blockers.map((task) => `${taskLine(task, now)} Owner: ${facts.members.find((member) => member.id === task.bandMemberId)?.name ?? task.ownerLabel ?? "unassigned"}.`);
      return result(`Next recorded show: ${label}.${blockerLines.length ? `\nRecorded task blockers:\n${blockerLines.join("\n")}` : ""}${!event.readiness ? " Show-readiness facts are unavailable; open the event before relying on a readiness answer." : shown.length ? `\n${shown.map((gap) => `• ${gap.title}: ${gap.detail} Next: ${gap.nextAction}`).join("\n")}${gaps.length > shown.length ? `\n${gaps.length - shown.length} more recorded gaps are listed on the event.` : ""}` : "  No readiness gap was detected in the recorded show assessment; task blockers and facts outside that assessment still need review."}\n\nOpen the linked show to review its advance, lineup, and day-of details. ${scope} Manager reads at most 30 active events and 100 tasks.`, [event.id, ...blockers.map((task) => task.id), ...shown.flatMap((gap) => gap.evidenceIds)]);
    }
    if (!facts.members.length) return result(`For ${label}, no active lineup is recorded. Add the real performers in Manager → Band context before treating response counts as meaningful.`, [event.id]);
    const responseByMember = new Map(event.participants.map((participant) => [participant.bandMemberId, participant]));
    const missing = facts.members.filter((member) => !responseByMember.has(member.id) || responseByMember.get(member.id)?.response === "unknown");
    const tentative = facts.members.filter((member) => responseByMember.get(member.id)?.response === "tentative");
    const unavailable = facts.members.filter((member) => responseByMember.get(member.id)?.response === "unavailable");
    const names = (members: typeof facts.members) => members.slice(0, 6).map((member) => member.name).join(", ") + (members.length > 6 ? `; ${members.length - 6} more in Events` : "");
    return result(`For ${label}:\n${missing.length ? `No availability answer recorded: ${names(missing)}.` : "Every active performer has a recorded response."}${tentative.length ? `\nTentative: ${names(tentative)}. These people have responded but are not confirmed available.` : ""}${unavailable.length ? `\nUnavailable: ${names(unavailable)}. Resolve this lineup conflict.` : ""}\n\nOpen Band operations → Events to collect or update availability. No reminder has been sent by this answer. ${scope} The active lineup is the expected response list.`, [event.id, ...missing.map((member) => member.id), ...tentative.map((member) => member.id), ...unavailable.map((member) => member.id)]);
  }
  if (intent === "travis") {
    const matches = facts.members.filter((member) => /^travis(?:\s|$)/i.test(member.name.trim()));
    if (matches.length > 1) return result("More than one active performer is named Travis. Identify the booking owner in Manager → Band context before attributing waiting work; no person was selected.", matches.map((member) => member.id));
    const member = matches[0];
    const waiting = member ? facts.tasks.filter((task) => task.status !== "done" && task.bandMemberId === member.id && (task.waitingOn || task.blockedReason || task.status === "blocked" || task.prerequisites?.some((item) => item.prerequisiteTask.status !== "done"))) : [];
    const shown = waiting.slice(0, 3);
    const followUps = facts.campaignRecipients.filter((row) => ["drafted", "sent"].includes(row.status) && (!row.followUpTaskId || facts.tasks.find((task) => task.id === row.followUpTaskId)?.status !== "done"))
      .sort((a, b) => (a.followUpDueAt?.getTime() ?? Infinity) - (b.followUpDueAt?.getTime() ?? Infinity));
    const followUp = followUps[0];
    const opportunity = followUp ? facts.opportunities.find((row) => row.id === followUp.opportunityId) : null;
    return result(`${shown.length ? `Recorded waiting work assigned to ${member!.name}:\n${shown.map((task) => taskLine(task, now)).join("\n")}${waiting.length > shown.length ? `\n${waiting.length - shown.length} more waiting tasks are in Tasks.` : ""}` : member ? "No blocked or waiting task assigned to Travis is recorded in this view. That does not establish that he has no work." : "No active performer named Travis is recorded, so personal task ownership cannot be established. Add or correct his lineup entry in Manager → Band context."}${followUp ? `\nBooking follow-up for review: ${opportunity ? `“${opportunity.title}”` : "linked opportunity is missing from this view"}; ${due(followUp.followUpDueAt, now)}. Status: ${followUp.status}${followUp.status === "drafted" ? " (a draft is not proof of delivery)" : " (verify the recorded delivery before following up)"}.` : "\nNo open campaign follow-up is recorded in this view."}\n\nOpen Tasks for the named blocker and Booking / Pitch campaigns for the recorded follow-up. Travis owns booking; this answer sends nothing and does not infer buyer interest or a response deadline. ${scope}`, [...(member ? [member.id] : []), ...shown.map((task) => task.id), ...(followUp ? [followUp.id] : []), ...(opportunity ? [opportunity.id] : [])]);
  }
  const invoices = facts.invoices.filter((row) => ["issued", "partially_paid", "overdue"].includes(row.status) && row.totalMinor > row.paidMinor);
  const totals = new Map<string, number>();
  for (const row of invoices) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.totalMinor - row.paidMinor);
  const amount = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;
  const shown = invoices.slice(0, 4);
  const drafts = facts.settlements.filter((row) => row.status === "draft");
  return result(`${invoices.length ? `Recorded unpaid invoice balances: ${[...totals].map(([currency, minor]) => amount(minor, currency)).join("; ")}.\n${shown.map((row) => `• ${row.number}: ${amount(row.totalMinor - row.paidMinor, row.currency)} remaining; ${due(row.dueAt, now)}.`).join("\n")}${invoices.length > shown.length ? `\n${invoices.length - shown.length} more invoices are included in these balances.` : ""}` : "No unpaid invoices are recorded in this view. That does not establish that nothing is owed."}\n${drafts.length} draft settlement${drafts.length === 1 ? " needs" : "s need"} review; settlement net is not an unpaid invoice or proof that performers were paid.\n\nOpen Band operations → Deals & money to verify receipts, record payments actually received, and reconcile settlement expenses and payouts. ${scope} Balances cover at most 30 invoices and settlement counts at most 20 drafts.`, [...shown.map((row) => row.id), ...drafts.slice(0, 3).map((row) => row.id)]);
}

export type ManagerEvidenceLink = { id: string; label: string; href: string };

// Code-owned destinations only: never derive URLs from model output or a stored
// title. Existing route guards revalidate access to the selected band's records.
export function managerEvidenceLinks(facts: ManagerFacts, citations: string[]): ManagerEvidenceLink[] {
  return [...new Set(citations)].flatMap((id) => {
    const task = facts.tasks.find((row) => row.id === id);
    if (task) return [{ id, label: `Task: ${task.title}`, href: "/tasks" }];
    const event = facts.events.find((row) => row.id === id);
    if (event) return [{ id, label: `Event: ${event.title}`, href: `/operations?tab=events&event=${encodeURIComponent(id)}` }];
    const member = facts.members.find((row) => row.id === id);
    if (member) return [{ id, label: `Lineup: ${member.name}`, href: "/manager#band-context" }];
    const invoice = facts.invoices.find((row) => row.id === id);
    if (invoice) return [{ id, label: `Invoice: ${invoice.number}`, href: "/operations?tab=deals&focus=money" }];
    const settlement = facts.settlements.find((row) => row.id === id);
    if (settlement) return [{ id, label: `Settlement: ${settlement.event.title}`, href: "/operations?tab=deals&focus=money" }];
    const opportunity = facts.opportunities.find((row) => row.id === id);
    if (opportunity) return [{ id, label: `Booking: ${opportunity.title}`, href: "/booking" }];
    if (facts.campaignRecipients.some((row) => row.id === id)) return [{ id, label: "Recorded booking follow-up", href: "/booking-campaigns" }];
    return [];
  }).slice(0, 10);
}

export function readManagerEvidenceLinks(output: unknown, citations: unknown): ManagerEvidenceLink[] {
  if (!output || typeof output !== "object" || !("evidenceLinks" in output) || !Array.isArray(output.evidenceLinks) || !Array.isArray(citations)) return [];
  return output.evidenceLinks.filter((row): row is ManagerEvidenceLink => Boolean(row && typeof row === "object"
    && typeof row.id === "string" && citations.includes(row.id) && typeof row.label === "string"
    && typeof row.href === "string" && /^(?:\/tasks|\/manager#band-context|\/booking|\/booking-campaigns|\/operations\?tab=(?:events&event=[a-zA-Z0-9%_-]+|deals&focus=money))$/.test(row.href))).slice(0, 10);
}
