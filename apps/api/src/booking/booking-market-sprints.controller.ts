import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { bookingMarketSprintCreateSchema, bookingMarketSprintPatchSchema } from "@storyboard/shared";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { BookingMarketSprintsService } from "./booking-market-sprints.service";

@Controller("market-sprints")
@UseGuards(SessionAuthGuard)
export class BookingMarketSprintsController {
  constructor(private readonly sprints: BookingMarketSprintsService, private readonly membership: MembershipService, private readonly roles: RolePolicyService) {}
  private artistId(operatorId: string, req: FastifyRequest, header?: string) { return this.membership.resolveArtistId(operatorId, req.storyboardSession ?? null, header); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { return this.sprints.list(await this.artistId(op.id, req, header)); }
  @Get(":id") async get(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { return this.sprints.get(await this.artistId(op.id, req, header), id); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { const artistId = await this.artistId(op.id, req, header); await this.roles.assertCanMutateWorkflow(op.id, artistId); const parsed = bookingMarketSprintCreateSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sprints.create(artistId, parsed.data, op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { const artistId = await this.artistId(op.id, req, header); await this.roles.assertCanMutateWorkflow(op.id, artistId); const parsed = bookingMarketSprintPatchSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.sprints.patch(artistId, id, parsed.data, op.email, op.id); }
}
