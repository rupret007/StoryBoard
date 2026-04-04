export type DashboardStats = {
  artistId: string;
  venues: number;
  contacts: number;
  bookingOpportunities: number;
  activeOpportunities: number;
  tasks: number;
  overdueTasks: number;
  pendingApprovals: number;
};

export type DashboardInsights = {
  bookingHealth: {
    score: number;
    label: string;
    factors: { code: string; impact: number; detail: string }[];
  };
  opportunityRisks: {
    opportunityId: string;
    level: "low" | "med" | "high";
    reasons: string[];
  }[];
  signals: {
    overdueTaskCount: number;
    staleFollowUpCount: number;
    pendingApprovalAgingCount: number;
    approvalAgingThresholdDays: number;
    overdueClusterThreshold: number;
    staleClusterMin: number;
    meetsApprovalAgingUrgent: boolean;
    meetsOverdueClusterUrgent: boolean;
    meetsStaleClusterUrgent: boolean;
  };
  priorityActions: {
    id: string;
    title: string;
    reason: string;
    href: string;
    severity: "low" | "med" | "high";
  }[];
};

export type Venue = {
  id: string;
  name: string;
  city: string;
  region?: string | null;
  country?: string | null;
  addressLine?: string | null;
  capacity?: number | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  driveMinutesFromBase?: number | null;
  fitScore?: number | null;
};

export type Contact = {
  id: string;
  fullName: string;
  contactKind: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  venueId?: string | null;
  venue?: Venue | null;
};

export type BookingOpportunity = {
  id: string;
  title: string;
  stage: string;
  venueId?: string | null;
  targetDate?: string | null;
  marketNotes?: string | null;
  venue?: Venue | null;
};

export type Task = {
  id: string;
  title: string;
  status: string;
  ownerLabel?: string | null;
  dueAt?: string | null;
  opportunityId?: string | null;
  opportunity?: BookingOpportunity | null;
};

export type ApprovalRequest = {
  id: string;
  title: string;
  status: string;
  actionType: string;
  proposedBy?: string | null;
  approvedBy?: string | null;
  payload: unknown;
};

export type AuditEvent = {
  id: string;
  action: string;
  aggregateType: string;
  aggregateId: string;
  actorLabel?: string | null;
  createdAt: string;
  metadata: unknown;
};

export type CommandRun = {
  id: string;
  intent?: string | null;
  rawInput: string;
  dryRun: boolean;
  status: string;
  createdAt: string;
};

export type WeeklySummary = {
  generatedAt: string;
  bookingPipelineByStage: Record<string, number>;
  activeOpportunities: number;
  overdueTasks: Task[];
  staleFollowUpsOlderThan7d: Task[];
  pendingApprovals: ApprovalRequest[];
  recentAudit: AuditEvent[];
  recentCommands: CommandRun[];
  recommendations: string[];
};
