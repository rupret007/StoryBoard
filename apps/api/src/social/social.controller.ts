import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { socialConnectProviderSchema } from "@storyboard/shared";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { signOAuthState } from "../integrations/oauth-state";
import {
  META_OAUTH_SCOPES,
  TIKTOK_OAUTH_AUTHORIZE,
  TIKTOK_OAUTH_SCOPES,
  YOUTUBE_UPLOAD_SCOPE
} from "./social.constants";
import { SocialService } from "./social.service";

@Controller("social")
@UseGuards(SessionAuthGuard)
export class SocialController {
  constructor(
    private readonly social: SocialService,
    private readonly membership: MembershipService,
    private readonly roles: RolePolicyService,
    private readonly config: ConfigService
  ) {}

  private async artistId(
    operator: RequestOperator,
    req: FastifyRequest,
    headerArtistId?: string
  ) {
    return this.membership.resolveArtistId(
      operator.id,
      req.storyboardSession ?? null,
      headerArtistId
    );
  }

  @Get()
  async workspace(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator, req, artistHeader);
    await this.roles.assertCanRead(operator.id, artistId);
    return this.social.workspace(artistId);
  }

  @Get("posts/:id")
  async getPost(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator, req, artistHeader);
    await this.roles.assertCanRead(operator.id, artistId);
    return this.social.getPost(artistId, id);
  }

  @Post("drops")
  async createDrop(
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.social.createDrop(artistId, body, {
      label: operator.email,
      operatorId: operator.id
    });
  }

  @Post("approve-and-post")
  async approveAndPost(
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.social.approveAndPost(artistId, body, {
      label: operator.email,
      operatorId: operator.id
    });
  }

  @Get("connect/:provider/start")
  async connectStart(
    @Param("provider") providerRaw: string,
    @Query("artistId") queryArtistId: string | undefined,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const parsed = socialConnectProviderSchema.safeParse(providerRaw);
    if (!parsed.success) {
      throw new BadRequestException("Unknown social provider");
    }
    const artistId = await this.artistId(operator, req, queryArtistId ?? artistHeader);
    await this.roles.assertOwner(operator.id, artistId);
    const apiUrl = this.config.get<string>("API_URL") ?? "http://localhost:4000";
    const state = signOAuthState(
      { artistId, issuedAt: Date.now(), operatorId: operator.id },
      this.config.getOrThrow<string>("SESSION_SECRET")
    );
    if (parsed.data === "meta") {
      const appId = this.config.get<string>("META_APP_ID")?.trim();
      if (!appId) {
        throw new ServiceUnavailableException("META_APP_ID is not configured");
      }
      const redirect = `${apiUrl}/auth/meta/callback`;
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirect,
        state,
        scope: META_OAUTH_SCOPES,
        response_type: "code"
      });
      return reply.redirect(`https://www.facebook.com/v23.0/dialog/oauth?${params.toString()}`);
    }
    if (parsed.data === "youtube_publish") {
      const clientId = (
        this.config.get<string>("YOUTUBE_CLIENT_ID") ?? this.config.get<string>("GOOGLE_CLIENT_ID")
      )?.trim();
      if (!clientId) {
        throw new ServiceUnavailableException("YOUTUBE_CLIENT_ID or GOOGLE_CLIENT_ID is not configured");
      }
      const redirect = this.config.get<string>("YOUTUBE_PUBLISH_REDIRECT_URI")?.trim()
        ?? `${apiUrl}/auth/youtube-publish/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        scope: YOUTUBE_UPLOAD_SCOPE,
        access_type: "offline",
        prompt: "consent",
        state
      });
      return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    }
    const key = this.config.get<string>("TIKTOK_CLIENT_KEY")?.trim();
    if (!key) {
      throw new ServiceUnavailableException("TIKTOK_CLIENT_KEY is not configured");
    }
    const redirect = `${apiUrl}/auth/tiktok/callback`;
    const params = new URLSearchParams({
      client_key: key,
      redirect_uri: redirect,
      response_type: "code",
      scope: TIKTOK_OAUTH_SCOPES,
      state
    });
    return reply.redirect(`${TIKTOK_OAUTH_AUTHORIZE}?${params.toString()}`);
  }
}
