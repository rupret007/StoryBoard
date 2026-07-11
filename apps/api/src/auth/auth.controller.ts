import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "./auth.service";
import { CurrentOperator } from "./current-operator.decorator";
import { MembershipService } from "./membership.service";
import { RolePolicyService } from "./role-policy.service";
import type { RequestOperator } from "./request-operator";
import { SessionAuthGuard } from "./session-auth.guard";
import {
  createOperatorOAuthState,
  operatorOAuthStateMatches
} from "./operator-oauth-state";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly membership: MembershipService,
    private readonly roles: RolePolicyService
  ) {}

  @Get("operator/google/start")
  startGoogle(@Res({ passthrough: false }) reply: FastifyReply) {
    const state = createOperatorOAuthState();
    this.auth.applyOperatorOAuthStateCookie(reply, state);
    const url = this.auth.buildGoogleOperatorAuthUrl(state);
    return reply.code(302).redirect(url);
  }

  @Get("operator/google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") oauthError: string | undefined,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply
  ) {
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    const fail = (reason: string) =>
      reply.code(302).redirect(`${webUrl}/?authError=${encodeURIComponent(reason)}`);
    const expectedState = this.auth.readOperatorOAuthStateFromRequest(req);
    if (!operatorOAuthStateMatches(expectedState, state)) {
      return fail("invalid_state");
    }
    this.auth.clearOperatorOAuthStateCookie(reply);
    if (oauthError) {
      return fail(oauthError);
    }
    if (!code?.trim()) {
      return fail("missing_code");
    }
    try {
      await this.auth.completeGoogleOperatorLogin(code, reply);
    } catch {
      return fail("operator_login_failed");
    }
    return reply.code(302).redirect(`${webUrl}/?signedIn=1`);
  }

  @Get("dev/login")
  async devLogin(@Res({ passthrough: false }) reply: FastifyReply) {
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    try {
      await this.auth.devBypassLogin(reply);
    } catch {
      return reply.code(302).redirect(
        `${webUrl}/?authError=${encodeURIComponent("dev_login_unavailable")}`
      );
    }
    return reply.code(302).redirect(`${webUrl}/?signedIn=1`);
  }

  @Post("logout")
  @UseGuards(SessionAuthGuard)
  logout(@Res({ passthrough: true }) reply: FastifyReply) {
    this.auth.clearSessionCookie(reply);
    return { ok: true as const };
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  async me(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest
  ) {
    const session = req.storyboardSession ?? null;
    return this.auth.getMe(operator.id, session);
  }

  @Post("session/artist")
  @UseGuards(SessionAuthGuard)
  async setArtist(
    @CurrentOperator() operator: RequestOperator,
    @Body() body: { artistId?: string },
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const id = body?.artistId?.trim();
    if (!id) {
      throw new BadRequestException("artistId required");
    }
    await this.membership.assertMembership(operator.id, id);
    await this.roles.assertCanRead(operator.id, id);
    await this.auth.setCurrentArtist(operator.id, id, reply);
    return { ok: true as const, currentArtistId: id };
  }
}
