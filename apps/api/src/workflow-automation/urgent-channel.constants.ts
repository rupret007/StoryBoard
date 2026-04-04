/** Deterministic thresholds for urgent Telegram scan (documented in docs/architecture.md). */
export const URGENT_TELEGRAM_RULES = {
  /** Pending approval aging: days ≥ max(workflowPendingApprovalDays, 1) × this, capped by adding at most APPROVAL_AGING_MAX_EXTRA_DAYS beyond base */
  APPROVAL_AGING_MULTIPLIER: 2,
  /** When workflowPendingApprovalDays is 0, still alert after this many days pending */
  APPROVAL_AGING_FLOOR_DAYS: 3,
  APPROVAL_AGING_CAP_DAYS: 30,
  /** Overdue task cluster: at least this many overdue tasks (after grace) */
  OVERDUE_CLUSTER_MIN: 5,
  /** When incomplete tasks ≤ this count, use SMALL roster threshold */
  SMALL_ROSTER_MAX_OPEN_TASKS: 10,
  OVERDUE_CLUSTER_MIN_SMALL: 3,
  /** Stale follow-up cluster */
  STALE_CLUSTER_MIN: 5
} as const;

export type TelegramNotifyCategoryKey =
  | "approvals"
  | "overdueTasks"
  | "staleFollowUps";
