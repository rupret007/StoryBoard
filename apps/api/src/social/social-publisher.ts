import {
  checkSocialAccountMatch,
  socialPostBatchPayloadSchema,
  type SocialPlatform,
  type SocialPostBatchPayload,
  type SocialVoiceKey
} from "@storyboard/shared";
import type { SocialPlatformAdapter, SocialPublishResult } from "./social-adapters";

export type SocialSendLogRecord = {
  artistId: string;
  postId: string;
  targetId: string;
  approvalRequestId: string;
  platform: SocialPlatform;
  accountExternalId: string | null;
  voiceKey: SocialVoiceKey;
  outcome:
    | "simulated"
    | "private_upload"
    | "processing"
    | "unknown"
    | "sent"
    | "draft_only"
    | "failed"
    | "refused_no_approval"
    | "refused_account_mismatch"
    | "refused_no_id"
    | "refused_voice_mismatch";
  requestSummary: Record<string, unknown>;
  responseCode?: number | undefined;
  externalPostId?: string | undefined;
  errorMessage?: string | undefined;
  durationMs: number;
  adapterMode: string;
};

export type SocialApprovalGate = {
  id: string;
  status: string;
  approvedAt: Date | string | null;
  actionType: string;
};

export type SocialTargetSendInput = {
  artistId: string;
  artistName: string;
  artistVoice: SocialVoiceKey;
  approval: SocialApprovalGate | null;
  payload: SocialPostBatchPayload;
  target: SocialPostBatchPayload["targets"][number];
  mediaUrl?: string | undefined;
  mediaPath?: string | undefined;
  mediaByteSize?: number | undefined;
  mediaMimeType?: string | undefined;
  mediaKind?: "photo" | "video" | undefined;
  adapter: SocialPlatformAdapter;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  instagramBusinessId?: string | undefined;
};

export type SocialTargetSendResult = {
  targetId: string;
  platform: SocialPlatform;
  posted: boolean;
  deliveryState?: SocialPublishResult["deliveryState"];
  isDraftOnly: boolean;
  externalPostId?: string | undefined;
  externalPostUrl?: string | undefined;
  errorMessage?: string | undefined;
  log: SocialSendLogRecord;
};

function hasExplicitApproval(approval: SocialApprovalGate | null): approval is SocialApprovalGate {
  return Boolean(
    approval &&
      approval.id &&
      approval.status === "approved" &&
      approval.approvedAt &&
      approval.actionType === "social_post_batch"
  );
}

function postedOnlyWithId(result: SocialPublishResult): boolean {
  return Boolean(result.success && result.externalPostId?.trim());
}

export function sendSocialTarget(input: SocialTargetSendInput): Promise<SocialTargetSendResult> {
  return sendSocialTargetAsync(input);
}

async function sendSocialTargetAsync(input: SocialTargetSendInput): Promise<SocialTargetSendResult> {
  const start = Date.now();
  const baseLog = {
    artistId: input.artistId,
    postId: input.payload.postId,
    targetId: input.target.targetId,
    approvalRequestId: input.approval?.id ?? "",
    platform: input.target.platform,
    accountExternalId: input.target.accountExternalId ?? null,
    voiceKey: input.artistVoice,
    requestSummary: { platform: input.target.platform },
    durationMs: 0,
    adapterMode: input.adapter.mode
  };

  if (!hasExplicitApproval(input.approval)) {
    const log: SocialSendLogRecord = {
      ...baseLog,
      outcome: "refused_no_approval",
      errorMessage: "Nothing posts without an explicit approval record.",
      durationMs: Date.now() - start
    };
    return {
      targetId: input.target.targetId,
      platform: input.target.platform,
      posted: false,
      isDraftOnly: false,
      errorMessage: log.errorMessage,
      log
    };
  }

  const match = checkSocialAccountMatch({
    artistName: input.artistName,
    artistVoice: input.artistVoice,
    accountLabel: input.target.accountLabel ?? "",
    accountVoice: input.target.accountVoiceKey ?? "unknown",
    accountExternalId: input.target.accountExternalId ?? null,
    platform: input.target.platform
  });
  if (!match.ok) {
    const outcome =
      match.code === "cross_band_account" ? "refused_account_mismatch" : "refused_voice_mismatch";
    const log: SocialSendLogRecord = {
      ...baseLog,
      approvalRequestId: input.approval.id,
      outcome,
      errorMessage: match.reason,
      durationMs: Date.now() - start
    };
    return {
      targetId: input.target.targetId,
      platform: input.target.platform,
      posted: false,
      isDraftOnly: false,
      errorMessage: match.reason,
      log
    };
  }

  let result: SocialPublishResult;
  try {
    result = await input.adapter.publish({
    platform: input.target.platform,
    caption: input.target.caption,
    title: input.target.title,
    tags: input.target.tags,
    mediaUrl: input.mediaUrl,
    mediaPath: input.mediaPath,
    mediaByteSize: input.mediaByteSize,
    mediaMimeType: input.mediaMimeType,
    mediaKind: input.mediaKind,
    includeFacebookEvent: input.target.includeFacebookEvent,
    facebookEventName: input.target.facebookEventName,
    facebookEventStartsAt: input.target.facebookEventStartsAt,
    facebookEventPlace: input.target.facebookEventPlace,
    account: {
      externalAccountId: input.target.accountExternalId ?? "",
      label: input.target.accountLabel ?? "",
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      instagramBusinessId: input.instagramBusinessId
    }
    });
  } catch {
    const log: SocialSendLogRecord = { ...baseLog, outcome: "unknown",
      errorMessage: "Provider outcome is unknown. Check the platform before creating another approval.",
      durationMs: Date.now() - start };
    return { targetId: input.target.targetId, platform: input.target.platform,
      posted: false, isDraftOnly: false, deliveryState: "unknown", errorMessage: log.errorMessage, log };
  }

  if (!postedOnlyWithId(result)) {
    const uncertain = result.success || result.deliveryState === "unknown";
    const log: SocialSendLogRecord = {
      ...baseLog,
      approvalRequestId: input.approval.id,
      outcome: uncertain ? "unknown" : "failed",
      externalPostId: result.externalPostId,
      requestSummary: result.requestSummary,
      responseCode: result.responseCode,
      errorMessage:
        result.errorMessage ??
        "Platform returned no id. Nothing was marked posted.",
      durationMs: result.durationMs || Date.now() - start
    };
    return {
      targetId: input.target.targetId,
      platform: input.target.platform,
      posted: false,
      isDraftOnly: Boolean(result.isDraftOnly),
      deliveryState: uncertain ? "unknown" : undefined,
      externalPostId: result.externalPostId,
      errorMessage: log.errorMessage,
      log
    };
  }

  const state = input.adapter.mode === "mock" ? "simulated" : result.deliveryState ?? "unknown";
  const posted = input.adapter.mode === "real" && state === "published";
  const log: SocialSendLogRecord = {
    ...baseLog,
    approvalRequestId: input.approval.id,
    outcome: posted ? "sent" : state === "published" ? "unknown" : state,
    requestSummary: { ...result.requestSummary, deliveryState: state },
    responseCode: result.responseCode,
    externalPostId: result.externalPostId,
    durationMs: result.durationMs || Date.now() - start,
    ...(state === "unknown" ? { errorMessage: "Provider outcome needs review; an id alone does not confirm publication." } : {})
  };
  return {
    targetId: input.target.targetId,
    platform: input.target.platform,
    posted,
    deliveryState: state,
    isDraftOnly: state === "draft_only" || state === "private_upload" || state === "processing",
    externalPostId: result.externalPostId,
    externalPostUrl: result.externalPostUrl,
    errorMessage: log.errorMessage,
    log
  };
}

export function parseSocialPostPayload(payload: unknown): SocialPostBatchPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return socialPostBatchPayloadSchema.parse(payload);
  }
  const source = { ...payload } as Record<string, unknown>;
  for (const key of ["dryRunPreview", "executionResult", "executionError", "executionFailedAt"]) delete source[key];
  return socialPostBatchPayloadSchema.parse(source);
}

export type SocialPublisherPort = {
  executeApproved(
    artistId: string,
    approvalId: string,
    actor: { label: string; operatorId?: string | null }
  ): Promise<{
    executionResult: Record<string, unknown>;
    approvalStatus: "executed" | "failed";
  }>;
  previewApproved(payload: unknown): Record<string, unknown>;
};
