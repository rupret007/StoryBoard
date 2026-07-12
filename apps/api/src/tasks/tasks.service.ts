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
      include: {
        opportunity: { include: { venue: true } },
        project: true,
        event: true,
        bandMember: true,
        prerequisites: { include: { prerequisiteTask: { select: { id: true, title: true, status: true, dueAt: true } } }, orderBy: { createdAt: "asc" } },
        dependents: { include: { task: { select: { id: true, title: true, status: true, dueAt: true } } }, orderBy: { createdAt: "asc" } }
      },
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
      include: {
        opportunity: true,
        project: true,
        event: true,
        bandMember: true,
        prerequisites: { include: { prerequisiteTask: { select: { id: true, title: true, status: true, dueAt: true } } }, orderBy: { createdAt: "asc" } },
        dependents: { include: { task: { select: { id: true, title: true, status: true, dueAt: true } } }, orderBy: { createdAt: "asc" } }
      }
    });
    if (!row) {
      throw new NotFoundException("Task not found");
    }
    return row;
  }

  private dependencyWouldCycle(taskId: string, prerequisiteTaskId: string, edges: { taskId: string; prerequisiteTaskId: string }[]) {
    const graph = new Map<string, string[]>();
    for (const edge of edges) graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.prerequisiteTaskId]);
    const pending = [prerequisiteTaskId];
    const visited = new Set<string>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(graph.get(current) ?? []));
    }
    return false;
  }

  async addPrerequisite(artistId: string, taskId: string, prerequisiteTaskId: string, actorLabel?: string | null, actorOperatorId?: string | null) {
    if (taskId === prerequisiteTaskId) throw new BadRequestException("A task cannot depend on itself");
    const attempt = () => this.prisma.client.$transaction(async (tx) => {
      const [task, prerequisite] = await Promise.all([
        tx.task.findFirst({ where: { id: taskId, artistId }, select: { id: true, title: true, status: true, dueAt: true } }),
        tx.task.findFirst({ where: { id: prerequisiteTaskId, artistId }, select: { id: true, title: true, status: true, dueAt: true } })
      ]);
      if (!task || !prerequisite) throw new NotFoundException("Task not found");
      if (task.dueAt && prerequisite.dueAt && prerequisite.dueAt > task.dueAt) throw new BadRequestException("A prerequisite cannot be due after the task it unlocks");
      if (task.status === TaskStatus.done && prerequisite.status !== TaskStatus.done) throw new BadRequestException("Completed work cannot gain an unfinished prerequisite");
      const existing = await tx.taskDependency.findUnique({
        where: { taskId_prerequisiteTaskId: { taskId, prerequisiteTaskId } },
        include: { prerequisiteTask: { select: { id: true, title: true, status: true, dueAt: true } } }
      });
      if (existing) return { row: existing, created: false };
      const edges = await tx.taskDependency.findMany({ where: { artistId }, select: { taskId: true, prerequisiteTaskId: true }, take: 1000 });
      if (this.dependencyWouldCycle(taskId, prerequisiteTaskId, edges)) throw new BadRequestException("That prerequisite would create a task cycle");
      const row = await tx.taskDependency.create({
        data: { artistId, taskId, prerequisiteTaskId },
        include: { prerequisiteTask: { select: { id: true, title: true, status: true, dueAt: true } } }
      });
      return { row, created: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    let result: Awaited<ReturnType<typeof attempt>> | null = null;
    let lastError: unknown = null;
    for (let retry = 0; retry < 3 && !result; retry += 1) {
      try {
        result = await attempt();
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
        if (code !== "P2002" && code !== "P2034") throw error;
        lastError = error;
      }
    }
    if (!result) throw lastError;
    if (result.created) await this.audit.log({
      artistId,
      aggregateType: "TaskDependency",
      aggregateId: result.row.id,
      action: "task.prerequisite_added",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { taskId, prerequisiteTaskId }
    });
    return result.row;
  }

  async removePrerequisite(artistId: string, taskId: string, prerequisiteTaskId: string, actorLabel?: string | null, actorOperatorId?: string | null) {
    const [task, dependency] = await Promise.all([
      this.prisma.client.task.findFirst({ where: { id: taskId, artistId }, select: { id: true } }),
      this.prisma.client.taskDependency.findFirst({ where: { artistId, taskId, prerequisiteTaskId }, select: { id: true } })
    ]);
    if (!task || !dependency) throw new NotFoundException("Task prerequisite not found");
    const removed = await this.prisma.client.taskDependency.deleteMany({ where: { id: dependency.id, artistId, taskId, prerequisiteTaskId } });
    if (removed.count !== 1) throw new NotFoundException("Task prerequisite not found");
    await this.audit.log({
      artistId,
      aggregateType: "TaskDependency",
      aggregateId: dependency.id,
      action: "task.prerequisite_removed",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: { taskId, prerequisiteTaskId }
    });
    return { removed: true };
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

  private async bandMemberForArtist(artistId: string, bandMemberId: string) {
    const member = await this.prisma.client.bandMember.findFirst({ where: { id: bandMemberId, artistId, active: true }, select: { id: true, name: true } });
    if (!member) throw new NotFoundException("Band member not found");
    return member;
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
    const bandMember = data.bandMemberId ? await this.bandMemberForArtist(artistId, data.bandMemberId) : null;
    if (data.status === TaskStatus.blocked && !data.blockedReason?.trim()) throw new BadRequestException("A blocked task requires a reason");
    if (data.status !== TaskStatus.blocked && data.blockedReason) throw new BadRequestException("A blocker may only be recorded on a blocked task");
    if (data.status === TaskStatus.done && data.waitingOn) throw new BadRequestException("Completed work cannot remain waiting on someone");
    const row = await this.prisma.client.task.create({
      data: {
        artistId,
        title: data.title,
        opportunityId: data.opportunityId ?? null,
        projectId: data.projectId ?? null,
        bandMemberId: bandMember?.id ?? null,
        status: data.status ?? TaskStatus.todo,
        ownerLabel: bandMember?.name ?? data.ownerLabel ?? null,
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
    const bandMember = data.bandMemberId ? await this.bandMemberForArtist(artistId, data.bandMemberId) : null;
    const targetStatus = data.status ?? current.status;
    const targetBlockedReason = data.blockedReason === undefined ? current.blockedReason : data.blockedReason;
    if (targetStatus === TaskStatus.blocked && !targetBlockedReason?.trim()) throw new BadRequestException("A blocked task requires a reason");
    if (targetStatus !== TaskStatus.blocked && data.blockedReason) throw new BadRequestException("A blocker may only be recorded on a blocked task");
    if (targetStatus === TaskStatus.done && data.waitingOn) throw new BadRequestException("Completed work cannot remain waiting on someone");
    const prerequisites = current.prerequisites ?? [];
    const dependents = current.dependents ?? [];
    if (targetStatus === TaskStatus.done && prerequisites.some((dependency) => dependency.prerequisiteTask.status !== TaskStatus.done)) throw new BadRequestException("Complete every prerequisite before finishing this task");
    if (current.status === TaskStatus.done && targetStatus !== TaskStatus.done && dependents.some((dependency) => dependency.task.status === TaskStatus.done)) throw new BadRequestException("This task cannot be reopened while completed downstream work depends on it");
    const patchData: Prisma.TaskUncheckedUpdateManyInput = {};
    if (data.title !== undefined) {
      patchData.title = data.title;
    }
    if (data.status !== undefined) {
      patchData.status = data.status;
    }
    if (data.bandMemberId !== undefined) {
      patchData.bandMemberId = bandMember?.id ?? null;
      patchData.ownerLabel = bandMember?.name ?? null;
    } else if (data.ownerLabel !== undefined) {
      patchData.ownerLabel = data.ownerLabel;
      patchData.bandMemberId = null;
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
    if (nextDueAt && prerequisites.some((dependency) => dependency.prerequisiteTask.dueAt && dependency.prerequisiteTask.dueAt > nextDueAt)) throw new BadRequestException("A task cannot be due before one of its prerequisites");
    if (nextDueAt && dependents.some((dependency) => dependency.task.dueAt && dependency.task.dueAt < nextDueAt)) throw new BadRequestException("A prerequisite cannot be due after a task it unlocks");
    const deferred = current.status !== TaskStatus.done && Boolean(current.dueAt) && (!nextDueAt || nextDueAt.getTime() > current.dueAt!.getTime());
    if (deferred) {
      patchData.deferralCount = { increment: 1 };
      patchData.lastDeferredAt = new Date();
    }
    let result: { row: Awaited<ReturnType<TasksService["get"]>>; attributed: { count: number } };
    try {
      result = await this.prisma.client.$transaction(async (tx) => {
        const fresh = await tx.task.findFirst({ where: { id, artistId }, select: { status: true, dueAt: true, prerequisites: { select: { prerequisiteTask: { select: { status: true, dueAt: true } } } }, dependents: { select: { task: { select: { status: true, dueAt: true } } } } } });
        if (!fresh) throw new NotFoundException("Task not found");
        if (targetStatus === TaskStatus.done && (fresh.prerequisites ?? []).some((dependency) => dependency.prerequisiteTask.status !== TaskStatus.done)) throw new BadRequestException("Complete every prerequisite before finishing this task");
        if (fresh.status === TaskStatus.done && targetStatus !== TaskStatus.done && (fresh.dependents ?? []).some((dependency) => dependency.task.status === TaskStatus.done)) throw new BadRequestException("This task cannot be reopened while completed downstream work depends on it");
        if (nextDueAt && (fresh.prerequisites ?? []).some((dependency) => dependency.prerequisiteTask.dueAt && dependency.prerequisiteTask.dueAt > nextDueAt)) throw new BadRequestException("A task cannot be due before one of its prerequisites");
        if (nextDueAt && (fresh.dependents ?? []).some((dependency) => dependency.task.dueAt && dependency.task.dueAt < nextDueAt)) throw new BadRequestException("A prerequisite cannot be due after a task it unlocks");
        const updated = await tx.task.updateMany({ where: { id, artistId, updatedAt: current.updatedAt }, data: patchData });
        if (updated.count !== 1) throw new BadRequestException("This task changed while you were editing it; reload before saving");
        const completed = targetStatus === TaskStatus.done
          ? await tx.managerRecommendation.updateMany({
              where: { taskId: id, outcome: ManagerRecommendationOutcome.accepted },
              data: { outcome: ManagerRecommendationOutcome.completed, outcomeReason: "task_completed", outcomeAt: new Date() }
            })
          : { count: 0 };
        const row = await tx.task.findUniqueOrThrow({ where: { id }, include: { opportunity: { include: { venue: true } }, project: true, event: true, bandMember: true, prerequisites: { include: { prerequisiteTask: { select: { id: true, title: true, status: true, dueAt: true } } }, orderBy: { createdAt: "asc" } }, dependents: { include: { task: { select: { id: true, title: true, status: true, dueAt: true } } }, orderBy: { createdAt: "asc" } } } });
        return { row, attributed: completed };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
      if (code === "P2034") throw new BadRequestException("This task or its prerequisites changed while you were editing it; reload before saving");
      throw error;
    }
    const { row, attributed } = result;
    await this.audit.log({
      artistId,
      aggregateType: "Task",
      aggregateId: row.id,
      action: "task.updated",
      actorLabel,
      actorOperatorId: actorOperatorId ?? null,
      metadata: {
        fields: Object.keys(data),
        previous: { status: current.status, ownerLabel: current.ownerLabel, bandMemberId: current.bandMemberId, dueAt: current.dueAt, blockedReason: current.blockedReason, waitingOn: current.waitingOn },
        current: { status: row.status, ownerLabel: row.ownerLabel, bandMemberId: row.bandMemberId, dueAt: row.dueAt, blockedReason: row.blockedReason, waitingOn: row.waitingOn },
        deferred,
        deferralCount: row.deferralCount,
        managerRecommendationsCompleted: attributed.count
      }
    });
    return row;
  }
}
