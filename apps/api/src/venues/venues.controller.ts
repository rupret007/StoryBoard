import {
  BadRequestException,
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
import { venuePatchSchema } from "./venue-patch.schema";
import { VenuesService } from "./venues.service";

@Controller("venues")
@UseGuards(SessionAuthGuard)
export class VenuesController {
  constructor(
    private readonly venues: VenuesService,
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
    return this.venues.list(artistId);
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    return this.venues.get(artistId, id);
  }

  @Post()
  async create(
    @Body()
    body: {
      name: string;
      city: string;
      region?: string;
      country?: string;
      addressLine?: string;
      capacity?: number;
      notes?: string;
      lat?: number;
      lng?: number;
      driveMinutesFromBase?: number;
      fitScore?: number;
    },
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    return this.venues.create(artistId, body, operator.email, operator.id);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = venuePatchSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.venues.update(artistId, id, parsed.data, operator.email, operator.id);
  }
}
