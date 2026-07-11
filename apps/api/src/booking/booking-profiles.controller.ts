import { BadRequestException, Body, Controller, Get, Headers, Put, Req, UseGuards } from "@nestjs/common";
import { artistBookingProfileSchema } from "@storyboard/shared";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { BookingProfilesService } from "./booking-profiles.service";

@Controller("booking-profile")
@UseGuards(SessionAuthGuard)
export class BookingProfilesController {
  constructor(
    private readonly profiles: BookingProfilesService,
    private readonly membership: MembershipService,
    private readonly roles: RolePolicyService
  ) {}

  private artistId(operatorId: string, req: FastifyRequest, headerArtistId?: string) {
    return this.membership.resolveArtistId(
      operatorId,
      req.storyboardSession ?? null,
      headerArtistId
    );
  }

  @Get()
  async get(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    return this.profiles.get(await this.artistId(operator.id, req, artistHeader));
  }

  @Put()
  async put(
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = artistBookingProfileSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.profiles.put(artistId, parsed.data, operator.email, operator.id);
  }
}
