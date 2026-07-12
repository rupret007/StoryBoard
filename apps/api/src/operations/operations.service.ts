import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { z } from "zod";
import { eventCreateSchema, eventPatchSchema, eventParticipantSchema, songCreateSchema, songPatchSchema, setlistCreateSchema, setlistPatchSchema, projectCreateSchema, projectPatchSchema, dealCreateSchema, dealPatchSchema, invoiceCreateSchema, invoicePatchSchema, paymentRecordSchema, expenseCreateSchema, expensePatchSchema, settlementCreateSchema, settlementPatchSchema } from "@storyboard/shared";
import type { Prisma } from "../generated/prisma/client";
import { ApprovalStatus, InvoiceStatus, SettlementStatus } from "../generated/prisma/enums";
import { ApprovalsService } from "../approvals/approvals.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { renderTextPdf } from "./simple-pdf";
import { deterministicShowReadiness } from "./event-readiness";
import { deterministicEventDayOf } from "./event-day-of";
import { deterministicProjectReadiness, PROJECT_PLAN_VERSION, projectPlanTemplate } from "./project-plan";
import { SHOW_ADVANCE_VERSION, showAdvanceSourceKey, showAdvanceTaskSpecs } from "./show-advance";

type EventCreate = z.infer<typeof eventCreateSchema>;
type EventPatch = z.infer<typeof eventPatchSchema>;
type ParticipantInput = z.infer<typeof eventParticipantSchema>;
type SongCreate = z.infer<typeof songCreateSchema>;
type SongPatch = z.infer<typeof songPatchSchema>;
type SetlistCreate = z.infer<typeof setlistCreateSchema>;
type SetlistPatch = z.infer<typeof setlistPatchSchema>;
type ProjectCreate = z.infer<typeof projectCreateSchema>;
type ProjectPatch = z.infer<typeof projectPatchSchema>;
type DealCreate = z.infer<typeof dealCreateSchema>;
type DealPatch = z.infer<typeof dealPatchSchema>;
type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;
type InvoicePatch = z.infer<typeof invoicePatchSchema>;
type PaymentInput = z.infer<typeof paymentRecordSchema>;
type ExpenseCreate = z.infer<typeof expenseCreateSchema>;
type ExpensePatch = z.infer<typeof expensePatchSchema>;
type SettlementCreate = z.infer<typeof settlementCreateSchema>;
type SettlementPatch = z.infer<typeof settlementPatchSchema>;

const dateFields = new Set(["startsAt","endsAt","loadInAt","soundcheckAt","doorsAt","setAt","curfewAt","depositDueAt","balanceDueAt","dueAt","performanceDate","expiresAt"]);
const eventDetailInclude = {
  venue: true,
  contact: true,
  opportunity: true,
  project: true,
  setlist: { include: { items: { include: { song: true }, orderBy: { sortOrder: "asc" as const } } } },
  participants: { include: { bandMember: true } },
  schedule: { orderBy: { sortOrder: "asc" as const } },
  tasks: { include: { bandMember: true } },
  deals: { include: { agreements: { orderBy: { version: "desc" as const } }, invoices: { include: { payments: true } } } },
  invoices: { include: { payments: true } },
  expenses: true,
  settlement: { include: { splits: { include: { bandMember: true } } } }
} as const;
const projectDetailInclude = { goal: true, events: true, tasks: { include: { bandMember: true }, orderBy: [{ dueAt: "asc" as const }, { createdAt: "asc" as const }] }, expenses: { orderBy: { incurredAt: "desc" as const } } } satisfies Prisma.ArtistProjectInclude;
function cleanDates(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, dateFields.has(key) && typeof value === "string" ? new Date(value) : value]));
}

type EventTimeline = { startsAt: Date | null; endsAt: Date | null; loadInAt: Date | null; soundcheckAt: Date | null; doorsAt: Date | null; setAt: Date | null; curfewAt: Date | null };
function eventDate(value: string | null | undefined, fallback: Date | null = null) { return value === undefined ? fallback : value === null ? null : new Date(value); }
function validateEventTimeline(input: EventCreate | EventPatch, existing?: EventTimeline) {
  const timeline: EventTimeline = {
    startsAt: eventDate(input.startsAt, existing?.startsAt),
    endsAt: eventDate(input.endsAt, existing?.endsAt),
    loadInAt: eventDate(input.loadInAt, existing?.loadInAt),
    soundcheckAt: eventDate(input.soundcheckAt, existing?.soundcheckAt),
    doorsAt: eventDate(input.doorsAt, existing?.doorsAt),
    setAt: eventDate(input.setAt, existing?.setAt),
    curfewAt: eventDate(input.curfewAt, existing?.curfewAt)
  };
  if (timeline.startsAt && timeline.endsAt && timeline.endsAt < timeline.startsAt) throw new BadRequestException("Event end must be after its start");
  const schedule = [
    ["Load-in", timeline.loadInAt],
    ["Soundcheck", timeline.soundcheckAt],
    ["Doors", timeline.doorsAt],
    ["Set time", timeline.setAt],
    ["Curfew", timeline.curfewAt]
  ].filter((item): item is [string, Date] => item[1] instanceof Date);
  for (let index = 1; index < schedule.length; index += 1) {
    const previous = schedule[index - 1]!;
    const current = schedule[index]!;
    if (current[1] < previous[1]) throw new BadRequestException(`${previous[0]} must be before ${current[0].toLowerCase()}`);
  }
}

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly approvals: ApprovalsService) {}

  private async auditWrite(artistId: string, type: string, id: string, action: string, actorLabel: string, actorOperatorId: string, metadata: Record<string, unknown>) { await this.audit.log({ artistId, aggregateType: type, aggregateId: id, action, actorLabel, actorOperatorId, metadata }); }
  private async assertArtistRecord(kind: "venue"|"contact"|"opportunity"|"project"|"setlist"|"goal"|"event"|"member"|"deal"|"invoice"|"settlement"|"template", artistId: string, id: string) {
    const where = { id, artistId }; let row: { id: string } | null = null;
    if (kind === "venue") row = await this.prisma.client.venue.findFirst({ where, select: { id: true } });
    else if (kind === "contact") row = await this.prisma.client.contact.findFirst({ where, select: { id: true } });
    else if (kind === "opportunity") row = await this.prisma.client.bookingOpportunity.findFirst({ where, select: { id: true } });
    else if (kind === "project") row = await this.prisma.client.artistProject.findFirst({ where, select: { id: true } });
    else if (kind === "setlist") row = await this.prisma.client.setlist.findFirst({ where, select: { id: true } });
    else if (kind === "goal") row = await this.prisma.client.managerGoal.findFirst({ where, select: { id: true } });
    else if (kind === "event") row = await this.prisma.client.bandEvent.findFirst({ where, select: { id: true } });
    else if (kind === "member") row = await this.prisma.client.bandMember.findFirst({ where, select: { id: true } });
    else if (kind === "deal") row = await this.prisma.client.dealOffer.findFirst({ where, select: { id: true } });
    else if (kind === "invoice") row = await this.prisma.client.invoice.findFirst({ where, select: { id: true } });
    else if (kind === "settlement") row = await this.prisma.client.settlement.findFirst({ where, select: { id: true } });
    else row = await this.prisma.client.documentTemplate.findFirst({ where, select: { id: true } });
    if (!row) throw new NotFoundException("Record not found"); return row;
  }
  private async validateEventRelations(artistId: string, input: EventCreate | EventPatch) {
    if (input.opportunityId) await this.assertArtistRecord("opportunity", artistId, input.opportunityId);
    if (input.venueId) await this.assertArtistRecord("venue", artistId, input.venueId);
    if (input.contactId) await this.assertArtistRecord("contact", artistId, input.contactId);
    if (input.projectId) await this.assertArtistRecord("project", artistId, input.projectId);
    if (input.setlistId) await this.assertArtistRecord("setlist", artistId, input.setlistId);
  }

  events(artistId: string) { return this.prisma.client.bandEvent.findMany({ where: { artistId }, include: { venue: true, contact: true, participants: { include: { bandMember: true } }, settlement: true }, orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }] }); }
  async event(artistId: string, id: string) { const row = await this.prisma.client.bandEvent.findFirst({ where: { id, artistId }, include: eventDetailInclude }); if (!row) throw new NotFoundException("Event not found"); return row; }
  async eventReadiness(artistId: string, id: string, now = new Date()) {
    const [event, members] = await Promise.all([
      this.prisma.client.bandEvent.findFirst({ where: { id, artistId }, include: eventDetailInclude }),
      this.prisma.client.bandMember.findMany({ where: { artistId, active: true }, select: { id: true, name: true } })
    ]);
    if (!event) throw new NotFoundException("Event not found");
    return deterministicShowReadiness(event, members, now);
  }
  async eventDayOf(artistId: string, id: string, now = new Date()) {
    const [event, members] = await Promise.all([
      this.prisma.client.bandEvent.findFirst({ where: { id, artistId }, include: eventDetailInclude }),
      this.prisma.client.bandMember.findMany({ where: { artistId, active: true }, select: { id: true, name: true, email: true, roles: true, instruments: true, active: true } })
    ]);
    if (!event) throw new NotFoundException("Event not found");
    const readiness = deterministicShowReadiness(event, members, now);
    return { event, activeMembers: members, readiness, dayOf: deterministicEventDayOf(event, readiness, members, now) };
  }
  async eventReadinessList(artistId: string, days = 90, now = new Date()) {
    const through = new Date(now.getTime() + days * 86400000);
    const [events, members] = await Promise.all([
      this.prisma.client.bandEvent.findMany({ where: { artistId, type: "gig", status: { in: ["draft", "hold", "confirmed"] }, OR: [{ startsAt: { gte: now, lte: through } }, { status: "confirmed", startsAt: null }] }, include: eventDetailInclude, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }], take: 50 }),
      this.prisma.client.bandMember.findMany({ where: { artistId, active: true }, select: { id: true, name: true } })
    ]);
    return events.map((event) => deterministicShowReadiness(event, members, now));
  }
  async createEvent(artistId: string, input: EventCreate, actorLabel: string, actorOperatorId: string) { await this.validateEventRelations(artistId, input); validateEventTimeline(input); const row = await this.prisma.client.bandEvent.create({ data: { artistId, ...cleanDates(input) } as Prisma.BandEventUncheckedCreateInput }); await this.auditWrite(artistId, "BandEvent", row.id, "event.created", actorLabel, actorOperatorId, { type: row.type, status: row.status }); return this.event(artistId, row.id); }
  async patchEvent(artistId: string, id: string, input: EventPatch, actorLabel: string, actorOperatorId: string) { const existing = await this.prisma.client.bandEvent.findFirst({ where: { id, artistId }, select: { startsAt: true, endsAt: true, loadInAt: true, soundcheckAt: true, doorsAt: true, setAt: true, curfewAt: true } }); if (!existing) throw new NotFoundException("Record not found"); await this.validateEventRelations(artistId, input); validateEventTimeline(input, existing); const row = await this.prisma.client.bandEvent.update({ where: { id }, data: cleanDates(input) }); await this.auditWrite(artistId, "BandEvent", id, "event.updated", actorLabel, actorOperatorId, { fields: Object.keys(input), status: row.status }); return this.event(artistId, id); }
  async eventFromOpportunity(artistId: string, opportunityId: string, actorLabel: string, actorOperatorId: string) { const opportunity = await this.prisma.client.bookingOpportunity.findFirst({ where: { id: opportunityId, artistId }, include: { venue: true } }); if (!opportunity) throw new NotFoundException("Booking opportunity not found"); const existing = await this.prisma.client.bandEvent.findUnique({ where: { opportunityId } }); const row = await this.prisma.client.bandEvent.upsert({ where: { opportunityId }, create: { artistId, opportunityId, venueId: opportunity.venueId, type: "gig", status: "confirmed", title: opportunity.title, startsAt: opportunity.targetDate, locationName: opportunity.venue?.name ?? null }, update: {} }); if (!existing) await this.auditWrite(artistId, "BandEvent", row.id, "event.created_from_opportunity", actorLabel, actorOperatorId, { opportunityId }); return this.event(artistId, row.id); }
  async participant(artistId: string, eventId: string, input: ParticipantInput, actorLabel: string, actorOperatorId: string) { await Promise.all([this.assertArtistRecord("event", artistId, eventId), this.assertArtistRecord("member", artistId, input.bandMemberId)]); const row = await this.prisma.client.eventParticipant.upsert({ where: { eventId_bandMemberId: { eventId, bandMemberId: input.bandMemberId } }, create: { eventId, bandMemberId: input.bandMemberId, response: input.response, assignment: input.assignment ?? null, notes: input.notes ?? null, respondedAt: input.response === "unknown" ? null : new Date() }, update: { response: input.response, assignment: input.assignment ?? null, notes: input.notes ?? null, respondedAt: input.response === "unknown" ? null : new Date() } }); await this.auditWrite(artistId, "EventParticipant", row.id, "event.availability_recorded", actorLabel, actorOperatorId, { eventId, response: row.response }); return row; }
  async generateAdvance(artistId: string, eventId: string, actorLabel: string, actorOperatorId: string) {
    const event = await this.event(artistId, eventId);
    if (!event.startsAt) throw new BadRequestException("Event start time is required before generating an advance");
    const specs = showAdvanceTaskSpecs(event.startsAt);
    const sourceKeys = specs.map((spec) => showAdvanceSourceKey(eventId, spec.key));
    const existing = await this.prisma.client.task.findMany({
      where: { artistId, eventId, OR: [{ sourceKey: { in: sourceKeys } }, { ownerLabel: "Show advance", title: { in: specs.map((spec) => spec.title) } }] },
      select: { id: true, title: true, sourceKey: true }
    });
    const existingTitles = new Set(existing.map((task) => task.title));
    const pending = specs.filter((spec) => !existingTitles.has(spec.title));
    const result = await this.prisma.client.task.createMany({
      data: pending.map((spec) => ({ artistId, eventId, opportunityId: event.opportunityId, title: spec.title, ownerLabel: "Show advance", dueAt: spec.dueAt, sourceKey: showAdvanceSourceKey(eventId, spec.key) })),
      skipDuplicates: true
    });
    const all = await this.prisma.client.task.findMany({ where: { artistId, eventId, sourceKey: { in: sourceKeys } }, orderBy: { dueAt: "asc" } });
    const created = result.count ? all.filter((task) => !existing.some((prior) => prior.id === task.id)).slice(0, result.count) : [];
    await this.auditWrite(artistId, "BandEvent", eventId, "event.advance_generated", actorLabel, actorOperatorId, { version: SHOW_ADVANCE_VERSION, createdCount: result.count });
    return { eventId, version: SHOW_ADVANCE_VERSION, created, createdCount: result.count, existingCount: existing.length };
  }
  async prepareLogistics(artistId: string, eventId: string, actorLabel: string, actorOperatorId: string) { const event = await this.event(artistId, eventId); if (!event.startsAt || !event.endsAt) throw new BadRequestException("Event start and end are required"); const approvals = [await this.approvals.create(artistId, { title: `Add ${event.title} to Google Calendar`, actionType: "calendar_hold_batch", payload: { holds: [{ title: event.title, start: event.startsAt.toISOString(), end: event.endsAt.toISOString(), ...(event.timezone ? { timeZone: event.timezone } : {}) }] }, opportunityId: event.opportunityId, proposedBy: actorLabel, actorOperatorId, status: ApprovalStatus.pending }), await this.approvals.create(artistId, { title: `Create Drive folder for ${event.title}`, actionType: "drive_ensure_folder", payload: { folderName: `${event.startsAt.toISOString().slice(0,10)} ${event.title}` }, opportunityId: event.opportunityId, proposedBy: actorLabel, actorOperatorId, status: ApprovalStatus.pending })]; return approvals; }

  songs(artistId: string) { return this.prisma.client.song.findMany({ where: { artistId }, orderBy: [{ active: "desc" }, { title: "asc" }] }); }
  async createSong(artistId: string, input: SongCreate, actorLabel: string, actorOperatorId: string) { const row = await this.prisma.client.song.create({ data: { artistId, ...input } as Prisma.SongUncheckedCreateInput }); await this.auditWrite(artistId, "Song", row.id, "song.created", actorLabel, actorOperatorId, { title: row.title }); return row; }
  async patchSong(artistId: string, id: string, input: SongPatch, actorLabel: string, actorOperatorId: string) { const row = await this.prisma.client.song.findFirst({ where: { id, artistId } }); if (!row) throw new NotFoundException("Song not found"); const updated = await this.prisma.client.song.update({ where: { id }, data: cleanDates(input) }); await this.auditWrite(artistId, "Song", id, "song.updated", actorLabel, actorOperatorId, { fields: Object.keys(input) }); return updated; }
  setlists(artistId: string) { return this.prisma.client.setlist.findMany({ where: { artistId }, include: { items: { include: { song: true }, orderBy: { sortOrder: "asc" } } }, orderBy: { updatedAt: "desc" } }); }
  private async validateSongs(artistId: string, items: SetlistCreate["items"]) { const ids = items.flatMap((item) => item.songId ? [item.songId] : []); if (!ids.length) return; const count = await this.prisma.client.song.count({ where: { artistId, id: { in: [...new Set(ids)] } } }); if (count !== new Set(ids).size) throw new NotFoundException("Song not found"); }
  async createSetlist(artistId: string, input: SetlistCreate, actorLabel: string, actorOperatorId: string) { await this.validateSongs(artistId, input.items); const row = await this.prisma.client.setlist.create({ data: { artistId, name: input.name, status: input.status, notes: input.notes ?? null, items: { create: input.items.map((item, sortOrder) => ({ ...item, songId: item.songId ?? null, label: item.label ?? null, transitionNotes: item.transitionNotes ?? null, sortOrder })) } }, include: { items: { include: { song: true }, orderBy: { sortOrder: "asc" } } } }); await this.auditWrite(artistId, "Setlist", row.id, "setlist.created", actorLabel, actorOperatorId, { itemCount: row.items.length }); return row; }
  async patchSetlist(artistId: string, id: string, input: SetlistPatch, actorLabel: string, actorOperatorId: string) { await this.assertArtistRecord("setlist", artistId, id); if (input.items) await this.validateSongs(artistId, input.items); const row = await this.prisma.client.$transaction(async (tx) => { if (input.items) { await tx.setlistItem.deleteMany({ where: { setlistId: id } }); await tx.setlistItem.createMany({ data: input.items.map((item, sortOrder) => ({ setlistId: id, songId: item.songId ?? null, itemType: item.itemType, label: item.label ?? null, transitionNotes: item.transitionNotes ?? null, sortOrder })) }); } return tx.setlist.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.status !== undefined ? { status: input.status } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) }, include: { items: { include: { song: true }, orderBy: { sortOrder: "asc" } } } }); }); await this.auditWrite(artistId, "Setlist", id, "setlist.updated", actorLabel, actorOperatorId, { fields: Object.keys(input) }); return row; }

  async projects(artistId: string, now = new Date()) { const rows = await this.prisma.client.artistProject.findMany({ where: { artistId }, include: projectDetailInclude, orderBy: [{ status: "asc" }, { dueAt: "asc" }] }); return rows.map((project) => ({ ...project, readiness: deterministicProjectReadiness(project, now) })); }
  async project(artistId: string, id: string) { const row = await this.prisma.client.artistProject.findFirst({ where: { id, artistId }, include: projectDetailInclude }); if (!row) throw new NotFoundException("Project not found"); return row; }
  async projectReadiness(artistId: string, id: string, now = new Date()) { const project = await this.project(artistId, id); return { project, readiness: deterministicProjectReadiness(project, now) }; }
  async projectReadinessList(artistId: string, now = new Date()) { const projects = await this.prisma.client.artistProject.findMany({ where: { artistId, status: { in: ["draft", "active", "paused"] } }, include: projectDetailInclude, orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }], take: 50 }); return projects.map((project) => deterministicProjectReadiness(project, now)); }
  async createProject(artistId: string, input: ProjectCreate, actorLabel: string, actorOperatorId: string) { if (input.goalId) await this.assertArtistRecord("goal", artistId, input.goalId); const row = await this.prisma.client.artistProject.create({ data: { artistId, ...cleanDates(input) } as Prisma.ArtistProjectUncheckedCreateInput }); await this.auditWrite(artistId, "ArtistProject", row.id, "project.created", actorLabel, actorOperatorId, { type: row.type, name: row.name }); return this.project(artistId, row.id); }
  async patchProject(artistId: string, id: string, input: ProjectPatch, actorLabel: string, actorOperatorId: string) { await this.assertArtistRecord("project", artistId, id); if (input.goalId) await this.assertArtistRecord("goal", artistId, input.goalId); await this.prisma.client.artistProject.update({ where: { id }, data: cleanDates(input) }); await this.auditWrite(artistId, "ArtistProject", id, "project.updated", actorLabel, actorOperatorId, { fields: Object.keys(input) }); return this.project(artistId, id); }
  async generateProjectPlan(artistId: string, id: string, actorLabel: string, actorOperatorId: string) { const project = await this.project(artistId, id); if (!project.dueAt) throw new BadRequestException("Project due date is required before generating milestones"); const specs = projectPlanTemplate(project.type, project.dueAt); const result = await this.prisma.client.task.createMany({ data: specs.map((spec) => ({ artistId, projectId: id, title: spec.title, dueAt: spec.dueAt, sourceKey: `${PROJECT_PLAN_VERSION}:${id}:${spec.key}` })), skipDuplicates: true }); if (result.count) await this.auditWrite(artistId, "ArtistProject", id, "project.plan_generated", actorLabel, actorOperatorId, { version: PROJECT_PLAN_VERSION, createdCount: result.count }); return { projectId: id, version: PROJECT_PLAN_VERSION, createdCount: result.count, project: await this.project(artistId, id) }; }

  deals(artistId: string) { return this.prisma.client.dealOffer.findMany({ where: { artistId }, include: { event: true, contact: true, memos: { orderBy: { version: "desc" }, take: 1 }, agreements: { orderBy: { version: "desc" }, take: 1 }, invoices: true }, orderBy: { updatedAt: "desc" } }); }
  private async validateDealRelations(artistId: string, input: DealCreate | DealPatch) { if (input.eventId) await this.assertArtistRecord("event", artistId, input.eventId); if (input.opportunityId) await this.assertArtistRecord("opportunity", artistId, input.opportunityId); if (input.contactId) await this.assertArtistRecord("contact", artistId, input.contactId); }
  async createDeal(artistId: string, input: DealCreate, actorLabel: string, actorOperatorId: string) { await this.validateDealRelations(artistId, input); const row = await this.prisma.client.dealOffer.create({ data: { artistId, ...cleanDates(input), ...(input.status === "accepted" ? { acceptedAt: new Date() } : {}) } as Prisma.DealOfferUncheckedCreateInput }); await this.snapshotDealMemo(row.id); await this.auditWrite(artistId, "DealOffer", row.id, "deal.created", actorLabel, actorOperatorId, { status: row.status, amountMinor: row.offerAmountMinor ?? null }); return row; }
  async patchDeal(artistId: string, id: string, input: DealPatch, actorLabel: string, actorOperatorId: string) { await this.assertArtistRecord("deal", artistId, id); await this.validateDealRelations(artistId, input); const row = await this.prisma.client.dealOffer.update({ where: { id }, data: { ...cleanDates(input), ...(input.status === "accepted" ? { acceptedAt: new Date() } : {}) } }); await this.snapshotDealMemo(id); await this.auditWrite(artistId, "DealOffer", id, "deal.updated", actorLabel, actorOperatorId, { fields: Object.keys(input), status: row.status }); return row; }
  private async snapshotDealMemo(dealOfferId: string) { const deal = await this.prisma.client.dealOffer.findUniqueOrThrow({ where: { id: dealOfferId } }); const latest = await this.prisma.client.dealMemo.aggregate({ where: { dealOfferId }, _max: { version: true } }); return this.prisma.client.dealMemo.create({ data: { dealOfferId, version: (latest._max.version ?? 0) + 1, termsSnapshot: { status: deal.status, amountMinor: deal.offerAmountMinor, currency: deal.currency, depositMinor: deal.depositMinor, depositDueAt: deal.depositDueAt, balanceDueAt: deal.balanceDueAt, performanceDate: deal.performanceDate, terms: deal.terms, cancellationTerms: deal.cancellationTerms, buyerName: deal.buyerName, buyerEmail: deal.buyerEmail } } }); }
  templates(artistId: string) { return this.prisma.client.documentTemplate.findMany({ where: { artistId }, orderBy: [{ kind: "asc" }, { version: "desc" }] }); }
  async createTemplate(artistId: string, input: { kind: string; name: string; bodyTemplate: string }, actorLabel: string, actorOperatorId: string) { const latest = await this.prisma.client.documentTemplate.aggregate({ where: { artistId, kind: input.kind }, _max: { version: true } }); const row = await this.prisma.client.documentTemplate.create({ data: { artistId, ...input, version: (latest._max.version ?? 0) + 1 } }); await this.auditWrite(artistId, "DocumentTemplate", row.id, "document_template.created", actorLabel, actorOperatorId, { kind: row.kind, version: row.version }); return row; }
  async activateTemplate(artistId: string, id: string, actorLabel: string, actorOperatorId: string) { await this.assertArtistRecord("template", artistId, id); const template = await this.prisma.client.documentTemplate.findUniqueOrThrow({ where: { id } }); await this.prisma.client.$transaction([this.prisma.client.documentTemplate.updateMany({ where: { artistId, kind: template.kind }, data: { active: false } }), this.prisma.client.documentTemplate.update({ where: { id }, data: { active: true } })]); await this.auditWrite(artistId, "DocumentTemplate", id, "document_template.activated", actorLabel, actorOperatorId, { kind: template.kind, version: template.version }); return this.prisma.client.documentTemplate.findUniqueOrThrow({ where: { id } }); }
  async generateDealDocument(artistId: string, dealId: string, templateId: string | undefined, actorLabel: string, actorOperatorId: string) { await this.assertArtistRecord("deal", artistId, dealId); const deal = await this.prisma.client.dealOffer.findUniqueOrThrow({ where: { id: dealId }, include: { artist: true } }); const template = templateId ? await this.prisma.client.documentTemplate.findFirst({ where: { id: templateId, artistId, active: true } }) : await this.prisma.client.documentTemplate.findFirst({ where: { artistId, kind: "agreement", active: true }, orderBy: { version: "desc" } }); if (!template) throw new BadRequestException("An owner-reviewed active agreement template is required"); const fields: Record<string,string> = { artistName: deal.artist.name, buyerName: deal.buyerName ?? "Unknown buyer", performanceDate: deal.performanceDate?.toISOString().slice(0,10) ?? "TBD", amount: deal.offerAmountMinor == null ? "TBD" : (deal.offerAmountMinor / 100).toFixed(2), currency: deal.currency, terms: deal.terms ?? "Not specified", cancellationTerms: deal.cancellationTerms ?? "Not specified" }; const unknown = [...template.bodyTemplate.matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)].map((match) => match[1]!).filter((name) => !(name in fields)); if (unknown.length) throw new BadRequestException(`Unknown template variable: ${unknown[0]}`); const rendered = template.bodyTemplate.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_, name: string) => fields[name] ?? ""); const latest = await this.prisma.client.agreement.aggregate({ where: { dealOfferId: dealId }, _max: { version: true } }); const version = (latest._max.version ?? 0) + 1; const title = `${deal.title} agreement v${version}`; const { bytes, sha256 } = renderTextPdf(title, `${rendered}\n\n${template.legalDisclaimer}`); const agreement = await this.prisma.client.agreement.create({ data: { artistId, dealOfferId: dealId, templateId: template.id, version, title, renderedText: rendered, signerName: deal.buyerName, signerEmail: deal.buyerEmail, snapshots: { create: { artistId, kind: "agreement", version, sha256, contentBase64: bytes.toString("base64") } } }, include: { snapshots: true } }); await this.auditWrite(artistId, "Agreement", agreement.id, "agreement.generated", actorLabel, actorOperatorId, { dealId, templateId: template.id, version, sha256 }); return agreement; }
  async prepareDealDelivery(artistId: string, dealId: string, actorLabel: string, actorOperatorId: string) { await this.assertArtistRecord("deal", artistId, dealId); const deal = await this.prisma.client.dealOffer.findUniqueOrThrow({ where: { id: dealId }, include: { agreements: { include: { snapshots: true }, orderBy: { version: "desc" }, take: 1 } } }); const agreement = deal.agreements[0]; if (!agreement) throw new BadRequestException("Generate and review an agreement first"); if (!deal.buyerEmail) throw new BadRequestException("Buyer email is required"); return this.approvals.create(artistId, { title: `Prepare delivery of ${agreement.title}`, actionType: "outbound_email_batch", payload: { drafts: [{ message: { to: deal.buyerEmail, subject: agreement.title, body: `Please review the attached agreement. StoryBoard document snapshot: ${agreement.snapshots[0]?.id ?? "unavailable"}. A human must attach the approved PDF before sending.` } }] }, opportunityId: deal.opportunityId, proposedBy: actorLabel, actorOperatorId, status: ApprovalStatus.pending }); }

  invoices(artistId: string) { return this.prisma.client.invoice.findMany({ where: { artistId }, include: { payments: true, dealOffer: true, event: true }, orderBy: { updatedAt: "desc" } }); }
  private async validateInvoiceRelations(artistId: string, input: InvoiceCreate | InvoicePatch) { if (input.dealOfferId) await this.assertArtistRecord("deal", artistId, input.dealOfferId); if (input.eventId) await this.assertArtistRecord("event", artistId, input.eventId); }
  async createInvoice(artistId: string, input: InvoiceCreate, actorLabel: string, actorOperatorId: string) { await this.validateInvoiceRelations(artistId, input); const row = await this.prisma.client.invoice.create({ data: { artistId, ...cleanDates(input), totalMinor: input.subtotalMinor + input.taxMinor } as Prisma.InvoiceUncheckedCreateInput }); await this.auditWrite(artistId, "Invoice", row.id, "invoice.created", actorLabel, actorOperatorId, { number: row.number, totalMinor: row.totalMinor }); return row; }
  async patchInvoice(artistId: string, id: string, input: InvoicePatch, actorLabel: string, actorOperatorId: string) { await this.assertArtistRecord("invoice", artistId, id); await this.validateInvoiceRelations(artistId, input); const existing = await this.prisma.client.invoice.findUniqueOrThrow({ where: { id } }); const subtotal = input.subtotalMinor ?? existing.subtotalMinor; const tax = input.taxMinor ?? existing.taxMinor; if (subtotal + tax < existing.paidMinor) throw new BadRequestException("Invoice total cannot be less than recorded payments"); const row = await this.prisma.client.invoice.update({ where: { id }, data: { ...cleanDates(input), totalMinor: subtotal + tax } }); await this.auditWrite(artistId, "Invoice", id, "invoice.updated", actorLabel, actorOperatorId, { fields: Object.keys(input) }); return row; }
  async recordPayment(artistId: string, invoiceId: string, input: PaymentInput, actorLabel: string, actorOperatorId: string) { await this.assertArtistRecord("invoice", artistId, invoiceId); const existing = await this.prisma.client.paymentRecord.findUnique({ where: { artistId_idempotencyKey: { artistId, idempotencyKey: input.idempotencyKey } } }); if (existing) { if (existing.invoiceId !== invoiceId || existing.amountMinor !== input.amountMinor) throw new BadRequestException("Idempotency key was already used for a different payment"); return existing; } const invoice = await this.prisma.client.invoice.findUniqueOrThrow({ where: { id: invoiceId } }); if (input.currency !== invoice.currency) throw new BadRequestException("Payment currency must match invoice currency"); if (invoice.paidMinor + input.amountMinor > invoice.totalMinor) throw new BadRequestException("Payment exceeds invoice balance"); const result = await this.prisma.client.$transaction(async (tx) => { const payment = await tx.paymentRecord.create({ data: { artistId, invoiceId, idempotencyKey: input.idempotencyKey, amountMinor: input.amountMinor, currency: input.currency, method: input.method, reference: input.reference ?? null, evidenceUrl: input.evidenceUrl ?? null, receivedAt: new Date(input.receivedAt) } }); const paidMinor = invoice.paidMinor + input.amountMinor; await tx.invoice.update({ where: { id: invoiceId }, data: { paidMinor, status: paidMinor === invoice.totalMinor ? InvoiceStatus.paid : InvoiceStatus.partially_paid } }); return payment; }); await this.auditWrite(artistId, "PaymentRecord", result.id, "invoice.payment_recorded", actorLabel, actorOperatorId, { invoiceId, amountMinor: input.amountMinor, idempotencyKey: input.idempotencyKey }); return result; }

  expenses(artistId: string) { return this.prisma.client.expense.findMany({ where: { artistId }, include: { event: true, project: true }, orderBy: { incurredAt: "desc" } }); }
  private async validateExpenseRelations(artistId: string, input: ExpenseCreate | ExpensePatch) { if (input.eventId) await this.assertArtistRecord("event", artistId, input.eventId); if (input.projectId) await this.assertArtistRecord("project", artistId, input.projectId); }
  async createExpense(artistId: string, input: ExpenseCreate, actorLabel: string, actorOperatorId: string) { await this.validateExpenseRelations(artistId, input); const row = await this.prisma.client.expense.create({ data: { artistId, eventId: input.eventId ?? null, projectId: input.projectId ?? null, category: input.category, description: input.description, amountMinor: input.amountMinor, currency: input.currency, incurredAt: new Date(input.incurredAt), receiptUrl: input.receiptUrl ?? null } }); await this.auditWrite(artistId, "Expense", row.id, "expense.created", actorLabel, actorOperatorId, { amountMinor: row.amountMinor, eventId: row.eventId, projectId: row.projectId }); return row; }
  async patchExpense(artistId: string, id: string, input: ExpensePatch, actorLabel: string, actorOperatorId: string) { const existing = await this.prisma.client.expense.findFirst({ where: { id, artistId, settlementId: null } }); if (!existing) throw new NotFoundException("Editable expense not found"); await this.validateExpenseRelations(artistId, input); const row = await this.prisma.client.expense.update({ where: { id }, data: { ...cleanDates(input), ...(input.incurredAt ? { incurredAt: new Date(input.incurredAt) } : {}) } }); await this.auditWrite(artistId, "Expense", id, "expense.updated", actorLabel, actorOperatorId, { fields: Object.keys(input) }); return row; }

  settlements(artistId: string) { return this.prisma.client.settlement.findMany({ where: { artistId }, include: { event: true, expenses: true, splits: { include: { bandMember: true } } }, orderBy: { updatedAt: "desc" } }); }
  private async validateSplits(artistId: string, splits: { bandMemberId: string; basisPoints: number }[]) { for (const split of splits) await this.assertArtistRecord("member", artistId, split.bandMemberId); if (new Set(splits.map((split) => split.bandMemberId)).size !== splits.length) throw new BadRequestException("A member may appear only once in a settlement"); }
  async createSettlement(artistId: string, input: SettlementCreate, actorLabel: string, actorOperatorId: string) {
    await this.assertArtistRecord("event", artistId, input.eventId);
    await this.validateSplits(artistId, input.splits);
    const currency = input.currency.toUpperCase();
    const expenseWhere: Prisma.ExpenseWhereInput = { artistId, eventId: input.eventId, currency: { equals: currency, mode: "insensitive" } };
    const expenses = await this.prisma.client.expense.aggregate({ where: expenseWhere, _sum: { amountMinor: true } });
    const expenseMinor = expenses._sum.amountMinor ?? 0;
    const netMinor = input.grossMinor - expenseMinor;
    if (netMinor < 0) throw new BadRequestException("Settlement expenses exceed gross revenue");
    const row = await this.prisma.client.settlement.create({ data: { artistId, eventId: input.eventId, currency, grossMinor: input.grossMinor, expenseMinor, netMinor, notes: input.notes ?? null, splits: { create: input.splits.map((split) => ({ ...split, amountMinor: Math.floor(netMinor * split.basisPoints / 10000) })) } }, include: { splits: true } });
    await this.auditWrite(artistId, "Settlement", row.id, "settlement.created", actorLabel, actorOperatorId, { eventId: input.eventId, grossMinor: row.grossMinor, expenseMinor, netMinor });
    return row;
  }

  async patchSettlement(artistId: string, id: string, input: SettlementPatch, actorLabel: string, actorOperatorId: string) {
    await this.assertArtistRecord("settlement", artistId, id);
    const existing = await this.prisma.client.settlement.findUniqueOrThrow({ where: { id }, include: { splits: true } });
    if (existing.status === SettlementStatus.finalized) throw new BadRequestException("Finalized settlements are immutable");
    if (input.splits) await this.validateSplits(artistId, input.splits);
    const expenseWhere: Prisma.ExpenseWhereInput = { artistId, eventId: existing.eventId, currency: { equals: existing.currency, mode: "insensitive" } };
    const expenses = await this.prisma.client.expense.aggregate({ where: expenseWhere, _sum: { amountMinor: true } });
    const expenseMinor = expenses._sum.amountMinor ?? 0;
    const grossMinor = input.grossMinor ?? existing.grossMinor;
    const netMinor = grossMinor - expenseMinor;
    if (netMinor < 0) throw new BadRequestException("Settlement expenses exceed gross revenue");
    const specs = input.splits ?? existing.splits.map((split) => ({ bandMemberId: split.bandMemberId, basisPoints: split.basisPoints }));
    const row = await this.prisma.client.$transaction(async (tx) => {
      if (input.splits) await tx.memberSplit.deleteMany({ where: { settlementId: id } });
      if (input.splits) await tx.memberSplit.createMany({ data: specs.map((split) => ({ settlementId: id, ...split, amountMinor: Math.floor(netMinor * split.basisPoints / 10000) })) });
      else for (const split of specs) await tx.memberSplit.update({ where: { settlementId_bandMemberId: { settlementId: id, bandMemberId: split.bandMemberId } }, data: { amountMinor: Math.floor(netMinor * split.basisPoints / 10000) } });
      return tx.settlement.update({ where: { id }, data: { grossMinor, expenseMinor, netMinor, ...(input.notes !== undefined ? { notes: input.notes } : {}) }, include: { splits: true } });
    });
    await this.auditWrite(artistId, "Settlement", id, "settlement.updated", actorLabel, actorOperatorId, { grossMinor, expenseMinor, netMinor });
    return row;
  }

  async finalizeSettlement(artistId: string, id: string, actorLabel: string, actorOperatorId: string) {
    await this.assertArtistRecord("settlement", artistId, id);
    const settlement = await this.prisma.client.settlement.findUniqueOrThrow({ where: { id }, include: { event: true, splits: { include: { bandMember: true } } } });
    if (settlement.status === SettlementStatus.finalized) return settlement;
    if (settlement.splits.length && settlement.splits.reduce((sum, split) => sum + split.basisPoints, 0) !== 10000) throw new BadRequestException("Member splits must total 100%");
    const expenseWhere: Prisma.ExpenseWhereInput = { artistId, eventId: settlement.eventId, currency: { equals: settlement.currency, mode: "insensitive" } };
    const expenses = await this.prisma.client.expense.aggregate({ where: expenseWhere, _sum: { amountMinor: true } });
    const expenseMinor = expenses._sum.amountMinor ?? 0;
    const netMinor = settlement.grossMinor - expenseMinor;
    if (netMinor < 0) throw new BadRequestException("Settlement expenses exceed gross revenue");
    const splitAmounts = settlement.splits.map((split) => ({ ...split, amountMinor: Math.floor(netMinor * split.basisPoints / 10000) }));
    const title = `${settlement.event.title} settlement`;
    const body = [`Gross: ${settlement.currency} ${(settlement.grossMinor/100).toFixed(2)}`, `Expenses: ${settlement.currency} ${(expenseMinor/100).toFixed(2)}`, `Net: ${settlement.currency} ${(netMinor/100).toFixed(2)}`, "", ...splitAmounts.map((split) => `${split.bandMember.name}: ${settlement.currency} ${(split.amountMinor/100).toFixed(2)}`)].join("\n");
    const { bytes, sha256 } = renderTextPdf(title, body);
    const row = await this.prisma.client.$transaction(async (tx) => {
      await tx.expense.updateMany({ where: { ...expenseWhere, settlementId: null }, data: { settlementId: id } });
      for (const split of splitAmounts) await tx.memberSplit.update({ where: { settlementId_bandMemberId: { settlementId: id, bandMemberId: split.bandMemberId } }, data: { amountMinor: split.amountMinor } });
      return tx.settlement.update({ where: { id }, data: { expenseMinor, netMinor, status: SettlementStatus.finalized, finalizedAt: new Date(), snapshots: { create: { artistId, kind: "settlement", version: 1, sha256, contentBase64: bytes.toString("base64") } } }, include: { splits: true, snapshots: true } });
    });
    await this.auditWrite(artistId, "Settlement", id, "settlement.finalized", actorLabel, actorOperatorId, { sha256, expenseMinor, netMinor: row.netMinor });
    return row;
  }
}
