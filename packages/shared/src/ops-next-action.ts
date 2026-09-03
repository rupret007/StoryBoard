export const OPS_NEXT_ACTION_POLICY_VERSION = "ops_next_action_v1" as const;

export type OpsWorkspaceTab = "events" | "music" | "projects" | "deals";
export type OpsWorkspaceFocus = "setlist" | "details" | "money";

export type OpsNextAction = {
  policyVersion: typeof OPS_NEXT_ACTION_POLICY_VERSION;
  code: string;
  nextAction: string;
  href: string;
  tab?: OpsWorkspaceTab;
  focus?: OpsWorkspaceFocus;
};

const OPS_TABS = new Set<OpsWorkspaceTab>(["events", "music", "projects", "deals"]);

export function parseOpsWorkspaceTab(value: string | null | undefined): OpsWorkspaceTab {
  if (value && OPS_TABS.has(value as OpsWorkspaceTab)) return value as OpsWorkspaceTab;
  return "events";
}

export function parseOpsWorkspaceFocus(value: string | null | undefined): OpsWorkspaceFocus | null {
  if (value === "setlist" || value === "details" || value === "money") return value;
  return null;
}

export function opsWorkspaceHref(input: {
  tab?: OpsWorkspaceTab;
  eventId?: string;
  focus?: OpsWorkspaceFocus;
}): string {
  const params = new URLSearchParams();
  params.set("tab", input.tab ?? "events");
  if (input.eventId) params.set("event", input.eventId);
  if (input.focus) params.set("focus", input.focus);
  return `/operations?${params.toString()}`;
}

export function invoicePaymentNextAction(invoice: {
  id: string;
  status: string;
  totalMinor: number;
  paidMinor: number;
}): OpsNextAction & { canRecordPayment: boolean; balanceMinor: number } {
  const balanceMinor = invoice.totalMinor - invoice.paidMinor;
  if (invoice.status === "voided") {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "voided",
      nextAction: "Voided invoices are immutable. Issue a new invoice if money is still due.",
      href: opsWorkspaceHref({ tab: "deals" }),
      tab: "deals",
      canRecordPayment: false,
      balanceMinor
    };
  }
  if (balanceMinor > 0) {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "record_payment",
      nextAction: "Record a payment for the remaining balance.",
      href: opsWorkspaceHref({ tab: "deals" }),
      tab: "deals",
      canRecordPayment: true,
      balanceMinor
    };
  }
  return {
    policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
    code: "paid",
    nextAction: "Paid from recorded payments. No further payment action.",
    href: opsWorkspaceHref({ tab: "deals" }),
    tab: "deals",
    canRecordPayment: false,
    balanceMinor: 0
  };
}

export function eventReadinessNextAction(
  eventId: string,
  gaps: { code: string; nextAction: string }[]
): OpsNextAction | null {
  const top = gaps[0];
  if (!top) return null;
  if (top.code === "setlist_missing") {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: top.code,
      nextAction: top.nextAction,
      href: opsWorkspaceHref({ tab: "events", eventId, focus: "setlist" }),
      tab: "events",
      focus: "setlist"
    };
  }
  if (top.code === "setlist_duration_incomplete") {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: top.code,
      nextAction: top.nextAction,
      href: opsWorkspaceHref({ tab: "music" }),
      tab: "music"
    };
  }
  if (top.code === "deposit_unpaid") {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: top.code,
      nextAction: top.nextAction,
      href: opsWorkspaceHref({ tab: "deals", eventId, focus: "money" }),
      tab: "deals",
      focus: "money"
    };
  }
  if (top.code === "advance_missing") {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: top.code,
      nextAction: top.nextAction,
      href: opsWorkspaceHref({ tab: "events", eventId }),
      tab: "events"
    };
  }
  return {
    policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
    code: top.code,
    nextAction: top.nextAction,
    href: opsWorkspaceHref({ tab: "events", eventId, focus: "details" }),
    tab: "events",
    focus: "details"
  };
}

export function settlementWorkspaceNextAction(input: {
  events: { id: string; type: string; status: string; title: string; settlement?: { id: string; status: string } | null }[];
  settlements: { id: string; status: string; event: { id: string; title: string } }[];
}): OpsNextAction | null {
  const draft = input.settlements.find((row) => row.status === "draft");
  if (draft) {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "finalize_settlement",
      nextAction: `Finalize the draft settlement for ${draft.event.title}. This freezes matching event expenses.`,
      href: opsWorkspaceHref({ tab: "deals" }),
      tab: "deals"
    };
  }
  const unsettled = input.events.find((event) => {
    if (event.type !== "gig") return false;
    if (event.status !== "completed") return false;
    return !event.settlement && !input.settlements.some((row) => row.event.id === event.id);
  });
  if (unsettled) {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "create_settlement",
      nextAction: `Create a draft settlement for ${unsettled.title}. This writes a draft; it does not finalize.`,
      href: opsWorkspaceHref({ tab: "deals" }),
      tab: "deals"
    };
  }
  return null;
}

export function bookingStageNextAction(stage: string): OpsNextAction {
  switch (stage) {
    case "outreach":
      return {
        policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
        code: "outreach",
        nextAction: "When Travis is ready, add this room to a pitch campaign. StoryBoard will not auto-pitch.",
        href: "/booking-campaigns"
      };
    case "conversation":
      return {
        policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
        code: "conversation",
        nextAction: "Check Booking inbox for a tracked campaign reply.",
        href: "/booking-inbox"
      };
    case "offer":
      return {
        policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
        code: "offer",
        nextAction: "Review terms in Booking inbox, then apply them. Travis still books.",
        href: "/booking-inbox"
      };
    case "hold":
      return {
        policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
        code: "hold",
        nextAction: "Confirm the date when Travis is ready. Confirming creates a gig.",
        href: "/booking"
      };
    case "confirmed":
      return {
        policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
        code: "confirmed",
        nextAction: "Open Band operations to advance the confirmed show.",
        href: opsWorkspaceHref({ tab: "events" })
      };
    case "closed":
      return {
        policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
        code: "closed",
        nextAction: "Closed. No further booking action.",
        href: "/booking"
      };
    default:
      return {
        policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
        code: "target",
        nextAction: "Travis books. Record outreach when he is ready; StoryBoard will not pitch.",
        href: "/booking"
      };
  }
}

export function bookingReplyNextAction(reply: {
  analyzedAt?: string | null;
  termsAppliedAt?: string | null;
  recommendedNextAction?: string | null;
  recipient: { opportunity?: { id: string } | null };
}): OpsNextAction {
  const hasOpportunity = Boolean(reply.recipient.opportunity?.id);
  if (hasOpportunity && reply.analyzedAt && !reply.termsAppliedAt) {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "apply_terms",
      nextAction: reply.recommendedNextAction?.trim() || "Apply the reviewed terms to the linked opportunity. Null analysis fields will not erase recorded fees.",
      href: "/booking-inbox"
    };
  }
  if (hasOpportunity && reply.termsAppliedAt) {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "confirm_booking",
      nextAction: "Terms are saved. Confirm this booking to create a reviewable approval. Travis still books; StoryBoard will not pitch.",
      href: "/approvals"
    };
  }
  if (reply.recommendedNextAction?.trim()) {
    return {
      policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
      code: "reviewed_next",
      nextAction: reply.recommendedNextAction.trim(),
      href: "/booking-inbox"
    };
  }
  return {
    policyVersion: OPS_NEXT_ACTION_POLICY_VERSION,
    code: "review_reply",
    nextAction: "Review the tracked reply. StoryBoard will not send or pitch from here.",
    href: "/booking-inbox"
  };
}
