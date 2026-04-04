import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { ContactKind } from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { ContactPatchInput } from "./contact-patch.schema";

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(artistId: string) {
    return this.prisma.client.contact.findMany({
      where: { artistId },
      include: { venue: true },
      orderBy: { updatedAt: "desc" }
    });
  }

  async get(artistId: string, id: string) {
    const row = await this.prisma.client.contact.findFirst({
      where: { id, artistId },
      include: { venue: true }
    });
    if (!row) {
      throw new NotFoundException("Contact not found");
    }
    return row;
  }

  async create(
    artistId: string,
    data: {
      fullName: string;
      contactKind?: ContactKind;
      role?: string | null;
      email?: string | null;
      phone?: string | null;
      notes?: string | null;
      venueId?: string | null;
    },
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    const row = await this.prisma.client.contact.create({
      data: {
        artistId,
        fullName: data.fullName,
        contactKind: data.contactKind ?? ContactKind.general,
        role: data.role ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        notes: data.notes ?? null,
        venueId: data.venueId ?? null
      }
    });
    await this.audit.log({
      artistId,
      aggregateType: "Contact",
      aggregateId: row.id,
      action: "contact.created",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { fullName: row.fullName, contactKind: row.contactKind }
    });
    return row;
  }

  async update(
    artistId: string,
    id: string,
    data: ContactPatchInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    await this.get(artistId, id);
    const patchData: Prisma.ContactUncheckedUpdateInput = {};
    if (data.fullName !== undefined) {
      patchData.fullName = data.fullName;
    }
    if (data.contactKind !== undefined) {
      patchData.contactKind = data.contactKind;
    }
    if (data.role !== undefined) {
      patchData.role = data.role;
    }
    if (data.email !== undefined) {
      patchData.email = data.email;
    }
    if (data.phone !== undefined) {
      patchData.phone = data.phone;
    }
    if (data.notes !== undefined) {
      patchData.notes = data.notes;
    }
    if (data.venueId !== undefined) {
      patchData.venueId = data.venueId;
    }
    const row = await this.prisma.client.contact.update({
      where: { id },
      data: patchData
    });
    await this.audit.log({
      artistId,
      aggregateType: "Contact",
      aggregateId: row.id,
      action: "contact.updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: data as Record<string, unknown>
    });
    return row;
  }
}
