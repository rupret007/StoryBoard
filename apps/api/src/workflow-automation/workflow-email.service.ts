import { Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AdapterRegistryResolver } from "../integrations/adapter-registry.resolver";
import { PrismaService } from "../prisma/prisma.service";
import type { NotifyOperator } from "./membership-notify-targets.service";

@Injectable()
export class WorkflowEmailService {
  private readonly log = new Logger(WorkflowEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AdapterRegistryResolver,
    private readonly audit: AuditService
  ) {}

  async draftForOperatorIfEnabled(input: {
    artistId: string;
    recipient: NotifyOperator;
    subject: string;
    body: string;
    auditAction: string;
    auditMetadata: Record<string, unknown>;
  }): Promise<{ mode: string; draftId?: string; skipped?: string }> {
    const op = await this.prisma.client.operator.findUnique({
      where: { id: input.recipient.operatorId },
      select: { workflowEmailEnabled: true }
    });
    if (!op?.workflowEmailEnabled) {
      return { mode: "skipped", skipped: "operator_pref_disabled" };
    }
    const adapters = await this.registry.resolveForArtist(input.artistId);
    try {
      const r = await adapters.gmail.draftMessage({
        to: input.recipient.email,
        subject: input.subject,
        body: input.body
      });
      await this.audit.log({
        artistId: input.artistId,
        aggregateType: "workflow_email",
        aggregateId: input.recipient.operatorId,
        action: input.auditAction,
        actorLabel: "automation",
        actorOperatorId: null,
        metadata: {
          ...input.auditMetadata,
          gmailMode: adapters.gmail.mode,
          draftId: r.draftId
        }
      });
      return { mode: adapters.gmail.mode, draftId: r.draftId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(`workflow email draft failed: ${message}`);
      await this.audit.log({
        artistId: input.artistId,
        aggregateType: "workflow_email",
        aggregateId: input.recipient.operatorId,
        action: `${input.auditAction}.failed`,
        actorLabel: "automation",
        actorOperatorId: null,
        metadata: { ...input.auditMetadata, error: message.slice(0, 500) }
      });
      throw err;
    }
  }
}
