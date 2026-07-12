import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
      include: { opportunity: { include: { venue: true } }, project: true, event: true },
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

  private async assertProjectBelongsToArtist(artistId: string, projectId: string): Promise<void> {
    const project = await this.prisma.client.artistProject.findFirst({ where: { id: projectId, artistId }, select: { id: true } });
    if (!project) throw new NotFoundException("Project not found");
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
    if (data.projectId != null) await this.assertProjectBelongsToArtist(artistId, data.projectId);
    if (data.status === TaskStatus.blocked && !data.blockedReason?.trim()) throw new BadRequestException("A blocked task requires a reason");
    if (data.status !== TaskStatus.blocked && data.blockedReason) throw new BadRequestException("A blocker may only be recorded on a blocked task");
    if (data.status === TaskStatus.done && data.waitingOn) throw new BadRequestException("Completed work cannot remain waiting on someone");
    const row = await this.prisma.client.task.create({
      data: {
        artistId,
        title: data.title,
        opportunityId: data.opportunityId ?? null,
        projectId: data.projectId ?? null,
        status: data.status ?? TaskStatus.todo,
        ownerLabel: data.ownerLabel ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        blockedReason: data.blockedReason ?? null,
        waitingOn: data.waitingOn ?? null
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
    const current = await this.get(artistId, id);
    if (data.opportunityId != null) {
      await this.assertOpportunityBelongsToArtist(
        artistId,
        data.opportunityId
      );
    }
    if (data.projectId != null) await this.assertProjectBelongsToArtist(artistId, data.projectId);
    const targetStatus = data.status ?? current.status;
    const targetBlockedReason = data.blockedReason === undefined ? current.blockedReason : data.blockedReason;
    if (targetStatus === TaskStatus.blocked && !targetBlockedReason?.trim()) throw new BadRequestException("A blocked task requires a reason");
    if (targetStatus !== TaskStatus.blocked && data.blockedReason) throw new BadRequestException("A blocker may only be recorded on a blocked task");
    if (targetStatus === TaskStatus.done && data.waitingOn) throw new BadRequestException("Completed work cannot remain waiting on someone");
    const patchData: Prisma.TaskUncheckedUpdateManyInput = {};
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
    if (data.projectId !== undefined) patchData.projectId = data.projectId;
    if (data.dueAt !== undefined) {
      patchData.dueAt = data.dueAt ? new Date(data.dueAt) : null;
    }
    if (data.waitingOn !== undefined) patchData.waitingOn = data.waitingOn;
    if (targetStatus === TaskStatus.done) {
      patchData.blockedReason = null;
      patchData.waitingOn = null;
    } else if (targetStatus !== TaskStatus.blocked) {
      patchData.blockedReason = null;
    } else if (data.blockedReason !== undefined) {
      patchData.blockedReason = data.blockedReason;
    }
    const nextDueAt = data.dueAt === undefined ? current.dueAt : data.dueAt ? new Date(data.dueAt) : null;
    const deferred = current.status !== TaskStatus.done && Boolean(current.dueAt) && (!nextDueAt || nextDueAt.getTime() > current.dueAt!.getTime());
    if (deferred) {
      patchData.deferralCount = { increment: 1 };
      patchData.lastDeferredAt = new Date();
    }
    const { row, attributed } = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({ where: { id, artistId, updatedAt: current.updatedAt }, data: patchData });
      if (updated.count !== 1) throw new BadRequestException("This task changed while you were editing it; reload before saving");
      const completed = targetStatus === TaskStatus.done
        ? await tx.managerRecommendation.updateMany({
            where: { taskId: id, outcome: ManagerRecommendationOutcome.accepted },
            data: { outcome: ManagerRecommendationOutcome.completed, outcomeReason: "task_completed", outcomeAt: new Date() }
          })
        : { count: 0 };
      const row = await tx.task.findUniqueOrThrow({ where: { id }, include: { opportunity: { include: { venue: true } }, project: true, event: true } });
      return { row, attributed: completed };
    });
    await this.audit.log({
      artistId,
      aggregateType: "Task",
      aggregateId: row.id,
      action: "task.updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: {
        fields: Object.keys(data),
        previous: { status: current.status, ownerLabel: current.ownerLabel, dueAt: current.dueAt, blockedReason: current.blockedReason, waitingOn: current.waitingOn },
        current: { status: row.status, ownerLabel: row.ownerLabel, dueAt: row.dueAt, blockedReason: row.blockedReason, waitingOn: row.waitingOn },
        deferred,
        deferralCount: row.deferralCount,
        managerRecommendationsCompleted: attributed.count
      }
    });
    return row;
  }
}
