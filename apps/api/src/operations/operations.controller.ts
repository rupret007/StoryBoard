import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { dealCreateSchema, dealPatchSchema, eventCreateSchema, eventParticipantSchema, eventPatchSchema, eventScheduleItemCreateSchema, eventScheduleItemPatchSchema, expenseCreateSchema, expensePatchSchema, invoiceCreateSchema, invoicePatchSchema, paymentRecordSchema, projectCreateSchema, projectPatchSchema, setlistCreateSchema, setlistPatchSchema, settlementCreateSchema, settlementPatchSchema, songCreateSchema, songPatchSchema } from "@storyboard/shared";
import { CurrentOperator } from "../auth/current-operator.decorator";
import { MembershipService } from "../auth/membership.service";
import { RolePolicyService } from "../auth/role-policy.service";
import type { RequestOperator } from "../auth/request-operator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { OperationsService } from "./operations.service";

abstract class ArtistController {
  constructor(protected readonly operations: OperationsService, protected readonly membership: MembershipService, protected readonly roles: RolePolicyService) {}
  protected artistId(operatorId: string, req: FastifyRequest, header?: string) { return this.membership.resolveArtistId(operatorId, req.storyboardSession ?? null, header); }
  protected parse<T>(schema: z.ZodType<T>, body: unknown): T { const parsed = schema.safeParse(body ?? {}); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return parsed.data; }
  protected async mutable(op: RequestOperator, req: FastifyRequest, header?: string) { const artistId = await this.artistId(op.id, req, header); await this.roles.assertCanMutateWorkflow(op.id, artistId); return artistId; }
}

@Controller("events") @UseGuards(SessionAuthGuard)
export class EventsController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.events(await this.artistId(op.id, req, h)); }
  @Get("readiness") async readiness(@Query("days") value: string | undefined, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const parsed = z.coerce.number().int().min(1).max(365).default(90).safeParse(value); if (!parsed.success) throw new BadRequestException("Invalid readiness horizon"); return this.operations.eventReadinessList(await this.artistId(op.id, req, h), parsed.data); }
  @Get(":id/readiness") async eventReadiness(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.eventReadiness(await this.artistId(op.id, req, h), id); }
  @Get(":id/day-of") async dayOf(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.eventDayOf(await this.artistId(op.id, req, h), id); }
  @Get(":id") async get(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.event(await this.artistId(op.id, req, h), id); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createEvent(artistId, this.parse(eventCreateSchema, body), op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchEvent(artistId, id, this.parse(eventPatchSchema, body), op.email, op.id); }
  @Post("from-opportunity/:opportunityId") async fromOpportunity(@Param("opportunityId") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.eventFromOpportunity(artistId, id, op.email, op.id); }
  @Post(":id/participants") async participant(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.participant(artistId, id, this.parse(eventParticipantSchema, body), op.email, op.id); }
  @Patch(":id/participants") async patchParticipant(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.participant(id, body, op, req, h); }
  @Post(":id/schedule") async createScheduleItem(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createEventScheduleItem(artistId, id, this.parse(eventScheduleItemCreateSchema, body), op.email, op.id); }
  @Patch(":id/schedule/:itemId") async patchScheduleItem(@Param("id") id: string, @Param("itemId") itemId: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchEventScheduleItem(artistId, id, itemId, this.parse(eventScheduleItemPatchSchema, body), op.email, op.id); }
  @Delete(":id/schedule/:itemId") async removeScheduleItem(@Param("id") id: string, @Param("itemId") itemId: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.removeEventScheduleItem(artistId, id, itemId, op.email, op.id); }
  @Post(":id/generate-advance") async advance(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.generateAdvance(artistId, id, op.email, op.id); }
  @Post(":id/prepare-logistics-approvals") async logistics(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.prepareLogistics(artistId, id, op.email, op.id); }
}

@Controller("songs") @UseGuards(SessionAuthGuard)
export class SongsController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.songs(await this.artistId(op.id, req, h)); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createSong(artistId, this.parse(songCreateSchema, body), op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchSong(artistId, id, this.parse(songPatchSchema, body), op.email, op.id); }
}

@Controller("setlists") @UseGuards(SessionAuthGuard)
export class SetlistsController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.setlists(await this.artistId(op.id, req, h)); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createSetlist(artistId, this.parse(setlistCreateSchema, body), op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchSetlist(artistId, id, this.parse(setlistPatchSchema, body), op.email, op.id); }
}

@Controller("projects") @UseGuards(SessionAuthGuard)
export class ProjectsController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.projects(await this.artistId(op.id, req, h)); }
  @Get("readiness") async readiness(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.projectReadinessList(await this.artistId(op.id, req, h)); }
  @Get(":id/readiness") async projectReadiness(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.projectReadiness(await this.artistId(op.id, req, h), id); }
  @Get(":id") async get(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.project(await this.artistId(op.id, req, h), id); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createProject(artistId, this.parse(projectCreateSchema, body), op.email, op.id); }
  @Post(":id/generate-plan") async generatePlan(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.generateProjectPlan(artistId, id, op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchProject(artistId, id, this.parse(projectPatchSchema, body), op.email, op.id); }
}

const templateCreateSchema = z.object({ kind: z.enum(["agreement","invoice","settlement"]), name: z.string().trim().min(1).max(160), bodyTemplate: z.string().trim().min(1).max(30000) }).strict();
const generateDocumentSchema = z.object({ templateId: z.string().trim().min(1).optional() }).strict();
@Controller("deals") @UseGuards(SessionAuthGuard)
export class DealsController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.deals(await this.artistId(op.id, req, h)); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createDeal(artistId, this.parse(dealCreateSchema, body), op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchDeal(artistId, id, this.parse(dealPatchSchema, body), op.email, op.id); }
  @Post(":id/generate-document") async generate(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); const input = this.parse(generateDocumentSchema, body); return this.operations.generateDealDocument(artistId, id, input.templateId, op.email, op.id); }
  @Post(":id/prepare-delivery") async delivery(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.prepareDealDelivery(artistId, id, op.email, op.id); }
}

@Controller("document-templates") @UseGuards(SessionAuthGuard)
export class DocumentTemplatesController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.templates(await this.artistId(op.id, req, h)); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.artistId(op.id, req, h); await this.roles.assertOwner(op.id, artistId); return this.operations.createTemplate(artistId, this.parse(templateCreateSchema, body), op.email, op.id); }
  @Put(":id/activate") async activate(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.artistId(op.id, req, h); await this.roles.assertOwner(op.id, artistId); return this.operations.activateTemplate(artistId, id, op.email, op.id); }
}

@Controller("invoices") @UseGuards(SessionAuthGuard)
export class InvoicesController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.invoices(await this.artistId(op.id, req, h)); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createInvoice(artistId, this.parse(invoiceCreateSchema, body), op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchInvoice(artistId, id, this.parse(invoicePatchSchema, body), op.email, op.id); }
  @Post(":id/record-payment") async payment(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.recordPayment(artistId, id, this.parse(paymentRecordSchema, body), op.email, op.id); }
}

@Controller("expenses") @UseGuards(SessionAuthGuard)
export class ExpensesController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.expenses(await this.artistId(op.id, req, h)); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createExpense(artistId, this.parse(expenseCreateSchema, body), op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchExpense(artistId, id, this.parse(expensePatchSchema, body), op.email, op.id); }
}

@Controller("settlements") @UseGuards(SessionAuthGuard)
export class SettlementsController extends ArtistController {
  constructor(operations: OperationsService, membership: MembershipService, roles: RolePolicyService) { super(operations, membership, roles); }
  @Get() async list(@CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { return this.operations.settlements(await this.artistId(op.id, req, h)); }
  @Post() async create(@Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.createSettlement(artistId, this.parse(settlementCreateSchema, body), op.email, op.id); }
  @Patch(":id") async patch(@Param("id") id: string, @Body() body: unknown, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.patchSettlement(artistId, id, this.parse(settlementPatchSchema, body), op.email, op.id); }
  @Post(":id/finalize") async finalize(@Param("id") id: string, @CurrentOperator() op: RequestOperator, @Req() req: FastifyRequest, @Headers("x-artist-id") h?: string) { const artistId = await this.mutable(op, req, h); return this.operations.finalizeSettlement(artistId, id, op.email, op.id); }
}
