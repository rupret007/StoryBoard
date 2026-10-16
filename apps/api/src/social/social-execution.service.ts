import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { shouldSendSocialTarget, type SocialPlatform, type SocialVoiceKey } from "@storyboard/shared";
import { ApprovalStatus, AuditSeverity } from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { SecretBox } from "../integrations/crypto/secret-box";
import { PrismaService } from "../prisma/prisma.service";
import { buildSocialAdapterRegistry, type SocialAdapterRegistry } from "./social-adapters";
import {
  envFallbackAccount,
  socialAdapterMode,
  type SocialCredentialEnv,
  type SocialStoredSecrets
} from "./social-credentials";
import { parseSocialPostPayload, sendSocialTarget, type SocialPublisherPort } from "./social-publisher";
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
      FACEBOOK_PAGE_ACCESS_TOKEN: this.config.get<string>("FACEBOOK_PAGE_ACCESS_TOKEN"),
      FACEBOOK_PAGE_ID: this.config.get<string>("FACEBOOK_PAGE_ID"),
      INSTAGRAM_BUSINESS_ACCOUNT_ID: this.config.get<string>("INSTAGRAM_BUSINESS_ACCOUNT_ID"),
      YOUTUBE_CLIENT_ID: this.config.get<string>("YOUTUBE_CLIENT_ID"),
      YOUTUBE_CLIENT_SECRET: this.config.get<string>("YOUTUBE_CLIENT_SECRET"),
      YOUTUBE_REFRESH_TOKEN: this.config.get<string>("YOUTUBE_REFRESH_TOKEN"),
      TIKTOK_CLIENT_KEY: this.config.get<string>("TIKTOK_CLIENT_KEY"),
      TIKTOK_CLIENT_SECRET: this.config.get<string>("TIKTOK_CLIENT_SECRET"),
      TIKTOK_ACCESS_TOKEN: this.config.get<string>("TIKTOK_ACCESS_TOKEN"),
      TIKTOK_OPEN_ID: this.config.get<string>("TIKTOK_OPEN_ID"),
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
    mediaAsset: { publicUrl: string; kind: string; filename: string } | null;
    approval?: {
      id: string;
      status: string;
      approvedAt: Date | null;
      approvedBy: string | null;
      actionType: string;
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
      status: string;
      externalPostId: string | null;
      externalPostUrl: string | null;
      isDraftOnly: boolean;
      lastError: string | null;
    }>;
    sendLogs: Array<{
      id: string;
      platform: SocialPlatform;
      outcome: string;
      externalPostId: string | null;
      errorMessage: string | null;
      attemptedAt: Date;
      adapterMode: string;
    }>;
  }) {
    return {
      id: post.id,
      note: post.note,
      voiceKey: post.voiceKey,
      status: post.status,
      captionSource: post.captionSource === "llm" ? "llm" : "template",
      captionNotice: post.captionNotice ?? null,
      approvalRequestId: post.approvalRequestId,
      createdAt: post.createdAt,
      media: post.mediaAsset,
      targets: post.targets.map((target) => ({
        ...target,
        captionVariants: Array.isArray(target.captionVariants) ? target.captionVariants : [],
        selectedVariantIndex: target.selectedVariantIndex ?? 0
      })),
      sendLogs: post.sendLogs,
      approval: post.approval
        ? {
            id: post.approval.id,
            status: post.approval.status,
            approvedAt: post.approval.approvedAt,
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
    const approval = await this.prisma.client.approvalRequest.findFirst({
      where: { id: approvalId, artistId }
    });
    if (!approval) throw new NotFoundException("Approval not found");
    if (approval.status !== ApprovalStatus.approved && approval.status !== ApprovalStatus.executed) {
      throw new BadRequestException("Nothing posts without an explicit approval record.");
    }
    const payload = parseSocialPostPayload(approval.payload);
    const post = await this.requirePost(artistId, payload.postId);
    const artist = await this.prisma.client.artist.findUniqueOrThrow({ where: { id: artistId } });
    const adapters = this.adapters();
    const results = [];
    await this.prisma.client.socialPost.update({
      where: { id: post.id },
      data: { status: "posting" }
    });
    for (const target of payload.targets.filter((row) => row.enabled)) {
      const row = post.targets.find((item) => item.id === target.targetId);
      if (!row) continue;
      if (
        !shouldSendSocialTarget({
          enabled: target.enabled,
          existingExternalPostId: row.externalPostId
        })
      ) {
        continue;
      }
      await this.prisma.client.socialPostTarget.update({
        where: { id: row.id },
        data: { status: "sending" }
      });
      const secrets = await this.secretsFor(artistId, target.platform);
      const sent = await sendSocialTarget({
        artistId,
        artistName: artist.name,
        artistVoice: post.voiceKey,
        approval: {
          id: approval.id,
          status: approval.status,
          approvedAt: approval.approvedAt,
          actionType: approval.actionType
        },
        payload,
        target,
        mediaUrl: post.mediaAsset?.publicUrl ?? payload.mediaUrl,
        mediaPath: post.mediaAsset?.storageKey
          ? socialMediaAbsolutePath(
              socialMediaRoot(this.config.get<string>("SOCIAL_MEDIA_DIR")),
              post.mediaAsset.storageKey
            )
          : undefined,
        mediaByteSize: post.mediaAsset?.byteSize ?? undefined,
        mediaMimeType: post.mediaAsset?.mimeType ?? undefined,
        mediaKind: post.mediaAsset?.kind ?? payload.mediaKind,
        adapter: adapters[target.platform],
        accessToken: secrets?.accessToken ?? secrets?.pageAccessToken,
        refreshToken: secrets?.refreshToken,
        clientId: this.env().YOUTUBE_CLIENT_ID ?? this.env().GOOGLE_CLIENT_ID,
        clientSecret: this.env().YOUTUBE_CLIENT_SECRET ?? this.env().GOOGLE_CLIENT_SECRET,
        instagramBusinessId: secrets?.instagramBusinessId
      });
      await this.prisma.client.socialSendLog.create({
        data: {
          artistId,
          postId: post.id,
          targetId: row.id,
          approvalRequestId: approval.id,
          platform: target.platform,
          accountExternalId: sent.log.accountExternalId ?? null,
          voiceKey: post.voiceKey,
          outcome: sent.log.outcome,
          requestSummary: sent.log.requestSummary as object,
          responseCode: sent.log.responseCode ?? null,
          externalPostId: sent.log.externalPostId ?? null,
          errorMessage: sent.log.errorMessage ?? null,
          durationMs: sent.log.durationMs,
          adapterMode: sent.log.adapterMode
        }
      });
      const posted = Boolean(sent.externalPostId);
      await this.prisma.client.socialPostTarget.update({
        where: { id: row.id },
        data: {
          status: posted ? (sent.isDraftOnly ? "draft_only" : "posted") : sent.log.outcome.startsWith("refused") ? "refused" : "failed",
          externalPostId: sent.externalPostId ?? null,
          externalPostUrl: sent.externalPostUrl ?? null,
          isDraftOnly: sent.isDraftOnly,
          lastError: sent.errorMessage ?? null
        }
      });
      await this.audit.log({
        artistId,
        severity: posted ? AuditSeverity.info : AuditSeverity.warning,
        aggregateType: "SocialSendLog",
        aggregateId: row.id,
        action: posted ? "social.send.logged" : "social.send.refused",
        actorLabel: actor.label,
        actorOperatorId: actor.operatorId ?? null,
        metadata: {
          platform: target.platform,
          outcome: sent.log.outcome,
          externalPostId: sent.externalPostId ?? null
        }
      });
      results.push(sent);
    }
    const refreshed = await this.requirePost(artistId, post.id);
    const enabled = refreshed.targets.filter((row) => row.enabled);
    const allPosted = enabled.every((row) => row.externalPostId);
    const anyPosted = enabled.some((row) => row.externalPostId);
    const nextStatus = allPosted ? "posted" : anyPosted ? "partial" : "failed";
    await this.prisma.client.socialPost.update({
      where: { id: post.id },
      data: { status: nextStatus }
    });
    const executionResult = {
      at: new Date().toISOString(),
      results: results.map((row) => ({
        platform: row.platform,
        posted: Boolean(row.externalPostId),
        isDraftOnly: row.isDraftOnly,
        externalPostId: row.externalPostId ?? null,
        externalPostUrl: row.externalPostUrl ?? null,
        error: row.errorMessage ?? null
      }))
    };
    return {
      post: await this.getPost(artistId, post.id),
      executionResult,
      approvalStatus: (nextStatus === "failed" ? "failed" : "executed") as "executed" | "failed"
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

  private async secretsFor(artistId: string, platform: SocialPlatform): Promise<SocialStoredSecrets | null> {
    const envAccount = envFallbackAccount(platform, this.env());
    const provider = platform === "youtube" ? "youtube_publish" : platform === "tiktok" ? "tiktok" : "meta";
    const connection = await this.prisma.client.integrationConnection.findUnique({
      where: { artistId_provider: { artistId, provider } }
    });
    const blob = connection?.encryptedSecrets && typeof connection.encryptedSecrets === "object"
      ? (connection.encryptedSecrets as { blob?: string }).blob
      : null;
    let stored: SocialStoredSecrets | null = null;
    if (blob && this.secretBox.configured()) {
      stored = this.secretBox.decryptJson<SocialStoredSecrets>(blob);
    }
    if (!stored && !envAccount) return null;
    return {
      v: 1,
      accessToken: stored?.accessToken ?? stored?.pageAccessToken ?? envAccount?.accessToken,
      refreshToken: stored?.refreshToken ?? envAccount?.refreshToken,
      pageAccessToken: stored?.pageAccessToken ?? envAccount?.accessToken,
      pageId: stored?.pageId ?? envAccount?.externalAccountId,
      instagramBusinessId: stored?.instagramBusinessId ?? envAccount?.instagramBusinessId,
      openId: stored?.openId ?? (platform === "tiktok" ? envAccount?.externalAccountId : undefined)
    };
  }
}
