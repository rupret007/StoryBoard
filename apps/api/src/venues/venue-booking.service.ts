import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  isSafeHttpUrl,
  resolveVenueBookingOutreachContext,
  venueApplicationTaskTitle
} from "@storyboard/shared";
import {
  BookingProspectKind,
  BookingProspectStatus,
  BookingStage,
  TaskStatus
} from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { BookingProspectsService } from "../booking/booking-prospects.service";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../tasks/tasks.service";
import type { VenueCreateOpportunityInput, VenueCreateProspectInput } from "./venue-booking.schema";

const VENUE_PROSPECT_SOURCE = "venue_crm";

@Injectable()
export class VenueBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly prospects: BookingProspectsService,
    private readonly tasks: TasksService
  ) {}

  private async loadVenue(artistId: string, venueId: string) {
    const venue = await this.prisma.client.venue.findFirst({
      where: { id: venueId, artistId }
    });
    if (!venue) throw new NotFoundException("Venue not found");
    return venue;
  }

  private async loadBookingContact(artistId: string, venueId: string) {
    return this.prisma.client.contact.findFirst({
      where: { artistId, venueId },
      orderBy: [{ contactKind: "asc" }, { updatedAt: "desc" }]
    });
  }

  async getPackDetail(artistId: string, venueId: string) {
    const venue = await this.loadVenue(artistId, venueId);
    const contacts = await this.prisma.client.contact.findMany({
      where: { artistId, venueId },
      orderBy: { updatedAt: "desc" }
    });
    const bookingContact =
      contacts.find((c) => c.contactKind === "venue_staff") ?? contacts[0] ?? null;
    const outreach = resolveVenueBookingOutreachContext(venue, bookingContact);
    return {
      venue,
      contacts,
      pack: {
        slug: outreach.slug,
        bookingEmail: outreach.bookingEmail,
        phone: outreach.phone,
        applyUrl: outreach.applyUrl,
        webApplicationFirst: outreach.webApplicationFirst,
        capacity: venue.capacity,
        notes: venue.notes,
        region: venue.region
      }
    };
  }

  async createOpportunityFromVenue(
    artistId: string,
    venueId: string,
    input: VenueCreateOpportunityInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const venue = await this.loadVenue(artistId, venueId);
    const existing = await this.prisma.client.bookingOpportunity.findFirst({
      where: {
        artistId,
        venueId: venue.id,
        stage: { not: BookingStage.closed }
      },
      orderBy: { updatedAt: "desc" },
      include: { venue: true }
    });
    if (existing) {
      return { ...existing, created: false };
    }
    const title = input.title?.trim() || `${venue.name} — booking`;
    const row = await this.prisma.client.bookingOpportunity.create({
      data: {
        artistId,
        title,
        venueId: venue.id,
        stage: BookingStage.target,
        targetDate: input.targetDate ? new Date(input.targetDate) : null
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
      metadata: { title: row.title, stage: row.stage, source: "venue_crm", venueId }
    });
    return { ...row, created: true };
  }

  async createProspectFromVenue(
    artistId: string,
    venueId: string,
    input: VenueCreateProspectInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const venue = await this.loadVenue(artistId, venueId);
    const bookingContact = await this.loadBookingContact(artistId, venueId);
    const outreach = resolveVenueBookingOutreachContext(venue, bookingContact);
    const safeApplyUrl =
      outreach.applyUrl && isSafeHttpUrl(outreach.applyUrl) ? outreach.applyUrl : null;

    if (input.opportunityId) {
      const opportunity = await this.prisma.client.bookingOpportunity.findFirst({
        where: { id: input.opportunityId, artistId },
        select: { id: true }
      });
      if (!opportunity) throw new NotFoundException("Booking opportunity not found");
    }

    const sourceRef = `venue:${venueId}:prospect`;
    const existing = await this.prisma.client.bookingProspect.findFirst({
      where: {
        artistId,
        sourceSystem: VENUE_PROSPECT_SOURCE,
        sourceRef
      },
      include: { venue: true, contact: true, opportunity: { include: { venue: true } } }
    });
    if (existing) {
      let prospect = existing;
      if (input.opportunityId && !existing.opportunityId) {
        prospect = await this.prospects.patch(
          artistId,
          existing.id,
          { opportunityId: input.opportunityId },
          actorLabel,
          actorOperatorId
        );
      }
      return {
        prospect,
        created: false,
        contactLinked: Boolean(prospect.contactId),
        applicationTask: null,
        travisNote:
          "Travis owns the send. StoryBoard records prospects and drafts only — nothing auto-pitches from here."
      };
    }

    if (!bookingContact?.email && !safeApplyUrl) {
      throw new BadRequestException(
        "Add a booking contact email or safe apply URL on this venue before creating a prospect."
      );
    }

    const status = bookingContact?.email
      ? BookingProspectStatus.qualified
      : BookingProspectStatus.discovered;

    const prospect = await this.prospects.create(
      artistId,
      {
        kind: BookingProspectKind.venue,
        status,
        name: venue.name,
        city: venue.city,
        region: venue.region ?? undefined,
        capacity: venue.capacity ?? undefined,
        notes: safeApplyUrl
          ? `Venue pack apply URL: ${safeApplyUrl}`
          : undefined,
        sourceSystem: VENUE_PROSPECT_SOURCE,
        sourceRef,
        venueId: venue.id,
        contactId: bookingContact?.id ?? undefined,
        opportunityId: input.opportunityId ?? undefined
      },
      actorLabel,
      actorOperatorId
    );

    let applicationTask: Awaited<ReturnType<TasksService["create"]>> | null = null;
    const shouldTrackApplication =
      Boolean(safeApplyUrl) &&
      (outreach.webApplicationFirst || !bookingContact?.email);
    if (shouldTrackApplication && safeApplyUrl) {
      const taskTitle = venueApplicationTaskTitle(safeApplyUrl);
      const existingTask = await this.prisma.client.task.findFirst({
        where: {
          artistId,
          title: taskTitle,
          opportunityId: input.opportunityId ?? null
        }
      });
      if (!existingTask) {
        applicationTask = await this.tasks.create(
          artistId,
          {
            title: taskTitle,
            opportunityId: input.opportunityId ?? null,
            status: TaskStatus.todo
          },
          actorLabel,
          actorOperatorId
        );
      } else {
        applicationTask = existingTask;
      }
    }

    return {
      prospect,
      created: true,
      contactLinked: Boolean(prospect.contactId),
      applicationTask,
      travisNote:
        "Travis owns the send. StoryBoard records prospects and drafts only — nothing auto-pitches from here."
    };
  }
}
