import { z } from "zod";

const channelPrefsSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean()
});

export const workflowNotifyPrefsSchema = z.object({
  invites: channelPrefsSchema,
  approvals: channelPrefsSchema,
  overdueTasks: channelPrefsSchema,
  staleFollowUps: channelPrefsSchema,
  integrationChanges: channelPrefsSchema,
  digest: z.object({
    daily: z.boolean(),
    weekly: z.boolean()
  })
});

export type WorkflowNotifyPrefs = z.infer<typeof workflowNotifyPrefsSchema>;

export type WorkflowNotifyCategory = keyof Omit<
  WorkflowNotifyPrefs,
  "digest"
>;

export const defaultWorkflowNotifyPrefs: WorkflowNotifyPrefs = {
  invites: { inApp: true, email: true },
  approvals: { inApp: true, email: true },
  overdueTasks: { inApp: true, email: true },
  staleFollowUps: { inApp: true, email: true },
  integrationChanges: { inApp: true, email: true },
  digest: { daily: false, weekly: false }
};

export function mergeWorkflowNotifyPrefs(
  stored: unknown | null | undefined
): WorkflowNotifyPrefs {
  if (stored == null) {
    return { ...defaultWorkflowNotifyPrefs };
  }
  const parsed = workflowNotifyPrefsSchema.safeParse(stored);
  if (!parsed.success) {
    return { ...defaultWorkflowNotifyPrefs };
  }
  return {
    invites: { ...defaultWorkflowNotifyPrefs.invites, ...parsed.data.invites },
    approvals: {
      ...defaultWorkflowNotifyPrefs.approvals,
      ...parsed.data.approvals
    },
    overdueTasks: {
      ...defaultWorkflowNotifyPrefs.overdueTasks,
      ...parsed.data.overdueTasks
    },
    staleFollowUps: {
      ...defaultWorkflowNotifyPrefs.staleFollowUps,
      ...parsed.data.staleFollowUps
    },
    integrationChanges: {
      ...defaultWorkflowNotifyPrefs.integrationChanges,
      ...parsed.data.integrationChanges
    },
    digest: {
      ...defaultWorkflowNotifyPrefs.digest,
      ...parsed.data.digest
    }
  };
}

/** Prisma `WorkflowNotificationKind` values that use per-category channel prefs. */
export type WorkflowNotificationKindKey =
  | "invite_delivered"
  | "approval_created"
  | "approval_approved"
  | "approval_rejected"
  | "approval_executed"
  | "approval_failed"
  | "membership_invite_accepted"
  | "integration_connection_changed"
  | "task_overdue_digest"
  | "followup_stale_digest";

export const WORKFLOW_NOTIFICATION_KIND_TO_CATEGORY: Record<
  WorkflowNotificationKindKey,
  WorkflowNotifyCategory
> = {
  invite_delivered: "invites",
  membership_invite_accepted: "invites",
  approval_created: "approvals",
  approval_approved: "approvals",
  approval_rejected: "approvals",
  approval_executed: "approvals",
  approval_failed: "approvals",
  integration_connection_changed: "integrationChanges",
  task_overdue_digest: "overdueTasks",
  followup_stale_digest: "staleFollowUps"
};

export function workflowKindHasCategoryPrefs(
  kind: string
): kind is WorkflowNotificationKindKey {
  return kind in WORKFLOW_NOTIFICATION_KIND_TO_CATEGORY;
}
