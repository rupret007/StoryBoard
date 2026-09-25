import { deterministicManagerBrief, deterministicManagerChat, managerQuestionAsksAboutSchedule, managerQuestionNeedsRecordedDeskAnswer, type ManagerFacts } from "./manager-intelligence";
import { deterministicEventDayOf, type EventDayOfInput } from "../operations/event-day-of";
import { deterministicShowReadiness } from "../operations/event-readiness";

// Synthetic offline records, never seed or operator data. Also used by the CLI transcript.
const now = new Date("2026-09-24T20:00:00Z");
const empty: ManagerFacts = {
  artist: { id: "desk-fixture", name: "Offline fixture" }, profile: null,
  members: [], goals: [], initiatives: [], tasks: [], opportunities: [], events: [], projects: [],
  deals: [], invoices: [], decisions: [], approvals: [], bookingReplies: [], campaignRecipients: [],
  prospects: [], settlements: [], goalMeasurements: [], recommendationHistory: [], songs: [], setlists: []
};
const input: EventDayOfInput = {
  id: "fixture-event", status: "confirmed", startsAt: new Date("2026-09-24T19:00:00Z"),
  endsAt: new Date("2026-09-25T02:00:00Z"), loadInAt: new Date("2026-09-24T18:00:00Z"),
  soundcheckAt: new Date("2026-09-24T20:30:00Z"), curfewAt: new Date("2026-09-25T02:00:00Z"),
  currency: "USD", participants: [], tasks: [], deals: [], invoices: [],
  schedule: [{ id: "fixture-checkpoint", title: "Recorded break", startsAt: new Date("2026-09-24T21:00:00Z"), endsAt: null, location: null, notes: "Recorded note" }]
};
function event(overrides: Partial<EventDayOfInput> = {}, timezone: string | null = "America/Chicago") {
  const record = { ...input, ...overrides, title: "Recorded fixture event" };
  const readiness = deterministicShowReadiness({ ...record, deals: [], invoices: [] }, [], now);
  return { ...record, title: "Recorded fixture event", type: "gig", timezone, readiness, dayOf: deterministicEventDayOf(record, readiness, [], now) };
}
const invoice = { id: "fixture-invoice", number: "FIXTURE-TODAY", status: "sent", currency: "USD", totalMinor: 10000, paidMinor: 2500, dueAt: new Date("2026-09-24T00:00:00Z") };
const populated: ManagerFacts = { ...empty, events: [event()], invoices: [invoice] };
const cases: { name: string; question: string; facts: ManagerFacts; check: (answer: string, citations: string[]) => boolean }[] = [
  { name: "desk-in-progress-recorded-timeline", question: "What is today's schedule?", facts: populated,
    check: (a, c) => /Load-in/.test(a) && /Soundcheck/.test(a) && /Recorded break/.test(a) && /CDT/.test(a) && /Recorded note/.test(a) && c.includes("fixture-checkpoint") },
  { name: "desk-invoice-calendar-today", question: "Which invoices are unpaid and next due?", facts: populated,
    check: (a, c) => /USD 75.00/.test(a) && /0 overdue/.test(a) && /Sep 24, 2026.*today/.test(a) && !/Collect overdue/.test(a) && c.includes(invoice.id) },
  { name: "desk-invoice-mixed-dates-currencies", question: "Give me a manager desk snapshot", facts: { ...populated, invoices: [invoice,
    { ...invoice, id: "past", number: "FIXTURE-PAST", dueAt: new Date("2026-09-23T00:00:00Z") },
    { ...invoice, id: "undated", number: "FIXTURE-UNDATED", currency: "EUR", dueAt: null },
    { ...invoice, id: "voided", status: "void", totalMinor: 999999 }, { ...invoice, id: "paid", paidMinor: 10000 }] },
    check: (a) => /3 unpaid invoices total USD 150.00 and EUR 75.00; 1 overdue/.test(a) && /Next recorded due: FIXTURE-TODAY/.test(a) && /1 unpaid invoice has no recorded due date/.test(a) },
  { name: "desk-empty-guidance", question: "Give me a manager desk snapshot", facts: empty,
    check: (a) => /Booking:/.test(a) && /Setlists: No songs or setlists are recorded/.test(a) && /local Vault app_api.json/.test(a) && /Invoices: No unpaid invoices/.test(a) && /No current or upcoming dated event/.test(a) },
  { name: "desk-empty-running-order", question: "What is our setlist?", facts: { ...empty, setlists: [{ id: "empty-set", name: "Recorded empty draft", status: "draft", itemCount: 0 }] },
    check: (a) => /0 items/.test(a) && /Recorded setlists are empty/.test(a) && !/Attach a recorded setlist/.test(a) },
  { name: "desk-nearest-missing-schedule", question: "What is the run-of-show?", facts: { ...empty, events: [event({ startsAt: new Date("2026-09-25T19:00:00Z") }), { ...event(), id: "missing", title: "Nearest recorded event", dayOf: null }] },
    check: (a, c) => /Nearest recorded event.*does not have a recorded schedule/.test(a) && c.includes("missing") && !/Recorded break/.test(a) },
  { name: "desk-today-does-not-borrow-tomorrow", question: "What is today's schedule?", facts: { ...empty, events: [event({ startsAt: new Date("2026-09-25T19:00:00Z") })] },
    check: (a, c) => /No event for today is recorded/.test(a) && c.length === 0 },
  { name: "desk-passed-checkpoint-is-not-next", question: "Manager desk snapshot", facts: { ...empty, events: [event({ soundcheckAt: null, curfewAt: null, schedule: [] })] },
    check: (a) => /No next checkpoint is recorded/.test(a) && !/next checkpoint is Load-in/.test(a) },
  { name: "desk-invalid-timezone-honesty", question: "When is load-in?", facts: { ...empty, events: [event({}, "Invalid/Zone")] },
    check: (a) => /UTC/.test(a) && /recorded timezone is invalid/.test(a) },
  { name: "desk-missing-timezone-honesty", question: "When is load-in?", facts: { ...empty, events: [event({}, null)] },
    check: (a) => /UTC/.test(a) && /timezone not recorded/.test(a) },
  { name: "desk-cancelled-event-excluded", question: "What is today's schedule?", facts: { ...empty, events: [event({ status: "cancelled" })] },
    check: (a) => /No event for today is recorded/.test(a) },
  { name: "desk-missing-requested-checkpoint", question: "When is load-in?", facts: { ...empty, events: [event({ loadInAt: null })] },
    check: (a) => /Load-in time is not recorded/.test(a) && /Soundcheck/.test(a) },
  { name: "desk-today-uses-recorded-zone", question: "What is today's schedule?", facts: { ...empty, events: [event({ startsAt: new Date("2026-09-25T02:00:00Z") })] },
    check: (a) => /Run-of-show/.test(a) && /Sep 24, 2026/.test(a) && /CDT/.test(a) },
  { name: "desk-snapshot-does-not-skip-missing-timeline", question: "Manager desk snapshot", facts: { ...empty, events: [event({ startsAt: new Date("2026-09-25T19:00:00Z") }), { ...event(), dayOf: null }] },
    check: (a) => /has no recorded day-of timeline/.test(a) && !/next checkpoint is/.test(a) },
  { name: "desk-cross-domain-plural-routing", question: "Summary of booking and invoices", facts: populated,
    check: (a) => /Manager desk snapshot/.test(a) && /Invoices:/.test(a) },
];

export function managerDeskTranscripts() {
  return cases.map((item) => ({ name: item.name, question: item.question, ...deterministicManagerChat(item.facts, item.question, now) }));
}

export function evaluateManagerDesk() {
  const transcripts = managerDeskTranscripts();
  return [
    ...cases.map((item, index) => ({ name: item.name, source: "golden" as const,
      passed: item.check(transcripts[index]!.answer, transcripts[index]!.citations), detail: "Synthetic recorded-data Manager desk regression; reproducible with scripts/manager-desk-transcript.mjs." })),
    { name: "desk-calendar-brief-agrees-with-chat", source: "golden" as const,
      passed: !JSON.stringify(deterministicManagerBrief(populated, now)).includes("Collect overdue"), detail: "An invoice due today never becomes overdue advice in the brief." },
    { name: "desk-provider-route-and-intent-boundary", source: "golden" as const,
      passed: cases.every((item) => managerQuestionNeedsRecordedDeskAnswer(item.question)) && !managerQuestionAsksAboutSchedule("When is our invoice due?") && !managerQuestionAsksAboutSchedule("What time should we discuss the album?"), detail: "Desk questions bypass provider rewriting without classifying every when/what-time question as run-of-show." }
  ];
}
