import { createHash } from "node:crypto";

export const EVENT_LOGISTICS_POLICY_VERSION = "event_logistics_v1" as const;
export const EVENT_LOGISTICS_CHANNELS = ["calendar", "drive"] as const;

export type EventLogisticsChannel = typeof EVENT_LOGISTICS_CHANNELS[number];
export type EventLogisticsBlockingReason = "type_not_gig" | "status_not_confirmed" | "start_missing" | "end_missing" | "timezone_missing" | "timezone_invalid" | "invalid_time_range";
export type EventLogisticsChannelState = "complete" | "simulated" | "not_prepared" | "pending" | "approved" | "rejected" | "failed" | "expired" | "stale" | "executed_unlinked";

export type EventLogisticsEvent = {
  id: string;
  type: string;
  opportunityId?: string | null;
  title: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string | null;
  calendarEventId?: string | null;
  driveFolderUrl?: string | null;
};

export type EventLogisticsApproval = {
  id: string;
  eventId?: string | null;
  sourceKey?: string | null;
  actionType: string;
  status: string;
  payload?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

export type EventLogisticsSourceKey = {
  policyVersion: typeof EVENT_LOGISTICS_POLICY_VERSION;
  eventId: string;
  eventFingerprint: string;
  channel: EventLogisticsChannel;
  attempt: number;
};

export type EventLogisticsChannelAssessment = {
  channel: EventLogisticsChannel;
  state: EventLogisticsChannelState;
  approvalId: string | null;
  approvalStatus: string | null;
  attempt: number | null;
};

export type EventLogisticsAssessment = {
  policyVersion: typeof EVENT_LOGISTICS_POLICY_VERSION;
  eventId: string;
  eventFingerprint: string;
  eligible: boolean;
  blockingReasons: EventLogisticsBlockingReason[];
  channels: Record<EventLogisticsChannel, EventLogisticsChannelAssessment>;
  preparableChannels: EventLogisticsChannel[];
  retryableChannels: EventLogisticsChannel[];
  sourceApprovalIds: string[];
  complete: boolean;
};

export type EventLogisticsApprovalSpec = {
  channel: EventLogisticsChannel;
  eventId: string;
  managerRecommendationId: string | null;
  sourceKey: string;
  attempt: number;
  title: string;
  actionType: "calendar_hold_batch" | "drive_ensure_folder";
  status: "pending";
  payload: Record<string, unknown>;
  opportunityId: string | null;
};

export type EventLogisticsPlan = {
  assessment: EventLogisticsAssessment;
  specs: EventLogisticsApprovalSpec[];
};

export type PrepareEventLogisticsApprovalsAction = {
  type: "prepare_event_logistics_approvals";
  policyVersion: typeof EVENT_LOGISTICS_POLICY_VERSION;
  eventId: string;
  eventFingerprint: string;
  channels: EventLogisticsChannel[];
  retryChannels: EventLogisticsChannel[];
};

function validDate(value: Date | null): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function dateValue(value: Date | null) {
  return validDate(value) ? value.toISOString() : null;
}

function validTimezone(value: string | null) {
  if (!value?.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function eventLocalDate(event: EventLogisticsEvent) {
  const values = new Map(new Intl.DateTimeFormat("en-US-u-ca-iso8601-nu-latn", {
    timeZone: event.timezone!,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(event.startsAt!).map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

/** Fingerprints only authoritative provider-write inputs. Event type/status are validated separately. */
export function eventLogisticsFingerprint(event: EventLogisticsEvent): string {
  const authoritative = JSON.stringify({
    title: event.title,
    startsAt: dateValue(event.startsAt),
    endsAt: dateValue(event.endsAt),
    timezone: event.timezone
  });
  return createHash("sha256").update(authoritative).digest("hex");
}

export function eventLogisticsApprovalSourceKey(eventId: string, eventFingerprint: string, channel: EventLogisticsChannel, attempt: number): string {
  if (!eventId || !/^[a-f0-9]{64}$/.test(eventFingerprint) || !EVENT_LOGISTICS_CHANNELS.includes(channel) || !Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("Invalid event logistics source-key input");
  }
  return `${EVENT_LOGISTICS_POLICY_VERSION}:${encodeURIComponent(eventId)}:${eventFingerprint}:${channel}:${attempt}`;
}

export function parseEventLogisticsApprovalSourceKey(sourceKey: string | null | undefined): EventLogisticsSourceKey | null {
  if (!sourceKey) return null;
  const parts = sourceKey.split(":");
  if (parts.length !== 5 || parts[0] !== EVENT_LOGISTICS_POLICY_VERSION || !/^[a-f0-9]{64}$/.test(parts[2] ?? "") || !/^[1-9]\d*$/.test(parts[4] ?? "")) return null;
  if (parts[3] !== "calendar" && parts[3] !== "drive") return null;
  const attempt = Number(parts[4]);
  if (!Number.isSafeInteger(attempt)) return null;
  try {
    const eventId = decodeURIComponent(parts[1] ?? "");
    if (!eventId) return null;
    return { policyVersion: EVENT_LOGISTICS_POLICY_VERSION, eventId, eventFingerprint: parts[2]!, channel: parts[3], attempt };
  } catch {
    return null;
  }
}

function approvalChannelMatches(approval: EventLogisticsApproval, channel: EventLogisticsChannel) {
  return approval.actionType === (channel === "calendar" ? "calendar_hold_batch" : "drive_ensure_folder");
}

function orderedApprovals(approvals: EventLogisticsApproval[]) {
  return [...approvals].sort((left, right) => {
    const leftKey = parseEventLogisticsApprovalSourceKey(left.sourceKey);
    const rightKey = parseEventLogisticsApprovalSourceKey(right.sourceKey);
    if ((leftKey?.attempt ?? 0) !== (rightKey?.attempt ?? 0)) return (rightKey?.attempt ?? 0) - (leftKey?.attempt ?? 0);
    return (right.updatedAt ?? right.createdAt ?? new Date(0)).getTime() - (left.updatedAt ?? left.createdAt ?? new Date(0)).getTime();
  });
}

function approvalState(status: string): EventLogisticsChannelState {
  if (status === "proposed" || status === "pending") return "pending";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "failed") return "failed";
  if (status === "expired") return "expired";
  return "executed_unlinked";
}

function approvalProviderMode(approval: EventLogisticsApproval | null, channel: EventLogisticsChannel) {
  if (!approval?.payload || typeof approval.payload !== "object" || Array.isArray(approval.payload)) return null;
  const result = (approval.payload as Record<string, unknown>).executionResult;
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const mode = (result as Record<string, unknown>)[channel === "calendar" ? "calendarMode" : "driveMode"];
  return mode === "mock" || mode === "real" ? mode : null;
}

export function eventLogisticsApprovalIsSimulated(approval: EventLogisticsApproval) {
  const source = parseEventLogisticsApprovalSourceKey(approval.sourceKey);
  return approval.status === "executed" && Boolean(source) && approvalProviderMode(approval, source!.channel) === "mock";
}

export function eventLogisticsSimulatedLinkedValue(approval: EventLogisticsApproval) {
  const source = parseEventLogisticsApprovalSourceKey(approval.sourceKey);
  if (!source || !eventLogisticsApprovalIsSimulated(approval) || !approval.payload || typeof approval.payload !== "object" || Array.isArray(approval.payload)) return null;
  const result = (approval.payload as Record<string, unknown>).executionResult;
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  if (source.channel === "calendar") {
    const holds = (result as Record<string, unknown>).holds;
    if (!Array.isArray(holds) || !holds[0] || typeof holds[0] !== "object" || Array.isArray(holds[0])) return null;
    const eventId = (holds[0] as Record<string, unknown>).eventId;
    return typeof eventId === "string" && eventId ? eventId : null;
  }
  const webViewLink = (result as Record<string, unknown>).webViewLink;
  if (typeof webViewLink === "string" && webViewLink) return webViewLink;
  const folderId = (result as Record<string, unknown>).folderId;
  return typeof folderId === "string" && folderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}` : null;
}

function channelAssessment(event: EventLogisticsEvent, approvals: EventLogisticsApproval[], fingerprint: string, channel: EventLogisticsChannel): EventLogisticsChannelAssessment {
  const related = orderedApprovals(approvals.filter((approval) => {
    const parsed = parseEventLogisticsApprovalSourceKey(approval.sourceKey);
    return approvalChannelMatches(approval, channel) && parsed?.eventId === event.id && parsed.channel === channel;
  }));
  const current = related.find((approval) => parseEventLogisticsApprovalSourceKey(approval.sourceKey)?.eventFingerprint === fingerprint);
  const source = current ?? related[0] ?? null;
  const parsed = parseEventLogisticsApprovalSourceKey(source?.sourceKey);
  const persisted = channel === "calendar" ? Boolean(event.calendarEventId) : Boolean(event.driveFolderUrl);
  const simulated = persisted && current?.status === "executed" && approvalProviderMode(current, channel) === "mock";
  const linkedSourceIsStale = persisted && related.some((approval) => {
    const approvalSource = parseEventLogisticsApprovalSourceKey(approval.sourceKey);
    return approval.status === "executed" && approvalSource?.eventFingerprint !== fingerprint;
  }) && !related.some((approval) => {
    const approvalSource = parseEventLogisticsApprovalSourceKey(approval.sourceKey);
    return approval.status === "executed" && approvalSource?.eventFingerprint === fingerprint;
  });
  const state = linkedSourceIsStale ? "stale" : persisted ? simulated ? "simulated" : "complete" : current ? approvalState(current.status) : source ? "stale" : "not_prepared";
  return { channel, state, approvalId: source?.id ?? null, approvalStatus: source?.status ?? null, attempt: parsed?.attempt ?? null };
}

export function assessEventLogistics(event: EventLogisticsEvent, approvals: EventLogisticsApproval[]): EventLogisticsAssessment {
  const blockingReasons: EventLogisticsBlockingReason[] = [];
  if (event.type !== "gig") blockingReasons.push("type_not_gig");
  if (event.status !== "confirmed") blockingReasons.push("status_not_confirmed");
  if (!validDate(event.startsAt)) blockingReasons.push("start_missing");
  if (!validDate(event.endsAt)) blockingReasons.push("end_missing");
  if (!event.timezone?.trim()) blockingReasons.push("timezone_missing");
  else if (!validTimezone(event.timezone)) blockingReasons.push("timezone_invalid");
  if (validDate(event.startsAt) && validDate(event.endsAt) && event.endsAt <= event.startsAt) blockingReasons.push("invalid_time_range");
  const eventFingerprint = eventLogisticsFingerprint(event);
  const channels = {
    calendar: channelAssessment(event, approvals, eventFingerprint, "calendar"),
    drive: channelAssessment(event, approvals, eventFingerprint, "drive")
  };
  const eligible = blockingReasons.length === 0;
  const preparableChannels = eligible ? EVENT_LOGISTICS_CHANNELS.filter((channel) => {
    if (channels[channel].state === "not_prepared") return true;
    if (channels[channel].state !== "stale") return false;
    return channel === "calendar" ? !event.calendarEventId : !event.driveFolderUrl;
  }) : [];
  // Rejection occurs before provider execution and is safe to prepare again.
  // A simulated result is also explicitly replaceable after Google is connected.
  // A provider failure is ambiguous: the remote write may have succeeded even
  // when its response was lost, so it requires manual reconciliation rather
  // than another automatic insert.
  const retryableChannels = eligible ? EVENT_LOGISTICS_CHANNELS.filter((channel) => channels[channel].state === "rejected" || channels[channel].state === "simulated") : [];
  const sourceApprovalIds = [...new Set(EVENT_LOGISTICS_CHANNELS.flatMap((channel) => channels[channel].approvalId ? [channels[channel].approvalId!] : []))];
  return {
    policyVersion: EVENT_LOGISTICS_POLICY_VERSION,
    eventId: event.id,
    eventFingerprint,
    eligible,
    blockingReasons,
    channels,
    preparableChannels,
    retryableChannels,
    sourceApprovalIds,
    complete: eligible && EVENT_LOGISTICS_CHANNELS.every((channel) => channels[channel].state === "complete")
  };
}

function logisticsPayload(event: EventLogisticsEvent, channel: EventLogisticsChannel, sourceKey: string, attempt: number, fingerprint: string): Record<string, unknown> {
  const context = { policyVersion: EVENT_LOGISTICS_POLICY_VERSION, eventId: event.id, eventFingerprint: fingerprint, channel, attempt, sourceKey };
  if (channel === "calendar") {
    return {
      holds: [{ title: event.title, start: event.startsAt!.toISOString(), end: event.endsAt!.toISOString(), timeZone: event.timezone!, kind: "confirmed" }],
      eventLogistics: context
    };
  }
  return { folderName: `${eventLocalDate(event)} ${event.title}`, eventLogistics: context };
}

export function planEventLogisticsApprovals(event: EventLogisticsEvent, approvals: EventLogisticsApproval[], options: { allowRetryChannels?: readonly EventLogisticsChannel[]; managerRecommendationId?: string | null } = {}): EventLogisticsPlan {
  const assessment = assessEventLogistics(event, approvals);
  if (!assessment.eligible) return { assessment, specs: [] };
  const allowedRetries = new Set(options.allowRetryChannels ?? []);
  const channels = EVENT_LOGISTICS_CHANNELS.filter((channel) => assessment.preparableChannels.includes(channel) || (assessment.retryableChannels.includes(channel) && allowedRetries.has(channel)));
  const specs = channels.map((channel): EventLogisticsApprovalSpec => {
    const matchingAttempts = approvals.flatMap((approval) => {
      const parsed = parseEventLogisticsApprovalSourceKey(approval.sourceKey);
      return parsed?.eventId === event.id && parsed.eventFingerprint === assessment.eventFingerprint && parsed.channel === channel ? [parsed.attempt] : [];
    });
    const attempt = matchingAttempts.length ? Math.max(...matchingAttempts) + 1 : 1;
    const sourceKey = eventLogisticsApprovalSourceKey(event.id, assessment.eventFingerprint, channel, attempt);
    return {
      channel,
      eventId: event.id,
      managerRecommendationId: options.managerRecommendationId ?? null,
      sourceKey,
      attempt,
      title: channel === "calendar" ? `Add ${event.title} to Google Calendar` : `Create Drive folder for ${event.title}`,
      actionType: channel === "calendar" ? "calendar_hold_batch" : "drive_ensure_folder",
      status: "pending",
      payload: logisticsPayload(event, channel, sourceKey, attempt, assessment.eventFingerprint),
      opportunityId: event.opportunityId ?? null
    };
  });
  return { assessment, specs };
}

export function eventLogisticsPrepareAction(event: EventLogisticsEvent, approvals: EventLogisticsApproval[], options: { allowRetryChannels?: readonly EventLogisticsChannel[] } = {}): PrepareEventLogisticsApprovalsAction | null {
  const plan = planEventLogisticsApprovals(event, approvals, options);
  if (!plan.specs.length) return null;
  const channels = plan.specs.map((spec) => spec.channel);
  return {
    type: "prepare_event_logistics_approvals",
    policyVersion: EVENT_LOGISTICS_POLICY_VERSION,
    eventId: event.id,
    eventFingerprint: plan.assessment.eventFingerprint,
    channels,
    retryChannels: channels.filter((channel) => plan.assessment.retryableChannels.includes(channel))
  };
}

export function eventLogisticsActionMatchesCurrent(action: PrepareEventLogisticsApprovalsAction, event: EventLogisticsEvent, approvals: EventLogisticsApproval[]): boolean {
  if (action.type !== "prepare_event_logistics_approvals" || action.policyVersion !== EVENT_LOGISTICS_POLICY_VERSION || action.eventId !== event.id || action.eventFingerprint !== eventLogisticsFingerprint(event)) return false;
  if (!action.channels.length || new Set(action.channels).size !== action.channels.length || action.retryChannels.some((channel) => !action.channels.includes(channel))) return false;
  const plan = planEventLogisticsApprovals(event, approvals, { allowRetryChannels: action.retryChannels });
  return action.channels.length === plan.specs.length && action.channels.every((channel, index) => plan.specs[index]?.channel === channel);
}
