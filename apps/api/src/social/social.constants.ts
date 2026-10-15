/** Current Graph version used for Page photos, videos, Events, and IG publish. */
export const META_GRAPH_VERSION = "v23.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export const YOUTUBE_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

export const TIKTOK_INBOX_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/";
export const TIKTOK_PHOTO_INIT_URL = "https://open.tiktokapis.com/v2/post/publish/content/init/";
export const TIKTOK_CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/";
export const TIKTOK_OAUTH_AUTHORIZE = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_OAUTH_TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";

export const META_CONNECTION_PROVIDER = "meta" as const;
export const YOUTUBE_PUBLISH_CONNECTION_PROVIDER = "youtube_publish" as const;
export const TIKTOK_CONNECTION_PROVIDER = "tiktok" as const;

export const SOCIAL_POST_ACTION_TYPE = "social_post_batch" as const;

export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_engagement",
  "pages_read_user_content",
  "pages_messaging",
  "read_insights",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "instagram_manage_insights"
].join(",");

export const TIKTOK_OAUTH_SCOPES = ["user.info.basic", "video.upload"].join(",");

export type SocialHttpFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: { get(name: string): string | null };
}>;
