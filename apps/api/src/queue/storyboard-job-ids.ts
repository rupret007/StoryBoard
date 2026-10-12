/**
 * BullMQ 5.73.0 rejects custom job IDs that contain ':' unless they have
 * exactly three colon-separated segments (legacy `repeat:...` jobs).
 * Invite used two segments (`invite:<id>`) and approval used four
 * (`approval:<id>:<event>:<timestamp>`), so both producers failed to enqueue.
 * Encode with a colon-free delimiter so IDs stay deterministic and unique.
 */
const JOB_ID_DELIMITER = "__";

export const APPROVAL_NOTIFY_EVENTS = [
  "created",
  "approved",
  "rejected",
  "executed",
  "failed"
] as const;

export type ApprovalNotifyEvent = (typeof APPROVAL_NOTIFY_EVENTS)[number];

export function inviteSendJobId(inviteId: string): string {
  return encodeStoryboardJobId(["invite", inviteId]);
}

export function approvalNotifyJobId(
  approvalId: string,
  event: ApprovalNotifyEvent,
  occurredAtMs: number
): string {
  return encodeStoryboardJobId([
    "approval",
    approvalId,
    event,
    String(occurredAtMs)
  ]);
}

export function encodeStoryboardJobId(parts: readonly string[]): string {
  return parts.map(encodeStoryboardJobIdPart).join(JOB_ID_DELIMITER);
}

function encodeStoryboardJobIdPart(part: string): string {
  return part.replaceAll(":", "_");
}
