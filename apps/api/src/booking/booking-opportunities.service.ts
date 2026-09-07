import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BOOKING_STAGE_STALE_MESSAGE, nextBookingStages } from "@storyboard/shared";
import { Prisma } from "../generated/prisma/client";
import { BookingStage } from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  BookingOpportunityCreateInput,
  BookingOpportunityPatchInput,
  BookingOpportunityStageInput
} from "./booking-opportunity.schema";

@Injectable()
export class BookingOpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

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
    input: BookingOpportunityStageInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const expectedVersion = new Date(input.expectedUpdatedAt);
    if (!Number.isFinite(expectedVersion.getTime())) {
      throw new BadRequestException("A valid opportunity version is required");
    }
    const { stage } = input;
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const existing = await tx.bookingOpportunity.findFirst({
          where: { id, artistId }, include: { venue: true }
        });
        if (!existing) throw new NotFoundException("Booking opportunity not found");
        if (existing.updatedAt.getTime() !== expectedVersion.getTime()) {
          throw new ConflictException(BOOKING_STAGE_STALE_MESSAGE);
        }
        if (existing.stage === stage) return existing;
        if (!nextBookingStages(existing.stage).includes(stage)) {
          throw new BadRequestException("Invalid booking stage transition");
        }
        const updated = await tx.bookingOpportunity.updateMany({
          where: { id, artistId, updatedAt: expectedVersion, stage: existing.stage },
          data: { stage, updatedAt: new Date(Math.max(Date.now(), expectedVersion.getTime() + 1)) }
        });
        if (updated.count !== 1) throw new ConflictException(BOOKING_STAGE_STALE_MESSAGE);
        // A gig may already have been advanced independently. Confirmation must
        // never replace that show's edited time, status, or venue with pipeline data.
        if (stage === BookingStage.confirmed) {
          const linkedEvent = await tx.bandEvent.findUnique({ where: { opportunityId: id } });
          if (linkedEvent && linkedEvent.artistId !== artistId) {
            throw new NotFoundException("Linked event not found");
          }
          if (!linkedEvent) {
            const event = await tx.bandEvent.create({
              data: {
                artistId, opportunityId: id, venueId: existing.venueId,
                type: "gig", status: "confirmed", title: existing.title,
                startsAt: existing.targetDate, locationName: existing.venue?.name ?? null
              }
            });
            await this.audit.log({
              artistId, aggregateType: "BandEvent", aggregateId: event.id,
              action: "event.confirmed_from_opportunity", actorLabel,
              actorOperatorId: actorOperatorId ?? null, metadata: { opportunityId: id }
            }, tx);
          }
        }
        await this.audit.log({
          artistId, aggregateType: "BookingOpportunity", aggregateId: id,
          action: "booking.stage_changed", actorLabel,
          actorOperatorId: actorOperatorId ?? null,
          metadata: { from: existing.stage, to: stage, expectedUpdatedAt: input.expectedUpdatedAt }
        }, tx);
        return tx.bookingOpportunity.findFirstOrThrow({ where: { id, artistId }, include: { venue: true } });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error.code === "P2034" || error.code === "P2002")) {
        throw new ConflictException(BOOKING_STAGE_STALE_MESSAGE);
      }
      throw error;
    }
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
