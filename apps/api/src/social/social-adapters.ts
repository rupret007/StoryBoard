import { SOCIAL_MEDIA_CHUNK_SIZE, tiktokFileUploadPlan, type SocialPlatform } from "@storyboard/shared";
import { buildMultipartBody, readFileSlice } from "./social-media-bytes";
import {
  META_GRAPH_BASE,
  META_GRAPH_VIDEO_BASE,
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
  mediaPath?: string | undefined;
  mediaByteSize?: number | undefined;
  mediaMimeType?: string | undefined;
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

      if (input.mediaKind === "video" && input.mediaPath && input.mediaByteSize) {
        return this.publishLocalVideo(input, token, pageId, start);
      }
      if (input.mediaKind !== "video" && input.mediaPath && input.mediaByteSize) {
        return this.publishLocalPhoto(input, token, pageId, start);
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
      return this.requireFacebookId(posted.status, posted.data, start, endpoint, pageId);
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

  private async publishLocalVideo(
    input: SocialPublishInput,
    token: string,
    pageId: string,
    start: number
  ): Promise<SocialPublishResult> {
    const started = await this.postForm(`${META_GRAPH_VIDEO_BASE}/${pageId}/videos`, {
      upload_phase: "start",
      file_size: String(input.mediaByteSize),
      access_token: token
    });
    if (!started.ok) return this.fail(start, started.status, started.data, "Facebook resumable start failed");
    const session = asRecord(started.data);
    const uploadSessionId = typeof session.upload_session_id === "string" ? session.upload_session_id : "";
    if (!uploadSessionId) {
      return {
        success: false,
        isDraftOnly: false,
        errorMessage: "Facebook resumable start returned no upload_session_id. Nothing was marked posted.",
        durationMs: Date.now() - start,
        requestSummary: { platform: "facebook", step: "resumable_start" }
      };
    }
    let offset = typeof session.start_offset === "string" ? Number(session.start_offset) : 0;
    let end = typeof session.end_offset === "string" ? Number(session.end_offset) : input.mediaByteSize ?? 0;
    while (offset < end) {
      const chunk = await readFileSlice(input.mediaPath!, offset, end - offset);
      const part = buildMultipartBody(
        {
          upload_phase: "transfer",
          upload_session_id: uploadSessionId,
          start_offset: String(offset),
          access_token: token
        },
        {
          fieldName: "video_file_chunk",
          filename: "clip.mp4",
          mimeType: input.mediaMimeType ?? "video/mp4",
          bytes: chunk
        }
      );
      const transferred = await this.http(`${META_GRAPH_VIDEO_BASE}/${pageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": part.contentType },
        body: part.body
      });
      const data = asRecord(await transferred.json());
      if (!transferred.ok) return this.fail(start, transferred.status, data, "Facebook resumable transfer failed");
      offset = typeof data.start_offset === "string" ? Number(data.start_offset) : end;
      end = typeof data.end_offset === "string" ? Number(data.end_offset) : end;
    }
    const finished = await this.postForm(`${META_GRAPH_VIDEO_BASE}/${pageId}/videos`, {
      upload_phase: "finish",
      upload_session_id: uploadSessionId,
      description: input.caption,
      access_token: token
    });
    if (!finished.ok) return this.fail(start, finished.status, finished.data, "Facebook resumable finish failed");
    return this.requireFacebookId(
      finished.status,
      finished.data,
      start,
      `${META_GRAPH_VIDEO_BASE}/${pageId}/videos`,
      pageId
    );
  }

  private async publishLocalPhoto(
    input: SocialPublishInput,
    token: string,
    pageId: string,
    start: number
  ): Promise<SocialPublishResult> {
    const bytes = await readFileSlice(input.mediaPath!, 0, input.mediaByteSize ?? 0);
    const part = buildMultipartBody(
      { caption: input.caption, access_token: token },
      {
        fieldName: "source",
        filename: "photo.jpg",
        mimeType: input.mediaMimeType ?? "image/jpeg",
        bytes
      }
    );
    const posted = await this.http(`${META_GRAPH_BASE}/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": part.contentType },
      body: part.body
    });
    const data = await posted.json();
    if (!posted.ok) return this.fail(start, posted.status, data, "Facebook photo upload failed");
    return this.requireFacebookId(
      posted.status,
      data,
      start,
      `${META_GRAPH_BASE}/${pageId}/photos`,
      pageId
    );
  }

  private requireFacebookId(
    status: number,
    data: unknown,
    start: number,
    endpoint: string,
    pageId: string
  ): SocialPublishResult {
    const id = typeof asRecord(data).id === "string" ? String(asRecord(data).id).trim() : "";
    if (!id) {
      return {
        success: false,
        isDraftOnly: false,
        responseCode: status,
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
      responseCode: status,
      durationMs: Date.now() - start,
      requestSummary: { platform: "facebook", endpoint }
    };
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

  private async postForm(url: string, fields: Record<string, string>) {
    const response = await this.http(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString()
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
    const canHostUrl = Boolean(input.mediaUrl?.startsWith("https://"));
    const canResumable = Boolean(input.mediaPath && input.mediaByteSize);
    if (!canHostUrl && !canResumable) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage: "Instagram needs a local file (resumable) or a public https URL. Nothing was published.",
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
      const useResumable = Boolean(isVideo && input.mediaPath && input.mediaByteSize);
      if (!isVideo && !canHostUrl) {
        return {
          success: false,
          isDraftOnly: false,
          errorMessage:
            "Instagram photos need a public https hosted URL (set API_URL to https). Local video uses resumable upload instead. Nothing was published.",
          durationMs: Date.now() - start,
          requestSummary: { platform: "instagram", step: "photo_hosted_url" }
        };
      }
      const containerBody: Record<string, unknown> = {
        caption: input.caption,
        access_token: token
      };
      if (isVideo) {
        containerBody.media_type = "REELS";
        containerBody.share_to_feed = true;
        if (useResumable) containerBody.upload_type = "resumable";
        else containerBody.video_url = input.mediaUrl;
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
      if (useResumable) {
        const uri = typeof containerData.uri === "string" ? containerData.uri : "";
        if (!uri) {
          return {
            success: false,
            isDraftOnly: false,
            errorMessage: "Instagram resumable container did not return an upload uri. Nothing was marked posted.",
            durationMs: Date.now() - start,
            requestSummary: { platform: "instagram", step: "resumable_uri" }
          };
        }
        const total = input.mediaByteSize ?? 0;
        let offset = 0;
        while (offset < total) {
          const length = Math.min(SOCIAL_MEDIA_CHUNK_SIZE, total - offset);
          const uploaded = await this.http(uri, {
            method: "POST",
            headers: {
              Authorization: `OAuth ${token}`,
              offset: String(offset),
              file_size: String(total)
            },
            body: await readFileSlice(input.mediaPath!, offset, length)
          });
          if (!uploaded.ok) {
            return {
              success: false,
              isDraftOnly: false,
              responseCode: uploaded.status,
              errorMessage: "Instagram resumable binary upload failed. Nothing was marked posted.",
              durationMs: Date.now() - start,
              requestSummary: { platform: "instagram", step: "resumable_put", offset }
            };
          }
          offset += length;
        }
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
    if (!input.mediaPath && !input.mediaUrl?.startsWith("https://")) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage: "YouTube upload needs a local video file or an https video URL. Nothing was uploaded.",
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
            "X-Upload-Content-Type": input.mediaMimeType ?? "video/*",
            ...(input.mediaByteSize ? { "X-Upload-Content-Length": String(input.mediaByteSize) } : {})
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
      const uploaded = await this.putYouTubeBytes(location, accessToken, input);
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

  private async putYouTubeBytes(
    location: string,
    accessToken: string,
    input: SocialPublishInput
  ) {
    if (input.mediaPath && input.mediaByteSize) {
      let offset = 0;
      let last: Awaited<ReturnType<SocialHttpFetch>> | null = null;
      while (offset < input.mediaByteSize) {
        const length = Math.min(SOCIAL_MEDIA_CHUNK_SIZE, input.mediaByteSize - offset);
        const chunk = await readFileSlice(input.mediaPath, offset, length);
        last = await this.http(location, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": input.mediaMimeType ?? "video/*",
            "Content-Range": `bytes ${offset}-${offset + length - 1}/${input.mediaByteSize}`
          },
          body: chunk
        });
        if (!last.ok && last.status !== 308) return last;
        offset += length;
      }
      if (!last) {
        return {
          ok: false,
          status: 400,
          json: async () => ({}),
          text: async () => "",
          headers: { get: () => null }
        };
      }
      return last;
    }
    const media = await this.http(input.mediaUrl ?? "");
    const bytes = new Uint8Array(Buffer.from(await media.text()));
    return this.http(location, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": input.mediaMimeType ?? "video/*"
      },
      body: bytes
    });
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
    if (!input.mediaPath && !input.mediaUrl?.startsWith("https://")) {
      return {
        success: false,
        isDraftOnly: true,
        errorMessage: "TikTok inbox draft needs a local file (FILE_UPLOAD) or an https media URL.",
        durationMs: Date.now() - start,
        requestSummary: { platform: "tiktok" }
      };
    }
    try {
      const isPhoto = input.mediaKind === "photo";
      const fileUpload = Boolean(input.mediaPath && input.mediaByteSize);
      const url = isPhoto ? TIKTOK_PHOTO_INIT_URL : TIKTOK_INBOX_INIT_URL;
      const plan = fileUpload ? tiktokFileUploadPlan(input.mediaByteSize ?? 0) : null;
      const body = isPhoto
        ? {
            post_info: { title: input.title ?? input.caption.slice(0, 90), description: input.caption },
            source_info: fileUpload
              ? {
                  source: "FILE_UPLOAD",
                  photo_cover_index: 0,
                  photo_images: []
                }
              : {
                  source: "PULL_FROM_URL",
                  photo_cover_index: 0,
                  photo_images: [input.mediaUrl]
                },
            post_mode: "MEDIA_UPLOAD",
            media_type: "PHOTO"
          }
        : fileUpload && plan
          ? {
              source_info: {
                source: "FILE_UPLOAD",
                video_size: plan.videoSize,
                chunk_size: plan.chunkSize,
                total_chunk_count: plan.totalChunkCount
              }
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
      const uploadUrl = typeof data.upload_url === "string" ? data.upload_url : "";
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
      if (fileUpload && plan) {
        if (!uploadUrl) {
          return {
            success: false,
            isDraftOnly: true,
            errorMessage: "TikTok FILE_UPLOAD init returned no upload_url. Nothing was marked posted.",
            durationMs: Date.now() - start,
            requestSummary: { platform: "tiktok", mode: "file_upload" }
          };
        }
        for (const chunk of plan.chunks) {
          const bytes = await readFileSlice(input.mediaPath!, chunk.start, chunk.length);
          const put = await this.http(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": input.mediaMimeType ?? "video/mp4",
              "Content-Length": String(chunk.length),
              "Content-Range": `bytes ${chunk.start}-${chunk.endExclusive - 1}/${plan.videoSize}`
            },
            body: bytes
          });
          if (!put.ok) {
            return {
              success: false,
              isDraftOnly: true,
              responseCode: put.status,
              errorMessage: "TikTok FILE_UPLOAD chunk failed. Nothing was marked posted.",
              durationMs: Date.now() - start,
              requestSummary: { platform: "tiktok", mode: "file_upload", offset: chunk.start }
            };
          }
        }
      }
      return {
        success: true,
        isDraftOnly: true,
        externalPostId: publishId,
        externalPostUrl: "https://www.tiktok.com/",
        responseCode: response.status,
        durationMs: Date.now() - start,
        requestSummary: {
          platform: "tiktok",
          mode: fileUpload ? "file_upload_inbox_draft" : "inbox_draft"
        }
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
