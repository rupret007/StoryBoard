import {
  bookingStageNextAction,
  eventReadinessNextAction,
  invoicePaymentNextAction,
  OPS_NEXT_ACTION_POLICY_VERSION,
  opsWorkspaceHref,
  settlementWorkspaceNextAction,
  type OpsNextAction
} from "./ops-next-action";
import { summarizeSetlist, type SetlistSummary } from "./setlist-summary";

export const OPS_SHOW_CONTROL_POLICY_VERSION = "ops_show_control_v1" as const;

export type OpsShowPhase = "live" | "upcoming" | "overdue" | "none";
export type OpsRecordAvailability = "ok" | "unavailable" | "empty";
export type OpsSetAvailability = OpsRecordAvailability | "unassigned" | "missing_record";

export type OpsShowControlEvent = {
  id: string;
  type: string;
  status: string;
  title: string;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  venue?: { name?: string | null } | null;
  locationName?: string | null;
  setlistId?: string | null;
  settlement?: { id: string; status: string } | null;
};

export type OpsShowControlReadiness = {
  eventId: string;
  status: string;
  score: number;
  confidenceLabel: string;
  headline: string;
  gaps: { code: string; nextAction: string }[];
};

export type OpsShowControlSetlist = {
  id: string;
  name: string;
  sourceKey?: string | null;
  summary?: SetlistSummary | null;
  items?: Parameters<typeof summarizeSetlist>[0];
};

export type OpsShowControlBooking = {
  id: string;
  title: string;
  stage: string;
  targetDate?: string | null;
};

export type OpsShowControlInvoice = {
  id: string;
  status: string;
  totalMinor: number;
  paidMinor: number;
};

export type OpsShowControlSettlement = {
  id: string;
  status: string;
  event: { id: string; title: string };
};

export type OpsShowControlInput = {
  eventsAvailable: boolean;
  readinessAvailable: boolean;
  setlistsAvailable: boolean;
  bookingsAvailable: boolean;
  events: OpsShowControlEvent[];
  readiness: OpsShowControlReadiness[];
  setlists: OpsShowControlSetlist[];
  bookings: OpsShowControlBooking[];
  invoices?: OpsShowControlInvoice[];
  settlements?: OpsShowControlSettlement[];
  now?: Date;
};

export type OpsShowControlAction = OpsNextAction & {
  kind: "navigate";
  label: string;
};

export type OpsShowControl = {
  policyVersion: typeof OPS_SHOW_CONTROL_POLICY_VERSION;
  show: {
    availability: OpsRecordAvailability;
    phase: OpsShowPhase;
    eventId: string | null;
    title: string;
    status: string | null;
    startsAt: string | null;
    timezone: string | null;
    location: string | null;
    readinessAvailability: OpsRecordAvailability;
    readinessStatus: string | null;
    readinessScore: number | null;
    readinessHeadline: string | null;
    confidenceLabel: string | null;
  };
  set: {
    availability: OpsSetAvailability;
    setlistId: string | null;
    name: string | null;
    sourceKey: string | null;
    songCount: number | null;
    timingStatus: SetlistSummary["timingStatus"] | null;
    durationLabel: string | null;
  };
  booking: {
    availability: OpsRecordAvailability;
    openCount: number;
    totalCount: number;
    stage: string | null;
    title: string | null;
    opportunityId: string | null;
    nextAction: string;
    href: string;
    code: string;
  };
  nextAction: OpsShowControlAction | null;
};

const ACTIVE_GIG_STATUSES = new Set(["draft", "hold", "confirmed"]);
const OPEN_BOOKING_PRIORITY: Record<string, number> = {
  hold: 0,
  offer: 1,
  conversation: 2,
  outreach: 3,
  target: 4
};

function parseMs(value?: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function withActionLabel(action: OpsNextAction): OpsShowControlAction {
  return {
    ...action,
    kind: "navigate",
    label: showControlActionLabel(action.code)
  };
}

export function showControlActionLabel(code: string): string {
  switch (code) {
    case "open_day_of":
      return "Open live day-of";
    case "review_overdue_gig":
      return "Open after-show wrap-up";
    case "setlist_missing":
      return "Open setlist assignment";
    case "setlist_duration_incomplete":
      return "Open song timing";
    case "deposit_unpaid":
      return "Open show invoices";
    case "advance_missing":
      return "Review show readiness";
    case "finalize_settlement":
      return "Open draft settlement";
    case "create_settlement":
      return "Open settlement";
    case "record_payment":
      return "Open invoices";
    case "hold":
      return "Open booking hold";
    case "offer":
      return "Review booking terms";
    case "conversation":
      return "Open booking inbox";
    case "outreach":
      return "Open campaigns";
    case "target":
      return "Open booking pipeline";
    case "record_gig":
      return "Add a recorded gig";
    case "refresh_ops":
      return "Refresh operations";
    default:
      return "Open next recorded work";
  }
}

/**
 * Pick the live, overdue, or next recorded gig for Band operations.
 *
 * Live requires a recorded end that still covers now. A started gig with no
 * end is overdue, not assumed live. Rehearsals, completed/cancelled rows,
 * undated records, and invalid dates never become a supposed show.
 */
export function selectLiveOrNextOpsGig<T extends OpsShowControlEvent>(
  events: T[],
  now = new Date()
): { event: T; phase: Exclude<OpsShowPhase, "none"> } | null {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return null;

  const scored = events.flatMap((event) => {
    if (event.type !== "gig" || !ACTIVE_GIG_STATUSES.has(event.status)) return [];
    const start = parseMs(event.startsAt);
    if (start == null) return [];
    const end = parseMs(event.endsAt);
    const phase: Exclude<OpsShowPhase, "none"> =
      start > nowMs ? "upcoming" : end != null && end >= nowMs ? "live" : "overdue";
    return [{ event, phase, start }];
  });

  // A live show is always first. An unfinished past show is next so its
  // after-show facts cannot be buried behind future readiness work.
  const rank = { live: 0, overdue: 1, upcoming: 2 };
  scored.sort((left, right) => {
    if (left.phase !== right.phase) return rank[left.phase] - rank[right.phase];
    if (left.phase === "upcoming" && left.start !== right.start) return left.start - right.start;
    if (left.phase !== "upcoming" && left.start !== right.start) return right.start - left.start;
    return compareId(left.event.id, right.event.id);
  });

  return scored[0] ? { event: scored[0].event, phase: scored[0].phase } : null;
}

export function selectOpenBookingWork<T extends OpsShowControlBooking>(
  bookings: T[],
  now = new Date()
): T | null {
  const nowMs = now.getTime();
  const open = bookings.flatMap((row) => {
    const priority = OPEN_BOOKING_PRIORITY[row.stage];
    if (priority == null) return [];
    const targetMs = parseMs(row.targetDate);
    return [{ row, priority, targetMs }];
  });

  open.sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    if (left.targetMs != null && right.targetMs != null && left.targetMs !== right.targetMs) {
      const leftPast = left.targetMs < nowMs;
      const rightPast = right.targetMs < nowMs;
      if (leftPast !== rightPast) return leftPast ? 1 : -1;
      return left.targetMs - right.targetMs;
    }
    if (left.targetMs != null && right.targetMs == null) return -1;
    if (left.targetMs == null && right.targetMs != null) return 1;
    return compareId(left.row.id, right.row.id);
  });

  return open[0]?.row ?? null;
}

function navigateAction(
  code: string,
  nextAction: string,
  href: string,
  extras: Pick<OpsNextAction, "tab" | "focus"> = {}
): OpsShowControlAction {
  return withActionLabel({
    policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
    code,
    nextAction,
    href,
    ...extras
  });
}

export function projectOpsShowControl(input: OpsShowControlInput): OpsShowControl {
  const now = input.now ?? new Date();
  const selected = input.eventsAvailable ? selectLiveOrNextOpsGig(input.events, now) : null;
  const readiness = selected && input.readinessAvailable
    ? input.readiness.find((row) => row.eventId === selected.event.id) ?? null
    : null;

  const show = projectShow(input, selected, readiness);
  const set = projectSet(input, selected);
  const booking = projectBooking(input, now);
  const nextAction = projectNextAction(input, selected, readiness, booking);

  return {
    policyVersion: OPS_SHOW_CONTROL_POLICY_VERSION,
    show,
    set,
    booking,
    nextAction
  };
}

function projectShow(
  input: OpsShowControlInput,
  selected: ReturnType<typeof selectLiveOrNextOpsGig>,
  readiness: OpsShowControlReadiness | null
): OpsShowControl["show"] {
  if (!input.eventsAvailable) {
    return {
      availability: "unavailable",
      phase: "none",
      eventId: null,
      title: "Show data unavailable",
      status: null,
      startsAt: null,
      timezone: null,
      location: null,
      readinessAvailability: input.readinessAvailable ? "empty" : "unavailable",
      readinessStatus: null,
      readinessScore: null,
      readinessHeadline: null,
      confidenceLabel: null
    };
  }
  if (!selected) {
    return {
      availability: "empty",
      phase: "none",
      eventId: null,
      title: "No upcoming or live gig is recorded",
      status: null,
      startsAt: null,
      timezone: null,
      location: null,
      readinessAvailability: input.readinessAvailable ? "empty" : "unavailable",
      readinessStatus: null,
      readinessScore: null,
      readinessHeadline: null,
      confidenceLabel: null
    };
  }

  const location = selected.event.venue?.name?.trim() || selected.event.locationName?.trim() || null;
  return {
    availability: "ok",
    phase: selected.phase,
    eventId: selected.event.id,
    title: selected.event.title,
    status: selected.event.status,
    startsAt: selected.event.startsAt ?? null,
    timezone: selected.event.timezone?.trim() || null,
    location,
    readinessAvailability: !input.readinessAvailable ? "unavailable" : readiness ? "ok" : "empty",
    readinessStatus: readiness?.status ?? null,
    readinessScore: readiness?.score ?? null,
    readinessHeadline: readiness?.headline ?? null,
    confidenceLabel: readiness?.confidenceLabel ?? null
  };
}

function projectSet(
  input: OpsShowControlInput,
  selected: ReturnType<typeof selectLiveOrNextOpsGig>
): OpsShowControl["set"] {
  const emptySet = {
    setlistId: null as string | null,
    name: null as string | null,
    sourceKey: null as string | null,
    songCount: null as number | null,
    timingStatus: null as SetlistSummary["timingStatus"] | null,
    durationLabel: null as string | null
  };

  if (!input.eventsAvailable) {
    return { availability: "unavailable", ...emptySet };
  }
  if (!selected) {
    return { availability: "empty", ...emptySet };
  }
  if (!selected.event.setlistId) {
    return { availability: "unassigned", ...emptySet };
  }
  if (!input.setlistsAvailable) {
    return { availability: "unavailable", ...emptySet, setlistId: selected.event.setlistId };
  }

  const assigned = input.setlists.find((setlist) => setlist.id === selected.event.setlistId) ?? null;
  if (!assigned) {
    return { availability: "missing_record", ...emptySet, setlistId: selected.event.setlistId };
  }

  const summary = assigned.summary ?? summarizeSetlist(assigned.items ?? []);
  return {
    availability: "ok",
    setlistId: assigned.id,
    name: assigned.name,
    sourceKey: assigned.sourceKey ?? null,
    songCount: summary.songCount,
    timingStatus: summary.timingStatus,
    durationLabel: summary.durationLabel
  };
}

function projectBooking(input: OpsShowControlInput, now: Date): OpsShowControl["booking"] {
  if (!input.bookingsAvailable) {
    return {
      availability: "unavailable",
      openCount: 0,
      totalCount: 0,
      stage: null,
      title: null,
      opportunityId: null,
      nextAction: "Booking records are unavailable. StoryBoard will not invent Travis's next step or auto-pitch.",
      href: "/booking",
      code: "booking_unavailable"
    };
  }

  const open = selectOpenBookingWork(input.bookings, now);
  const openCount = input.bookings.filter((row) => OPEN_BOOKING_PRIORITY[row.stage] != null).length;
  if (!open) {
    return {
      availability: "empty",
      openCount: 0,
      totalCount: input.bookings.length,
      stage: null,
      title: null,
      opportunityId: null,
      nextAction: "No open booking work is recorded. Travis books; StoryBoard will not pitch.",
      href: "/booking",
      code: "booking_empty"
    };
  }

  const stageAction = bookingStageNextAction(open.stage);
  return {
    availability: "ok",
    openCount,
    totalCount: input.bookings.length,
    stage: open.stage,
    title: open.title,
    opportunityId: open.id,
    nextAction: stageAction.nextAction,
    href: stageAction.href,
    code: stageAction.code
  };
}

function projectNextAction(
  input: OpsShowControlInput,
  selected: ReturnType<typeof selectLiveOrNextOpsGig>,
  readiness: OpsShowControlReadiness | null,
  booking: OpsShowControl["booking"]
): OpsShowControlAction | null {
  if (!input.eventsAvailable) {
    return navigateAction(
      "refresh_ops",
      "Refresh Band operations. StoryBoard will not guess the live show from incomplete records.",
      "/operations"
    );
  }

  if (selected?.phase === "live") {
    return navigateAction(
      "open_day_of",
      `Open the day-of workspace for the live recorded gig ${selected.event.title}.`,
      `/operations/events/${selected.event.id}`
    );
  }

  if (selected?.phase === "overdue") {
    return navigateAction(
      "review_overdue_gig",
      `${selected.event.title} is still open after its recorded show window. Open after-show wrap-up to record attendance, money, lessons, and the relationship outcome; StoryBoard will not invent a result and will not close the gig automatically.`,
      `/operations/events/${selected.event.id}`
    );
  }

  if (selected && readiness?.gaps.length) {
    const readinessAction = eventReadinessNextAction(selected.event.id, readiness.gaps);
    if (readinessAction) return withActionLabel(readinessAction);
  }

  const settlement = settlementWorkspaceNextAction({
    events: input.events,
    settlements: input.settlements ?? []
  });
  if (settlement) return withActionLabel(settlement);

  const unpaid = (input.invoices ?? []).map((invoice) => invoicePaymentNextAction(invoice)).find((row) => row.canRecordPayment);
  if (unpaid) return withActionLabel(unpaid);

  if (booking.availability === "ok") {
    return navigateAction(booking.code, booking.nextAction, booking.href);
  }

  if (!selected && booking.availability === "empty") {
    return navigateAction(
      "record_gig",
      "Record a dated draft, hold, or confirmed gig when it is known. StoryBoard will not invent a live schedule.",
      opsWorkspaceHref({ tab: "events" }),
      { tab: "events" }
    );
  }

  if (!selected && booking.availability === "unavailable") {
    return navigateAction(
      "record_gig",
      "Record a dated gig when it is known. Booking posture could not be verified; StoryBoard will not invent outreach.",
      opsWorkspaceHref({ tab: "events" }),
      { tab: "events" }
    );
  }

  return null;
}
