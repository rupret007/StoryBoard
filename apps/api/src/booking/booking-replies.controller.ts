import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { BookingRepliesService } from "./booking-replies.service";

const settingsSchema = z.object({ syncEnabled: z.boolean().optional(), aiAnalysisEnabled: z.boolean().optional() }).strict();
const patchSchema = z.object({ processingStatus: z.enum(["unread","reviewed","archived"]).optional(), intent: z.enum(["interested","offer","needs_info","decline","out_of_office","unknown"]).optional() }).strict();
const draftSchema = z.object({ subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20000) }).strict();

@Controller("booking-replies")
@UseGuards(SessionAuthGuard)
export class BookingRepliesController {
  constructor(private readonly replies: BookingRepliesService, private readonly membership: MembershipService, private readonly roles: RolePolicyService) {}
  private artistId(operatorId: string, req: FastifyRequest, header?: string) { return this.membership.resolveArtistId(operatorId, req.storyboardSession ?? null, header); }
  @Get("settings") async settings(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.replies.settings(await this.artistId(op.id, req, h)); }
  @Patch("settings") async updateSettings(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.artistId(op.id, req, h); await this.roles.assertOwner(op.id, artistId); const parsed = settingsSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.replies.updateSettings(artistId, parsed.data, op.email, op.id); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.replies.list(await this.artistId(op.id, req, h)); }
  @Post("sync") async sync(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.artistId(op.id, req, h); await this.roles.assertCanMutateWorkflow(op.id, artistId); return this.replies.sync(artistId, op.email, op.id); }
  @Get(":id") async get(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.replies.get(await this.artistId(op.id, req, h), id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.artistId(op.id, req, h); await this.roles.assertCanMutateWorkflow(op.id, artistId); const parsed = patchSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.replies.patch(artistId, id, parsed.data, op.email, op.id); }
  @Post(":id/analyze") async analyze(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.artistId(op.id, req, h); await this.roles.assertCanMutateWorkflow(op.id, artistId); return this.replies.analyze(artistId, id, op.email, op.id); }
  @Post(":id/apply-terms") async applyTerms(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.artistId(op.id, req, h); await this.roles.assertCanMutateWorkflow(op.id, artistId); return this.replies.applyTerms(artistId, id, op.email, op.id); }
  @Post(":id/prepare-approval") async prepare(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.artistId(op.id, req, h); await this.roles.assertCanMutateWorkflow(op.id, artistId); const parsed = draftSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.replies.prepareApproval(artistId, id, parsed.data, op.email, op.id); }
}
