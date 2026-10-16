import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  resolveRecordedSocialShow,
  resolveSocialVoice,
  SOCIAL_SHOW_NOT_RECORDED,
  socialApproveAndPostSchema,
  socialDropInputSchema,
  voiceProfileFor,
  type SocialDropInput,
  type SocialPlatform,
  type SocialPostBatchPayload,
  type SocialVoiceKey
} from "@storyboard/shared";
import { ApprovalStatus, AuditSeverity } from "../generated/prisma/enums";
import { ApprovalsService } from "../approvals/approvals.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { connectReadiness, socialAdapterMode } from "./social-credentials";
import { socialReviewFingerprint, recordedSocialReviewFingerprint } from "./social-review";
import { assertSocialOwner } from "./social-owner";
import { SOCIAL_POST_ACTION_TYPE } from "./social.constants";
import { SocialCaptionService } from "./social-caption.service";
import { SocialExecutionService } from "./social-execution.service";

const PLATFORMS: SocialPlatform[] = ["facebook", "instagram", "youtube", "tiktok"];

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly execution: SocialExecutionService,
    private readonly captions: SocialCaptionService
  ) {}

  async workspace(artistId: string) {
    const artist = await this.prisma.client.artist.findUniqueOrThrow({ where: { id: artistId } });
    const voiceKey = resolveSocialVoice(artist.name);
    await this.ensureVoiceProfile(artistId, voiceKey);
    const env = this.execution.env();
    if (socialAdapterMode(env) === "mock") {
      await this.ensureMockAccounts(artistId, artist.name, voiceKey);
    }
    const [posts, accounts, connections, events] = await Promise.all([
      this.prisma.client.socialPost.findMany({
        where: { artistId },
        include: {
          targets: { include: { account: true } },
          mediaAsset: true,
          approval: true,
          sendLogs: { orderBy: { attemptedAt: "desc" }, take: 20 }
        },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      this.prisma.client.socialAccount.findMany({ where: { artistId } }),
      this.prisma.client.integrationConnection.findMany({
        where: {
          artistId,
          provider: { in: ["meta", "youtube_publish", "tiktok"] }
        }
      }),
      this.prisma.client.bandEvent.findMany({
        where: { artistId, status: { in: ["draft", "hold", "confirmed"] } },
        orderBy: { startsAt: "asc" },
        take: 12,
        select: {
          id: true,
          title: true,
          startsAt: true,
          locationName: true,
          timezone: true
        }
      })
    ]);
    return {
      artist: { id: artist.id, name: artist.name },
      voiceKey,
      adapterMode: socialAdapterMode(env),
      connect: connectReadiness(env),
      accounts: accounts.map((account) => ({
        platform: account.platform,
        accountLabel: account.accountLabel,
        externalAccountId: account.externalAccountId,
        voiceKey: account.voiceKey,
        status: account.status,
        handle: account.handle
      })),
      connections: connections.map((row) => ({
        provider: row.provider,
        status: row.status,
        accountLabel: row.accountLabel,
        scopes: row.scopes
      })),
      events,
      posts: posts.map((post) => this.execution.presentPost(post)),
      captionDrafting: this.captions.draftingStatus()
    };
  }

  async createDrop(
    artistId: string,
    raw: unknown,
    actor: { label: string; operatorId: string }
  ) {
    const input = socialDropInputSchema.parse(raw);
    const artist = await this.prisma.client.artist.findUniqueOrThrow({ where: { id: artistId } });
    const voiceKey = resolveSocialVoice(artist.name);
    await this.ensureVoiceProfile(artistId, voiceKey);
    if (socialAdapterMode(this.execution.env()) === "mock") {
      await this.ensureMockAccounts(artistId, artist.name, voiceKey);
    }
    const uploaded = input.mediaAssetId
      ? await this.prisma.client.socialMediaAsset.findFirst({
          where: { id: input.mediaAssetId, artistId }
        })
      : null;
    if (input.mediaAssetId && (!uploaded || uploaded.uploadStatus !== "ready")) {
      throw new BadRequestException("Wait for the file upload to finish before drafting captions.");
    }
    const mediaKind =
      input.mediaKind ??
      uploaded?.kind ??
      (input.mediaUrl?.match(/\.(mp4|mov|webm)$/i) ? "video" : "photo");
    const show = await this.resolveShow(artistId, input);
    const voiceRow = await this.prisma.client.socialVoiceProfile.findUnique({ where: { artistId } });
    const extraFacts = Array.isArray(voiceRow?.confirmedFacts)
      ? voiceRow.confirmedFacts.filter((row): row is string => typeof row === "string")
      : [];
    const drafted = await this.captions.draft({
      voice: voiceKey,
      note: input.note,
      mediaKind,
      show,
      extraFacts
    });
    const drafts = drafted.drafts.filter((draft) => (input.platforms ?? PLATFORMS).includes(draft.platform));
    const accounts = await this.prisma.client.socialAccount.findMany({ where: { artistId } });

    const created = await this.prisma.client.$transaction(async (tx) => {
      const mediaAsset = uploaded
        ? uploaded
        : input.mediaUrl
          ? await tx.socialMediaAsset.create({
              data: {
                artistId,
                filename: input.mediaUrl.split("/").pop() ?? "media",
                mimeType: mediaKind === "video" ? "video/mp4" : "image/jpeg",
                publicUrl: input.mediaUrl,
                kind: mediaKind,
                uploadStatus: "ready",
                receivedBytes: 0
              }
            })
          : null;
      const post = await tx.socialPost.create({
        data: {
          artistId,
          eventId: input.eventId ?? null,
          note: input.note,
          voiceKey,
          status: "pending_approval",
          captionSource: drafted.source,
          captionNotice: drafted.notice,
          mediaAssetId: mediaAsset?.id ?? null,
          createdByOperatorId: actor.operatorId
        }
      });
      for (const draft of drafts) {
        const account = accounts.find((row) => row.platform === draft.platform);
        await tx.socialPostTarget.create({
          data: {
            postId: post.id,
            accountId: account?.id ?? null,
            platform: draft.platform,
            enabled: true,
            caption: draft.caption,
            title: draft.title ?? null,
            tags: draft.tags,
            captionVariants: draft.variants,
            selectedVariantIndex: draft.selectedVariantIndex,
            mediaKind,
            includeFacebookEvent: false,
            facebookEventName: show?.name ?? null,
            facebookEventStartsAt: parseOptionalDate(show?.startsAt),
            facebookEventPlace: show?.place ?? null,
            status: "pending"
          }
        });
      }
      return post.id;
    });

    const loaded = await this.execution.requirePost(artistId, created);
    const approval = await this.approvals.create(artistId, {
      title: `Social post: ${input.note.slice(0, 80)}`,
      actionType: SOCIAL_POST_ACTION_TYPE,
      payload: this.payloadFromPost(loaded, voiceKey),
      eventId: input.eventId ?? null,
      sourceKey: `social_post:${created}`,
      proposedBy: actor.label,
      status: ApprovalStatus.pending,
      actorOperatorId: actor.operatorId
    });
    await this.prisma.client.socialPost.update({
      where: { id: created },
      data: { approvalRequestId: approval.id }
    });
    await this.audit.log({
      artistId,
      severity: AuditSeverity.info,
      aggregateType: "SocialPost",
      aggregateId: created,
      action: "social.drop.created",
      actorLabel: actor.label,
      actorOperatorId: actor.operatorId,
      metadata: { voiceKey, platforms: drafts.map((row) => row.platform), captionSource: drafted.source }
    });
    return this.execution.getPost(artistId, created);
  }

  async getPost(artistId: string, postId: string) {
    return this.execution.getPost(artistId, postId);
  }

  async approveAndPost(
    artistId: string,
    raw: unknown,
    actor: { label: string; operatorId: string }
  ) {
    const input = socialApproveAndPostSchema.parse(raw);
    const decision = await this.prisma.client.$transaction(async (tx) => {
      await assertSocialOwner(tx, artistId, actor.operatorId);
      const post = await tx.socialPost.findFirst({
        where: { id: input.postId, artistId },
        include: { targets: { include: { account: true } }, mediaAsset: true, approval: true }
      });
      if (!post?.approval || post.approval.artistId !== artistId ||
          post.approval.actionType !== SOCIAL_POST_ACTION_TYPE ||
          post.approval.sourceKey !== `social_post:${post.id}`) {
        throw new BadRequestException("This drop has no matching approval record.");
      }
      const reviewedFingerprint = post.approval.status === ApprovalStatus.pending || post.approval.status === ApprovalStatus.proposed
        ? socialReviewFingerprint(post, socialAdapterMode(this.execution.env()))
        : recordedSocialReviewFingerprint(post.approval.payload) ?? socialReviewFingerprint(post, socialAdapterMode(this.execution.env()));
      if (input.reviewFingerprint !== reviewedFingerprint) {
        throw new ConflictException("The draft, account, media, or posting mode changed. Reload and review before approving.");
      }
      if (input.targets?.some((target) => target.includeFacebookEvent)) {
        throw new BadRequestException("Facebook Event creation is unavailable. Approve a social post separately.");
      }
      const ids = input.targets?.map((target) => target.id) ?? [];
      if (new Set(ids).size !== ids.length || ids.some((id) => !post.targets.some((row) => row.id === id))) {
        throw new BadRequestException("Review targets must belong to this drop and cannot repeat.");
      }
      if (post.approval.status !== ApprovalStatus.pending && post.approval.status !== ApprovalStatus.proposed) {
        return { approvalId: post.approval.id, execute: false };
      }
      const targets = post.targets.map((target) => {
        const edit = input.targets?.find((row) => row.id === target.id);
        return edit ? { ...target, ...edit, title: edit.title ?? null, tags: edit.tags ?? [],
          includeFacebookEvent: edit.includeFacebookEvent ?? false,
          selectedVariantIndex: edit.selectedVariantIndex ?? 0 } : target;
      });
      if (!targets.some((target) => target.enabled)) {
        throw new BadRequestException("Select at least one platform before approving.");
      }
      // Claim the decision before changing any target. Approval Center and concurrent
      // clicks compete on the same row; the winning payload is immutable thereafter.
      const approved = await tx.approvalRequest.updateMany({
        where: { id: post.approval.id, artistId,
          status: { in: [ApprovalStatus.pending, ApprovalStatus.proposed] }, executionAttemptedAt: null },
        data: { status: ApprovalStatus.approved, approvedAt: new Date(), approvedBy: actor.label,
          payload: { ...this.payloadFromPost({ ...post, targets }, post.voiceKey), reviewFingerprint: input.reviewFingerprint } as object }
      });
      if (approved.count !== 1) return { approvalId: post.approval.id, execute: false };
      for (const target of targets) {
        await tx.socialPostTarget.update({ where: { id: target.id }, data: {
          enabled: target.enabled, caption: target.caption, title: target.title, tags: target.tags,
          includeFacebookEvent: target.includeFacebookEvent,
          selectedVariantIndex: target.selectedVariantIndex,
          status: target.enabled ? "pending" : "skipped"
        } });
      }
      await tx.socialPost.update({ where: { id: post.id }, data: { status: "approved" } });
      await tx.auditEvent.create({ data: {
        artistId, severity: AuditSeverity.info, aggregateType: "ApprovalRequest",
        aggregateId: post.approval.id, action: "approval.approved", actorLabel: actor.label,
        actorOperatorId: actor.operatorId,
        metadata: { actionType: SOCIAL_POST_ACTION_TYPE, ownerApproved: true }
      } });
      return { approvalId: post.approval.id, execute: true };
    });
    if (!decision.execute) {
      const current = await this.execution.requirePost(artistId, input.postId);
      if (input.targets?.some((edit) => {
        const row = current.targets.find((target) => target.id === edit.id);
        return !row || row.enabled !== edit.enabled || row.caption !== edit.caption ||
          row.title !== (edit.title ?? null) || JSON.stringify(row.tags) !== JSON.stringify(edit.tags ?? []) ||
          row.includeFacebookEvent !== (edit.includeFacebookEvent ?? false) ||
          row.selectedVariantIndex !== (edit.selectedVariantIndex ?? 0);
      })) throw new ConflictException("This drop has already been reviewed. Its approved content cannot change.");
      // Failed/uncertain attempts are reads. A separately approved, unclaimed
      // request can still execute after this owner's explicit unchanged review.
      if (current.approval?.status !== ApprovalStatus.approved || current.approval.executionAttemptedAt) {
        return this.execution.getPost(artistId, input.postId);
      }
    }
    try {
      await this.approvals.executeApproved(artistId, decision.approvalId, actor.label, {
        actorOperatorId: actor.operatorId
      });
    } catch (error) {
      const current = await this.execution.requirePost(artistId, input.postId);
      if (!current.approval?.executionAttemptedAt) throw error;
      // A competing click won the durable execution claim. Return its persisted
      // state without performing another provider call or changing the snapshot.
    }
    return this.execution.getPost(artistId, input.postId);
  }

  private payloadFromPost(
    post: {
      id: string;
      voiceKey: SocialVoiceKey;
      mediaAsset: { publicUrl: string; kind: "photo" | "video"; storageKey?: string | null } | null;
      targets: Array<{
        id: string;
        platform: SocialPlatform;
        enabled: boolean;
        caption: string;
        title: string | null;
        tags: string[];
        includeFacebookEvent: boolean;
        facebookEventName: string | null;
        facebookEventStartsAt: Date | null;
        facebookEventPlace: string | null;
        account: { externalAccountId: string; accountLabel: string; voiceKey: SocialVoiceKey } | null;
      }>;
    },
    voiceKey: SocialVoiceKey
  ): SocialPostBatchPayload {
    return {
      postId: post.id,
      adapterMode: socialAdapterMode(this.execution.env()),
      voiceKey,
      mediaUrl: post.mediaAsset?.storageKey ? undefined : post.mediaAsset?.publicUrl,
      mediaKind: post.mediaAsset?.kind,
      targets: post.targets.map((target) => ({
        targetId: target.id,
        platform: target.platform,
        enabled: target.enabled,
        caption: target.caption,
        title: target.title ?? undefined,
        tags: target.tags,
        includeFacebookEvent: target.includeFacebookEvent,
        facebookEventName: target.facebookEventName ?? undefined,
        facebookEventStartsAt: target.facebookEventStartsAt?.toISOString(),
        facebookEventPlace: target.facebookEventPlace ?? undefined,
        accountExternalId: target.account?.externalAccountId,
        accountLabel: target.account?.accountLabel,
        accountVoiceKey: target.account?.voiceKey
      }))
    };
  }

  private async resolveShow(artistId: string, input: SocialDropInput) {
    if (!input.eventId) return null;
    const event = await this.prisma.client.bandEvent.findFirst({
      where: { id: input.eventId, artistId },
      select: { title: true, startsAt: true, locationName: true }
    });
    try {
      return resolveRecordedSocialShow({ eventId: input.eventId, event });
    } catch (error) {
      const message = error instanceof Error ? error.message : SOCIAL_SHOW_NOT_RECORDED;
      throw new BadRequestException(message);
    }
  }

  private async ensureVoiceProfile(artistId: string, voiceKey: SocialVoiceKey) {
    const existing = await this.prisma.client.socialVoiceProfile.findUnique({ where: { artistId } });
    if (existing) return existing;
    const profile = voiceProfileFor(voiceKey);
    return this.prisma.client.socialVoiceProfile.create({
      data: {
        artistId,
        voiceKey,
        toneDescription: profile?.toneDescription ?? "Unknown band voice. Do not inherit Stalemate or Rad Dad.",
        toneRules: profile?.toneRules ?? [],
        bannedPhrases: profile?.bannedPhrases ?? [],
        bannedTopics: profile?.bannedTopics ?? [],
        emojiTolerance: profile?.emojiTolerance ?? 1,
        confirmedFacts: []
      }
    });
  }

  private async ensureMockAccounts(artistId: string, artistName: string, voiceKey: SocialVoiceKey) {
    for (const platform of PLATFORMS) {
      await this.prisma.client.socialAccount.upsert({
        where: { artistId_platform: { artistId, platform } },
        create: {
          artistId,
          platform,
          accountLabel: `${artistName} ${platform}`,
          externalAccountId: `mock-${platform}-${artistId.slice(-6)}`,
          voiceKey,
          status: "active",
          handle: artistName.toLowerCase().replace(/\s+/g, "")
        },
        update: {}
      });
    }
  }
}
