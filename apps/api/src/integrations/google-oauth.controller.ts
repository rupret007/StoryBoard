import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  ServiceUnavailableException,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { SecretBox } from "./crypto/secret-box";
import { GOOGLE_OAUTH_SCOPES } from "./google-oauth.constants";
import { signOAuthState } from "./oauth-state";

@Controller("integrations")
@UseGuards(SessionAuthGuard)
export class IntegrationsGoogleLinkController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly secretBox: SecretBox,
    private readonly membership: MembershipService,
    private readonly roles: RolePolicyService
  ) {}

  @Get("google/authorize")
  async authorize(
    @Query("artistId") artistId: string | undefined,
    @CurrentOperator() operator: RequestOperator,
    @Res({ passthrough: false }) reply: FastifyReply
  ) {
    if (!artistId?.trim()) {
      throw new BadRequestException("artistId is required");
    }
    const id = artistId.trim();
    const clientId = this.config.get<string | undefined>("GOOGLE_CLIENT_ID");
    const clientSecret = this.config.get<string | undefined>(
      "GOOGLE_CLIENT_SECRET"
    );
    const redirectUri = this.config.get<string | undefined>(
      "GOOGLE_REDIRECT_URI"
    );
    if (!clientId?.trim() || !clientSecret?.trim() || !redirectUri?.trim()) {
      throw new ServiceUnavailableException(
        "Google OAuth client is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)"
      );
    }
    if (!this.secretBox.configured()) {
      throw new ServiceUnavailableException(
        "INTEGRATION_SECRETS_ENCRYPTION_KEY must be set to connect Google"
      );
    }
    const artistRow = await this.prisma.client.artist.findUnique({
      where: { id }
    });
    if (!artistRow) {
      throw new BadRequestException("Artist not found");
    }
    await this.membership.assertMembership(operator.id, id);
    await this.roles.assertOwner(operator.id, id);
    const sessionSecret = this.config.getOrThrow<string>("SESSION_SECRET");
    const state = signOAuthState(
      { artistId: id, issuedAt: Date.now(), operatorId: operator.id },
      sessionSecret
    );
    const params = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri.trim(),
      response_type: "code",
      scope: GOOGLE_OAUTH_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return reply.redirect(url);
  }
}
