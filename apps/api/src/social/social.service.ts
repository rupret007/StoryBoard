import { BadRequestException, Injectable } from "@nestjs/common";
import {
  draftPlatformCaptions,
  resolveSocialVoice,
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
import { SOCIAL_POST_ACTION_TYPE } from "./social.constants";
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
    private readonly execution: SocialExecutionService
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
      posts: posts.map((post) => this.execution.presentPost(post))
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
    const mediaKind = input.mediaKind ?? (input.mediaUrl?.match(/\.(mp4|mov|webm)$/i) ? "video" : "photo");
    const show = await this.resolveShow(artistId, input);
    const drafts = draftPlatformCaptions({
      voice: voiceKey,
      note: input.note,
      mediaKind,
      show
    }).filter((draft) => (input.platforms ?? PLATFORMS).includes(draft.platform));
    const accounts = await this.prisma.client.socialAccount.findMany({ where: { artistId } });

    const created = await this.prisma.client.$transaction(async (tx) => {
      const mediaAsset = input.mediaUrl
        ? await tx.socialMediaAsset.create({
            data: {
              artistId,
              filename: input.mediaUrl.split("/").pop() ?? "media",
              mimeType: mediaKind === "video" ? "video/mp4" : "image/jpeg",
              publicUrl: input.mediaUrl,
              kind: mediaKind
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
            mediaKind,
            includeFacebookEvent: draft.includeFacebookEvent,
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
      metadata: { voiceKey, platforms: drafts.map((row) => row.platform) }
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
    const post = await this.execution.requirePost(artistId, input.postId);
    if (input.targets) {
      for (const edit of input.targets) {
        await this.prisma.client.socialPostTarget.updateMany({
          where: { id: edit.id, postId: post.id },
          data: {
            enabled: edit.enabled,
            caption: edit.caption,
            title: edit.title ?? null,
            tags: edit.tags ?? [],
            includeFacebookEvent: edit.includeFacebookEvent ?? false
          }
        });
      }
    }
    const current = await this.execution.requirePost(artistId, post.id);
    if (!current.approvalRequestId) {
      throw new BadRequestException("This drop has no approval record.");
    }
    const approval = await this.prisma.client.approvalRequest.findUniqueOrThrow({
      where: { id: current.approvalRequestId }
    });
    await this.prisma.client.approvalRequest.update({
      where: { id: approval.id },
      data: { payload: this.payloadFromPost(current, current.voiceKey) as object }
    });
    if (approval.status === ApprovalStatus.pending || approval.status === ApprovalStatus.proposed) {
      await this.approvals.approve(artistId, approval.id, actor.label, actor.operatorId);
    }
    await this.approvals.executeApproved(artistId, approval.id, actor.label, {
      actorOperatorId: actor.operatorId
    });
    return this.execution.getPost(artistId, post.id);
  }

  private payloadFromPost(
    post: {
      id: string;
      voiceKey: SocialVoiceKey;
      mediaAsset: { publicUrl: string; kind: "photo" | "video" } | null;
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
      voiceKey,
      mediaUrl: post.mediaAsset?.publicUrl,
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
    if (input.show) return input.show;
    if (!input.eventId) return null;
    const event = await this.prisma.client.bandEvent.findFirst({
      where: { id: input.eventId, artistId }
    });
    if (!event) return null;
    return {
      name: event.title,
      startsAt: event.startsAt?.toISOString() ?? undefined,
      place: event.locationName ?? undefined
    };
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
        update: { voiceKey, accountLabel: `${artistName} ${platform}` }
      });
    }
  }
}
