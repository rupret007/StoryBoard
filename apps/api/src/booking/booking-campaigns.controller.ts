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
import {
  bookingCampaignCreateSchema,
  bookingCampaignPatchSchema,
  bookingCampaignPrepareApprovalSchema,
  bookingCampaignRecipientCreateSchema,
  bookingCampaignRecipientPatchSchema
} from "@storyboard/shared";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { BookingCampaignsService } from "./booking-campaigns.service";

@Controller("booking-campaigns")
@UseGuards(SessionAuthGuard)
export class BookingCampaignsController {
  constructor(
    private readonly campaigns: BookingCampaignsService,
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
  async list(
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    return this.campaigns.list(await this.artistId(operator.id, req, artistHeader));
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    return this.campaigns.get(await this.artistId(operator.id, req, artistHeader), id);
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
    const parsed = bookingCampaignCreateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.create(artistId, parsed.data, operator.email, operator.id);
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
    const parsed = bookingCampaignPatchSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.patch(artistId, id, parsed.data, operator.email, operator.id);
  }

  @Post(":id/recipients")
  async addRecipient(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = bookingCampaignRecipientCreateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.addRecipient(
      artistId,
      id,
      parsed.data,
      operator.email,
      operator.id
    );
  }

  @Patch(":id/recipients/:recipientId")
  async patchRecipient(
    @Param("id") id: string,
    @Param("recipientId") recipientId: string,
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = bookingCampaignRecipientPatchSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.patchRecipient(
      artistId,
      id,
      recipientId,
      parsed.data,
      operator.email,
      operator.id
    );
  }

  @Post(":id/prepare-approval")
  async prepareApproval(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentOperator() operator: RequestOperator,
    @Req() req: FastifyRequest,
    @Headers("x-artist-id") artistHeader?: string
  ) {
    const artistId = await this.artistId(operator.id, req, artistHeader);
    await this.roles.assertCanMutateWorkflow(operator.id, artistId);
    const parsed = bookingCampaignPrepareApprovalSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.campaigns.prepareApproval(
      artistId,
      id,
      parsed.data,
      operator.email,
      operator.id
    );
  }
}
