export type SocialReceiptTarget = {
  status: string;
  externalPostId: string | null;
};

/** An ID alone is never proof that a public post exists. */
export function socialReceiptLabel(target: SocialReceiptTarget): string {
  switch (target.status) {
    case "simulated": return "Simulated — nothing sent";
    case "private_upload": return "Private upload — not public";
    case "processing": return "Processing — publication unconfirmed";
    case "draft_only": return "Inbox draft — finish in TikTok";
    case "posted": return target.externalPostId ? "Public post confirmed" : "Publication unconfirmed";
    case "sending": return "Send started — outcome unconfirmed";
    case "unknown": return "Outcome unknown — check the platform before any new approval";
    case "failed": return "Failed — publication unconfirmed";
    case "refused": return "Send refused";
    case "approved": return "Owner approved — no send attempt recorded";
    case "not_attempted": return "No send attempt recorded — review approval status";
    case "skipped": return "Disabled";
    case "cancelled": return "Approval closed — no send attempt recorded";
    case "draft":
    case "pending": return "Awaiting owner approval";
    default: return "Status unconfirmed — refresh to review";
  }
}

export function canApproveSocialPost(input: {
  isOwner: boolean;
  approvalStatus: string | null | undefined;
  postStatus: string;
  hasEnabledTarget: boolean;
}): boolean {
  return input.isOwner && input.hasEnabledTarget &&
    input.approvalStatus === "pending" &&
    ["draft", "pending_approval"].includes(input.postStatus);
}

export const SOCIAL_APPROVAL_UNCERTAIN =
  "The approval response could not be confirmed. A send may have started. Refresh status and check the platform before approving another post.";
