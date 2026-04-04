import { Injectable } from "@nestjs/common";
import { WorkflowNotificationKind } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import type { NotifyOperator } from "./membership-notify-targets.service";

@Injectable()
export class WorkflowNotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createForRecipients(input: {
    artistId: string;
    recipients: NotifyOperator[];
    kind: WorkflowNotificationKind;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    const meta = input.metadata ?? {};
    const rows = await Promise.all(
      input.recipients.map((r) =>
        this.prisma.client.workflowNotification.create({
          data: {
            artistId: input.artistId,
            recipientOperatorId: r.operatorId,
            kind: input.kind,
            title: input.title,
            body: input.body,
            metadata: meta as object
          }
        })
      )
    );
    return rows;
  }

  async hasDigestToday(
    artistId: string,
    recipientOperatorId: string,
    kind: WorkflowNotificationKind,
    since: Date
  ): Promise<boolean> {
    return this.hasNotificationSince(
      artistId,
      recipientOperatorId,
      kind,
      since
    );
  }

  async hasNotificationSince(
    artistId: string,
    recipientOperatorId: string,
    kind: WorkflowNotificationKind,
    since: Date
  ): Promise<boolean> {
    const n = await this.prisma.client.workflowNotification.findFirst({
      where: {
        artistId,
        recipientOperatorId,
        kind,
        createdAt: { gte: since }
      },
      select: { id: true }
    });
    return n !== null;
  }

  async listForRecipient(input: {
    artistId: string;
    recipientOperatorId: string;
    limit: number;
    unreadOnly?: boolean;
  }) {
    return this.prisma.client.workflowNotification.findMany({
      where: {
        artistId: input.artistId,
        recipientOperatorId: input.recipientOperatorId,
        ...(input.unreadOnly ? { readAt: null } : {})
      },
      orderBy: { createdAt: "desc" },
      take: input.limit
    });
  }

  async markRead(input: {
    id: string;
    artistId: string;
    recipientOperatorId: string;
  }) {
    const row = await this.prisma.client.workflowNotification.findFirst({
      where: {
        id: input.id,
        artistId: input.artistId,
        recipientOperatorId: input.recipientOperatorId
      }
    });
    if (!row) {
      return null;
    }
    if (row.readAt) {
      return row;
    }
    return this.prisma.client.workflowNotification.update({
      where: { id: input.id },
      data: { readAt: new Date() }
    });
  }

  async unreadCount(artistId: string, recipientOperatorId: string) {
    return this.prisma.client.workflowNotification.count({
      where: { artistId, recipientOperatorId, readAt: null }
    });
  }
}
