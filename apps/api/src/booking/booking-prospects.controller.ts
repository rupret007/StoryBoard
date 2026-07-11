import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  bookingProspectConversionSchema,
  bookingProspectContactSchema,
  bookingProspectCreateSchema,
  bookingProspectDiscoverSchema,
  bookingProspectPatchSchema
} from "@storyboard/shared";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { BookingProspectsService } from "./booking-prospects.service";

@Controller("booking-prospects")
@UseGuards(SessionAuthGuard)
export class BookingProspectsController {
  constructor(
    private readonly prospects: BookingProspectsService,
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

  @Get("discover")
  async discover(
    @Query() query: Record<string, unknown>,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const parsed = bookingProspectDiscoverSchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.prospects.discover(
      await this.artistId(operator.id, req, artistHeader),
      parsed.data
    );
  }

  @Get()
  async list(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    return this.prospects.list(await this.artistId(operator.id, req, artistHeader));
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    return this.prospects.get(await this.artistId(operator.id, req, artistHeader), id);
  }

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = bookingProspectCreateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.prospects.create(artistId, parsed.data, operator.email, operator.id);
  }

  @Patch(":id")
  async patch(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = bookingProspectPatchSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.prospects.patch(artistId, id, parsed.data, operator.email, operator.id);
  }

  @Post(":id/convert")
  async convert(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = bookingProspectConversionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.prospects.convert(artistId, id, parsed.data, operator.email, operator.id);
  }

  @Put(":id/contact")
  async attachContact(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = bookingProspectContactSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.prospects.attachContact(
      artistId,
      id,
      parsed.data,
      operator.email,
      operator.id
    );
  }
}
