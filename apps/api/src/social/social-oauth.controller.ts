import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import { SecretBox } from "../integrations/crypto/secret-box";
import { verifyOAuthState } from "../integrations/oauth-state";
import { PrismaService } from "../prisma/prisma.service";
import {
  META_CONNECTION_PROVIDER,
  TIKTOK_CONNECTION_PROVIDER,
  TIKTOK_OAUTH_TOKEN,
  YOUTUBE_PUBLISH_CONNECTION_PROVIDER,
  GOOGLE_TOKEN_URL
} from "./social.constants";

const STATE_TTL_MS = 15 * 60 * 1000;

@Controller("auth")
export class SocialOAuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly secretBox: SecretBox,
    private readonly auth: AuthService,
    private readonly membership: MembershipService,
    private readonly roles: RolePolicyService
  ) {}

  @Get("meta/callback")
  async metaCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply
  ) {
    return this.finish(
      reply,
      req,
      code,
      state,
      oauthError,
      META_CONNECTION_PROVIDER,
      async (tokenCode, redirectUri) => {
        const appId = this.config.get<string>("META_APP_ID")?.trim();
        const secret = this.config.get<string>("META_APP_SECRET")?.trim();
        if (!appId || !secret) throw new Error("meta_not_configured");
        const url = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
        url.searchParams.set("client_id", appId);
        url.searchParams.set("client_secret", secret);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("code", tokenCode);
        const shortLived = await fetch(url);
        const shortData = (await shortLived.json()) as Record<string, unknown>;
        if (!shortLived.ok || typeof shortData.access_token !== "string") {
          throw new Error("meta_token_exchange_failed");
        }
        const longUrl = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
        longUrl.searchParams.set("grant_type", "fb_exchange_token");
        longUrl.searchParams.set("client_id", appId);
        longUrl.searchParams.set("client_secret", secret);
        longUrl.searchParams.set("fb_exchange_token", shortData.access_token);
        const longLived = await fetch(longUrl);
        const longData = (await longLived.json()) as Record<string, unknown>;
        const userToken = typeof longData.access_token === "string" ? longData.access_token : shortData.access_token;
        const pages = await fetch(
          `https://graph.facebook.com/v23.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userToken)}`
        );
        const pageData = (await pages.json()) as { data?: Array<Record<string, unknown>> };
        const page = pageData.data?.[0];
        const ig = page?.instagram_business_account as { id?: string } | undefined;
        return {
          secrets: {
            v: 1 as const,
            accessToken: userToken,
            pageAccessToken: typeof page?.access_token === "string" ? page.access_token : userToken,
            pageId: typeof page?.id === "string" ? page.id : undefined,
            instagramBusinessId: ig?.id
          },
          accountLabel: typeof page?.name === "string" ? page.name : "Facebook Page",
          scopes: String(shortData.scope ?? "").split(",").filter(Boolean)
        };
      },
      `${this.config.getOrThrow<string>("API_URL") ?? "http://localhost:4000"}/auth/meta/callback`
    );
  }

  @Get("youtube-publish/callback")
  async youtubeCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply
  ) {
    const apiUrl = this.config.get<string>("API_URL") ?? "http://localhost:4000";
    const redirect = this.config.get<string>("YOUTUBE_PUBLISH_REDIRECT_URI")?.trim()
      ?? `${apiUrl}/auth/youtube-publish/callback`;
    return this.finish(
      reply,
      req,
      code,
      state,
      oauthError,
      YOUTUBE_PUBLISH_CONNECTION_PROVIDER,
      async (tokenCode) => {
        const clientId = (
          this.config.get<string>("YOUTUBE_CLIENT_ID") ?? this.config.get<string>("GOOGLE_CLIENT_ID")
        )?.trim();
        const clientSecret = (
          this.config.get<string>("YOUTUBE_CLIENT_SECRET") ?? this.config.get<string>("GOOGLE_CLIENT_SECRET")
        )?.trim();
        if (!clientId || !clientSecret) throw new Error("youtube_not_configured");
        const response = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: tokenCode,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirect,
            grant_type: "authorization_code"
          })
        });
        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok || typeof data.refresh_token !== "string") {
          throw new Error("youtube_token_exchange_failed");
        }
        return {
          secrets: {
            v: 1 as const,
            refreshToken: data.refresh_token,
            accessToken: typeof data.access_token === "string" ? data.access_token : undefined
          },
          accountLabel: "YouTube channel",
          scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : []
        };
      },
      redirect
    );
  }

  @Get("tiktok/callback")
  async tiktokCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply
  ) {
    const apiUrl = this.config.get<string>("API_URL") ?? "http://localhost:4000";
    const redirect = `${apiUrl}/auth/tiktok/callback`;
    return this.finish(
      reply,
      req,
      code,
      state,
      oauthError,
      TIKTOK_CONNECTION_PROVIDER,
      async (tokenCode) => {
        const key = this.config.get<string>("TIKTOK_CLIENT_KEY")?.trim();
        const secret = this.config.get<string>("TIKTOK_CLIENT_SECRET")?.trim();
        if (!key || !secret) throw new Error("tiktok_not_configured");
        const response = await fetch(TIKTOK_OAUTH_TOKEN, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: key,
            client_secret: secret,
            code: tokenCode,
            grant_type: "authorization_code",
            redirect_uri: redirect
          })
        });
        const payload = (await response.json()) as { data?: Record<string, unknown>; error?: string };
        const data = payload.data ?? {};
        if (!response.ok || typeof data.access_token !== "string") {
          throw new Error("tiktok_token_exchange_failed");
        }
        return {
          secrets: {
            v: 1 as const,
            accessToken: data.access_token,
            refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
            openId: typeof data.open_id === "string" ? data.open_id : undefined
          },
          accountLabel: "TikTok",
          scopes: typeof data.scope === "string" ? data.scope.split(",").filter(Boolean) : []
        };
      },
      redirect
    );
  }

  private async finish(
    reply: FastifyReply,
    req: FastifyRequest,
    code: string | undefined,
    state: string | undefined,
    oauthError: string | undefined,
    provider: string,
    exchange: (code: string, redirectUri: string) => Promise<{
      secrets: Record<string, unknown>;
      accountLabel: string;
      scopes: string[];
    }>,
    redirectUri: string
  ) {
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    const fail = (reason: string) =>
      reply.redirect(`${webUrl}/social?connectError=${encodeURIComponent(reason)}`);
    if (oauthError) return fail(oauthError);
    if (!code?.trim() || !state?.trim()) return fail("missing_code_or_state");
    if (!this.secretBox.configured()) return fail("encryption_not_configured");
    const st = verifyOAuthState(state, this.config.getOrThrow<string>("SESSION_SECRET"), STATE_TTL_MS);
    if (!st) return fail("invalid_state");
    const operator = await this.auth.operatorFromRequestCookies(req);
    if (!operator || operator.id !== st.operatorId) return fail("session_mismatch");
    try {
      await this.membership.assertMembership(operator.id, st.artistId);
      await this.roles.assertOwner(operator.id, st.artistId);
      const exchanged = await exchange(code.trim(), redirectUri);
      const blob = this.secretBox.encryptJson(exchanged.secrets);
      await this.prisma.client.integrationConnection.upsert({
        where: { artistId_provider: { artistId: st.artistId, provider } },
        create: {
          artistId: st.artistId,
          provider,
          status: "active",
          accountLabel: exchanged.accountLabel,
          scopes: exchanged.scopes,
          encryptedSecrets: { blob }
        },
        update: {
          status: "active",
          accountLabel: exchanged.accountLabel,
          scopes: exchanged.scopes,
          encryptedSecrets: { blob },
          updatedAt: new Date()
        }
      });
      return reply.redirect(`${webUrl}/social?connected=${encodeURIComponent(provider)}`);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "connect_failed");
    }
  }
}
