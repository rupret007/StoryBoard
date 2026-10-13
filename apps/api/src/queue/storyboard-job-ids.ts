/**
 * BullMQ 5.73.0 rejects custom job IDs that contain ':' unless they have
 * exactly three colon-separated segments (legacy `repeat:...` jobs).
 * Invite used two segments (`invite:<id>`) and approval used four
 * (`approval:<id>:<event>:<timestamp>`), so both producers failed to enqueue.
 *
 * Join parts with a colon-free delimiter. Each part percent-encodes `%`, `:`,
 * and `_` so the mapping is injective: `"a:b"` and `"a_b"` stay distinct,
 * and a literal `__` inside a part cannot be confused with the delimiter.
 * Safe alphanumeric ids (CUIDs, event names, timestamps) are unchanged, so
 * identical inputs still produce the same job id for deliberate BullMQ dedupe.
 */
const JOB_ID_DELIMITER = "__";
const JOB_ID_PART_ESCAPES: Readonly<Record<string, string>> = {
  "%": "%25",
  ":": "%3A",
  _: "%5F"
};

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
  return part.replaceAll(/[%:_]/g, (char) => JOB_ID_PART_ESCAPES[char] ?? char);
}
