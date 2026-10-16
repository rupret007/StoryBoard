import { createHash } from "node:crypto";

type SocialReviewSource = {
  id: string;
  voiceKey: string;
  mediaAsset: { id: string; publicUrl: string; kind: string; storageKey?: string | null } | null;
  targets: Array<{
    id: string; platform: string; enabled: boolean; caption: string; title: string | null;
    tags: string[]; includeFacebookEvent: boolean; facebookEventName: string | null;
    facebookEventStartsAt?: Date | null; facebookEventPlace?: string | null;
    account?: { externalAccountId: string; accountLabel: string; voiceKey: string; status?: string } | null;
  }>;
};

/** Binds the owner's displayed review to the exact original draft/destinations/mode. */
export function socialReviewFingerprint(post: SocialReviewSource, adapterMode: "mock" | "real") {
  return createHash("sha256").update(JSON.stringify({
    version: 1, postId: post.id, voiceKey: post.voiceKey, adapterMode,
    media: post.mediaAsset ? { id: post.mediaAsset.id, publicUrl: post.mediaAsset.publicUrl,
      kind: post.mediaAsset.kind, storageKey: post.mediaAsset.storageKey ?? null } : null,
    targets: [...post.targets].sort((a, b) => a.id.localeCompare(b.id)).map((target) => ({
      id: target.id, platform: target.platform, enabled: target.enabled, caption: target.caption,
      title: target.title, tags: target.tags, includeFacebookEvent: target.includeFacebookEvent,
      facebookEventName: target.facebookEventName,
      facebookEventStartsAt: target.facebookEventStartsAt?.toISOString() ?? null,
      facebookEventPlace: target.facebookEventPlace ?? null,
      account: target.account ? { externalAccountId: target.account.externalAccountId,
        accountLabel: target.account.accountLabel, voiceKey: target.account.voiceKey,
        status: target.account.status ?? null } : null
    }))
  })).digest("hex");
}

export function recordedSocialReviewFingerprint(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).reviewFingerprint;
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
