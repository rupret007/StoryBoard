import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { FastifyRequest } from "fastify";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { BookingAdvisorService, outcomeSchema } from "./booking-advisor.service";

const feedbackSchema = z.object({ helpful: z.boolean() }).strict();
const settingsSchema = z.object({ scheduleEnabled: z.boolean().optional(), timezone: z.string().trim().min(1).max(80).nullable().optional(), dailyHour: z.number().int().min(6).max(20).optional() }).strict();
const outcomeInputSchema = z.object({ outcome: outcomeSchema }).strict();

@Controller("booking-advisor")
@UseGuards(SessionAuthGuard)
export class BookingAdvisorController {
  constructor(private readonly advisor: BookingAdvisorService, private readonly membership: MembershipService, private readonly roles: RolePolicyService) {}
  private artistId(operatorId: string, req: FastifyRequest, header?: string) { return this.membership.resolveArtistId(operatorId, req.storyboardSession ?? null, header); }
  @Get("latest") async latest(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { return this.advisor.latest(await this.artistId(op.id, req, header)); }
  @Get("settings") async settings(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { return this.advisor.settings(await this.artistId(op.id, req, header)); }
  @Put("settings") async updateSettings(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { const artistId = await this.artistId(op.id, req, header); await this.roles.assertOwner(op.id, artistId); const parsed = settingsSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.advisor.updateSettings(artistId, parsed.data, op.email, op.id); }
  @Post("generate") async generate(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { const artistId = await this.artistId(op.id, req, header); await this.roles.assertCanMutateWorkflow(op.id, artistId); return this.advisor.generate(artistId, op.email, op.id); }
  @Post(":id/feedback") async feedback(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { const artistId = await this.artistId(op.id, req, header); await this.roles.assertCanMutateWorkflow(op.id, artistId); const parsed = feedbackSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.advisor.feedback(artistId, id, op.id, parsed.data.helpful, op.email); }
  @Post("runs/:runId/recommendations/:recommendationId/outcome") async outcome(@Param("runId") runId: string, @Param("recommendationId") recommendationId: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") header?: string) { const artistId = await this.artistId(op.id, req, header); await this.roles.assertCanMutateWorkflow(op.id, artistId); const parsed = outcomeInputSchema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.advisor.outcome(artistId, runId, recommendationId, parsed.data.outcome, op.email, op.id); }
}
