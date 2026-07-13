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
  UseGuards
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import {
  ApprovalStatus,
  ArtistMembershipRole
} from "../generated/prisma/enums";
import { ApprovalsService } from "./approvals.service";
import { approvalReconciliationInputSchema } from "./approval-reconciliation";

@Controller("approvals")
@UseGuards(SessionAuthGuard)
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly membership: MembershipService,
    private readonly roles: RolePolicyService
  ) {}

  private async artistId(
    operatorId: string,
    req: FastifyRequest,
    headerArtistId?: string
  ) {
    return this.membership.resolveArtistId(
      operatorId,
      req.storyboardSession ?? null,
      headerArtistId
    );
  }

  @Get()
  async list(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string,
    @Query("status") status?: ApprovalStatus
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.approvals.list(artistId, status);
  }

  @Get("pending")
  async pending(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.approvals.pending(artistId);
  }

  @Get("ready-to-execute")
  async readyToExecute(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.approvals.readyToExecute(artistId);
  }

  @Get("work-queue")
  async workQueue(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    const role = await this.roles.getRole(operator.id, artistId);
    return this.approvals.workQueue(
      artistId,
      role !== ArtistMembershipRole.viewer
    );
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.approvals.get(artistId, id);
  }

  @Get(":id/reconciliations")
  async reconciliations(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    const role = await this.roles.getRole(operator.id, artistId);
    return this.approvals.reconciliations(
      artistId,
      id,
      role !== ArtistMembershipRole.viewer
    );
  }

  @Post(":id/reconciliations")
  async recordReconciliation(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = approvalReconciliationInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.approvals.recordReconciliation(
      artistId,
      id,
      parsed.data,
      operator.email,
      operator.id
    );
  }

  @Post(":id/approve")
  async approve(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.approvals.approve(artistId, id, operator.email, operator.id);
  }

  @Post(":id/reject")
  async reject(
    @Param("id") id: string,
    @Body() body: { reason?: string },
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.approvals.reject(
      artistId,
      id,
      operator.email,
      body.reason,
      operator.id
    );
  }

  @Post(":id/execute")
  async execute(
    @Param("id") id: string,
    @Body() body: { dryRun?: boolean },
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.approvals.executeApproved(artistId, id, operator.email, {
      dryRun: body?.dryRun === true,
      actorOperatorId: operator.id
    });
  }
}
