import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BookingProspectConversionInput,
  BookingProspectContactInput,
  BookingProspectCreateInput,
  BookingProspectDiscoverInput,
  BookingProspectPatchInput
} from "@storyboard/shared";
import {
  BookingProspectKind,
  BookingProspectStatus,
  ContactKind
} from "../generated/prisma/enums";
import { Prisma } from "../generated/prisma/client";
import { AuditService } from "../audit/audit.service";
import { AdapterRegistryResolver } from "../integrations/adapter-registry.resolver";
import { PrismaService } from "../prisma/prisma.service";
import { BookingProfilesService } from "./booking-profiles.service";

const prospectInclude = {
  venue: true,
  contact: true,
  opportunity: { include: { venue: true } }
} as const;

@Injectable()
export class BookingProspectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly profiles: BookingProfilesService,
    private readonly registryResolver: AdapterRegistryResolver
  ) {}

  list(artistId: string) {
    return this.prisma.client.bookingProspect.findMany({
      where: { artistId },
      include: prospectInclude,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
  }

  async get(artistId: string, id: string) {
    const prospect = await this.prisma.client.bookingProspect.findFirst({
      where: { id, artistId },
      include: prospectInclude
    });
    if (!prospect) {
      throw new NotFoundException("Booking prospect not found");
    }
    return prospect;
  }

  private async assertRelations(
    artistId: string,
    input: {
      venueId?: string | null | undefined;
      contactId?: string | null | undefined;
      opportunityId?: string | null | undefined;
    }
  ) {
    if (input.venueId != null) {
      const venue = await this.prisma.client.venue.findFirst({
        where: { id: input.venueId, artistId },
        select: { id: true }
      });
      if (!venue) throw new NotFoundException("Venue not found");
    }
    if (input.contactId != null) {
      const contact = await this.prisma.client.contact.findFirst({
        where: { id: input.contactId, artistId },
        select: { id: true }
      });
      if (!contact) throw new NotFoundException("Contact not found");
    }
    if (input.opportunityId != null) {
      const opportunity = await this.prisma.client.bookingOpportunity.findFirst({
        where: { id: input.opportunityId, artistId },
        select: { id: true }
      });
      if (!opportunity) throw new NotFoundException("Booking opportunity not found");
    }
  }

  private assertSourcePair(sourceSystem: string | null, sourceRef: string | null) {
    if ((sourceSystem == null) !== (sourceRef == null)) {
      throw new BadRequestException(
        "Source system and source reference must be provided together"
      );
    }
  }

  async create(
    artistId: string,
    data: BookingProspectCreateInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    if (data.status === BookingProspectStatus.converted) {
      throw new BadRequestException("Use conversion to mark a prospect converted");
    }
    this.assertSourcePair(data.sourceSystem ?? null, data.sourceRef ?? null);
    await this.assertRelations(artistId, data);

    if (data.sourceSystem && data.sourceRef) {
      const existing = await this.prisma.client.bookingProspect.findFirst({
        where: {
          artistId,
          sourceSystem: data.sourceSystem,
          sourceRef: data.sourceRef
        },
        include: prospectInclude
      });
      if (existing) return existing;
    }

    const prospect = await this.prisma.client.bookingProspect.create({
      data: {
        artistId,
        kind: data.kind,
        status: data.status ?? BookingProspectStatus.discovered,
        name: data.name,
        city: data.city,
        region: data.region ?? null,
        country: data.country ?? null,
        capacity: data.capacity ?? null,
        websiteUrl: data.websiteUrl ?? null,
        notes: data.notes ?? null,
        sourceSystem: data.sourceSystem ?? null,
        sourceRef: data.sourceRef ?? null,
        ...(data.sourceMetadata !== undefined
          ? {
              sourceMetadata:
                data.sourceMetadata === null
                  ? Prisma.JsonNull
                  : (data.sourceMetadata as Prisma.InputJsonValue)
            }
          : {}),
        venueId: data.venueId ?? null,
        contactId: data.contactId ?? null,
        opportunityId: data.opportunityId ?? null
      },
      include: prospectInclude
    });
    await this.audit.log({
      artistId,
      aggregateType: "BookingProspect",
      aggregateId: prospect.id,
      action: "booking_prospect.created",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { kind: prospect.kind, status: prospect.status, source: prospect.sourceSystem }
    });
    return prospect;
  }

  async patch(
    artistId: string,
    id: string,
    data: BookingProspectPatchInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const current = await this.get(artistId, id);
    if (
      current.status === BookingProspectStatus.converted &&
      data.status !== undefined
    ) {
      throw new BadRequestException("Converted prospects cannot change status");
    }
    if (data.status === BookingProspectStatus.converted) {
      throw new BadRequestException("Use conversion to mark a prospect converted");
    }
    const sourceSystem =
      data.sourceSystem === undefined ? current.sourceSystem : data.sourceSystem;
    const sourceRef =
      data.sourceRef === undefined ? current.sourceRef : data.sourceRef;
    this.assertSourcePair(sourceSystem, sourceRef);
    await this.assertRelations(artistId, data);

    const patch: Prisma.BookingProspectUncheckedUpdateInput = {};
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.status !== undefined) patch.status = data.status;
    if (data.name !== undefined) patch.name = data.name;
    if (data.city !== undefined) patch.city = data.city;
    if (data.region !== undefined) patch.region = data.region;
    if (data.country !== undefined) patch.country = data.country;
    if (data.capacity !== undefined) patch.capacity = data.capacity;
    if (data.websiteUrl !== undefined) patch.websiteUrl = data.websiteUrl;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.sourceSystem !== undefined) patch.sourceSystem = data.sourceSystem;
    if (data.sourceRef !== undefined) patch.sourceRef = data.sourceRef;
    if (data.sourceMetadata !== undefined) {
      patch.sourceMetadata =
        data.sourceMetadata === null
          ? Prisma.JsonNull
          : (data.sourceMetadata as Prisma.InputJsonValue);
    }
    if (data.venueId !== undefined) patch.venueId = data.venueId;
    if (data.contactId !== undefined) patch.contactId = data.contactId;
    if (data.opportunityId !== undefined) patch.opportunityId = data.opportunityId;
    const prospect = await this.prisma.client.bookingProspect.update({
      where: { id },
      data: patch,
      include: prospectInclude
    });
    await this.audit.log({
      artistId,
      aggregateType: "BookingProspect",
      aggregateId: prospect.id,
      action: "booking_prospect.updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { updatedFields: Object.keys(data) }
    });
    return prospect;
  }

  async attachContact(
    artistId: string,
    id: string,
    input: BookingProspectContactInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const prospect = await tx.bookingProspect.findFirst({
        where: { id, artistId }
      });
      if (!prospect) throw new NotFoundException("Booking prospect not found");

      let contactId: string;
      let created = false;
      if (input.contactId != null) {
        const contact = await tx.contact.findFirst({
          where: { id: input.contactId, artistId },
          select: { id: true }
        });
        if (!contact) throw new NotFoundException("Contact not found");
        contactId = contact.id;
      } else {
        const contact = await tx.contact.create({
          data: {
            artistId,
            contactKind: ContactKind.promoter,
            fullName: input.contact!.fullName,
            role: input.contact!.role ?? null,
            email: input.contact!.email,
            phone: input.contact!.phone ?? null,
            notes: input.contact!.notes ?? null
          }
        });
        contactId = contact.id;
        created = true;
        await tx.auditEvent.create({
          data: {
            artistId,
            aggregateType: "Contact",
            aggregateId: contact.id,
            action: "contact.created",
            actorLabel: actorLabel ?? null,
            actorOperatorId: actorOperatorId ?? null,
            metadata: {
              fullName: contact.fullName,
              contactKind: contact.contactKind,
              source: "booking_prospect"
            }
          }
        });
      }

      const updated = await tx.bookingProspect.update({
        where: { id },
        data: { contactId },
        include: prospectInclude
      });
      await tx.auditEvent.create({
        data: {
          artistId,
          aggregateType: "BookingProspect",
          aggregateId: id,
          action: "booking_prospect.contact_linked",
          actorLabel: actorLabel ?? null,
          actorOperatorId: actorOperatorId ?? null,
          metadata: { contactId, created }
        }
      });
      return { prospect: updated, created };
    });
  }

  async discover(artistId: string, input: BookingProspectDiscoverInput) {
    const adapters = await this.registryResolver.resolveForArtist(artistId);
    if (adapters.ticketmaster.mode !== "real") {
      return {
        mode: "manual" as const,
        reason:
          "Ticketmaster is not configured for this environment. Add prospects manually; no synthetic leads are shown.",
        signals: []
      };
    }
    try {
      const result = await adapters.ticketmaster.searchMarket({
        city: input.city,
        size: 12,
        ...(input.region ? { region: input.region } : {}),
        ...(input.country ? { country: input.country } : {}),
        ...(input.keyword ? { keyword: input.keyword } : {})
      });
      const refs = [
        ...result.venues.map((venue) => `venue:${venue.id}`),
        ...result.events.map((event) => `event:${event.id}`)
      ];
      const saved = refs.length
        ? await this.prisma.client.bookingProspect.findMany({
            where: {
              artistId,
              sourceSystem: "ticketmaster",
              sourceRef: { in: refs }
            },
            select: { sourceRef: true }
          })
        : [];
      const savedRefs = new Set(saved.map((row) => row.sourceRef));
      return {
        mode: "ticketmaster" as const,
        signals: [
          ...result.venues.map((venue) => ({
            kind: BookingProspectKind.venue,
            status: BookingProspectStatus.discovered,
            name: venue.name,
            city: venue.city || input.city,
            region: venue.state ?? input.region ?? null,
            country: venue.country ?? input.country ?? null,
            capacity: venue.capacity ?? null,
            websiteUrl: venue.url ?? null,
            sourceSystem: "ticketmaster",
            sourceRef: `venue:${venue.id}`,
            sourceMetadata: { signalType: "venue", providerId: venue.id },
            saved: savedRefs.has(`venue:${venue.id}`)
          })),
          ...result.events.map((event) => ({
            kind: BookingProspectKind.festival,
            status: BookingProspectStatus.discovered,
            name: event.name,
            city: event.city ?? input.city,
            region: event.state ?? input.region ?? null,
            country: event.country ?? input.country ?? null,
            capacity: null,
            websiteUrl: event.url ?? null,
            sourceSystem: "ticketmaster",
            sourceRef: `event:${event.id}`,
            sourceMetadata: {
              signalType: "event",
              providerId: event.id,
              venueName: event.venueName,
              startAt: event.startAt
            },
            saved: savedRefs.has(`event:${event.id}`)
          }))
        ]
      };
    } catch {
      return {
        mode: "manual" as const,
        reason:
          "Ticketmaster is temporarily unavailable. Add or qualify prospects manually; no synthetic leads are shown.",
        signals: []
      };
    }
  }

  async convert(
    artistId: string,
    id: string,
    input: BookingProspectConversionInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    await this.profiles.assertReady(artistId);
    const prospect = await this.get(artistId, id);
    if (prospect.status === BookingProspectStatus.disqualified) {
      throw new BadRequestException("Disqualified prospects cannot be converted");
    }
    if (prospect.status !== BookingProspectStatus.qualified && prospect.status !== BookingProspectStatus.converted) {
      throw new BadRequestException("Qualify the prospect before conversion");
    }
    if (input.contactId != null) {
      await this.assertRelations(artistId, { contactId: input.contactId });
    }
    await this.assertRelations(artistId, {
      venueId: prospect.venueId,
      contactId: prospect.contactId,
      opportunityId: prospect.opportunityId
    });

    const converted = await this.prisma.client.$transaction(async (tx) => {
      // PostgreSQL transaction lock: simultaneous convert clicks for one prospect
      // serialize here, so the second caller reads the first caller's CRM result.
      await tx.$executeRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `booking-prospect:${id}`
      );
      const current = await tx.bookingProspect.findFirst({
        where: { id, artistId }
      });
      if (!current) throw new NotFoundException("Booking prospect not found");
      if (current.status === BookingProspectStatus.converted && current.opportunityId) {
        return tx.bookingProspect.findUniqueOrThrow({
          where: { id },
          include: prospectInclude
        });
      }

      let venueId = current.venueId;
      if (current.kind === BookingProspectKind.venue && !venueId) {
        const venue = await tx.venue.create({
          data: {
            artistId,
            name: current.name,
            city: current.city,
            region: current.region,
            country: current.country,
            capacity: current.capacity,
            notes: current.notes
          }
        });
        venueId = venue.id;
      }

      let contactId = input.contactId ?? current.contactId;
      if (input.contact) {
        const contact = await tx.contact.create({
          data: {
            artistId,
            venueId: venueId ?? null,
            contactKind: ContactKind.promoter,
            fullName: input.contact.fullName,
            role: input.contact.role ?? null,
            email: input.contact.email ?? null,
            phone: input.contact.phone ?? null,
            notes: input.contact.notes ?? null
          }
        });
        contactId = contact.id;
      }

      let opportunityId = current.opportunityId;
      if (!opportunityId) {
        const opportunity = await tx.bookingOpportunity.create({
          data: {
            artistId,
            venueId: venueId ?? null,
            title: input.opportunityTitle ?? `${current.name} — booking opportunity`,
            stage: "target",
            targetDate: input.targetDate ? new Date(input.targetDate) : null,
            marketNotes: input.marketNotes ?? current.notes ?? null,
            sourceSystem: "booking_prospect",
            sourceRef: current.id
          }
        });
        opportunityId = opportunity.id;
      }
      const now = new Date();
      const updated = await tx.bookingProspect.update({
        where: { id },
        data: {
          venueId: venueId ?? null,
          contactId: contactId ?? null,
          opportunityId,
          status: BookingProspectStatus.converted,
          convertedAt: now
        },
        include: prospectInclude
      });
      await tx.auditEvent.create({
        data: {
          artistId,
          aggregateType: "BookingProspect",
          aggregateId: id,
          action: "booking_prospect.converted",
          actorLabel: actorLabel ?? null,
          actorOperatorId: actorOperatorId ?? null,
          metadata: {
            venueId: venueId ?? null,
            contactId: contactId ?? null,
            opportunityId
          }
        }
      });
      return updated;
    });
    return converted;
  }
}
