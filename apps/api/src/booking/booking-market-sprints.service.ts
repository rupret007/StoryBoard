import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BookingMarketSprintCreateInput,
  BookingMarketSprintPatchInput
} from "@storyboard/shared";
import { AuditService } from "../audit/audit.service";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BookingMarketSprintsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list(artistId: string) {
    return this.prisma.client.bookingMarketSprint.findMany({
      where: { artistId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
  }

  private dates(input: { targetDateWindowStart?: string | null | undefined; targetDateWindowEnd?: string | null | undefined }) {
    const start = input.targetDateWindowStart === undefined ? undefined : input.targetDateWindowStart ? new Date(input.targetDateWindowStart) : null;
    const end = input.targetDateWindowEnd === undefined ? undefined : input.targetDateWindowEnd ? new Date(input.targetDateWindowEnd) : null;
    if (start && end && start > end) throw new BadRequestException("Sprint date window end must be on or after its start");
    return { start, end };
  }

  async get(artistId: string, id: string) {
    const sprint = await this.prisma.client.bookingMarketSprint.findFirst({ where: { id, artistId } });
    if (!sprint) throw new NotFoundException("Booking market sprint not found");
    const [prospects, campaigns, followUps] = await Promise.all([
      this.prisma.client.bookingProspect.groupBy({ by: ["status"], where: { artistId, marketSprintId: id }, _count: { _all: true } }),
      this.prisma.client.bookingCampaign.findMany({
        where: { artistId, marketSprintId: id },
        include: { recipients: { select: { status: true } } }, orderBy: { updatedAt: "desc" }
      }),
      this.prisma.client.task.findMany({
        where: { artistId, dueAt: { lte: new Date() }, status: { not: "done" }, bookingCampaignFollowUpFor: { campaign: { marketSprintId: id } } },
        include: { bookingCampaignFollowUpFor: { include: { prospect: true } } }, orderBy: { dueAt: "asc" }, take: 25
      })
    ]);
    const funnel = { discovered: 0, qualified: 0, disqualified: 0, converted: 0, needs_contact: 0, ready: 0, approval_requested: 0, drafted: 0, sent: 0, replied: 0, declined: 0, booked: 0 };
    for (const row of prospects) funnel[row.status] = row._count._all;
    for (const campaign of campaigns) for (const recipient of campaign.recipients) funnel[recipient.status] += 1;
    return { sprint, funnel, campaigns, overdueFollowUps: followUps };
  }

  async create(artistId: string, input: BookingMarketSprintCreateInput, actorLabel?: string | null, actorOperatorId?: string | null) {
    const { start, end } = this.dates(input);
    const sprint = await this.prisma.client.bookingMarketSprint.create({
      data: { artistId, name: input.name, city: input.city, region: input.region ?? null, country: input.country ?? null,
        targetDateWindowStart: start ?? null, targetDateWindowEnd: end ?? null, targetQualifiedCount: input.targetQualifiedCount ?? null,
        targetOutreachCount: input.targetOutreachCount ?? null, targetBookedCount: input.targetBookedCount ?? null, status: input.status ?? "draft" }
    });
    await this.audit.log({ artistId, aggregateType: "BookingMarketSprint", aggregateId: sprint.id, action: "booking_market_sprint.created", actorLabel, actorOperatorId: actorOperatorId ?? null, metadata: { city: sprint.city, status: sprint.status } });
    return sprint;
  }

  async patch(artistId: string, id: string, input: BookingMarketSprintPatchInput, actorLabel?: string | null, actorOperatorId?: string | null) {
    const current = await this.get(artistId, id);
    const { start, end } = this.dates({ targetDateWindowStart: input.targetDateWindowStart === undefined ? current.sprint.targetDateWindowStart?.toISOString() ?? null : input.targetDateWindowStart, targetDateWindowEnd: input.targetDateWindowEnd === undefined ? current.sprint.targetDateWindowEnd?.toISOString() ?? null : input.targetDateWindowEnd });
    const data: Prisma.BookingMarketSprintUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.city !== undefined) data.city = input.city;
    if (input.region !== undefined) data.region = input.region;
    if (input.country !== undefined) data.country = input.country;
    if (input.targetDateWindowStart !== undefined) data.targetDateWindowStart = start ?? null;
    if (input.targetDateWindowEnd !== undefined) data.targetDateWindowEnd = end ?? null;
    if (input.targetQualifiedCount !== undefined) data.targetQualifiedCount = input.targetQualifiedCount;
    if (input.targetOutreachCount !== undefined) data.targetOutreachCount = input.targetOutreachCount;
    if (input.targetBookedCount !== undefined) data.targetBookedCount = input.targetBookedCount;
    if (input.status !== undefined) data.status = input.status;
    const sprint = await this.prisma.client.bookingMarketSprint.update({ where: { id }, data });
    await this.audit.log({ artistId, aggregateType: "BookingMarketSprint", aggregateId: id, action: "booking_market_sprint.updated", actorLabel, actorOperatorId: actorOperatorId ?? null, metadata: { updatedFields: Object.keys(input) } });
    return sprint;
  }
}
