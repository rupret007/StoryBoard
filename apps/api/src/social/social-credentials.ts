import type { SocialPlatform } from "@storyboard/shared";
import {
  META_CONNECTION_PROVIDER,
  TIKTOK_CONNECTION_PROVIDER,
  YOUTUBE_PUBLISH_CONNECTION_PROVIDER
} from "./social.constants";

export type SocialStoredSecrets = {
  v: 1;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  expiresAt?: string | undefined;
  pageAccessToken?: string | undefined;
  pageId?: string | undefined;
  instagramBusinessId?: string | undefined;
  openId?: string | undefined;
  channelId?: string | undefined;
};

/** Credentials must name the same provider account the owner reviewed. */
export function boundSocialSecrets(
  platform: SocialPlatform,
  externalAccountId: string | undefined,
  secrets: SocialStoredSecrets | null
): SocialStoredSecrets | null {
  if (!secrets || !externalAccountId?.trim()) return null;
  const actualId = platform === "facebook" ? secrets.pageId
    : platform === "instagram" ? secrets.instagramBusinessId
      : platform === "youtube" ? secrets.channelId : secrets.openId;
  if (!actualId || actualId !== externalAccountId) return null;
  if (platform === "facebook" || platform === "instagram") {
    if (!cred(secrets.pageAccessToken)) return null;
    return { ...secrets, accessToken: secrets.pageAccessToken };
  }
  if (!cred(secrets.accessToken) && !(platform === "youtube" && cred(secrets.refreshToken))) return null;
  return secrets;
}

export type SocialCredentialEnv = {
  SOCIAL_ADAPTER?: string | undefined;
  YOUTUBE_CLIENT_ID?: string | undefined;
  YOUTUBE_CLIENT_SECRET?: string | undefined;
  TIKTOK_CLIENT_KEY?: string | undefined;
  TIKTOK_CLIENT_SECRET?: string | undefined;
  META_APP_ID?: string | undefined;
  META_APP_SECRET?: string | undefined;
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
};

function cred(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "replace-me") return undefined;
  return trimmed;
}

export function socialAdapterMode(env: SocialCredentialEnv): "mock" | "real" {
  return env.SOCIAL_ADAPTER === "real" ? "real" : "mock";
}

export function connectionProviderFor(platform: SocialPlatform): string {
  if (platform === "youtube") return YOUTUBE_PUBLISH_CONNECTION_PROVIDER;
  if (platform === "tiktok") return TIKTOK_CONNECTION_PROVIDER;
  return META_CONNECTION_PROVIDER;
}

export function connectReadiness(env: SocialCredentialEnv): {
  meta: boolean;
  youtube_publish: boolean;
  tiktok: boolean;
} {
  return {
    meta: Boolean(cred(env.META_APP_ID) && cred(env.META_APP_SECRET)),
    youtube_publish: Boolean(
      (cred(env.YOUTUBE_CLIENT_ID) || cred(env.GOOGLE_CLIENT_ID)) &&
        (cred(env.YOUTUBE_CLIENT_SECRET) || cred(env.GOOGLE_CLIENT_SECRET))
    ),
    tiktok: Boolean(cred(env.TIKTOK_CLIENT_KEY) && cred(env.TIKTOK_CLIENT_SECRET))
  };
}
