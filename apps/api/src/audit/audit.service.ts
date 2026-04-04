import { Injectable } from "@nestjs/common";
import { AuditSeverity } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    artistId?: string | null;
    severity?: AuditSeverity;
    aggregateType: string;
    aggregateId: string;
    action: string;
    actorLabel?: string | null | undefined;
    actorOperatorId?: string | null | undefined;
    metadata: Record<string, unknown>;
  }) {
    return this.prisma.client.auditEvent.create({
      data: {
        artistId: input.artistId ?? null,
        severity: input.severity ?? AuditSeverity.info,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        action: input.action,
        actorLabel: input.actorLabel ?? null,
        actorOperatorId: input.actorOperatorId ?? null,
        metadata: input.metadata as object
      }
    });
  }
}
