import type { SocialPlatform } from "@storyboard/shared";
import {
  META_GRAPH_BASE,
  TIKTOK_INBOX_INIT_URL,
  TIKTOK_PHOTO_INIT_URL,
  YOUTUBE_API_BASE,
  YOUTUBE_UPLOAD_URL,
  GOOGLE_TOKEN_URL,
  type SocialHttpFetch
} from "./social.constants";

export type SocialPublishInput = {
  platform: SocialPlatform;
  caption: string;
  title?: string | undefined;
  tags?: string[] | undefined;
  mediaUrl?: string | undefined;
  mediaKind?: "photo" | "video" | undefined;
  includeFacebookEvent?: boolean | undefined;
  facebookEventName?: string | undefined;
  facebookEventStartsAt?: string | undefined;
  facebookEventPlace?: string | undefined;
  account: {
    externalAccountId: string;
    label: string;
    accessToken?: string | undefined;
    refreshToken?: string | undefined;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    instagramBusinessId?: string | undefined;
  };
};

export type SocialPublishResult = {
  success: boolean;
  isDraftOnly: boolean;
  externalPostId?: string;
  externalPostUrl?: string;
  responseCode?: number;
  errorMessage?: string;
  durationMs: number;
  requestSummary: Record<string, unknown>;
};

export interface SocialPlatformAdapter {
  readonly platform: SocialPlatform;
  readonly mode: "mock" | "real";
  publish(input: SocialPublishInput): Promise<SocialPublishResult>;
  validateAccount(input: SocialPublishInput): Promise<boolean>;
}

const defaultFetch: SocialHttpFetch = async (input, init) => {
  const request: RequestInit = {};
  if (init?.method) request.method = init.method;
  if (init?.headers) request.headers = init.headers;
  if (init?.body !== undefined) request.body = init.body;
  const response = await fetch(input, request);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
    text: () => response.text(),
    headers: response.headers
  };
};

function readErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const record = data as Record<string, unknown>;
  const nested = record.error;
  if (nested && typeof nested === "object") {
    const message = (nested as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return fallback;
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

export class MockSocialPlatformAdapter implements SocialPlatformAdapter {
  constructor(
    readonly platform: SocialPlatform,
    readonly mode: "mock" | "real" = "mock"
  ) {}

  async publish(input: SocialPublishInput): Promise<SocialPublishResult> {
    const start = Date.now();
    const draftOnly = this.platform === "tiktok";
    const id = `mock_${this.platform}_${Date.now().toString(36)}`;
    return {
      success: true,
      isDraftOnly: draftOnly,
      externalPostId: id,
      externalPostUrl: draftOnly
        ? `https://www.tiktok.com/inbox?draft=${id}`
        : `https://mock.${this.platform}.example/posts/${id}`,
      responseCode: 200,
      durationMs: Date.now() - start,
      requestSummary: {
        platform: this.platform,
        account: input.account.externalAccountId,
        includeFacebookEvent: Boolean(input.includeFacebookEvent)
      }
    };
  }

  async validateAccount(input: SocialPublishInput): Promise<boolean> {
    return Boolean(input.account.externalAccountId);
  }
}

export class FacebookRealAdapter implements SocialPlatformAdapter {
  readonly platform = "facebook" as const;
  readonly mode = "real" as const;

  constructor(private readonly http: SocialHttpFetch = defaultFetch) {}

  async publish(input: SocialPublishInput): Promise<SocialPublishResult> {
    const start = Date.now();
    const token = input.account.accessToken;
    const pageId = input.account.externalAccountId;
    if (!token || !pageId) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage: "Facebook Page token or Page id is missing.",
        durationMs: Date.now() - start,
        requestSummary: { platform: "facebook" }
      };
    }

    try {
      if (input.includeFacebookEvent && input.facebookEventName && input.facebookEventStartsAt) {
        const event = await this.postJson(`${META_GRAPH_BASE}/${pageId}/events`, {
          name: input.facebookEventName,
          start_time: input.facebookEventStartsAt,
          description: input.caption,
          ...(input.facebookEventPlace ? { location: input.facebookEventPlace } : {}),
          access_token: token
        });
        if (!event.ok) {
          return this.fail(start, event.status, event.data, "Facebook Event create failed");
        }
        const eventId = typeof asRecord(event.data).id === "string" ? String(asRecord(event.data).id) : "";
        if (!eventId) {
          return {
            success: false,
            isDraftOnly: false,
            responseCode: event.status,
            errorMessage: "Facebook Event create returned no id. Nothing was marked posted.",
            durationMs: Date.now() - start,
            requestSummary: { platform: "facebook", kind: "event" }
          };
        }
      }

      const endpoint =
        input.mediaKind === "video"
          ? `${META_GRAPH_BASE}/${pageId}/videos`
          : input.mediaUrl
            ? `${META_GRAPH_BASE}/${pageId}/photos`
            : `${META_GRAPH_BASE}/${pageId}/feed`;
      const body: Record<string, unknown> = { access_token: token };
      if (input.mediaKind === "video") {
        body.file_url = input.mediaUrl;
        body.description = input.caption;
      } else if (input.mediaUrl) {
        body.url = input.mediaUrl;
        body.caption = input.caption;
      } else {
        body.message = input.caption;
      }
      const posted = await this.postJson(endpoint, body);
      if (!posted.ok) {
        return this.fail(start, posted.status, posted.data, "Facebook publish failed");
      }
      const id = typeof asRecord(posted.data).id === "string" ? String(asRecord(posted.data).id).trim() : "";
      if (!id) {
        return {
          success: false,
          isDraftOnly: false,
          responseCode: posted.status,
          errorMessage: "Facebook Graph API returned success without a post id. Nothing was marked posted.",
          durationMs: Date.now() - start,
          requestSummary: { platform: "facebook", endpoint }
        };
      }
      const shortId = id.includes("_") ? id.split("_")[1] : id;
      return {
        success: true,
        isDraftOnly: false,
        externalPostId: id,
        externalPostUrl: `https://www.facebook.com/permalink.php?story_fbid=${shortId}&id=${pageId}`,
        responseCode: posted.status,
        durationMs: Date.now() - start,
        requestSummary: { platform: "facebook", endpoint }
      };
    } catch (error) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage: error instanceof Error ? error.message : "Facebook publish failed",
        durationMs: Date.now() - start,
        requestSummary: { platform: "facebook" }
      };
    }
  }

  async validateAccount(input: SocialPublishInput): Promise<boolean> {
    const token = input.account.accessToken;
    const pageId = input.account.externalAccountId;
    if (!token || !pageId) return false;
    const response = await this.http(
      `${META_GRAPH_BASE}/${pageId}?fields=id,name&access_token=${encodeURIComponent(token)}`
    );
    if (!response.ok) return false;
    const data = asRecord(await response.json());
    return typeof data.id === "string";
  }

  private fail(
    start: number,
    status: number,
    data: unknown,
    fallback: string
  ): SocialPublishResult {
    return {
      success: false,
      isDraftOnly: false,
      responseCode: status,
      errorMessage: readErrorMessage(data, fallback),
      durationMs: Date.now() - start,
      requestSummary: { platform: "facebook" }
    };
  }

  private async postJson(url: string, body: Record<string, unknown>) {
    const response = await this.http(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { ok: response.ok, status: response.status, data: await response.json() };
  }
}

export class InstagramRealAdapter implements SocialPlatformAdapter {
  readonly platform = "instagram" as const;
  readonly mode = "real" as const;

  constructor(private readonly http: SocialHttpFetch = defaultFetch) {}

  async publish(input: SocialPublishInput): Promise<SocialPublishResult> {
    const start = Date.now();
    const token = input.account.accessToken;
    const igUserId = input.account.instagramBusinessId ?? input.account.externalAccountId;
    if (!token || !igUserId) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage: "Instagram business account id or token is missing.",
        durationMs: Date.now() - start,
        requestSummary: { platform: "instagram" }
      };
    }
    if (!input.mediaUrl?.startsWith("https://")) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage: "Instagram feed posts require a public https image or video URL. Nothing was published.",
        durationMs: Date.now() - start,
        requestSummary: { platform: "instagram" }
      };
    }

    try {
      const limit = await this.http(
        `${META_GRAPH_BASE}/${igUserId}/content_publishing_limit?fields=quota_usage,config&access_token=${encodeURIComponent(token)}`
      );
      if (limit.ok) {
        const rows = asRecord(await limit.json()).data;
        const first = Array.isArray(rows) ? asRecord(rows[0]) : {};
        const usage = typeof first.quota_usage === "number" ? first.quota_usage : 0;
        const config = asRecord(first.config);
        const total = typeof config.quota_total === "number" ? config.quota_total : 50;
        if (usage >= total) {
          return {
            success: false,
            isDraftOnly: false,
            errorMessage: `Instagram content_publishing_limit is exhausted (${usage}/${total} in the current 24h window).`,
            durationMs: Date.now() - start,
            requestSummary: { platform: "instagram", quotaUsage: usage, quotaTotal: total }
          };
        }
      }

      const isVideo = input.mediaKind === "video";
      const containerBody: Record<string, unknown> = {
        caption: input.caption,
        access_token: token
      };
      if (isVideo) {
        containerBody.media_type = "REELS";
        containerBody.video_url = input.mediaUrl;
        containerBody.share_to_feed = true;
      } else {
        containerBody.image_url = input.mediaUrl;
      }
      const container = await this.http(`${META_GRAPH_BASE}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(containerBody)
      });
      const containerData = asRecord(await container.json());
      if (!container.ok) {
        return {
          success: false,
          isDraftOnly: false,
          responseCode: container.status,
          errorMessage: readErrorMessage(containerData, "Instagram media container failed"),
          durationMs: Date.now() - start,
          requestSummary: { platform: "instagram", step: "container" }
        };
      }
      const creationId = typeof containerData.id === "string" ? containerData.id.trim() : "";
      if (!creationId) {
        return {
          success: false,
          isDraftOnly: false,
          responseCode: container.status,
          errorMessage: "Instagram media container was created without an id. Nothing was marked posted.",
          durationMs: Date.now() - start,
          requestSummary: { platform: "instagram", step: "container" }
        };
      }
      if (isVideo) {
        const ready = await this.waitForContainer(creationId, token);
        if (!ready.ok) {
          return {
            success: false,
            isDraftOnly: false,
            errorMessage: ready.error,
            durationMs: Date.now() - start,
            requestSummary: { platform: "instagram", step: "container_status" }
          };
        }
      }
      const publish = await this.http(`${META_GRAPH_BASE}/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: creationId, access_token: token })
      });
      const publishData = asRecord(await publish.json());
      if (!publish.ok) {
        return {
          success: false,
          isDraftOnly: false,
          responseCode: publish.status,
          errorMessage: readErrorMessage(publishData, "Instagram media_publish failed"),
          durationMs: Date.now() - start,
          requestSummary: { platform: "instagram", step: "publish" }
        };
      }
      const postId = typeof publishData.id === "string" ? publishData.id.trim() : "";
      if (!postId) {
        return {
          success: false,
          isDraftOnly: false,
          responseCode: publish.status,
          errorMessage: "Instagram publish returned success without a post id. Nothing was marked posted.",
          durationMs: Date.now() - start,
          requestSummary: { platform: "instagram", step: "publish" }
        };
      }
      return {
        success: true,
        isDraftOnly: false,
        externalPostId: postId,
        externalPostUrl: `https://www.instagram.com/p/${postId}/`,
        responseCode: publish.status,
        durationMs: Date.now() - start,
        requestSummary: { platform: "instagram", creationId }
      };
    } catch (error) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage: error instanceof Error ? error.message : "Instagram publish failed",
        durationMs: Date.now() - start,
        requestSummary: { platform: "instagram" }
      };
    }
  }

  async validateAccount(input: SocialPublishInput): Promise<boolean> {
    const token = input.account.accessToken;
    const igUserId = input.account.instagramBusinessId ?? input.account.externalAccountId;
    if (!token || !igUserId) return false;
    const response = await this.http(
      `${META_GRAPH_BASE}/${igUserId}?fields=id,username&access_token=${encodeURIComponent(token)}`
    );
    if (!response.ok) return false;
    const data = asRecord(await response.json());
    return typeof data.id === "string";
  }

  private async waitForContainer(
    creationId: string,
    token: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const response = await this.http(
      `${META_GRAPH_BASE}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`
    );
    if (!response.ok) {
      return { ok: false, error: "Instagram video container status could not be read. Nothing was marked posted." };
    }
    const status = asRecord(await response.json()).status_code;
    if (status === "FINISHED" || status === "PUBLISHED") return { ok: true };
    return {
      ok: false,
      error: `Instagram video container is not ready (${String(status ?? "unknown")}). Nothing was marked posted.`
    };
  }
}

export class YouTubeRealAdapter implements SocialPlatformAdapter {
  readonly platform = "youtube" as const;
  readonly mode = "real" as const;

  constructor(private readonly http: SocialHttpFetch = defaultFetch) {}

  async publish(input: SocialPublishInput): Promise<SocialPublishResult> {
    const start = Date.now();
    if (!input.mediaUrl?.startsWith("https://")) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage: "YouTube upload needs an https video URL. Nothing was uploaded.",
        durationMs: Date.now() - start,
        requestSummary: { platform: "youtube" }
      };
    }
    try {
      const accessToken = await this.accessToken(input);
      const init = await this.http(
        `${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/*"
          },
          body: JSON.stringify({
            snippet: {
              title: input.title?.trim() || input.caption.slice(0, 100),
              description: input.caption.slice(0, 5000),
              tags: input.tags ?? []
            },
            status: {
              privacyStatus: "private",
              selfDeclaredMadeForKids: false
            }
          })
        }
      );
      const location = init.headers.get("location") ?? init.headers.get("Location");
      if (!init.ok || !location) {
        return {
          success: false,
          isDraftOnly: false,
          responseCode: init.status,
          errorMessage: "YouTube resumable upload session did not return a Location. Nothing was marked posted.",
          durationMs: Date.now() - start,
          requestSummary: { platform: "youtube", step: "resumable_init" }
        };
      }
      const media = await this.http(input.mediaUrl);
      const bytes = await media.text();
      const uploaded = await this.http(location, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "video/*"
        },
        body: bytes
      });
      const data = asRecord(await uploaded.json());
      const id = typeof data.id === "string" ? data.id.trim() : "";
      if (!uploaded.ok || !id) {
        return {
          success: false,
          isDraftOnly: false,
          responseCode: uploaded.status,
          errorMessage: readErrorMessage(data, "YouTube videos.insert returned no video id. Nothing was marked posted."),
          durationMs: Date.now() - start,
          requestSummary: { platform: "youtube", step: "upload" }
        };
      }
      return {
        success: true,
        isDraftOnly: false,
        externalPostId: id,
        externalPostUrl: `https://www.youtube.com/watch?v=${id}`,
        responseCode: uploaded.status,
        durationMs: Date.now() - start,
        requestSummary: { platform: "youtube", privacyStatus: "private" }
      };
    } catch (error) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage: error instanceof Error ? error.message : "YouTube upload failed",
        durationMs: Date.now() - start,
        requestSummary: { platform: "youtube" }
      };
    }
  }

  async validateAccount(input: SocialPublishInput): Promise<boolean> {
    try {
      const accessToken = await this.accessToken(input);
      const response = await this.http(`${YOUTUBE_API_BASE}/channels?part=id,snippet&mine=true`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) return false;
      const items = asRecord(await response.json()).items;
      return Array.isArray(items) && items.length > 0;
    } catch {
      return false;
    }
  }

  private async accessToken(input: SocialPublishInput): Promise<string> {
    if (input.account.accessToken) return input.account.accessToken;
    if (!input.account.refreshToken || !input.account.clientId || !input.account.clientSecret) {
      throw new Error("YouTube OAuth refresh token is missing.");
    }
    const response = await this.http(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.account.clientId,
        client_secret: input.account.clientSecret,
        refresh_token: input.account.refreshToken,
        grant_type: "refresh_token"
      }).toString()
    });
    const data = asRecord(await response.json());
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(readErrorMessage(data, "YouTube OAuth token refresh failed"));
    }
    return data.access_token;
  }
}

export class TikTokRealAdapter implements SocialPlatformAdapter {
  readonly platform = "tiktok" as const;
  readonly mode = "real" as const;

  constructor(private readonly http: SocialHttpFetch = defaultFetch) {}

  async publish(input: SocialPublishInput): Promise<SocialPublishResult> {
    const start = Date.now();
    const token = input.account.accessToken;
    if (!token) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage: "TikTok access token is missing.",
        durationMs: Date.now() - start,
        requestSummary: { platform: "tiktok" }
      };
    }
    if (!input.mediaUrl?.startsWith("https://")) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage: "TikTok inbox draft needs an https media URL from a verified domain.",
        durationMs: Date.now() - start,
        requestSummary: { platform: "tiktok" }
      };
    }
    try {
      const isPhoto = input.mediaKind === "photo";
      const url = isPhoto ? TIKTOK_PHOTO_INIT_URL : TIKTOK_INBOX_INIT_URL;
      const body = isPhoto
        ? {
            post_info: { title: input.title ?? input.caption.slice(0, 90), description: input.caption },
            source_info: {
              source: "PULL_FROM_URL",
              photo_cover_index: 0,
              photo_images: [input.mediaUrl]
            },
            post_mode: "MEDIA_UPLOAD",
            media_type: "PHOTO"
          }
        : {
            source_info: { source: "PULL_FROM_URL", video_url: input.mediaUrl }
          };
      const response = await this.http(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const payload = asRecord(await response.json());
      const data = asRecord(payload.data);
      const error = asRecord(payload.error);
      const publishId = typeof data.publish_id === "string" ? data.publish_id.trim() : "";
      if (!response.ok || error.code && error.code !== "ok" || !publishId) {
        return {
          success: false,
          isDraftOnly: true,
          responseCode: response.status,
          errorMessage:
            typeof error.message === "string" && error.message
              ? error.message
              : "TikTok inbox init returned no publish_id. Nothing was marked posted.",
          durationMs: Date.now() - start,
          requestSummary: { platform: "tiktok", mode: "inbox_draft" }
        };
      }
      return {
        success: true,
        isDraftOnly: true,
        externalPostId: publishId,
        externalPostUrl: "https://www.tiktok.com/",
        responseCode: response.status,
        durationMs: Date.now() - start,
        requestSummary: { platform: "tiktok", mode: "inbox_draft" }
      };
    } catch (error) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage: error instanceof Error ? error.message : "TikTok inbox draft failed",
        durationMs: Date.now() - start,
        requestSummary: { platform: "tiktok" }
      };
    }
  }

  async validateAccount(input: SocialPublishInput): Promise<boolean> {
    return Boolean(input.account.accessToken && input.account.externalAccountId);
  }
}

export type SocialAdapterRegistry = Record<SocialPlatform, SocialPlatformAdapter>;

export function mockSocialAdapters(): SocialAdapterRegistry {
  return {
    facebook: new MockSocialPlatformAdapter("facebook"),
    instagram: new MockSocialPlatformAdapter("instagram"),
    youtube: new MockSocialPlatformAdapter("youtube"),
    tiktok: new MockSocialPlatformAdapter("tiktok")
  };
}

export function buildSocialAdapterRegistry(input: {
  mode: "mock" | "real";
  http?: SocialHttpFetch;
}): SocialAdapterRegistry {
  if (input.mode !== "real") return mockSocialAdapters();
  const http = input.http ?? defaultFetch;
  return {
    facebook: new FacebookRealAdapter(http),
    instagram: new InstagramRealAdapter(http),
    youtube: new YouTubeRealAdapter(http),
    tiktok: new TikTokRealAdapter(http)
  };
}
