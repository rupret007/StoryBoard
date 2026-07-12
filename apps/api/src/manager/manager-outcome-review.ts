const DAY_MS = 24 * 60 * 60 * 1000;

export type ManagerOutcomeReviewInput = {
  windowDays: number;
  through: Date;
  events: {
    id: string;
    title: string;
    status: string;
    startsAt: Date | null;
    updatedAt: Date;
    currency: string;
    attendance: number | null;
    grossRevenueMinor: number | null;
    postShowNotes: string | null;
    relationshipOutcome: string | null;
    settlement: { id: string; status: string; currency: string; grossMinor: number; expenseMinor: number; netMinor: number } | null;
    expenses: { id: string; currency: string; amountMinor: number }[];
    invoices: { id: string; status: string; currency: string; totalMinor: number; paidMinor: number; dueAt: Date | null }[];
  }[];
  projects: {
    id: string;
    name: string;
    status: string;
    updatedAt: Date;
    tasks: { id: string; status: string }[];
    expenses: { id: string; currency: string; amountMinor: number }[];
  }[];
  completedTasks: { id: string; updatedAt: Date }[];
  campaignRecipients: { id: string; status: string; updatedAt: Date }[];
};

export type ManagerOutcomeReview = {
  windowDays: number;
  from: string;
  through: string;
  headline: string;
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  activity: {
    completedShows: number;
    cancelledShows: number;
    completedProjects: number;
    cancelledProjects: number;
    completedTasks: number;
    booking: { booked: number; replied: number; declined: number };
  };
  live: {
    attendanceRecordedShows: number;
    attendanceTotal: number;
    postShowNotesRecorded: number;
    relationshipOutcomesRecorded: number;
    finalizedSettlements: number;
    unsettledCompletedShows: number;
  };
  financials: {
    currency: string;
    grossMinor: number;
    expenseMinor: number;
    settledNetMinor: number;
    showsWithGross: number;
    finalizedSettlements: number;
    netKnownShows: number;
  }[];
  recordedLessons: { eventId: string; title: string; postShowNotes: string | null; relationshipOutcome: string | null; evidenceIds: string[] }[];
  wins: { code: string; title: string; detail: string; evidenceIds: string[] }[];
  attention: { code: string; title: string; detail: string; evidenceIds: string[] }[];
  questions: { code: string; question: string; evidenceIds: string[] }[];
  nextAction: string;
  evidenceIds: string[];
};

function unique(items: string[]) {
  return [...new Set(items)];
}

export function deterministicManagerOutcomeReview(input: ManagerOutcomeReviewInput): ManagerOutcomeReview {
  const windowDays = Math.max(7, Math.min(365, Math.trunc(input.windowDays)));
  const through = input.through;
  const from = new Date(through.getTime() - windowDays * DAY_MS);
  const completedShows = input.events.filter((event) => event.status === "completed");
  const cancelledShows = input.events.filter((event) => event.status === "cancelled");
  const completedProjects = input.projects.filter((project) => project.status === "completed");
  const cancelledProjects = input.projects.filter((project) => project.status === "cancelled");
  const booked = input.campaignRecipients.filter((recipient) => recipient.status === "booked");
  const replied = input.campaignRecipients.filter((recipient) => recipient.status === "replied");
  const declined = input.campaignRecipients.filter((recipient) => recipient.status === "declined");

  const attendanceRecorded = completedShows.filter((event) => event.attendance !== null);
  const notesRecorded = completedShows.filter((event) => Boolean(event.postShowNotes?.trim()));
  const relationshipsRecorded = completedShows.filter((event) => Boolean(event.relationshipOutcome?.trim()));
  const finalized = completedShows.filter((event) => event.settlement?.status === "finalized");
  const unsettled = completedShows.filter((event) => event.settlement?.status !== "finalized");

  const possiblePremises = completedShows.length * 4 + completedProjects.length + booked.length + replied.length + declined.length;
  const recordedPremises = attendanceRecorded.length + notesRecorded.length + relationshipsRecorded.length + finalized.length + completedProjects.length + booked.length + replied.length + declined.length;
  const confidence = possiblePremises ? Math.round((recordedPremises / possiblePremises) * 100) / 100 : 0;
  const confidenceLabel: ManagerOutcomeReview["confidenceLabel"] = confidence >= 0.75 ? "high" : confidence >= 0.45 ? "medium" : "low";

  const financialMap = new Map<string, ManagerOutcomeReview["financials"][number]>();
  const countedExpenseIds = new Set<string>();
  const financial = (currency: string) => {
    const key = currency.toUpperCase();
    const existing = financialMap.get(key);
    if (existing) return existing;
    const row = { currency: key, grossMinor: 0, expenseMinor: 0, settledNetMinor: 0, showsWithGross: 0, finalizedSettlements: 0, netKnownShows: 0 };
    financialMap.set(key, row);
    return row;
  };
  for (const event of [...completedShows, ...cancelledShows]) {
    if (event.settlement) {
      const row = financial(event.settlement.currency);
      row.grossMinor += event.settlement.grossMinor;
      row.expenseMinor += event.settlement.expenseMinor;
      const currentSameCurrencyExpenses = event.expenses.filter((expense) => expense.currency.toUpperCase() === event.settlement!.currency.toUpperCase()).reduce((sum, expense) => sum + expense.amountMinor, 0);
      row.expenseMinor += Math.max(0, currentSameCurrencyExpenses - event.settlement.expenseMinor);
      row.settledNetMinor += event.settlement.netMinor;
      row.showsWithGross += 1;
      row.netKnownShows += 1;
      if (event.settlement.status === "finalized") row.finalizedSettlements += 1;
      for (const expense of event.expenses.filter((item) => item.currency.toUpperCase() !== event.settlement!.currency.toUpperCase())) {
        financial(expense.currency).expenseMinor += expense.amountMinor;
      }
    } else {
      if (event.grossRevenueMinor !== null) {
        const row = financial(event.currency);
        row.grossMinor += event.grossRevenueMinor;
        row.showsWithGross += 1;
      }
      for (const expense of event.expenses) financial(expense.currency).expenseMinor += expense.amountMinor;
    }
    for (const expense of event.expenses) countedExpenseIds.add(expense.id);
  }
  for (const project of [...completedProjects, ...cancelledProjects]) {
    for (const expense of project.expenses) {
      if (!countedExpenseIds.has(expense.id)) financial(expense.currency).expenseMinor += expense.amountMinor;
      countedExpenseIds.add(expense.id);
    }
  }
  const financials = [...financialMap.values()].filter((row) => row.grossMinor || row.expenseMinor || row.netKnownShows).sort((left, right) => left.currency.localeCompare(right.currency));

  const wins: ManagerOutcomeReview["wins"] = [];
  if (completedShows.length) wins.push({ code: "shows_completed", title: `${completedShows.length} show${completedShows.length === 1 ? "" : "s"} completed`, detail: `${attendanceRecorded.length} include attendance and ${finalized.length} have a finalized settlement.`, evidenceIds: completedShows.map((event) => event.id).slice(0, 8) });
  if (completedProjects.length) wins.push({ code: "projects_completed", title: `${completedProjects.length} project${completedProjects.length === 1 ? "" : "s"} completed`, detail: "These projects are recorded as completed in StoryBoard; success against their intended metric still depends on the facts entered with them.", evidenceIds: completedProjects.map((project) => project.id).slice(0, 8) });
  if (booked.length) wins.push({ code: "booking_wins", title: `${booked.length} campaign prospect${booked.length === 1 ? "" : "s"} booked`, detail: "These booking outcomes are explicitly recorded, not inferred from messages.", evidenceIds: booked.map((recipient) => recipient.id).slice(0, 8) });
  const positiveSettlements = financials.filter((row) => row.finalizedSettlements > 0 && row.settledNetMinor > 0);
  if (positiveSettlements.length) wins.push({ code: "positive_settled_net", title: "Finalized shows recorded positive net", detail: positiveSettlements.map((row) => `${row.currency} ${(row.settledNetMinor / 100).toFixed(2)}`).join(" · "), evidenceIds: finalized.flatMap((event) => [event.id, event.settlement!.id]).slice(0, 8) });

  const attention: ManagerOutcomeReview["attention"] = [];
  const missingPostShow = completedShows.filter((event) => event.attendance === null || !event.postShowNotes?.trim() || !event.relationshipOutcome?.trim());
  if (missingPostShow.length) attention.push({ code: "post_show_incomplete", title: `Finish ${missingPostShow.length} post-show review${missingPostShow.length === 1 ? "" : "s"}`, detail: "Record attendance, what happened, and the buyer/relationship outcome so future advice can learn from the show.", evidenceIds: missingPostShow.map((event) => event.id).slice(0, 8) });
  if (unsettled.length) attention.push({ code: "settlement_incomplete", title: `${unsettled.length} completed show${unsettled.length === 1 ? " needs" : "s need"} settlement review`, detail: "Record expenses and finalize the settlement before treating show profit as known.", evidenceIds: unsettled.flatMap((event) => [event.id, ...(event.settlement ? [event.settlement.id] : [])]).slice(0, 8) });
  const settlementExpenseDrift = completedShows.filter((event) => event.settlement?.status === "finalized" && event.expenses.filter((expense) => expense.currency.toUpperCase() === event.settlement!.currency.toUpperCase()).reduce((sum, expense) => sum + expense.amountMinor, 0) !== event.settlement.expenseMinor);
  if (settlementExpenseDrift.length) attention.push({ code: "settlement_expense_drift", title: `${settlementExpenseDrift.length} finalized settlement${settlementExpenseDrift.length === 1 ? " no longer matches" : "s no longer match"} current expenses`, detail: "Review late, edited, or historical expense records without changing the finalized document; record any correction deliberately.", evidenceIds: settlementExpenseDrift.flatMap((event) => [event.id, event.settlement!.id, ...event.expenses.map((expense) => expense.id)]).slice(0, 8) });
  const unpaidInvoices = input.events.flatMap((event) => event.invoices.map((invoice) => ({ ...invoice, eventId: event.id }))).filter((invoice) => invoice.totalMinor > invoice.paidMinor && !["void", "cancelled"].includes(invoice.status));
  if (unpaidInvoices.length) attention.push({ code: "event_invoice_open", title: `${unpaidInvoices.length} event invoice${unpaidInvoices.length === 1 ? " has" : "s have"} an open balance`, detail: "Verify payment status before counting the expected cash as received.", evidenceIds: unpaidInvoices.flatMap((invoice) => [invoice.id, invoice.eventId]).slice(0, 8) });
  const completedWithOpenTasks = completedProjects.filter((project) => project.tasks.some((task) => task.status !== "done"));
  if (completedWithOpenTasks.length) attention.push({ code: "completed_project_open_work", title: `${completedWithOpenTasks.length} completed project${completedWithOpenTasks.length === 1 ? " still has" : "s still have"} open work`, detail: "Close, reassign, or intentionally defer the remaining tasks so completion status reflects reality.", evidenceIds: completedWithOpenTasks.flatMap((project) => [project.id, ...project.tasks.filter((task) => task.status !== "done").map((task) => task.id)]).slice(0, 8) });
  if (!completedShows.length && !completedProjects.length && !booked.length && !replied.length && !declined.length) attention.push({ code: "no_recorded_outcomes", title: "No recent outcomes are recorded", detail: "Complete an event or project, or record a booking result, before using StoryBoard to judge what is working.", evidenceIds: [] });

  const questions: ManagerOutcomeReview["questions"] = [];
  const missingAttendance = completedShows.filter((event) => event.attendance === null);
  if (missingAttendance.length) questions.push({ code: "attendance_unknown", question: `What was the attendance for ${missingAttendance.length === 1 ? `“${missingAttendance[0]!.title}”` : `the ${missingAttendance.length} completed shows`}?`, evidenceIds: missingAttendance.map((event) => event.id).slice(0, 8) });
  const missingNotes = completedShows.filter((event) => !event.postShowNotes?.trim());
  if (missingNotes.length) questions.push({ code: "show_learning_unknown", question: `What worked, what did not, and what should change after ${missingNotes.length === 1 ? `“${missingNotes[0]!.title}”` : "the recent shows"}?`, evidenceIds: missingNotes.map((event) => event.id).slice(0, 8) });
  const missingRelationship = completedShows.filter((event) => !event.relationshipOutcome?.trim());
  if (missingRelationship.length) questions.push({ code: "relationship_outcome_unknown", question: `Did the buyer, venue, or client invite a follow-up after ${missingRelationship.length === 1 ? `“${missingRelationship[0]!.title}”` : "these shows"}?`, evidenceIds: missingRelationship.map((event) => event.id).slice(0, 8) });

  const outcomeCount = completedShows.length + completedProjects.length + booked.length + replied.length + declined.length;
  const headline = outcomeCount === 0
    ? `There is not enough recorded outcome data from the last ${windowDays} days to judge what is working yet.`
    : completedShows.length
      ? `${completedShows.length} completed show${completedShows.length === 1 ? " is" : "s are"} recorded; outcome confidence is ${confidenceLabel} because ${recordedPremises} of ${possiblePremises} core result facts are present.`
      : `${outcomeCount} recent outcome${outcomeCount === 1 ? " is" : "s are"} recorded; no completed show is available for a live-performance review.`;
  const nextAction = attention[0]?.detail ?? "Use the recorded wins to choose the next goal, then keep capturing the same outcome fields so comparisons become reliable.";
  const recordedLessons = completedShows.filter((event) => event.postShowNotes?.trim() || event.relationshipOutcome?.trim()).slice(0, 8).map((event) => ({
    eventId: event.id,
    title: event.title,
    postShowNotes: event.postShowNotes?.trim().slice(0, 300) || null,
    relationshipOutcome: event.relationshipOutcome?.trim().slice(0, 300) || null,
    evidenceIds: [event.id]
  }));
  const evidenceIds = unique([
    ...input.events.flatMap((event) => [event.id, ...(event.settlement ? [event.settlement.id] : []), ...event.expenses.map((expense) => expense.id), ...event.invoices.map((invoice) => invoice.id)]),
    ...input.projects.flatMap((project) => [project.id, ...project.tasks.map((task) => task.id), ...project.expenses.map((expense) => expense.id)]),
    ...input.completedTasks.map((task) => task.id),
    ...input.campaignRecipients.map((recipient) => recipient.id)
  ]).slice(0, 100);

  return {
    windowDays,
    from: from.toISOString(),
    through: through.toISOString(),
    headline,
    confidence,
    confidenceLabel,
    activity: {
      completedShows: completedShows.length,
      cancelledShows: cancelledShows.length,
      completedProjects: completedProjects.length,
      cancelledProjects: cancelledProjects.length,
      completedTasks: input.completedTasks.length,
      booking: { booked: booked.length, replied: replied.length, declined: declined.length }
    },
    live: {
      attendanceRecordedShows: attendanceRecorded.length,
      attendanceTotal: attendanceRecorded.reduce((sum, event) => sum + (event.attendance ?? 0), 0),
      postShowNotesRecorded: notesRecorded.length,
      relationshipOutcomesRecorded: relationshipsRecorded.length,
      finalizedSettlements: finalized.length,
      unsettledCompletedShows: unsettled.length
    },
    financials,
    recordedLessons,
    wins: wins.slice(0, 6),
    attention: attention.slice(0, 6),
    questions: questions.slice(0, 4),
    nextAction,
    evidenceIds
  };
}
