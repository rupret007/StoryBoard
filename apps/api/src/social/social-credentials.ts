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
};

export type SocialCredentialEnv = {
  SOCIAL_ADAPTER?: string | undefined;
  FACEBOOK_PAGE_ACCESS_TOKEN?: string | undefined;
  FACEBOOK_PAGE_ID?: string | undefined;
  INSTAGRAM_BUSINESS_ACCOUNT_ID?: string | undefined;
  YOUTUBE_CLIENT_ID?: string | undefined;
  YOUTUBE_CLIENT_SECRET?: string | undefined;
  YOUTUBE_REFRESH_TOKEN?: string | undefined;
  TIKTOK_CLIENT_KEY?: string | undefined;
  TIKTOK_CLIENT_SECRET?: string | undefined;
  TIKTOK_ACCESS_TOKEN?: string | undefined;
  TIKTOK_OPEN_ID?: string | undefined;
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

export function envFallbackAccount(
  platform: SocialPlatform,
  env: SocialCredentialEnv
): {
  externalAccountId: string;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  instagramBusinessId?: string | undefined;
} | null {
  if (platform === "facebook" && cred(env.FACEBOOK_PAGE_ACCESS_TOKEN) && cred(env.FACEBOOK_PAGE_ID)) {
    return {
      externalAccountId: cred(env.FACEBOOK_PAGE_ID)!,
      accessToken: cred(env.FACEBOOK_PAGE_ACCESS_TOKEN)
    };
  }
  if (platform === "instagram" && cred(env.FACEBOOK_PAGE_ACCESS_TOKEN) && cred(env.INSTAGRAM_BUSINESS_ACCOUNT_ID)) {
    return {
      externalAccountId: cred(env.INSTAGRAM_BUSINESS_ACCOUNT_ID)!,
      accessToken: cred(env.FACEBOOK_PAGE_ACCESS_TOKEN),
      instagramBusinessId: cred(env.INSTAGRAM_BUSINESS_ACCOUNT_ID)
    };
  }
  if (platform === "youtube" && cred(env.YOUTUBE_REFRESH_TOKEN)) {
    return {
      externalAccountId: "youtube-env",
      refreshToken: cred(env.YOUTUBE_REFRESH_TOKEN),
      clientId: cred(env.YOUTUBE_CLIENT_ID) ?? cred(env.GOOGLE_CLIENT_ID),
      clientSecret: cred(env.YOUTUBE_CLIENT_SECRET) ?? cred(env.GOOGLE_CLIENT_SECRET)
    };
  }
  if (platform === "tiktok" && cred(env.TIKTOK_ACCESS_TOKEN) && cred(env.TIKTOK_OPEN_ID)) {
    return {
      externalAccountId: cred(env.TIKTOK_OPEN_ID)!,
      accessToken: cred(env.TIKTOK_ACCESS_TOKEN)
    };
  }
  return null;
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
