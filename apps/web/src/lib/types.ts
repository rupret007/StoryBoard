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
    dueCampaignFollowUpCount: number;
    unreadBookingReplyCount: number;
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

export type ArtistBookingProfile = {
  id: string;
  homeCity?: string | null;
  homeRegion?: string | null;
  homeCountry?: string | null;
  genres: string[];
  targetCapacityMin?: number | null;
  targetCapacityMax?: number | null;
  bookingPitch?: string | null;
  pressKitUrl?: string | null;
  liveVideoUrl?: string | null;
};

export type BookingProfileResponse = {
  profile: ArtistBookingProfile | null;
  ready: boolean;
  missing: string[];
};

export type BookingProspect = {
  id: string;
  kind: "venue" | "festival" | "private_event" | "corporate_event";
  status: "discovered" | "qualified" | "disqualified" | "converted";
  name: string;
  city: string;
  region?: string | null;
  country?: string | null;
  capacity?: number | null;
  websiteUrl?: string | null;
  notes?: string | null;
  sourceSystem?: string | null;
  sourceRef?: string | null;
  venueId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  marketSprintId?: string | null;
  venue?: Venue | null;
  contact?: Contact | null;
  opportunity?: BookingOpportunity | null;
};

export type BookingCampaignRecipient = {
  id: string;
  status:
    | "needs_contact"
    | "ready"
    | "approval_requested"
    | "drafted"
    | "sent"
    | "replied"
    | "declined"
    | "booked";
  outcomeNote?: string | null;
  outcomeKind?: string | null;
  followUpDueAt?: string | null;
  followUpTaskId?: string | null;
  prospect: BookingProspect;
  contact?: Contact | null;
  opportunity?: BookingOpportunity | null;
};

export type BookingCampaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "closed";
  subjectTemplate: string;
  bodyTemplate: string;
  defaultFollowUpDays: number;
  deliveryMode: "draft_only" | "send_on_execution";
  marketSprintId?: string | null;
  approvalRequestId?: string | null;
  recipients: BookingCampaignRecipient[];
};

export type BookingReplySettings = {
  syncEnabled: boolean;
  aiAnalysisEnabled: boolean;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
  deploymentEnabled: boolean;
  scopeReady: boolean;
  reconnectRequired: boolean;
};

export type BookingReply = {
  id: string;
  fromEmail: string;
  fromName?: string | null;
  subject?: string | null;
  snippet?: string | null;
  receivedAt: string;
  processingStatus: "unread" | "reviewed" | "archived";
  intent?: "interested" | "offer" | "needs_info" | "decline" | "out_of_office" | "unknown" | null;
  summary?: string | null;
  proposedDate?: string | null;
  proposedFeeMinor?: number | null;
  proposedCurrency?: string | null;
  proposedVenue?: string | null;
  materialConditions?: string | null;
  questions?: string[] | null;
  recommendedNextAction?: string | null;
  suggestedReplySubject?: string | null;
  suggestedReplyBody?: string | null;
  confidence?: number | null;
  analyzedAt?: string | null;
  termsAppliedAt?: string | null;
  recipient: BookingCampaignRecipient & { campaign: BookingCampaign };
};

export type BookingMarketSprint = {
  id: string;
  name: string;
  city: string;
  region?: string | null;
  country?: string | null;
  status: "draft" | "active" | "completed" | "abandoned";
  targetQualifiedCount?: number | null;
  targetOutreachCount?: number | null;
  targetBookedCount?: number | null;
};

export type Task = {
  id: string;
  title: string;
  status: string;
  ownerLabel?: string | null;
  dueAt?: string | null;
  blockedReason?: string | null;
  waitingOn?: string | null;
  deferralCount?: number;
  lastDeferredAt?: string | null;
  opportunityId?: string | null;
  opportunity?: BookingOpportunity | null;
  projectId?: string | null;
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

export type ManagerProfile = {
  id: string;
  bandMode: "original" | "cover_event" | "hybrid";
  careerStage?: string | null;
  homeCity?: string | null;
  homeRegion?: string | null;
  homeCountry?: string | null;
  genres: string[];
  businessName?: string | null;
  currentAssets: string[];
  revenueSources: string[];
  constraints: string[];
  budgetToleranceMinor?: number | null;
  twelveMonthAmbition?: string | null;
  communicationCadence?: string | null;
  decisionStyle?: string | null;
  educationTopics: string[];
  availabilityExpectations?: string | null;
  currency: string;
  intakeCompletedAt?: string | null;
};
export type ManagerSettings = {
  id: string;
  artistId: string;
  aiEnabled: boolean;
  fullContextEnabled: boolean;
  scheduleEnabled: boolean;
  scheduledAiEnabled: boolean;
  scheduleAudience: "owners" | "team";
  timezone?: string | null;
  dailyHour: number;
  weeklyDay: number;
  lastScheduledPeriod?: string | null;
  scheduleClaimedAt?: string | null;
  lastScheduledAt?: string | null;
  updatedAt: string;
};
export type BandMember = { id: string; name: string; email?: string | null; roles: string[]; instruments: string[]; active: boolean };
export type ManagerContextHealth = { score: number; status: "thin" | "usable" | "strong"; summary: string; dimensions: { section: "identity" | "people" | "business" | "execution"; score: number; maxScore: 25; detail: string }[]; gaps: { code: string; section: "identity" | "people" | "business" | "execution"; importance: "high" | "med" | "low"; question: string; reason: string; evidenceIds: string[] }[]; nextQuestion?: string | null; evidenceIds: string[] };
export type ManagerCommitmentHealth = { observedAt: string; summary: string; counts: { open: number; blocked: number; overdue: number; waiting: number; unassigned: number; repeatedlyDeferred: number; dueSoon: number; unscheduled: number }; items: { taskId: string; title: string; state: "blocked" | "overdue" | "repeatedly_deferred" | "waiting" | "unassigned" | "due_soon" | "unscheduled" | "active"; severity: "high" | "med" | "low"; status: string; ownerLabel: string | null; dueAt: string | null; blockedReason: string | null; waitingOn: string | null; deferralCount: number; lastDeferredAt: string | null; reasons: string[]; evidenceIds: string[] }[]; nextAction: string; evidenceIds: string[] };
export type ManagerGoalProgressEvent = { id: string; previousValue?: number | null; value: number; delta?: number | null; note?: string | null; createdAt: string };
export type ManagerGoal = { id: string; sourceKey?: string | null; workstream: string; title: string; targetValue?: number | null; targetUnit?: string | null; currentValue?: number | null; deadline?: string | null; status: string; initiatives?: ManagerInitiative[]; progressEvents?: ManagerGoalProgressEvent[] };
export type ManagerInitiative = { id: string; sourceKey?: string | null; goalId?: string | null; workstream: string; title: string; description?: string | null; status: string; startsAt?: string | null; dueAt?: string | null; successMetric?: string | null; tasks?: { id: string; title: string; status: string; ownerLabel?: string | null; dueAt?: string | null }[] };
export type ManagerDecisionOption = { label: string; tradeoff: string };
export type ManagerDecision = { id: string; workstream: string; title: string; context?: string | null; options: ManagerDecisionOption[]; choice?: string | null; rationale?: string | null; expectedOutcome?: string | null; needsFraming?: boolean; evidence: string[]; status: "open" | "decided" | "reviewed" | "superseded"; reviewAt?: string | null; decidedAt?: string | null; reviewOutcome?: "worked" | "mixed" | "did_not_work" | "inconclusive" | null; reviewNote?: string | null; reviewedAt?: string | null; createdAt: string; updatedAt: string };
export type ManagerRecommendation = { id: string; title: string; reason: string; nextAction: string; priority: string; evidence: string[]; outcome: string; outcomeReason?: string | null; outcomeNote?: string | null; proposedAction?: { type: "create_task"; title: string } | { type: "create_decision"; title: string; workstream: string; context?: string | null; options: ManagerDecisionOption[] } | null };
export type ManagerRun = { id: string; cadence: string; mode: string; promptVersion: string; output: { summary: string; today: { title: string; reason: string; nextAction: string; priority: string; evidenceIds: string[] }[]; thisWeek: { title: string; reason: string; nextAction: string }[]; decisionsNeeded: { title: string; explanation: string }[]; waitingOn: { title: string; dueAt?: string | null }[]; risksAndOpportunities: { title: string; detail: string; confidence: number }[] }; recommendations: ManagerRecommendation[] };
export type ManagerMessageAction = { recommendationId: string; title: string; nextAction: string; outcome: string; actionType?: "create_task" | "create_decision" | null };
export type ManagerMessageFeedback = { id: string; helpful: boolean; reason?: string | null; note?: string | null; createdAt: string; updatedAt: string };
export type ManagerMessage = { id: string; role: "user" | "assistant"; content: string; citations: string[]; proposedActions: ManagerMessageAction[]; feedback?: ManagerMessageFeedback | null; createdAt: string };
export type ManagerConversation = { id: string; title?: string | null; updatedAt: string; messages: ManagerMessage[] };
export type ManagerMemoryFact = { id: string; key: string; value: unknown; sourceType: string; confidence: number; sensitivity: "normal" | "sensitive" | "restricted"; confirmedAt?: string | null; updatedAt: string };
export type ManagerLearningSummary = { windowDays: number; total: number; suggested: number; accepted: number; dismissed: number; completed: number; blocked: number; acceptanceRate: number | null; completionRate: number | null; openAcceptedTasks: number; dismissalReasons: { reason: string; count: number }[]; responseFeedback: { total: number; helpful: number; notHelpful: number; helpfulRate: number | null; reasons: { reason: string; count: number }[] } };
export type ManagerEvalExample = { id: string; recommendationId: string; label: "useful" | "not_useful" | "needs_revision"; notes?: string | null; promptVersion: string; updatedAt: string };
export type ManagerPlanHealth = { score: number; status: "on_track" | "at_risk" | "off_track" | "needs_plan"; summary: string; goals: { goalId: string; title: string; status: "on_track" | "at_risk" | "off_track" | "needs_measurement"; progressRatio: number | null; completedTasks: number; openTasks: number; reasons: string[]; evidenceIds: string[] }[]; gaps: { code: string; detail: string; evidenceIds: string[] }[] };
export type ManagerEvaluationRun = { id: string; candidateVersion: string; datasetVersion: string; passed: boolean; metrics: { total: number; passed: number; passRate: number; goldenPassRate: number; safetyPassRate: number; ownerReviewedCount: number; ownerReviewedPassRate: number | null }; createdAt: string };
export type ManagerOutcomeReview = { windowDays: number; from: string; through: string; headline: string; confidence: number; confidenceLabel: "low" | "medium" | "high"; activity: { completedShows: number; cancelledShows: number; completedProjects: number; cancelledProjects: number; completedTasks: number; booking: { booked: number; replied: number; declined: number } }; live: { attendanceRecordedShows: number; attendanceTotal: number; postShowNotesRecorded: number; relationshipOutcomesRecorded: number; finalizedSettlements: number; unsettledCompletedShows: number }; financials: { currency: string; grossMinor: number; expenseMinor: number; settledNetMinor: number; showsWithGross: number; finalizedSettlements: number; netKnownShows: number }[]; recordedLessons: { eventId: string; title: string; postShowNotes: string | null; relationshipOutcome: string | null; evidenceIds: string[] }[]; wins: { code: string; title: string; detail: string; evidenceIds: string[] }[]; attention: { code: string; title: string; detail: string; evidenceIds: string[] }[]; questions: { code: string; question: string; evidenceIds: string[] }[]; nextAction: string; evidenceIds: string[] };
export type ShowReadinessGap = { code: string; category: "people" | "schedule" | "contacts" | "deal" | "advance" | "performance"; severity: "low" | "med" | "high"; title: string; detail: string; nextAction: string; evidenceIds: string[] };
export type ShowReadiness = { eventId: string; title: string; startsAt?: string | null; daysUntil?: number | null; score: number; status: "ready" | "attention" | "not_ready" | "blocked"; confidence: number; confidenceLabel: "low" | "medium" | "high"; observedAt: string; headline: string; nextAction?: string | null; categories: { category: ShowReadinessGap["category"]; score: number; maxScore: number; detail: string }[]; gaps: ShowReadinessGap[]; evidenceIds: string[] };
export type EventDayOfTimelineItem = { id: string; label: string; at: string; endsAt?: string | null; location?: string | null; notes?: string | null; state: "passed" | "next" | "later"; minutesUntil: number };
export type EventDayOfView = { eventId: string; mode: "date_missing" | "pre_show" | "in_progress" | "post_show" | "closed"; observedAt: string; headline: string; nextAction: string; nextCheckpoint?: EventDayOfTimelineItem | null; timeline: EventDayOfTimelineItem[]; openTaskCount: number; overdueTaskCount: number; unavailableCount: number; unresolvedAvailabilityCount: number; expectedFeeMinor?: number | null; expectedDepositMinor: number; recordedPaidMinor: number; openInvoiceBalanceMinor: number; depositRemainingMinor: number; currency: string; evidenceIds: string[] };
export type BandEvent = { id: string; type: string; status: string; title: string; startsAt?: string | null; endsAt?: string | null; venueId?: string | null; venue?: Venue | null; contactId?: string | null; contact?: Contact | null; setlistId?: string | null; setlist?: Setlist | null; locationName?: string | null; address?: string | null; loadInAt?: string | null; soundcheckAt?: string | null; doorsAt?: string | null; setAt?: string | null; curfewAt?: string | null; travelNotes?: string | null; hospitalityNotes?: string | null; productionNotes?: string | null; parkingNotes?: string | null; guestListNotes?: string | null; stagePlotUrl?: string | null; inputListUrl?: string | null; techRiderUrl?: string | null; hospitalityRiderUrl?: string | null; driveFolderUrl?: string | null; guaranteeMinor?: number | null; depositMinor?: number | null; attendance?: number | null; grossRevenueMinor?: number | null; postShowNotes?: string | null; relationshipOutcome?: string | null; currency: string; participants: { id: string; response: string; assignment?: string | null; notes?: string | null; bandMember: BandMember }[]; schedule?: { id: string; title: string; startsAt: string; endsAt?: string | null; location?: string | null; notes?: string | null }[]; tasks?: Task[]; deals?: DealOffer[]; invoices?: Invoice[]; settlement?: Settlement | null };
export type EventDayOfResponse = { event: BandEvent; activeMembers: BandMember[]; readiness: ShowReadiness; dayOf: EventDayOfView };
export type Song = { id: string; title: string; durationSeconds?: number | null; musicalKey?: string | null; bpm?: number | null; active: boolean };
export type Setlist = { id: string; name: string; status: string; notes?: string | null; items: { id: string; itemType: string; label?: string | null; transitionNotes?: string | null; song?: Song | null }[] };
export type ProjectReadinessGap = { code: string; severity: "low" | "med" | "high"; detail: string; nextAction: string; evidenceIds: string[] };
export type ProjectReadiness = { projectId: string; score: number; status: "on_track" | "at_risk" | "off_track" | "blocked" | "complete" | "closed" | "needs_plan"; confidence: number; headline: string; nextAction: string; nextMilestone?: { id: string; title: string; dueAt?: string | null; ownerLabel?: string | null } | null; completedMilestones: number; totalMilestones: number; overdueMilestones: number; blockedMilestones: number; spendMinor: number; budgetRemainingMinor?: number | null; gaps: ProjectReadinessGap[]; evidenceIds: string[]; observedAt: string };
export type ArtistProject = { id: string; type: string; status: string; name: string; description?: string | null; startsAt?: string | null; dueAt?: string | null; budgetMinor?: number | null; currency: string; successMetrics?: string[]; assets?: { label: string; url: string }[]; tasks?: Task[]; events?: BandEvent[]; expenses?: Expense[]; readiness?: ProjectReadiness };
export type ProjectReadinessResponse = { project: ArtistProject; readiness: ProjectReadiness };
export type DealOffer = { id: string; title: string; status: string; offerAmountMinor?: number | null; currency: string; buyerName?: string | null; buyerEmail?: string | null; agreements: { id: string; version: number; status: string }[]; invoices: Invoice[] };
export type Invoice = { id: string; number: string; status: string; recipientName: string; currency: string; totalMinor: number; paidMinor: number; dueAt?: string | null };
export type Settlement = { id: string; status: string; currency: string; grossMinor: number; expenseMinor: number; netMinor: number; event: BandEvent };
export type Expense = { id: string; eventId?: string | null; projectId?: string | null; category: string; description: string; amountMinor: number; currency: string; incurredAt: string; event?: BandEvent | null; project?: ArtistProject | null };
export type DocumentTemplate = { id: string; kind: string; name: string; version: number; active: boolean; legalDisclaimer: string };

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

export type BookingAdvisorRun = {
  id: string;
  mode: string;
  model?: string | null;
  promptVersion: string;
  createdAt: string;
  advice: { summary: string; opportunities: { title: string; reason: string; nextAction: string; priority: "low" | "med" | "high" }[]; promptImprovements: string[] };
  feedback: { helpful: boolean }[];
};
