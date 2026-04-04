import { Injectable } from "@nestjs/common";
import {
  mergeWorkflowNotifyPrefs,
  type WorkflowNotifyCategory,
  type WorkflowNotifyPrefs,
  workflowKindHasCategoryPrefs,
  WORKFLOW_NOTIFICATION_KIND_TO_CATEGORY,
  type WorkflowNotificationKindKey
} from "@storyboard/shared";
import { WorkflowNotificationKind } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WorkflowNotifyPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrefs(
    operatorId: string,
    artistId: string
  ): Promise<WorkflowNotifyPrefs> {
    const m = await this.prisma.client.artistMembership.findUnique({
      where: {
        operatorId_artistId: { operatorId, artistId }
      },
      select: { workflowNotifyPrefs: true }
    });
    return mergeWorkflowNotifyPrefs(m?.workflowNotifyPrefs);
  }

  async prefsForOperators(
    artistId: string,
    operatorIds: string[]
  ): Promise<Map<string, WorkflowNotifyPrefs>> {
    if (operatorIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.client.artistMembership.findMany({
      where: { artistId, operatorId: { in: operatorIds } },
      select: { operatorId: true, workflowNotifyPrefs: true }
    });
    const byId = new Map(
      rows.map((r) => [r.operatorId, mergeWorkflowNotifyPrefs(r.workflowNotifyPrefs)])
    );
    const out = new Map<string, WorkflowNotifyPrefs>();
    for (const id of operatorIds) {
      out.set(id, byId.get(id) ?? mergeWorkflowNotifyPrefs(null));
    }
    return out;
  }

  channelAllows(
    kind: WorkflowNotificationKind,
    channel: "inApp" | "email",
    prefs: WorkflowNotifyPrefs
  ): boolean {
    const key = kind as string;
    if (!workflowKindHasCategoryPrefs(key)) {
      return true;
    }
    const cat =
      WORKFLOW_NOTIFICATION_KIND_TO_CATEGORY[key as WorkflowNotificationKindKey];
    return prefs[cat][channel];
  }

  digestEnabled(
    prefs: WorkflowNotifyPrefs,
    cadence: "daily" | "weekly"
  ): boolean {
    return cadence === "daily" ? prefs.digest.daily : prefs.digest.weekly;
  }

  includeDigestSection(
    prefs: WorkflowNotifyPrefs,
    section: WorkflowNotifyCategory
  ): boolean {
    const ch = prefs[section];
    return ch.inApp || ch.email;
  }
}
