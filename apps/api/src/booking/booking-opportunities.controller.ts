import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { BookingStage } from "../generated/prisma/enums";
import { BookingOpportunitiesService } from "./booking-opportunities.service";

@Controller("booking-opportunities")
@UseGuards(SessionAuthGuard)
export class BookingOpportunitiesController {
  constructor(
    private readonly booking: BookingOpportunitiesService,
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
    return this.booking.list(artistId);
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.booking.get(artistId, id);
  }

  @Post()
  async create(
    @Body()
    body: {
      title: string;
      venueId?: string;
      stage?: BookingStage;
      targetDate?: string;
      marketNotes?: string;
    },
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.booking.create(artistId, body, operator.email, operator.id);
  }

  @Patch(":id/stage")
  async stage(
    @Param("id") id: string,
    @Body() body: { stage: BookingStage },
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.booking.updateStage(
      artistId,
      id,
      body.stage,
      operator.email,
      operator.id
    );
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
    return this.booking.patch(
      artistId,
      id,
      body,
      operator.email,
      operator.id
    );
  }
}
