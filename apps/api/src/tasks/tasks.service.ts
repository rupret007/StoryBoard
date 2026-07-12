import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { ManagerRecommendationOutcome, TaskStatus } from "../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TaskCreateInput, TaskPatchInput } from "./task.schema";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  list(artistId: string) {
    return this.prisma.client.task.findMany({
      where: { artistId },
      include: { opportunity: { include: { venue: true } } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }]
    });
  }

  /**
   * Tasks past their due date, excluding done.
   * When `graceDays` &gt; 0, `dueAt` must be before (now minus that many UTC calendar days).
   * Null or 0 grace matches “any past-due” (`dueAt` &lt; now).
   */
  overdueByDueDate(artistId: string, graceDays?: number | null) {
    const cutoff = new Date();
    if (graceDays != null && graceDays > 0) {
      cutoff.setUTCDate(cutoff.getUTCDate() - graceDays);
    }
    return this.prisma.client.task.findMany({
      where: {
        artistId,
        status: { not: TaskStatus.done },
        dueAt: { lt: cutoff }
      },
      include: { opportunity: { include: { venue: true } } },
      orderBy: [{ dueAt: "asc" }]
    });
  }

  /**
   * Incomplete tasks whose last update is older than `days` (stale follow-ups).
   */
  followUpsOlderThan(artistId: string, days: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return this.prisma.client.task.findMany({
      where: {
        artistId,
        status: { not: TaskStatus.done },
        updatedAt: { lt: cutoff }
      },
      include: { opportunity: true }
    });
  }

  async get(artistId: string, id: string) {
    const row = await this.prisma.client.task.findFirst({
      where: { id, artistId },
      include: { opportunity: true }
    });
    if (!row) {
      throw new NotFoundException("Task not found");
    }
    return row;
  }

  private async assertOpportunityBelongsToArtist(
    artistId: string,
    opportunityId: string
  ): Promise<void> {
    const opportunity = await this.prisma.client.bookingOpportunity.findFirst({
      where: { id: opportunityId, artistId },
      select: { id: true }
    });
    if (!opportunity) {
      throw new NotFoundException("Booking opportunity not found");
    }
  }

  async create(
    artistId: string,
    data: TaskCreateInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    if (data.opportunityId != null) {
      await this.assertOpportunityBelongsToArtist(
        artistId,
        data.opportunityId
      );
    }
    const row = await this.prisma.client.task.create({
      data: {
        artistId,
        title: data.title,
        opportunityId: data.opportunityId ?? null,
        status: data.status ?? TaskStatus.todo,
        ownerLabel: data.ownerLabel ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null
      }
    });
    await this.audit.log({
      artistId,
      aggregateType: "Task",
      aggregateId: row.id,
      action: "task.created",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { title: row.title }
    });
    return row;
  }

  async patch(
    artistId: string,
    id: string,
    data: TaskPatchInput,
    actorLabel?: string | null,
    actorOperatorId?: string | null
  ) {
    await this.get(artistId, id);
    if (data.opportunityId != null) {
      await this.assertOpportunityBelongsToArtist(
        artistId,
        data.opportunityId
      );
    }
    const patchData: Prisma.TaskUncheckedUpdateInput = {};
    if (data.title !== undefined) {
      patchData.title = data.title;
    }
    if (data.status !== undefined) {
      patchData.status = data.status;
    }
    if (data.ownerLabel !== undefined) {
      patchData.ownerLabel = data.ownerLabel;
    }
    if (data.opportunityId !== undefined) {
      patchData.opportunityId = data.opportunityId;
    }
    if (data.dueAt !== undefined) {
      patchData.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    }
    const { row, attributed } = data.status === TaskStatus.done
      ? await this.prisma.client.$transaction(async (tx) => {
          const updated = await tx.task.update({ where: { id }, data: patchData });
          const completed = await tx.managerRecommendation.updateMany({
            where: { taskId: id, outcome: ManagerRecommendationOutcome.accepted },
            data: { outcome: ManagerRecommendationOutcome.completed, outcomeReason: "task_completed", outcomeAt: new Date() }
          });
          return { row: updated, attributed: completed };
        })
      : { row: await this.prisma.client.task.update({ where: { id }, data: patchData }), attributed: { count: 0 } };
    await this.audit.log({
      artistId,
      aggregateType: "Task",
      aggregateId: row.id,
      action: "task.updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { ...data, managerRecommendationsCompleted: attributed.count } as Record<string, unknown>
    });
    return row;
  }
}
