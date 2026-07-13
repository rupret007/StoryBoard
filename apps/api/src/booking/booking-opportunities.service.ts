import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { BookingStage } from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  BookingOpportunityCreateInput,
  BookingOpportunityPatchInput
} from "./booking-opportunity.schema";

@Injectable()
export class BookingOpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private readonly stageTransitionPolicy: Record<
    BookingStage,
    readonly BookingStage[]
  > = {
    [BookingStage.target]: [
      BookingStage.outreach,
      BookingStage.conversation,
      BookingStage.offer,
      BookingStage.hold,
      BookingStage.confirmed,
      BookingStage.closed
    ],
    [BookingStage.outreach]: [
      BookingStage.conversation,
      BookingStage.offer,
      BookingStage.hold,
      BookingStage.confirmed,
      BookingStage.closed
    ],
    [BookingStage.conversation]: [
      BookingStage.offer,
      BookingStage.hold,
      BookingStage.confirmed,
      BookingStage.closed
    ],
    [BookingStage.offer]: [
      BookingStage.hold,
      BookingStage.confirmed,
      BookingStage.closed
    ],
    [BookingStage.hold]: [
      BookingStage.offer,
      BookingStage.confirmed,
      BookingStage.closed
    ],
    [BookingStage.confirmed]: [BookingStage.closed],
    [BookingStage.closed]: []
  };

  private assertValidStageTransition(from: BookingStage, to: BookingStage) {
    if (from === to) return;
    if (!this.stageTransitionPolicy[from].includes(to)) {
      throw new BadRequestException("Invalid booking stage transition");
    }
  }

  list(artistId: string) {
    return this.prisma.client.bookingOpportunity.findMany({
      where: { artistId },
      include: { venue: true },
      orderBy: { updatedAt: "desc" }
    });
  }

  async get(artistId: string, id: string) {
    const row = await this.prisma.client.bookingOpportunity.findFirst({
      where: { id, artistId },
      include: { venue: true }
    });
    if (!row) {
      throw new NotFoundException("Booking opportunity not found");
    }
    return row;
  }

  private async assertVenueBelongsToArtist(
    artistId: string,
    venueId: string
  ): Promise<void> {
    const venue = await this.prisma.client.venue.findFirst({
      where: { id: venueId, artistId },
      select: { id: true }
    });
    if (!venue) {
      throw new NotFoundException("Venue not found");
    }
  }

  async create(
    artistId: string,
    data: BookingOpportunityCreateInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    if (data.venueId != null) {
      await this.assertVenueBelongsToArtist(artistId, data.venueId);
    }
    const row = await this.prisma.client.bookingOpportunity.create({
      data: {
        artistId,
        title: data.title,
        venueId: data.venueId ?? null,
        stage: data.stage ?? BookingStage.target,
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
        marketNotes: data.marketNotes ?? null
      },
      include: { venue: true }
    });
    await this.audit.log({
      artistId,
      aggregateType: "BookingOpportunity",
      aggregateId: row.id,
      action: "booking.created",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { title: row.title, stage: row.stage }
    });
    return row;
  }

  async updateStage(
    artistId: string,
    id: string,
    stage: BookingStage,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const existing = await this.get(artistId, id);
    this.assertValidStageTransition(existing.stage, stage);
    if (existing.stage === stage) {
      return existing;
    }
    const { row, event } = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.bookingOpportunity.update({ where: { id }, data: { stage }, include: { venue: true } });
      const linkedEvent = stage === BookingStage.confirmed ? await tx.bandEvent.upsert({
        where: { opportunityId: updated.id },
        create: {
          artistId,
          opportunityId: updated.id,
          venueId: updated.venueId,
          type: "gig",
          status: "confirmed",
          title: updated.title,
          startsAt: updated.targetDate,
          locationName: updated.venue?.name ?? null
        },
        update: {
          status: "confirmed",
          venueId: updated.venueId,
          title: updated.title,
          startsAt: updated.targetDate,
          locationName: updated.venue?.name ?? null
        }
      }) : null;
      return { row: updated, event: linkedEvent };
    });
    if (event) {
      await this.audit.log({ artistId, aggregateType: "BandEvent", aggregateId: event.id, action: "event.confirmed_from_opportunity", actorLabel, actorOperatorId: actorOperatorId ?? null, metadata: { opportunityId: row.id } });
    }
    await this.audit.log({
      artistId,
      aggregateType: "BookingOpportunity",
      aggregateId: row.id,
      action: "booking.stage_changed",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { from: existing.stage, to: stage }
    });
    return row;
  }

  async patch(
    artistId: string,
    id: string,
    data: BookingOpportunityPatchInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    await this.get(artistId, id);
    if (data.venueId != null) {
      await this.assertVenueBelongsToArtist(artistId, data.venueId);
    }
    const patchData: Prisma.BookingOpportunityUncheckedUpdateInput = {};
    if (data.title !== undefined) {
      patchData.title = data.title;
    }
    if (data.venueId !== undefined) {
      patchData.venueId = data.venueId;
    }
    if (data.marketNotes !== undefined) {
      patchData.marketNotes = data.marketNotes;
    }
    if (data.targetDate !== undefined) {
      patchData.targetDate = data.targetDate
        ? new Date(data.targetDate)
        : null;
    }
    const row = await this.prisma.client.bookingOpportunity.update({
      where: { id },
      data: patchData,
      include: { venue: true }
    });
    await this.audit.log({
      artistId,
      aggregateType: "BookingOpportunity",
      aggregateId: row.id,
      action: "booking.updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: data as Record<string, unknown>
    });
    return row;
  }
}
