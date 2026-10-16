/**
 * Approve & post is one-shot. A drop that already posted, failed, or is
 * mid-send must not rewrite captions or call a platform again.
 */
export function socialApproveAndPostBlockReason(input: {
  postStatus?: string | null | undefined;
  approvalStatus?: string | null | undefined;
}): string | null {
  const approval = input.approvalStatus ?? "";
  const status = input.postStatus ?? "";
  if (status === "posted") {
    return "This drop already posted. Draft a new one instead of sending again.";
  }
  if (status === "posting") {
    return "This drop is already posting. Refresh status and review its recorded outcome.";
  }
  if (["partial", "unknown", "processing"].includes(status)) {
    return "This drop already has a posting attempt. Check each platform before approving a new drop.";
  }
  if (approval === "failed" || status === "failed") {
    return "This approval already failed. Check each platform before approving a new drop.";
  }
  if (approval === "executed" || ["simulated", "private_upload", "draft_only"].includes(status)) {
    return "This approval has already been used. Review its receipts before drafting a new drop.";
  }
  if (["rejected", "expired"].includes(approval) || status === "cancelled") {
    return "This approval is closed. Draft a new drop for a new review.";
  }
  return null;
}

export function shouldSendSocialTarget(input: {
  enabled: boolean;
  existingExternalPostId?: string | null;
}): boolean {
  return input.enabled && !Boolean(input.existingExternalPostId?.trim());
}
