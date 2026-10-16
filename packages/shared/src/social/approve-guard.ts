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
  if (approval === "executed" || status === "posted" || status === "partial") {
    return "This drop already posted. Draft a new one instead of sending again.";
  }
  if (approval === "failed" || status === "failed") {
    return "This approval already failed. Draft a new drop to try again. Nothing extra was sent.";
  }
  if (status === "posting") {
    return "This drop is already posting. Wait for platform IDs before trying again.";
  }
  return null;
}

export function shouldSendSocialTarget(input: {
  enabled: boolean;
  existingExternalPostId?: string | null;
}): boolean {
  return input.enabled && !Boolean(input.existingExternalPostId?.trim());
}
