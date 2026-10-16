import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveSocialVoice, type SocialPlatform } from "@storyboard/shared";
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
        const userToken = longLived.ok && typeof longData.access_token === "string" ? longData.access_token : shortData.access_token;
        const pages = await fetch(
          `https://graph.facebook.com/v23.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userToken)}`
        );
        const pageData = (await pages.json()) as { data?: Array<Record<string, unknown>> };
        if (!pages.ok || pageData.data?.length !== 1) throw new Error("meta_select_one_page");
        const page = pageData.data[0];
        if (typeof page?.id !== "string" || typeof page.access_token !== "string" || typeof page.name !== "string") {
          throw new Error("meta_page_unavailable");
        }
        const ig = page?.instagram_business_account as { id?: string } | undefined;
        const accounts: Array<{ platform: SocialPlatform; externalAccountId: string; accountLabel: string }> = [
          { platform: "facebook", externalAccountId: page.id, accountLabel: page.name }
        ];
        if (ig?.id) {
          const profile = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(ig.id)}?fields=id,username`, {
            headers: { Authorization: `Bearer ${page.access_token}` }
          });
          const profileData = await profile.json() as Record<string, unknown>;
          if (!profile.ok || profileData.id !== ig.id || typeof profileData.username !== "string") {
            throw new Error("instagram_account_unavailable");
          }
          accounts.push({ platform: "instagram", externalAccountId: ig.id, accountLabel: profileData.username });
        }
        return {
          secrets: {
            v: 1 as const,
            accessToken: userToken,
            pageAccessToken: page.access_token,
            pageId: page.id,
            instagramBusinessId: ig?.id
          },
          accountLabel: typeof page?.name === "string" ? page.name : "Facebook Page",
          scopes: String(shortData.scope ?? "").split(",").filter(Boolean),
          accounts
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
        if (!response.ok || typeof data.refresh_token !== "string" || typeof data.access_token !== "string") {
          throw new Error("youtube_token_exchange_failed");
        }
        const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", {
          headers: { Authorization: `Bearer ${data.access_token}` }
        });
        const channelData = await channelResponse.json() as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
        const channel = channelData.items?.[0];
        if (!channelResponse.ok || channelData.items?.length !== 1 || !channel?.id || !channel.snippet?.title) {
          throw new Error("youtube_channel_unavailable");
        }
        return {
          secrets: {
            v: 1 as const,
            refreshToken: data.refresh_token,
            accessToken: data.access_token,
            channelId: channel.id
          },
          accountLabel: channel.snippet.title,
          scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [],
          accounts: [{ platform: "youtube" as const, externalAccountId: channel.id, accountLabel: channel.snippet.title }]
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
        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok || typeof data.access_token !== "string" || typeof data.open_id !== "string") {
          throw new Error("tiktok_token_exchange_failed");
        }
        const profileResponse = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", {
          headers: { Authorization: `Bearer ${data.access_token}` }
        });
        const profile = await profileResponse.json() as { data?: { user?: { open_id?: string; display_name?: string } }; error?: { code?: string } };
        const user = profile.data?.user;
        if (!profileResponse.ok || profile.error?.code !== "ok" || user?.open_id !== data.open_id || !user.display_name) {
          throw new Error("tiktok_account_unavailable");
        }
        return {
          secrets: {
            v: 1 as const,
            accessToken: data.access_token,
            refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
            openId: typeof data.open_id === "string" ? data.open_id : undefined
          },
          accountLabel: user.display_name,
          scopes: typeof data.scope === "string" ? data.scope.split(",").filter(Boolean) : [],
          accounts: [{ platform: "tiktok" as const, externalAccountId: data.open_id, accountLabel: user.display_name }]
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
      accounts: Array<{ platform: SocialPlatform; externalAccountId: string; accountLabel: string }>;
    }>,
    redirectUri: string
  ) {
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    const fail = (reason: string) =>
      reply.redirect(`${webUrl}/social?connectError=${encodeURIComponent(reason)}`);
    if (oauthError) return fail("provider_authorization_failed");
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
      await this.prisma.client.$transaction(async (tx) => {
        const artist = await tx.artist.findUniqueOrThrow({ where: { id: st.artistId } });
        const connection = await tx.integrationConnection.upsert({
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
        for (const account of exchanged.accounts) {
          await tx.socialAccount.upsert({
            where: { artistId_platform: { artistId: st.artistId, platform: account.platform } },
            create: { artistId: st.artistId, ...account, voiceKey: resolveSocialVoice(artist.name), status: "active", scopes: exchanged.scopes },
            update: { ...account, voiceKey: resolveSocialVoice(artist.name), status: "active", scopes: exchanged.scopes }
          });
        }
        await tx.auditEvent.create({
          data: {
            artistId: st.artistId,
            aggregateType: "IntegrationConnection",
            aggregateId: connection.id,
            action: "social.connection.connected",
            actorLabel: operator.email,
            actorOperatorId: operator.id,
            metadata: { provider, platforms: exchanged.accounts.map((account) => account.platform) }
          }
        });
      });
      return reply.redirect(`${webUrl}/social?connected=${encodeURIComponent(provider)}`);
    } catch {
      return fail("connect_failed");
    }
  }
}
