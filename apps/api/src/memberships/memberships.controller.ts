import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ArtistMembershipRole } from "../generated/prisma/enums";
import { InvitesService } from "./invites.service";
import { MembershipsAdminService } from "./memberships-admin.service";

@Controller("memberships")
@UseGuards(SessionAuthGuard)
export class MembershipsController {
  constructor(
    private readonly invites: InvitesService,
    private readonly admin: MembershipsAdminService,
    private readonly config: ConfigService
  ) {}

  @Get()
  async listMembers(
    @CurrentOperator() operator: RequestOperator,
    @Query("artistId") artistId: string | undefined
  ) {
    const id = artistId?.trim();
    if (!id) {
      throw new BadRequestException("artistId query required");
    }
    return this.admin.listMembers(id, operator.id);
  }

  @Post("invites")
  async createInvite(
    @Body()
    body: {
      artistId?: string;
      email?: string;
      role?: ArtistMembershipRole;
    },
    @CurrentOperator() operator: RequestOperator
  ) {
    const artistId = body.artistId?.trim();
    const email = body.email ?? "";
    const role = body.role ?? ArtistMembershipRole.member;
    if (!artistId) {
      throw new BadRequestException("artistId required");
    }
    const created = await this.invites.createInvite({
      artistId,
      email,
      role,
      actorOperatorId: operator.id,
      actorLabel: operator.email
    });
    const webUrl = this.config.getOrThrow<string>("WEB_URL");
    const acceptPath = `/onboarding?invite=${encodeURIComponent(created.token)}`;
    return {
      inviteId: created.inviteId,
      token: created.token,
      expiresAt: created.expiresAt.toISOString(),
      acceptUrl: `${webUrl.replace(/\/$/, "")}${acceptPath}`
    };
  }

  @Get("invites")
  async listInvites(
    @CurrentOperator() operator: RequestOperator,
    @Query("artistId") artistId: string | undefined
  ) {
    const id = artistId?.trim();
    if (!id) {
      throw new BadRequestException("artistId query required");
    }
    return this.invites.listPending(id, operator.id);
  }

  @Post("invites/accept")
  async acceptInvite(
    @Body() body: { token?: string },
    @CurrentOperator() operator: RequestOperator,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.invites.accept(
      body.token ?? "",
      operator.id,
      operator.email,
      operator.email,
      reply
    );
  }

  @Post("invites/:id/revoke")
  async revokeInvite(
    @Param("id") inviteId: string,
    @Body() body: { artistId?: string },
    @CurrentOperator() operator: RequestOperator
  ) {
    const artistId = body.artistId?.trim();
    if (!artistId) {
      throw new BadRequestException("artistId required");
    }
    await this.invites.revoke(
      inviteId,
      artistId,
      operator.id,
      operator.email
    );
    return { ok: true as const };
  }

  @Patch()
  async patchMembership(
    @Body()
    body: {
      artistId?: string;
      operatorId?: string;
      role?: ArtistMembershipRole;
    },
    @CurrentOperator() operator: RequestOperator
  ) {
    const artistId = body.artistId?.trim();
    const targetOperatorId = body.operatorId?.trim();
    const role = body.role;
    if (!artistId || !targetOperatorId || !role) {
      throw new BadRequestException("artistId, operatorId, and role required");
    }
    await this.admin.updateRole({
      artistId,
      targetOperatorId,
      role,
      actorOperatorId: operator.id,
      actorLabel: operator.email
    });
    return { ok: true as const };
  }

  @Delete()
  async removeMembership(
    @Query("artistId") artistId: string | undefined,
    @Query("operatorId") targetOperatorId: string | undefined,
    @CurrentOperator() operator: RequestOperator
  ) {
    const id = artistId?.trim();
    const target = targetOperatorId?.trim();
    if (!id || !target) {
      throw new BadRequestException("artistId and operatorId query required");
    }
    await this.admin.removeMember({
      artistId: id,
      targetOperatorId: target,
      actorOperatorId: operator.id,
      actorLabel: operator.email
    });
    return { ok: true as const };
  }
}
