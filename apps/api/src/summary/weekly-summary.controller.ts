import { Controller, Get, Headers, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { WeeklySummaryService } from "./weekly-summary.service";

@Controller("weekly-summary")
@UseGuards(SessionAuthGuard)
export class WeeklySummaryController {
  constructor(
    private readonly summary: WeeklySummaryService,
    private readonly membership: MembershipService
  ) {}

  @Get()
  async get(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.membership.resolveArtistId(
      operator.id,
      req.storyboardSession ?? null,
      artistHeader
    );
    return this.summary.build(artistId);
  }
}
