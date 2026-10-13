import { isTaskOverdueByUtcDay } from "@storyboard/shared";
import type { ShowReadiness } from "./event-readiness";

export type DayOfTimelineItem = {
  id: string;
  label: string;
  at: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  state: "passed" | "next" | "later";
  minutesUntil: number;
};

export type EventDayOfView = {
  eventId: string;
  mode: "date_missing" | "pre_show" | "in_progress" | "post_show" | "closed";
  observedAt: string;
  headline: string;
  nextAction: string;
  nextCheckpoint: DayOfTimelineItem | null;
  timeline: DayOfTimelineItem[];
  openTaskCount: number;
  overdueTaskCount: number;
  unavailableCount: number;
  unresolvedAvailabilityCount: number;
  expectedFeeMinor: number | null;
  expectedDepositMinor: number;
  recordedPaidMinor: number;
  openInvoiceBalanceMinor: number;
  depositRemainingMinor: number;
  currency: string;
  currencyReviewInvoiceCount: number;
  currencyReviewCurrencies: string[];
  currencyReviewMessage: string | null;
  evidenceIds: string[];
};

export type EventDayOfInput = {
  id: string;
  status: string;
  startsAt: Date | null;
  endsAt?: Date | null;
  loadInAt?: Date | null;
  soundcheckAt?: Date | null;
  doorsAt?: Date | null;
  setAt?: Date | null;
  curfewAt?: Date | null;
  guaranteeMinor?: number | null;
  depositMinor?: number | null;
  currency: string;
  participants: { id: string; bandMemberId: string; response: string }[];
  tasks: { id: string; title: string; status: string; dueAt: Date | null }[];
  schedule: { id: string; title: string; startsAt: Date; endsAt: Date | null; location: string | null; notes: string | null }[];
  deals: { id: string; status: string; currency?: string; offerAmountMinor?: number | null; depositMinor?: number | null; invoices?: DayOfInvoice[] }[];
  invoices: DayOfInvoice[];
};

type DayOfInvoice = { id: string; totalMinor: number; paidMinor: number; status: string; currency: string };

function recordedCurrency(value: string | undefined | null): string | null {
  const recorded = value?.trim();
  return recorded ? recorded.toUpperCase() : null;
}

function matchesEventCurrency(value: string | undefined | null, eventCurrency: string): boolean {
  const recorded = recordedCurrency(value);
  return recorded === null || recorded === recordedCurrency(eventCurrency);
}

function describeCurrencyReview(count: number, currencies: string[], eventCurrency: string): string | null {
  if (count <= 0) return null;
  const listed = currencies.join(", ");
  const noun = count === 1 ? "invoice" : "invoices";
  const verb = count === 1 ? "It is" : "They are";
  return `${count} ${noun} in ${listed} need${count === 1 ? "s" : ""} review. ${verb} not included in these ${eventCurrency} totals; StoryBoard did not convert ${count === 1 ? "it" : "them"}.`;
}

function unique(values: string[]) { return [...new Set(values)]; }
function fixedTimeline(event: EventDayOfInput) {
  return [
    ["load-in", "Load-in", event.loadInAt],
    ["soundcheck", "Soundcheck", event.soundcheckAt],
    ["doors", "Doors", event.doorsAt],
    ["set", "Set time", event.setAt],
    ["curfew", "Curfew", event.curfewAt]
  ].filter((item): item is [string, string, Date] => item[2] instanceof Date).map(([key, label, at]) => ({ id: `${event.id}:${key}`, label, at, endsAt: null, location: null, notes: null }));
}

export function deterministicEventDayOf(event: EventDayOfInput, readiness: ShowReadiness, activeMembers: { id: string }[], now = new Date()): EventDayOfView {
  const rawTimeline = [
    ...fixedTimeline(event),
    ...event.schedule.map((item) => ({ id: item.id, label: item.title, at: item.startsAt, endsAt: item.endsAt, location: item.location, notes: item.notes }))
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const recordedEnd = event.curfewAt ?? event.endsAt ?? null;
  const mode: EventDayOfView["mode"] = ["completed", "cancelled"].includes(event.status)
    ? "closed"
    : !event.startsAt
      ? "date_missing"
      : now < (rawTimeline[0]?.at ?? event.startsAt)
        ? "pre_show"
        : recordedEnd && now <= recordedEnd
          ? "in_progress"
          : "post_show";
  const nextIndex = rawTimeline.findIndex((item) => item.at >= now);
  const timeline: DayOfTimelineItem[] = rawTimeline.map((item, index) => ({
    id: item.id,
    label: item.label,
    at: item.at.toISOString(),
    endsAt: item.endsAt?.toISOString() ?? null,
    location: item.location,
    notes: item.notes,
    state: item.at < now ? "passed" : mode !== "closed" && index === nextIndex ? "next" : "later",
    minutesUntil: Math.round((item.at.getTime() - now.getTime()) / 60000)
  }));
  const nextCheckpoint = timeline.find((item) => item.state === "next") ?? null;
  const openTasks = event.tasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => isTaskOverdueByUtcDay(task.dueAt, now));
  const responseByMember = new Map(event.participants.map((participant) => [participant.bandMemberId, participant.response]));
  const unavailableCount = activeMembers.filter((member) => responseByMember.get(member.id) === "unavailable").length;
  const unresolvedAvailabilityCount = activeMembers.filter((member) => !responseByMember.has(member.id) || ["unknown", "tentative"].includes(responseByMember.get(member.id) ?? "unknown")).length;
  const eventCurrency = recordedCurrency(event.currency) ?? event.currency;
  const matchingDeals = event.deals.filter((deal) => matchesEventCurrency(deal.currency, eventCurrency));
  const acceptedDeal = matchingDeals.find((deal) => ["accepted", "completed"].includes(deal.status));
  const expectedFeeMinor = acceptedDeal?.offerAmountMinor ?? event.guaranteeMinor ?? null;
  const expectedDepositMinor = Math.max(event.depositMinor ?? 0, ...matchingDeals.map((deal) => deal.depositMinor ?? 0), 0);
  const invoices = [...event.invoices, ...event.deals.flatMap((deal) => deal.invoices ?? [])].filter((invoice, index, rows) => rows.findIndex((candidate) => candidate.id === invoice.id) === index);
  const payableInvoices = invoices.filter((invoice) => invoice.status !== "voided");
  const compatibleInvoices = payableInvoices.filter((invoice) => matchesEventCurrency(invoice.currency, eventCurrency));
  const foreignInvoices = payableInvoices.filter((invoice) => !matchesEventCurrency(invoice.currency, eventCurrency));
  const currencyReviewCurrencies = unique(foreignInvoices.map((invoice) => recordedCurrency(invoice.currency)).filter((value): value is string => Boolean(value))).sort();
  const currencyReviewInvoiceCount = foreignInvoices.length;
  const currencyReviewMessage = describeCurrencyReview(currencyReviewInvoiceCount, currencyReviewCurrencies, eventCurrency);
  const recordedPaidMinor = compatibleInvoices.reduce((sum, invoice) => sum + invoice.paidMinor, 0);
  const openInvoiceBalanceMinor = compatibleInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.totalMinor - invoice.paidMinor), 0);
  const depositRemainingMinor = Math.max(0, expectedDepositMinor - recordedPaidMinor);
  const nextAction = mode === "closed"
    ? event.status === "cancelled" ? "Record the cancellation outcome and any buyer, payment, or rescheduling follow-up." : "Record the settlement, attendance, notes, and relationship follow-up."
    : readiness.gaps.find((gap) => gap.severity === "high")?.nextAction
      ?? overdueTasks[0]?.title
      ?? (nextCheckpoint ? `Confirm ${nextCheckpoint.label.toLowerCase()} readiness before the next checkpoint.` : mode === "post_show" ? "Record the settlement, attendance, notes, and relationship follow-up." : readiness.nextAction)
      ?? "Keep the event record current as details change.";
  const headline = mode === "closed"
    ? `This event is ${event.status}; no live checkpoint is active.`
    : mode === "date_missing"
    ? "The show date is missing, so a reliable day-of sequence cannot be built."
    : nextCheckpoint
      ? `Next checkpoint: ${nextCheckpoint.label} in ${nextCheckpoint.minutesUntil} minute${Math.abs(nextCheckpoint.minutesUntil) === 1 ? "" : "s"}.`
      : mode === "in_progress"
        ? "The recorded checkpoints have passed; stay on the event until curfew."
        : !recordedEnd && event.startsAt && now >= event.startsAt
          ? "This gig is still open after its recorded start. Review or complete it; StoryBoard will not assume it is live without an end."
          : "The recorded show-day sequence is complete; finish the post-show work.";
  return {
    eventId: event.id,
    mode,
    observedAt: now.toISOString(),
    headline,
    nextAction,
    nextCheckpoint,
    timeline,
    openTaskCount: openTasks.length,
    overdueTaskCount: overdueTasks.length,
    unavailableCount,
    unresolvedAvailabilityCount,
    expectedFeeMinor,
    expectedDepositMinor,
    recordedPaidMinor,
    openInvoiceBalanceMinor,
    depositRemainingMinor,
    currency: event.currency,
    currencyReviewInvoiceCount,
    currencyReviewCurrencies,
    currencyReviewMessage,
    evidenceIds: unique([event.id, ...readiness.evidenceIds, ...openTasks.map((task) => task.id), ...invoices.map((invoice) => invoice.id), ...event.schedule.map((item) => item.id)])
  };
}
