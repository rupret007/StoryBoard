import { summarizeSetlist } from "@storyboard/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ShowReadinessGap = {
  code: string;
  category: "people" | "schedule" | "contacts" | "deal" | "advance" | "performance";
  severity: "low" | "med" | "high";
  title: string;
  detail: string;
  nextAction: string;
  evidenceIds: string[];
};

export type ShowReadiness = {
  eventId: string;
  title: string;
  startsAt: string | null;
  daysUntil: number | null;
  score: number;
  status: "ready" | "attention" | "not_ready" | "blocked";
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  observedAt: string;
  headline: string;
  nextAction: string | null;
  categories: { category: ShowReadinessGap["category"]; score: number; maxScore: number; detail: string }[];
  gaps: ShowReadinessGap[];
  evidenceIds: string[];
};

export type ShowReadinessInput = {
  id: string;
  title: string;
  startsAt: Date | null;
  venueId?: string | null;
  locationName?: string | null;
  contactId?: string | null;
  loadInAt?: Date | null;
  soundcheckAt?: Date | null;
  doorsAt?: Date | null;
  setAt?: Date | null;
  curfewAt?: Date | null;
  productionNotes?: string | null;
  stagePlotUrl?: string | null;
  inputListUrl?: string | null;
  techRiderUrl?: string | null;
  guaranteeMinor?: number | null;
  depositMinor?: number | null;
  currency?: string;
  participants: { id: string; bandMemberId: string; response: string }[];
  tasks: { id: string; title: string; status: string; dueAt: Date | null; ownerLabel?: string | null }[];
  setlist?: { id: string; items: { id: string; itemType?: string; label?: string | null; song?: { id?: string; title?: string; durationSeconds?: number | null } | null }[] } | null;
  deals: {
    id: string;
    status: string;
    offerAmountMinor?: number | null;
    depositMinor?: number | null;
    buyerName?: string | null;
    buyerEmail?: string | null;
    agreements?: { id: string; status: string }[];
    invoices?: { id: string; totalMinor: number; paidMinor: number; status: string }[];
  }[];
  invoices: { id: string; totalMinor: number; paidMinor: number; status: string }[];
};

function unique(items: string[]) { return [...new Set(items)]; }

function severity(daysUntil: number | null, base: "low" | "med" | "high" = "med"): "low" | "med" | "high" {
  if (base === "high" || (daysUntil !== null && daysUntil <= 7)) return "high";
  if (base === "med" || (daysUntil !== null && daysUntil <= 30)) return "med";
  return "low";
}

export function deterministicShowReadiness(event: ShowReadinessInput, activeMembers: { id: string; name?: string }[], now = new Date()): ShowReadiness {
  const daysUntil = event.startsAt ? Math.ceil((event.startsAt.getTime() - now.getTime()) / DAY_MS) : null;
  const gaps: ShowReadinessGap[] = [];
  const addGap = (gap: Omit<ShowReadinessGap, "severity"> & { severity?: "low" | "med" | "high" }) => gaps.push({ ...gap, severity: gap.severity ?? severity(daysUntil) });
  const categories: ShowReadiness["categories"] = [];

  const responseByMember = new Map(event.participants.map((participant) => [participant.bandMemberId, participant]));
  const unavailable = activeMembers.filter((member) => responseByMember.get(member.id)?.response === "unavailable");
  const tentative = activeMembers.filter((member) => responseByMember.get(member.id)?.response === "tentative");
  const unknown = activeMembers.filter((member) => !responseByMember.has(member.id) || responseByMember.get(member.id)?.response === "unknown");
  let peopleScore = 0;
  if (activeMembers.length) {
    const points = activeMembers.reduce((sum, member) => {
      const response = responseByMember.get(member.id)?.response;
      return sum + (response === "available" ? 1 : response === "tentative" ? 0.5 : 0);
    }, 0);
    peopleScore = Math.round((points / activeMembers.length) * 25);
  }
  if (!activeMembers.length) addGap({ code: "no_active_lineup", category: "people", severity: "high", title: "Lineup missing", detail: "No active band members are recorded for availability planning.", nextAction: "Add the performing lineup in Manager before confirming readiness.", evidenceIds: [event.id] });
  if (unavailable.length) addGap({ code: "member_unavailable", category: "people", severity: "high", title: "Availability conflict", detail: `${unavailable.length} active member${unavailable.length === 1 ? " is" : "s are"} unavailable.`, nextAction: "Resolve the lineup conflict or record a replacement before treating the show as ready.", evidenceIds: unique([event.id, ...unavailable.flatMap((member) => responseByMember.get(member.id) ? [responseByMember.get(member.id)!.id, member.id] : [member.id])]) });
  if (unknown.length || tentative.length) addGap({ code: "availability_unresolved", category: "people", title: "Availability unresolved", detail: `${unknown.length + tentative.length} active member response${unknown.length + tentative.length === 1 ? " is" : "s are"} unknown or tentative.`, nextAction: "Collect a clear availability response from every active performer.", evidenceIds: unique([event.id, ...unknown.map((member) => member.id), ...tentative.map((member) => member.id)]) });
  categories.push({ category: "people", score: peopleScore, maxScore: 25, detail: `${activeMembers.length - unknown.length - tentative.length - unavailable.length}/${activeMembers.length} active members are recorded available.` });

  let scheduleScore = 0;
  if (event.startsAt) scheduleScore += 5;
  else addGap({ code: "start_missing", category: "schedule", severity: "high", title: "Show date missing", detail: "The event has no start date or time.", nextAction: "Record the confirmed show date and time.", evidenceIds: [event.id] });
  if (event.venueId || event.locationName) scheduleScore += 5;
  else addGap({ code: "location_missing", category: "schedule", title: "Location missing", detail: "No venue or client location is recorded.", nextAction: "Attach the venue or record the event location.", evidenceIds: [event.id] });
  if (event.setAt) scheduleScore += 4;
  else addGap({ code: "set_time_missing", category: "schedule", title: "Set time missing", detail: "The performance time is not recorded.", nextAction: "Confirm and record the set time with the buyer or venue.", evidenceIds: [event.id] });
  if (event.loadInAt) scheduleScore += 2;
  if (event.soundcheckAt) scheduleScore += 2;
  if (event.doorsAt || event.curfewAt) scheduleScore += 2;
  if (!event.loadInAt && !event.soundcheckAt) addGap({ code: "arrival_schedule_missing", category: "schedule", title: "Arrival schedule missing", detail: "Neither load-in nor soundcheck is recorded.", nextAction: "Confirm arrival, load-in, and soundcheck timing.", evidenceIds: [event.id] });
  categories.push({ category: "schedule", score: scheduleScore, maxScore: 20, detail: `${scheduleScore}/20 timing and location points are recorded.` });

  const buyerEvidence = event.deals.find((deal) => deal.buyerName || deal.buyerEmail);
  const contactScore = event.contactId ? 10 : buyerEvidence ? 5 : 0;
  if (!event.contactId) addGap({ code: "day_of_contact_missing", category: "contacts", title: "Day-of contact missing", detail: buyerEvidence ? "Buyer information exists, but no event contact is attached." : "No buyer, venue, or day-of contact is attached to the event.", nextAction: "Attach the person the band should call on show day.", evidenceIds: unique([event.id, ...(buyerEvidence ? [buyerEvidence.id] : [])]) });
  categories.push({ category: "contacts", score: contactScore, maxScore: 10, detail: event.contactId ? "An event contact is attached." : buyerEvidence ? "Buyer details are partial contact coverage." : "No contact is attached." });

  const acceptedDeal = event.deals.find((deal) => ["accepted", "completed"].includes(deal.status));
  const allInvoices = [...event.invoices, ...event.deals.flatMap((deal) => deal.invoices ?? [])].filter((invoice, index, rows) => rows.findIndex((candidate) => candidate.id === invoice.id) === index);
  const expectedDeposit = Math.max(event.depositMinor ?? 0, ...event.deals.map((deal) => deal.depositMinor ?? 0), 0);
  const paid = allInvoices.reduce((sum, invoice) => sum + invoice.paidMinor, 0);
  let dealScore = 0;
  if (acceptedDeal) dealScore += 8;
  else addGap({ code: "deal_not_accepted", category: "deal", title: "Terms not accepted", detail: "No accepted deal is linked to this show.", nextAction: "Record the agreed fee, key terms, and accepted deal status.", evidenceIds: unique([event.id, ...event.deals.map((deal) => deal.id)]) });
  if ((acceptedDeal?.offerAmountMinor ?? event.guaranteeMinor) != null) dealScore += 4;
  else addGap({ code: "fee_missing", category: "deal", title: "Fee missing", detail: "No guarantee or accepted offer amount is recorded.", nextAction: "Record the agreed compensation or explicitly note that the show is unpaid.", evidenceIds: unique([event.id, ...(acceptedDeal ? [acceptedDeal.id] : [])]) });
  const signedAgreement = acceptedDeal?.agreements?.find((agreement) => agreement.status === "signed");
  if (signedAgreement) dealScore += 4;
  else addGap({ code: "agreement_unsigned", category: "deal", title: "Agreement not signed", detail: "No signed agreement is recorded for the accepted terms.", nextAction: "Review the agreement state or record signature evidence.", evidenceIds: unique([event.id, ...(acceptedDeal ? [acceptedDeal.id, ...(acceptedDeal.agreements ?? []).map((agreement) => agreement.id)] : [])]) });
  if (expectedDeposit <= 0 || paid >= expectedDeposit) dealScore += 4;
  else addGap({ code: "deposit_unpaid", category: "deal", severity: severity(daysUntil, daysUntil !== null && daysUntil <= 14 ? "high" : "med"), title: "Deposit outstanding", detail: `${event.currency ?? "USD"} ${((expectedDeposit - paid) / 100).toFixed(2)} of the recorded deposit remains unpaid.`, nextAction: "Verify payment, record it, or prepare a reviewed reminder.", evidenceIds: unique([event.id, ...allInvoices.map((invoice) => invoice.id)]) });
  categories.push({ category: "deal", score: dealScore, maxScore: 20, detail: `${dealScore}/20 deal, agreement, and deposit points are satisfied.` });

  const advanceTasks = event.tasks.filter((task) => task.ownerLabel === "Show advance" || /confirm|readiness/i.test(task.title));
  const completedAdvance = advanceTasks.filter((task) => task.status === "done");
  const overdueAdvance = advanceTasks.filter((task) => task.status !== "done" && task.dueAt && task.dueAt < now);
  const advanceScore = advanceTasks.length ? Math.round((completedAdvance.length / advanceTasks.length) * 15) : 0;
  if (!advanceTasks.length) addGap({ code: "advance_missing", category: "advance", title: "Advance not generated", detail: "No show-advance checklist is linked to this event.", nextAction: "Generate the advance checklist, then assign and review each deadline.", evidenceIds: [event.id] });
  if (overdueAdvance.length) addGap({ code: "advance_overdue", category: "advance", severity: "high", title: "Advance work overdue", detail: `${overdueAdvance.length} show-advance task${overdueAdvance.length === 1 ? " is" : "s are"} overdue.`, nextAction: "Finish, reschedule, or mark the blocker on every overdue advance item.", evidenceIds: unique([event.id, ...overdueAdvance.map((task) => task.id)]) });
  categories.push({ category: "advance", score: advanceScore, maxScore: 15, detail: `${completedAdvance.length}/${advanceTasks.length} advance tasks are complete.` });

  let performanceScore = 0;
  const setlistSummary = event.setlist ? summarizeSetlist(event.setlist.items) : null;
  if (setlistSummary?.songCount) {
    performanceScore += 3;
    if (setlistSummary.timingStatus === "timed") performanceScore += 2;
    else addGap({ code: "setlist_duration_incomplete", category: "performance", title: "Setlist duration incomplete", detail: `${setlistSummary.unknownDurationSongCount} setlist song duration${setlistSummary.unknownDurationSongCount === 1 ? " is" : "s are"} unknown; ${setlistSummary.durationLabel}. Breaks are not included in song time.`, nextAction: "Record every song duration before relying on the set length.", evidenceIds: unique([event.id, event.setlist!.id, ...event.setlist!.items.map((item) => item.id)]) });
  } else addGap({ code: "setlist_missing", category: "performance", title: "Setlist missing", detail: "No populated setlist is linked to the show.", nextAction: "Attach a practical setlist and confirm its total duration.", evidenceIds: unique([event.id, ...(event.setlist ? [event.setlist.id] : [])]) });
  if (event.productionNotes || event.stagePlotUrl || event.inputListUrl || event.techRiderUrl) performanceScore += 5;
  else addGap({ code: "production_details_missing", category: "performance", title: "Production details missing", detail: "No production notes, stage plot, input list, or technical rider is recorded.", nextAction: "Record the production requirements appropriate for this show.", evidenceIds: [event.id] });
  categories.push({ category: "performance", score: performanceScore, maxScore: 10, detail: setlistSummary?.songCount ? `${performanceScore}/10 performance points are recorded; ${setlistSummary.durationLabel}.` : `${performanceScore}/10 setlist and production points are recorded.` });

  const score = categories.reduce((sum, category) => sum + category.score, 0);
  const blocked = !event.startsAt || unavailable.length > 0;
  const highRisk = gaps.some((gap) => gap.severity === "high");
  const status: ShowReadiness["status"] = blocked ? "blocked" : score < 60 || (highRisk && daysUntil !== null && daysUntil <= 7) ? "not_ready" : score < 85 || gaps.length ? "attention" : "ready";
  const coverageSignals = [
    activeMembers.length > 0,
    Boolean(event.startsAt),
    Boolean(event.venueId || event.locationName),
    activeMembers.length > 0 && activeMembers.every((member) => {
      const response = responseByMember.get(member.id)?.response;
      return response && response !== "unknown";
    }),
    Boolean(event.contactId || buyerEvidence),
    Boolean(event.deals.length || event.guaranteeMinor != null),
    advanceTasks.length > 0,
    Boolean(setlistSummary?.songCount),
    Boolean(event.productionNotes || event.stagePlotUrl || event.inputListUrl || event.techRiderUrl)
  ];
  const confidence = Number((coverageSignals.filter(Boolean).length / coverageSignals.length).toFixed(2));
  const confidenceLabel: ShowReadiness["confidenceLabel"] = confidence >= 0.78 ? "high" : confidence >= 0.45 ? "medium" : "low";
  const severityOrder = { high: 0, med: 1, low: 2 } as const;
  gaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  const headline = status === "ready"
    ? `${event.title} is show-ready based on the records currently in StoryBoard.`
    : status === "blocked"
      ? `${event.title} is blocked by ${gaps[0]?.title.toLowerCase() ?? "a critical missing detail"}.`
      : status === "not_ready"
        ? `${event.title} is not show-ready yet; ${gaps.length} recorded gap${gaps.length === 1 ? " needs" : "s need"} attention.`
        : `${event.title} is moving, but ${gaps.length} readiness gap${gaps.length === 1 ? " remains" : "s remain"}.`;
  return { eventId: event.id, title: event.title, startsAt: event.startsAt?.toISOString() ?? null, daysUntil, score, status, confidence, confidenceLabel, observedAt: now.toISOString(), headline, nextAction: gaps[0]?.nextAction ?? null, categories, gaps, evidenceIds: unique([event.id, ...gaps.flatMap((gap) => gap.evidenceIds)]) };
}
