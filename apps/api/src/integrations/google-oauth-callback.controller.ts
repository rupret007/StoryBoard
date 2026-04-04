import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { google } from "googleapis";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { StoryboardQueueService } from "../queue/storyboard-queue.service";
import { SecretBox } from "./crypto/secret-box";
import { GOOGLE_CONNECTION_PROVIDER } from "./google-oauth.constants";
import type { GoogleStoredSecretsV1 } from "./google-stored-secrets";
import { verifyOAuthState } from "./oauth-state";

const STATE_TTL_MS = 15 * 60 * 1000;

@Controller("auth/google")
export class GoogleOAuthCallbackController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly secretBox: SecretBox,
    private readonly auth: AuthService,
    private readonly queue: StoryboardQueueService
  ) {}

  @Get("callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply
  ) {
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    const failRedirect = (reason: string) =>
      reply.redirect(
        `${webUrl}/?googleError=${encodeURIComponent(reason)}`
      );

    if (oauthError) {
      return failRedirect(oauthError);
    }
    if (!code?.trim() || !state?.trim()) {
      return failRedirect("missing_code_or_state");
    }
    if (!this.secretBox.configured()) {
      return failRedirect("encryption_not_configured");
    }
    const sessionSecret = this.config.getOrThrow<string>("SESSION_SECRET");
    const st = verifyOAuthState(state, sessionSecret, STATE_TTL_MS);
    if (!st) {
      return failRedirect("invalid_state");
    }
    const operator = await this.auth.operatorFromRequestCookies(req);
    if (!operator || operator.id !== st.operatorId) {
      return failRedirect("session_mismatch");
    }
    const clientId = this.config.get<string | undefined>("GOOGLE_CLIENT_ID");
    const clientSecret = this.config.get<string | undefined>(
      "GOOGLE_CLIENT_SECRET"
    );
    const redirectUri = this.config.get<string | undefined>(
      "GOOGLE_REDIRECT_URI"
    );
    if (!clientId?.trim() || !clientSecret?.trim() || !redirectUri?.trim()) {
      return failRedirect("oauth_not_configured");
    }
    const oauth2 = new google.auth.OAuth2(
      clientId.trim(),
      clientSecret.trim(),
      redirectUri.trim()
    );
    let tokens;
    try {
      const exchanged = await oauth2.getToken(code.trim());
      tokens = exchanged.tokens;
    } catch {
      return failRedirect("token_exchange_failed");
    }
    const refreshToken = tokens.refresh_token;
    if (!refreshToken?.trim()) {
      return failRedirect("no_refresh_token_retry_with_consent");
    }
    const scopes =
      typeof tokens.scope === "string"
        ? tokens.scope.split(" ").filter(Boolean)
        : [];
    const payload: GoogleStoredSecretsV1 = { v: 1, refreshToken: refreshToken.trim() };
    if (tokens.access_token) {
      payload.accessToken = tokens.access_token;
    }
    if (tokens.expiry_date != null) {
      payload.accessTokenExpiresAt = new Date(tokens.expiry_date).toISOString();
    }
    const blob = this.secretBox.encryptJson(payload);
    await this.prisma.client.integrationConnection.upsert({
      where: {
        artistId_provider: {
          artistId: st.artistId,
          provider: GOOGLE_CONNECTION_PROVIDER
        }
      },
      create: {
        artistId: st.artistId,
        provider: GOOGLE_CONNECTION_PROVIDER,
        status: "active",
        scopes,
        encryptedSecrets: { blob }
      },
      update: {
        status: "active",
        scopes,
        encryptedSecrets: { blob },
        updatedAt: new Date()
      }
    });
    try {
      await this.queue.enqueueIntegrationConnectionChanged({
        artistId: st.artistId,
        provider: GOOGLE_CONNECTION_PROVIDER
      });
    } catch {
      /* enqueue is best-effort */
    }
    return reply.redirect(`${webUrl}/?googleConnected=1`);
  }
}
