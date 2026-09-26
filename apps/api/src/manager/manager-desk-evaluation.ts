import { deterministicManagerBrief, deterministicManagerChat, managerQuestionAsksAboutSchedule, managerQuestionAsksAboutPipelineStages, managerQuestionNeedsRecordedDeskAnswer, type ManagerFacts } from "./manager-intelligence";
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
  { name: "desk-herman-marshall-venue-pack", question: "Package Herman Marshall", 
    facts: { ...empty, opportunities: [{ id: "opp-hm", title: "Herman Marshall Tasting Room (Wylie)", stage: "target", targetDate: null, updatedAt: new Date("2026-09-24T00:00:00Z") }] },
    check: (a, c) => /Positioning/.test(a) && /Live links placeholders/.test(a) && /Set formats/.test(a) && /Travis owns the send/.test(a) && /Jeff\+Travis yes before pitch/.test(a) && /hermanmarshall\.com/.test(a) && /info@hmwhiskey\.com/.test(a) && /outreach on Booking/.test(a) && c.includes("opp-hm") },
  { name: "desk-my-stomping-grounds-venue-pack", question: "Package My Stomping Grounds", 
    facts: { ...empty, opportunities: [{ id: "opp-msg", title: "My Stomping Grounds (Haltom City)", stage: "target", targetDate: null, updatedAt: new Date("2026-09-24T00:00:00Z") }] },
    check: (a, c) => /Positioning/.test(a) && /Live links placeholders/.test(a) && /Set formats/.test(a) && /Travis owns the send/.test(a) && /Jeff\+Travis yes before pitch/.test(a) && /mystompinggrounds\.com/.test(a) && /info@mystompinggrounds\.com/.test(a) && /817.*231.*8080/.test(a) && /outreach on Booking/.test(a) && c.includes("opp-msg") },
  { name: "desk-birdies-social-club-venue-pack", question: "Package Birdies Social Club", 
    facts: { ...empty, opportunities: [{ id: "opp-bsc", title: "Birdie's Social Club (Fort Worth)", stage: "target", targetDate: null, updatedAt: new Date("2026-09-24T00:00:00Z") }] },
    check: (a, c) => /Positioning/.test(a) && /Live links placeholders/.test(a) && /Set formats/.test(a) && /Travis owns the send/.test(a) && /Jeff\+Travis yes before pitch/.test(a) && /birdiessocialclub\.com\/music-submission/.test(a) && /hiring@birdiessocialclub\.com/.test(a) && /outreach on Booking/.test(a) && c.includes("opp-bsc") },
  { name: "desk-dans-silverleaf-venue-pack", question: "Package Dan's Silverleaf", 
    facts: { ...empty, opportunities: [{ id: "opp-dsl", title: "Dan's Silverleaf (Denton)", stage: "target", targetDate: null, updatedAt: new Date("2026-09-24T00:00:00Z") }] },
    check: (a, c) => /Positioning/.test(a) && /Live links placeholders/.test(a) && /Set formats/.test(a) && /Travis owns the send/.test(a) && /Jeff\+Travis yes before pitch/.test(a) && /danssilverleaf\.com\/contact/.test(a) && /booking@danssilverleaf\.com/.test(a) && /940.*252.*4369/.test(a) && /outreach on Booking/.test(a) && c.includes("opp-dsl") },
  { name: "desk-double-wide-venue-pack", question: "Package Double Wide", 
    facts: { ...empty, opportunities: [{ id: "opp-dw", title: "Double Wide (Deep Ellum)", stage: "target", targetDate: null, updatedAt: new Date("2026-09-24T00:00:00Z") }] },
    check: (a, c) => /Positioning/.test(a) && /Live links placeholders/.test(a) && /Set formats/.test(a) && /Travis owns the send/.test(a) && /Jeff\+Travis yes before pitch/.test(a) && /doublewidedallas\.com\/contact/.test(a) && /dwbookings@gmail\.com/.test(a) && /469.*872.*0191/.test(a) && /outreach on Booking/.test(a) && c.includes("opp-dw") },
  { name: "desk-kessler-theater-venue-pack", question: "Package The Kessler", 
    facts: { ...empty, opportunities: [{ id: "opp-kessler", title: "The Kessler Theater (Oak Cliff)", stage: "target", targetDate: null, updatedAt: new Date("2026-09-24T00:00:00Z") }] },
    check: (a, c) => /Positioning/.test(a) && /Live links placeholders/.test(a) && /Set formats/.test(a) && /Travis owns the send/.test(a) && /Jeff\+Travis yes before pitch/.test(a) && /thekessler\.org\/faq/.test(a) && /booking@kesslerpresents\.com/.test(a) && /214.*272.*8346/.test(a) && /outreach on Booking/.test(a) && c.includes("opp-kessler") },
  { name: "desk-granada-theater-venue-pack", question: "Package Granada Theater", 
    facts: { ...empty, opportunities: [{ id: "opp-granada", title: "Granada Theater (Lower Greenville)", stage: "target", targetDate: null, updatedAt: new Date("2026-09-24T00:00:00Z") }] },
    check: (a, c) => /Positioning/.test(a) && /Live links placeholders/.test(a) && /Set formats/.test(a) && /Travis owns the send/.test(a) && /Jeff\+Travis yes before pitch/.test(a) && /granadatheater\.com\/faqs/.test(a) && /booking@granadatheater\.com/.test(a) && /214.*841.*4900/.test(a) && /outreach on Booking/.test(a) && c.includes("opp-granada") },
  { name: "desk-magnolia-motor-lounge-venue-pack", question: "Package Magnolia Motor Lounge", 
    facts: { ...empty, opportunities: [{ id: "opp-mml", title: "Magnolia Motor Lounge (Fort Worth)", stage: "target", targetDate: null, updatedAt: new Date("2026-09-24T00:00:00Z") }] },
    check: (a, c) => /Positioning/.test(a) && /Live links placeholders/.test(a) && /Set formats/.test(a) && /Travis owns the send/.test(a) && /Jeff\+Travis yes before pitch/.test(a) && /magnoliamotorlounge\.com\/contact/.test(a) && /booking@mmlbar\.com/.test(a) && /817.*332.*3344/.test(a) && /outreach on Booking/.test(a) && c.includes("opp-mml") },
  { name: "desk-pipeline-stage-breakdown", question: "Show me the pipeline by stage",
    facts: { ...empty, opportunities: [
      { id: "opp-1", title: "Bluebird hold", stage: "hold", targetDate: new Date("2026-10-15T00:00:00Z"), updatedAt: new Date("2026-09-20T00:00:00Z") },
      { id: "opp-2", title: "Exit offer", stage: "offer", targetDate: new Date("2026-11-01T00:00:00Z"), updatedAt: new Date("2026-09-22T00:00:00Z") },
      { id: "opp-3", title: "Hideaway target", stage: "target", targetDate: null, updatedAt: new Date("2026-09-23T00:00:00Z") },
      { id: "opp-4", title: "Skylark offer", stage: "offer", targetDate: new Date("2026-10-20T00:00:00Z"), updatedAt: new Date("2026-09-21T00:00:00Z") }
    ] },
    check: (a, c) => /Pipeline by stage:/.test(a) && /target: 1/.test(a) && /offer: 2/.test(a) && /hold: 1/.test(a) && c.includes("opp-1") && c.includes("opp-2") },
  { name: "desk-pipeline-stale-opportunity-warning", question: "What is the pipeline status by stage?",
    facts: { ...empty, opportunities: [
      { id: "opp-stale", title: "Old hold", stage: "hold", targetDate: null, updatedAt: new Date("2026-08-01T00:00:00Z") }
    ] },
    check: (a, c) => /Pipeline by stage:/.test(a) && /hold: 1/.test(a) && /very stale/.test(a) && /Old hold/.test(a) && /has not changed in/.test(a) && c.includes("opp-stale") },
  { name: "desk-pipeline-21-day-stale-check", question: "Pipeline stage breakdown",
    facts: { ...empty, opportunities: [
      { id: "opp-21", title: "Three week old", stage: "conversation", targetDate: null, updatedAt: new Date("2026-09-02T00:00:00Z") }
    ] },
    check: (a) => /Pipeline by stage:/.test(a) && /conversation: 1/.test(a) && /may need a status check/.test(a) && /Three week old/.test(a) },
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
      passed: cases.every((item) => managerQuestionNeedsRecordedDeskAnswer(item.question)) && !managerQuestionAsksAboutSchedule("When is our invoice due?") && !managerQuestionAsksAboutSchedule("What time should we discuss the album?"), detail: "Desk questions bypass provider rewriting without classifying every when/what-time question as run-of-show." },
    { name: "desk-pipeline-stage-question-boundary", source: "golden" as const,
      passed: managerQuestionAsksAboutPipelineStages("Show me the pipeline by stage") && managerQuestionAsksAboutPipelineStages("What is the funnel breakdown?") && managerQuestionAsksAboutPipelineStages("How many are in each stage?") && !managerQuestionAsksAboutPipelineStages("What's the booking status?") && !managerQuestionAsksAboutPipelineStages("Any new prospects?"), detail: "Pipeline stage questions are routed to stage breakdown without overly broad matching." }
  ];
}
