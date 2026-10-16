import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SocialPlatform, SocialVoiceKey } from "@storyboard/shared";
import { ApprovalStatus, AuditSeverity, type SocialPostStatus, type SocialTargetStatus } from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { SecretBox } from "../integrations/crypto/secret-box";
import { PrismaService } from "../prisma/prisma.service";
import { buildSocialAdapterRegistry, type SocialAdapterRegistry } from "./social-adapters";
import {
  socialAdapterMode,
  boundSocialSecrets,
  type SocialCredentialEnv,
  type SocialStoredSecrets
} from "./social-credentials";
import { parseSocialPostPayload, sendSocialTarget, type SocialPublisherPort } from "./social-publisher";
import { socialReviewFingerprint, recordedSocialReviewFingerprint } from "./social-review";
import { assertSocialOwner } from "./social-owner";
import { socialMediaAbsolutePath, socialMediaRoot } from "./social-media.store";

@Injectable()
export class SocialExecutionService implements SocialPublisherPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly secretBox: SecretBox
  ) {}

  env(): SocialCredentialEnv {
    return {
      SOCIAL_ADAPTER: this.config.get<string>("SOCIAL_ADAPTER"),
      YOUTUBE_CLIENT_ID: this.config.get<string>("YOUTUBE_CLIENT_ID"),
      YOUTUBE_CLIENT_SECRET: this.config.get<string>("YOUTUBE_CLIENT_SECRET"),
      TIKTOK_CLIENT_KEY: this.config.get<string>("TIKTOK_CLIENT_KEY"),
      TIKTOK_CLIENT_SECRET: this.config.get<string>("TIKTOK_CLIENT_SECRET"),
      META_APP_ID: this.config.get<string>("META_APP_ID"),
      META_APP_SECRET: this.config.get<string>("META_APP_SECRET"),
      GOOGLE_CLIENT_ID: this.config.get<string>("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: this.config.get<string>("GOOGLE_CLIENT_SECRET")
    };
  }

  adapters(): SocialAdapterRegistry {
    return buildSocialAdapterRegistry({ mode: socialAdapterMode(this.env()) });
  }

  async getPost(artistId: string, postId: string) {
    return this.presentPost(await this.requirePost(artistId, postId));
  }

  async requirePost(artistId: string, postId: string) {
    const post = await this.prisma.client.socialPost.findFirst({
      where: { id: postId, artistId },
      include: {
        targets: { include: { account: true } },
        mediaAsset: true,
        approval: true,
        sendLogs: { orderBy: { attemptedAt: "desc" }, take: 40 }
      }
    });
    if (!post) throw new NotFoundException("Social post not found");
    return post;
  }

  presentPost(post: {
    id: string;
    note: string;
    voiceKey: SocialVoiceKey;
    status: string;
    captionSource?: string | null;
    captionNotice?: string | null;
    approvalRequestId: string | null;
    createdAt: Date;
    mediaAsset: { id: string; publicUrl: string; kind: string; filename: string; storageKey?: string | null } | null;
    approval?: {
      id: string;
      status: string;
      approvedAt: Date | null;
      approvedBy: string | null;
      actionType: string;
      executionAttemptedAt?: Date | null;
      payload?: unknown;
    } | null;
    targets: Array<{
      id: string;
      platform: SocialPlatform;
      enabled: boolean;
      caption: string;
      title: string | null;
      tags: string[];
      captionVariants?: unknown;
      selectedVariantIndex?: number;
      includeFacebookEvent: boolean;
      facebookEventName: string | null;
      facebookEventStartsAt?: Date | null;
      facebookEventPlace?: string | null;
      account?: { externalAccountId: string; accountLabel: string; voiceKey: string; status?: string } | null;
      status: string;
      externalPostId: string | null;
      externalPostUrl: string | null;
      isDraftOnly: boolean;
      lastError: string | null;
    }>;
    sendLogs: Array<{
      id: string;
      targetId?: string | null;
      requestSummary?: unknown;
      platform: SocialPlatform;
      outcome: string;
      externalPostId: string | null;
      errorMessage: string | null;
      attemptedAt: Date;
      adapterMode: string;
    }>;
  }) {
    const projectedLogOutcome = (log: typeof post.sendLogs[number]) => {
      if (log.adapterMode === "mock" && log.externalPostId) return "simulated";
      if (log.externalPostId && log.platform === "youtube" && log.outcome === "sent") return "private_upload";
      if (log.externalPostId && log.platform === "tiktok" && ["sent", "draft_only"].includes(log.outcome)) return "processing";
      const summary = log.requestSummary && typeof log.requestSummary === "object"
        ? log.requestSummary as Record<string, unknown> : {};
      if (log.outcome === "sent" && (log.adapterMode !== "real" || summary.deliveryState !== "published")) return "unknown";
      return log.outcome;
    };
    const cancelled = post.approval?.status === "rejected" || post.approval?.status === "expired";
    const unresolvedAttempt = post.status === "unknown" ||
      (["posting", "approved", "pending_approval"].includes(post.status) && (post.approval?.status === "failed" ||
        Boolean(post.approval?.status === "approved" && post.approval.executionAttemptedAt &&
          Date.now() - post.approval.executionAttemptedAt.getTime() >= 60 * 60 * 1000)));
    const unattemptedNeedsReview = unresolvedAttempt ||
      ["failed", "executed"].includes(post.approval?.status ?? "") ||
      ["failed", "partial", "posted", "simulated", "private_upload", "processing", "draft_only"].includes(post.status);
    const targets = post.targets.map((target) => {
      const log = post.sendLogs.find((row) => row.targetId === target.id || (!row.targetId && row.platform === target.platform));
      const outcome = log ? projectedLogOutcome(log) : null;
      const hasAttemptEvidence = Boolean(log || target.externalPostId || target.externalPostUrl);
      const status = ["posted", "draft_only"].includes(target.status)
        ? outcome === "sent" ? "posted" : outcome === "simulated" || outcome === "private_upload" ||
          outcome === "processing" || outcome === "draft_only" ? outcome : "unknown"
        : cancelled && ["draft", "pending", "skipped"].includes(target.status)
          ? hasAttemptEvidence ? "unknown" : "cancelled"
        : target.status === "sending" && unresolvedAttempt ? "unknown"
        : target.enabled && ["draft", "pending"].includes(target.status)
          ? hasAttemptEvidence ? "unknown" : unattemptedNeedsReview ? "not_attempted"
            : post.approval?.status === "approved" ? "approved" : target.status
          : target.status;
      return { ...target, status };
    });
    const enabledStatuses = targets.filter((target) => target.enabled).map((target) => target.status);
    let status = cancelled && ["draft", "pending_approval", "approved"].includes(post.status)
      ? "cancelled" : unresolvedAttempt ? "unknown" : post.status;
    if (["posted", "partial"].includes(status)) {
      status = !enabledStatuses.length ? "failed" : enabledStatuses.every((value) => value === "posted") ? "posted" :
        enabledStatuses.every((value) => value === "simulated") ? "simulated" :
        enabledStatuses.every((value) => value === "private_upload") ? "private_upload" :
        enabledStatuses.every((value) => value === "draft_only") ? "draft_only" :
        enabledStatuses.some((value) => value === "unknown") ? "unknown" :
        enabledStatuses.some((value) => value === "processing") ? "processing" : "partial";
    }
    return {
      id: post.id,
      reviewFingerprint: recordedSocialReviewFingerprint(post.approval?.payload) ?? socialReviewFingerprint(post, socialAdapterMode(this.env())),
      note: post.note,
      voiceKey: post.voiceKey,
      status,
      captionSource: post.captionSource === "llm" ? "llm" : "template",
      captionNotice: post.captionNotice ?? null,
      approvalRequestId: post.approvalRequestId,
      createdAt: post.createdAt,
      media: post.mediaAsset ? {
        kind: post.mediaAsset.kind, filename: post.mediaAsset.filename,
        publicUrl: post.mediaAsset.storageKey ? `/social/media/${encodeURIComponent(post.mediaAsset.id)}/file` : post.mediaAsset.publicUrl
      } : null,
      targets: targets.map((target) => ({
        id: target.id, platform: target.platform, enabled: target.enabled,
        accountLabel: target.account?.accountLabel ?? null, accountExternalId: target.account?.externalAccountId ?? null,
        caption: target.caption, title: target.title, tags: target.tags,
        includeFacebookEvent: target.includeFacebookEvent, facebookEventName: target.facebookEventName,
        status: target.status, externalPostId: target.externalPostId, externalPostUrl: target.externalPostUrl,
        isDraftOnly: target.isDraftOnly, lastError: target.lastError ? "This platform needs review. Check its recorded outcome before preparing another approval." : null,
        captionVariants: Array.isArray(target.captionVariants) ? target.captionVariants : [],
        selectedVariantIndex: target.selectedVariantIndex ?? 0
      })),
      sendLogs: post.sendLogs.map((log) => ({
        id: log.id, platform: log.platform, outcome: projectedLogOutcome(log),
        externalPostId: log.externalPostId, errorMessage: log.errorMessage ? "The platform outcome was not confirmed. Review the recorded status and check the platform." : null,
        attemptedAt: log.attemptedAt, adapterMode: log.adapterMode
      })),
      approval: post.approval
        ? {
            id: post.approval.id,
            status: post.approval.status,
            approvedAt: post.approval.approvedAt,
            executionAttemptedAt: post.approval.executionAttemptedAt ?? null,
            approvedBy: post.approval.approvedBy,
            actionType: post.approval.actionType
          }
        : null
    };
  }

  async executeApproved(
    artistId: string,
    approvalId: string,
    actor: { label: string; operatorId?: string | null }
  ) {
    await assertSocialOwner(this.prisma.client, artistId, actor.operatorId);
    const approval = await this.prisma.client.approvalRequest.findFirst({
      where: { id: approvalId, artistId }
    });
    if (!approval) throw new NotFoundException("Approval not found");
    if (approval.status !== ApprovalStatus.approved || !approval.approvedAt ||
        !approval.executionAttemptedAt || approval.actionType !== "social_post_batch") {
      throw new BadRequestException("Nothing posts without an explicit claimed owner approval.");
    }
    const ownerDecision = await this.prisma.client.auditEvent.findFirst({ where: {
      artistId, aggregateType: "ApprovalRequest", aggregateId: approvalId,
      action: "approval.approved", actorOperatorId: { not: null },
      metadata: { path: ["ownerApproved"], equals: true }
    } });
    if (!ownerDecision) throw new BadRequestException("This approval has no verified owner decision.");
    const payload = parseSocialPostPayload(approval.payload);
    if (payload.adapterMode !== socialAdapterMode(this.env())) {
      throw new BadRequestException("Posting mode changed after review. Nothing was sent.");
    }
    const post = await this.requirePost(artistId, payload.postId);
    const enabled = payload.targets.filter((row) => row.enabled);
    if (post.approvalRequestId !== approvalId || approval.sourceKey !== `social_post:${post.id}` ||
        post.voiceKey !== payload.voiceKey || !enabled.length || enabled.some((target) => target.includeFacebookEvent) ||
        new Set(payload.targets.map((row) => row.targetId)).size !== payload.targets.length ||
        payload.targets.length !== post.targets.length ||
        payload.targets.some((target) => !post.targets.some((row) =>
          row.id === target.targetId && row.platform === target.platform && row.enabled === target.enabled &&
          row.caption === target.caption && (row.title ?? undefined) === target.title &&
          JSON.stringify(row.tags) === JSON.stringify(target.tags ?? []) &&
          row.includeFacebookEvent === (target.includeFacebookEvent ?? false) &&
          (row.facebookEventName ?? undefined) === target.facebookEventName &&
          row.facebookEventStartsAt?.toISOString() === target.facebookEventStartsAt &&
          (row.facebookEventPlace ?? undefined) === target.facebookEventPlace)) ||
        (post.mediaAsset?.storageKey ? payload.mediaUrl !== undefined : post.mediaAsset?.publicUrl !== payload.mediaUrl) ||
        post.mediaAsset?.kind !== payload.mediaKind) {
      throw new BadRequestException("The approved snapshot does not match this drop. Nothing was sent.");
    }
    for (const target of enabled) {
      const row = post.targets.find((item) => item.id === target.targetId)!;
      if (!row.account || row.account.artistId !== artistId || row.account.platform !== target.platform ||
          row.account.status !== "active" || row.account.externalAccountId !== target.accountExternalId ||
          row.account.voiceKey !== target.accountVoiceKey || row.account.accountLabel !== target.accountLabel) {
        throw new BadRequestException("The approved account is unavailable or changed. Nothing was sent.");
      }
    }
    const artist = await this.prisma.client.artist.findUniqueOrThrow({ where: { id: artistId } });
    const adapters = this.adapters();
    // The approval claim protects normal execution; this second durable claim also
    // protects direct service calls and never reopens after a lost response.
    const claim = await this.prisma.client.socialPost.updateMany({
      where: { id: post.id, artistId, approvalRequestId: approvalId,
        status: { in: ["pending_approval", "approved"] } }, data: { status: "posting" }
    });
    if (claim.count !== 1) throw new BadRequestException("This drop already has a posting attempt. Check its recorded outcome.");
    const results = [];
    try {
      for (const target of enabled) {
        const row = post.targets.find((item) => item.id === target.targetId)!;
        const secrets = adapters[target.platform].mode === "real"
          ? await this.secretsFor(artistId, target.platform, target.accountExternalId ?? "") : null;
        const attempt = await this.prisma.client.$transaction(async (tx) => {
          const claimed = await tx.socialPostTarget.updateMany({
            where: { id: row.id, postId: post.id, status: { in: ["draft", "pending"] }, externalPostId: null },
            data: { status: "sending" }
          });
          if (claimed.count !== 1) throw new BadRequestException("A target already has a posting attempt.");
          return tx.socialSendLog.create({ data: {
            artistId, postId: post.id, targetId: row.id, approvalRequestId: approvalId,
            platform: target.platform, accountExternalId: target.accountExternalId ?? null,
            voiceKey: post.voiceKey, outcome: "unknown", requestSummary: { platform: target.platform },
            durationMs: 0, adapterMode: adapters[target.platform].mode,
            errorMessage: "Posting attempt started; its outcome is not yet confirmed."
          } });
        });
        const sent = await sendSocialTarget({
          artistId, artistName: artist.name, artistVoice: post.voiceKey,
          approval: { id: approval.id, status: approval.status, approvedAt: approval.approvedAt, actionType: approval.actionType },
          payload, target, mediaUrl: post.mediaAsset?.publicUrl ?? payload.mediaUrl,
          mediaPath: post.mediaAsset?.storageKey ? socialMediaAbsolutePath(
            socialMediaRoot(this.config.get<string>("SOCIAL_MEDIA_DIR")), post.mediaAsset.storageKey) : undefined,
          mediaByteSize: post.mediaAsset?.byteSize ?? undefined,
          mediaMimeType: post.mediaAsset?.mimeType ?? undefined,
          mediaKind: post.mediaAsset?.kind ?? payload.mediaKind,
          adapter: adapters[target.platform], accessToken: secrets?.pageAccessToken ?? secrets?.accessToken,
          refreshToken: secrets?.refreshToken,
          clientId: this.env().YOUTUBE_CLIENT_ID ?? this.env().GOOGLE_CLIENT_ID,
          clientSecret: this.env().YOUTUBE_CLIENT_SECRET ?? this.env().GOOGLE_CLIENT_SECRET,
          instagramBusinessId: target.platform === "instagram" ? target.accountExternalId : undefined
        });
        const status: SocialTargetStatus = sent.posted ? "posted" :
          sent.deliveryState === "simulated" || sent.deliveryState === "private_upload" ||
          sent.deliveryState === "processing" || sent.deliveryState === "draft_only" || sent.deliveryState === "unknown"
            ? sent.deliveryState : sent.log.outcome.startsWith("refused") ? "refused" : "failed";
        await this.prisma.client.$transaction(async (tx) => {
          await tx.socialSendLog.update({ where: { id: attempt.id }, data: {
            outcome: sent.log.outcome, requestSummary: sent.log.requestSummary as object,
            responseCode: sent.log.responseCode ?? null, externalPostId: sent.externalPostId ?? null,
            errorMessage: sent.errorMessage ?? null, durationMs: sent.log.durationMs
          } });
          await tx.socialPostTarget.update({ where: { id: row.id }, data: {
            status, externalPostId: sent.externalPostId ?? null, externalPostUrl: sent.externalPostUrl ?? null,
            isDraftOnly: sent.isDraftOnly, lastError: sent.errorMessage ?? null
          } });
          await tx.auditEvent.create({ data: {
            artistId, severity: status === "failed" || status === "unknown" ? AuditSeverity.warning : AuditSeverity.info,
            aggregateType: "SocialSendLog", aggregateId: attempt.id, action: "social.send.logged",
            actorLabel: actor.label, actorOperatorId: actor.operatorId ?? null,
            metadata: { platform: target.platform, outcome: sent.log.outcome, externalPostId: sent.externalPostId ?? null }
          } });
        });
        results.push(sent);
      }
    } catch {
      await this.prisma.client.socialPost.update({ where: { id: post.id }, data: { status: "unknown" } });
      throw new BadRequestException("Posting stopped. Check recorded platform outcomes before preparing any new approval.");
    }
    const statuses = results.map((row) => row.posted ? "posted" : row.deliveryState ?? "failed");
    const complete = statuses.every((status) => ["posted", "simulated", "private_upload", "draft_only"].includes(status));
    const nextStatus: SocialPostStatus = statuses.every((status) => status === "posted") ? "posted" :
      statuses.every((status) => status === "simulated") ? "simulated" :
      statuses.every((status) => status === "private_upload") ? "private_upload" :
      statuses.every((status) => status === "draft_only") ? "draft_only" :
      statuses.some((status) => status === "unknown") ? "unknown" :
      statuses.some((status) => status === "processing") ? "processing" :
      statuses.every((status) => status === "failed") ? "failed" : "partial";
    await this.prisma.client.socialPost.update({ where: { id: post.id }, data: { status: nextStatus } });
    return {
      post: await this.getPost(artistId, post.id),
      executionResult: { at: new Date().toISOString(), socialMode: socialAdapterMode(this.env()),
        results: results.map((row) => ({ platform: row.platform, posted: row.posted,
          deliveryState: row.deliveryState ?? "unknown", isDraftOnly: row.isDraftOnly,
          externalPostId: row.externalPostId ?? null, externalPostUrl: row.externalPostUrl ?? null,
          error: row.errorMessage ?? null })) },
      approvalStatus: (complete ? "executed" : "failed") as "executed" | "failed"
    };
  }

  previewApproved(payload: unknown) {
    const parsed = parseSocialPostPayload(payload);
    return {
      wouldPublish: parsed.targets.filter((row) => row.enabled).map((row) => ({
        platform: row.platform,
        account: row.accountLabel,
        includeFacebookEvent: row.includeFacebookEvent
      })),
      socialMode: socialAdapterMode(this.env())
    };
  }

  private async secretsFor(artistId: string, platform: SocialPlatform, approvedAccountId: string): Promise<SocialStoredSecrets> {
    const provider = platform === "youtube" ? "youtube_publish" : platform === "tiktok" ? "tiktok" : "meta";
    const connection = await this.prisma.client.integrationConnection.findUnique({
      where: { artistId_provider: { artistId, provider } }
    });
    const blob = connection?.encryptedSecrets && typeof connection.encryptedSecrets === "object"
      ? (connection.encryptedSecrets as { blob?: string }).blob : null;
    if (!connection || connection.status !== "active" || !blob || !this.secretBox.configured()) {
      throw new BadRequestException("Reconnect this band's social account before approving a new drop.");
    }
    const stored = this.secretBox.decryptJson<SocialStoredSecrets>(blob);
    const bound = boundSocialSecrets(platform, approvedAccountId, stored);
    if (!bound) {
      throw new BadRequestException("The connected account differs from the approved destination.");
    }
    return bound;
  }
}
