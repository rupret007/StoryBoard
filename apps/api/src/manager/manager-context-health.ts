export type ManagerContextGap = {
  code: string;
  section: "identity" | "people" | "business" | "execution";
  importance: "high" | "med" | "low";
  question: string;
  reason: string;
  evidenceIds: string[];
};

export type ManagerContextHealth = {
  score: number;
  status: "thin" | "usable" | "strong";
  summary: string;
  dimensions: { section: ManagerContextGap["section"]; score: number; maxScore: 25; detail: string }[];
  gaps: ManagerContextGap[];
  nextQuestion: string | null;
  evidenceIds: string[];
};

type ContextProfile = {
  id?: string;
  bandMode?: string | null;
  careerStage?: string | null;
  homeCity?: string | null;
  genres?: string[];
  twelveMonthAmbition?: string | null;
  constraints?: string[];
  availabilityExpectations?: string | null;
  revenueSources?: string[];
  currentAssets?: string[];
  budgetToleranceMinor?: number | null;
  businessName?: string | null;
  currency?: string | null;
} | null;

type ContextRecord = { id: string };
type ContextMember = ContextRecord & { name: string; roles?: string[]; instruments?: string[] };

export function deterministicManagerContextHealth(input: {
  profile: ContextProfile;
  members: ContextMember[];
  goals: ContextRecord[];
  events: ContextRecord[];
  projects: ContextRecord[];
  opportunities: ContextRecord[];
}): ManagerContextHealth {
  const { profile, members, goals, events, projects, opportunities } = input;
  const gaps: ManagerContextGap[] = [];
  const addGap = (gap: ManagerContextGap) => gaps.push(gap);
  const profileEvidence = profile?.id ? [profile.id] : [];
  let identity = 0;
  if (profile?.bandMode) identity += 2;
  if (profile?.careerStage) identity += 4;
  else addGap({ code: "career_stage", section: "identity", importance: "med", question: "How would you describe the band's current stage in plain language?", reason: "Stage changes which opportunities and timelines are realistic.", evidenceIds: profileEvidence });
  if (profile?.homeCity) identity += 5;
  else addGap({ code: "home_market", section: "identity", importance: "high", question: "What city or market is the band actually operating from?", reason: "Booking, travel, and audience plans need a real starting market.", evidenceIds: profileEvidence });
  if (profile?.genres?.length) identity += 4;
  else addGap({ code: "genres", section: "identity", importance: "med", question: "What two or three genre labels help the right buyer understand the band?", reason: "Genre fit helps qualify rooms, bills, and audience opportunities.", evidenceIds: profileEvidence });
  if (profile?.twelveMonthAmbition) identity += 6;
  else addGap({ code: "ambition", section: "identity", importance: "high", question: "What would make the next twelve months feel meaningfully successful?", reason: "Priorities cannot be weighed without a direction the band actually chose.", evidenceIds: profileEvidence });
  if (profile?.constraints?.length) identity += 4;
  else addGap({ code: "constraints", section: "identity", importance: "med", question: "What planning limits should the Manager respect—work schedules, caregiving, travel, money, or another boundary? Share only the operational impact, not private details.", reason: "A plan that ignores real constraints is not a usable plan.", evidenceIds: profileEvidence });

  let people = 0;
  if (members.length) people += 8;
  else addGap({ code: "lineup", section: "people", importance: "high", question: "Who is currently in the working lineup?", reason: "Availability and ownership cannot be managed without the real people involved.", evidenceIds: [] });
  const unscopedMembers = members.filter((member) => !(member.roles?.length || member.instruments?.length));
  if (members.length && !unscopedMembers.length) people += 10;
  else if (members.length) addGap({ code: "member_responsibilities", section: "people", importance: "high", question: `What does ${unscopedMembers[0]?.name ?? "each member"} handle onstage or offstage?`, reason: "Named responsibilities make assignments and availability advice specific.", evidenceIds: unscopedMembers.map((member) => member.id).slice(0, 8) });
  if (profile?.availabilityExpectations) people += 7;
  else addGap({ code: "availability_expectations", section: "people", importance: "high", question: "How far ahead should members respond to shows, rehearsals, and travel?", reason: "A shared response expectation prevents holds and opportunities from drifting.", evidenceIds: profileEvidence });

  let business = 0;
  if (profile?.revenueSources?.length) business += 6;
  else addGap({ code: "revenue_sources", section: "business", importance: "med", question: "How does the band currently make money, even if the amounts are small?", reason: "Revenue sources show which work is sustaining the band and which is speculative.", evidenceIds: profileEvidence });
  if (profile?.currentAssets?.length) business += 5;
  else addGap({ code: "current_assets", section: "business", importance: "med", question: "Which usable assets already exist—recordings, photos, video, press kit, mailing list, gear, or something else?", reason: "Plans should reuse real assets before creating new work.", evidenceIds: profileEvidence });
  if (profile?.budgetToleranceMinor !== null && profile?.budgetToleranceMinor !== undefined) business += 5;
  else addGap({ code: "budget_tolerance", section: "business", importance: "med", question: "What amount can the band responsibly invest over the next ninety days?", reason: "Budget-sensitive advice needs a band-approved ceiling, including zero.", evidenceIds: profileEvidence });
  if (profile?.businessName) business += 4;
  else addGap({ code: "business_identity", section: "business", importance: "low", question: "Does the band use a legal or payment name different from the artist name?", reason: "This becomes important for agreements, invoices, and tax records.", evidenceIds: profileEvidence });
  if (profile?.currency) business += 5;

  let execution = 0;
  if (goals.length) execution += 7;
  else addGap({ code: "active_goal", section: "execution", importance: "high", question: "What measurable outcome should the band pursue first?", reason: "Without an active goal, current work cannot be prioritized against a chosen result.", evidenceIds: [] });
  if (events.length) execution += 6;
  if (projects.length) execution += 6;
  if (opportunities.length) execution += 6;
  if (!events.length && !projects.length && !opportunities.length) addGap({ code: "current_commitments", section: "execution", importance: "med", question: "What show, release, campaign, or opportunity is already in motion?", reason: "The Manager needs current commitments before proposing new work.", evidenceIds: [] });

  const score = identity + people + business + execution;
  const status: ManagerContextHealth["status"] = score >= 80 ? "strong" : score >= 55 ? "usable" : "thin";
  const priority = { high: 0, med: 1, low: 2 } as const;
  gaps.sort((a, b) => priority[a.importance] - priority[b.importance]);
  const evidenceIds = [...new Set([
    ...profileEvidence,
    ...members.map((member) => member.id),
    ...goals.map((row) => row.id),
    ...events.map((row) => row.id),
    ...projects.map((row) => row.id),
    ...opportunities.map((row) => row.id)
  ])];
  const summary = status === "strong"
    ? "The Manager has strong structured context for current planning, with remaining gaps clearly labeled."
    : status === "usable"
      ? "The Manager has enough context to help, but a few answers would make priorities more specific."
      : "The Manager is still missing important band context, so some advice will remain cautious or generic.";
  return {
    score,
    status,
    summary,
    dimensions: [
      { section: "identity", score: identity, maxScore: 25, detail: "Direction, market, genre, stage, and constraints" },
      { section: "people", score: people, maxScore: 25, detail: "Working lineup, responsibilities, and availability expectations" },
      { section: "business", score: business, maxScore: 25, detail: "Revenue, assets, budget, payment identity, and currency" },
      { section: "execution", score: execution, maxScore: 25, detail: "Goals and current shows, projects, or opportunities" }
    ],
    gaps,
    nextQuestion: gaps[0]?.question ?? null,
    evidenceIds
  };
}
