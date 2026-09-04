import {
  OPS_NEXT_ACTION_POLICY_VERSION,
  opsWorkspaceHref,
  type OpsNextAction
} from "./ops-next-action";

export const OPS_AFTER_SHOW_POLICY_VERSION = "ops_after_show_v1" as const;

export const AFTER_SHOW_STALE_WRITE_MESSAGE =
  "After-show facts changed since you opened them. Refresh to load the current record, then reapply your edits.";

export type AfterShowFacts = {
  attendance?: number | null;
  grossRevenueMinor?: number | null;
  postShowNotes?: string | null;
  relationshipOutcome?: string | null;
};

export type AfterShowEvent = AfterShowFacts & {
  id: string;
  type: string;
  status: string;
  title: string;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  settlement?: { id: string; status: string } | null;
};

function instantMs(value?: string | Date | null): number | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * One recorded fact is enough. Blank values stay unknown and never count as a
 * result StoryBoard invented.
 */
export function afterShowFactsRecorded(facts: AfterShowFacts): boolean {
  return facts.attendance != null
    || facts.grossRevenueMinor != null
    || Boolean(facts.postShowNotes?.trim())
    || Boolean(facts.relationshipOutcome?.trim());
}

export function afterShowFactsEqual(left: AfterShowFacts, right: AfterShowFacts): boolean {
  return (left.attendance ?? null) === (right.attendance ?? null)
    && (left.grossRevenueMinor ?? null) === (right.grossRevenueMinor ?? null)
    && (left.postShowNotes?.trim() || null) === (right.postShowNotes?.trim() || null)
    && (left.relationshipOutcome?.trim() || null) === (right.relationshipOutcome?.trim() || null);
}

export function afterShowWriteAllowed(
  event: Pick<AfterShowEvent, "type" | "status" | "startsAt">,
  now = new Date()
): { allowed: boolean; reason: string } {
  if (event.type !== "gig") {
    return {
      allowed: false,
      reason: "After-show facts apply to a recorded gig only. StoryBoard will not invent a result for a rehearsal or other event."
    };
  }
  if (event.status === "completed" || event.status === "cancelled") {
    return {
      allowed: true,
      reason: "Record attendance, money, and lessons from this show. StoryBoard will not invent a result or close the gig for you."
    };
  }
  const startMs = instantMs(event.startsAt);
  const nowMs = now.getTime();
  if (startMs == null || !Number.isFinite(nowMs)) {
    return {
      allowed: false,
      reason: "After-show facts stay closed until this recorded gig has a start."
    };
  }
  if (startMs > nowMs) {
    return {
      allowed: false,
      reason: "After-show facts stay closed until this recorded gig has started."
    };
  }
  return {
    allowed: true,
    reason: "Record attendance, money, and lessons from this show. StoryBoard will not invent a result or close the gig for you."
  };
}

/**
 * Navigate-only next step after wrap-up facts exist. Never creates a
 * settlement, never marks the gig completed, and never invents net income.
 */
export function afterShowNextAction(input: {
  event: AfterShowEvent;
  settlement?: { id: string; status: string } | null;
  now?: Date;
}): OpsNextAction | null {
  const write = afterShowWriteAllowed(input.event, input.now);
  if (!write.allowed || !afterShowFactsRecorded(input.event)) return null;

  const settlement = input.settlement ?? input.event.settlement ?? null;
  const moneyHref = opsWorkspaceHref({ tab: "deals", eventId: input.event.id, focus: "money" });

  if (settlement?.status === "draft") {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "finalize_settlement",
      nextAction: `Finalize the draft settlement for ${input.event.title}. This freezes matching event expenses. StoryBoard will not close the gig automatically.`,
      href: moneyHref,
      tab: "deals",
      focus: "money"
    };
  }

  if (!settlement) {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "after_show_settlement",
      nextAction: `After-show facts are recorded for ${input.event.title}. Open a draft settlement when you are ready. StoryBoard will not invent net or close the gig.`,
      href: moneyHref,
      tab: "deals",
      focus: "money"
    };
  }

  return {
    policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
    code: "after_show_recorded",
    nextAction: `Facts and settlement are recorded for ${input.event.title}. Mark the gig completed when you are ready. StoryBoard will not close it automatically.`,
    href: `/operations/events/${input.event.id}`
  };
}
