import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
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
import { TaskStatus } from "../generated/prisma/enums";
import { TasksService } from "./tasks.service";

@Controller("tasks")
@UseGuards(SessionAuthGuard)
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
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
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.tasks.list(artistId);
  }

  @Get("overdue")
  async overdue(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.tasks.overdueByDueDate(artistId);
  }

  /** Incomplete tasks with updatedAt older than `days` (default 7). */
  @Get("stale-followups")
  async staleFollowups(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string,
    @Query("days") days?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    const d = days ? parseInt(days, 10) : 7;
    return this.tasks.followUpsOlderThan(artistId, Number.isFinite(d) ? d : 7);
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.tasks.get(artistId, id);
  }

  @Post()
  async create(
    @Body()
    body: {
      title: string;
      opportunityId?: string;
      status?: TaskStatus;
      ownerLabel?: string;
      dueAt?: string;
    },
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.tasks.create(artistId, body, operator.email, operator.id);
  }

  @Patch(":id")
  async patch(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.tasks.patch(artistId, id, body, operator.email, operator.id);
  }
}
