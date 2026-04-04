import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { AuditSeverity } from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { VenuePatchInput } from "./venue-patch.schema";

@Injectable()
export class VenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(artistId: string) {
    return this.prisma.client.venue.findMany({
      where: { artistId },
      orderBy: { updatedAt: "desc" }
    });
  }

  async get(artistId: string, id: string) {
    const venue = await this.prisma.client.venue.findFirst({
      where: { id, artistId }
    });
    if (!venue) {
      throw new NotFoundException("Venue not found");
    }
    return venue;
  }

  async create(
    artistId: string,
    data: {
      name: string;
      city: string;
      region?: string | null;
      country?: string | null;
      addressLine?: string | null;
      capacity?: number | null;
      notes?: string | null;
      lat?: number | null;
      lng?: number | null;
      driveMinutesFromBase?: number | null;
      fitScore?: number | null;
    },
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const venue = await this.prisma.client.venue.create({
      data: { artistId, ...data }
    });
    await this.audit.log({
      artistId,
      aggregateType: "Venue",
      aggregateId: venue.id,
      action: "venue.created",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { name: venue.name, city: venue.city }
    });
    return venue;
  }

  async update(
    artistId: string,
    id: string,
    data: VenuePatchInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    await this.get(artistId, id);
    const patchData: Prisma.VenueUncheckedUpdateInput = {};
    if (data.name !== undefined) {
      patchData.name = data.name;
    }
    if (data.city !== undefined) {
      patchData.city = data.city;
    }
    if (data.region !== undefined) {
      patchData.region = data.region;
    }
    if (data.country !== undefined) {
      patchData.country = data.country;
    }
    if (data.addressLine !== undefined) {
      patchData.addressLine = data.addressLine;
    }
    if (data.capacity !== undefined) {
      patchData.capacity = data.capacity;
    }
    if (data.notes !== undefined) {
      patchData.notes = data.notes;
    }
    if (data.lat !== undefined) {
      patchData.lat = data.lat;
    }
    if (data.lng !== undefined) {
      patchData.lng = data.lng;
    }
    if (data.driveMinutesFromBase !== undefined) {
      patchData.driveMinutesFromBase = data.driveMinutesFromBase;
    }
    if (data.fitScore !== undefined) {
      patchData.fitScore = data.fitScore;
    }
    const venue = await this.prisma.client.venue.update({
      where: { id },
      data: patchData
    });
    await this.audit.log({
      artistId,
      severity: AuditSeverity.info,
      aggregateType: "Venue",
      aggregateId: venue.id,
      action: "venue.updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: data as Record<string, unknown>
    });
    return venue;
  }
}
