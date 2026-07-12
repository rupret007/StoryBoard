const DAY_MS = 24 * 60 * 60 * 1000;

export const PROFILE_BACKED_MEMORY_KEYS = [
  "band_mode",
  "home_market",
  "twelve_month_ambition",
  "constraints"
] as const;

export type ProfileBackedMemoryKey = typeof PROFILE_BACKED_MEMORY_KEYS[number];

type KnowledgeProfile = {
  id: string;
  bandMode: string;
  homeCity: string | null;
  homeRegion: string | null;
  homeCountry: string | null;
  twelveMonthAmbition: string | null;
  constraints: string[];
  updatedAt: Date;
} | null;

type KnowledgeMemoryFact = {
  id: string;
  key: string;
  value: unknown;
  sourceType: string;
  sourceId: string | null;
  confidence: number;
  sensitivity: string;
  confirmedAt: Date | null;
  updatedAt: Date;
};

export type ManagerKnowledgeState = "current" | "stale" | "unconfirmed" | "low_confidence" | "conflicted";

export type ManagerKnowledgeHealth = {
  policyVersion: "manager_knowledge_v1";
  status: "healthy" | "attention" | "conflicted";
  score: number;
  summary: string;
  items: {
    factId: string;
    key: string;
    state: ManagerKnowledgeState;
    authoritativeSource: "operating_profile" | "manager_memory";
    reason: string;
    confirmedAt: Date | null;
    evidenceIds: string[];
  }[];
  counts: Record<ManagerKnowledgeState, number>;
  nextAction: string;
  evidenceIds: string[];
};

const reviewDays: Record<ProfileBackedMemoryKey, number> = {
  band_mode: 365,
  home_market: 180,
  twelve_month_ambition: 90,
  constraints: 90
};

export function isProfileBackedMemoryKey(key: string): key is ProfileBackedMemoryKey {
  return (PROFILE_BACKED_MEMORY_KEYS as readonly string[]).includes(key);
}

export function managerProfileMemoryValues(profile: NonNullable<KnowledgeProfile>): Record<ProfileBackedMemoryKey, unknown> {
  return {
    band_mode: profile.bandMode,
    home_market: { city: profile.homeCity, region: profile.homeRegion, country: profile.homeCountry },
    twelve_month_ambition: profile.twelveMonthAmbition,
    constraints: profile.constraints
  };
}

function comparable(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") {
    return JSON.stringify(Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))));
  }
  return JSON.stringify(value);
}

function stateForFact(fact: KnowledgeMemoryFact, profile: KnowledgeProfile, now: Date): { state: ManagerKnowledgeState; source: "operating_profile" | "manager_memory"; reason: string } {
  const source = profile && isProfileBackedMemoryKey(fact.key) ? "operating_profile" as const : "manager_memory" as const;
  if (profile && isProfileBackedMemoryKey(fact.key)) {
    const expected = managerProfileMemoryValues(profile)[fact.key];
    if (comparable(fact.value) !== comparable(expected)) return {
      state: "conflicted",
      source: "operating_profile",
      reason: "The saved memory disagrees with the operating profile; the profile is authoritative."
    };
  }
  if (!fact.confirmedAt) return { state: "unconfirmed", source, reason: "No band member has confirmed this fact." };
  if (fact.confidence < 0.75) return { state: "low_confidence", source, reason: "The recorded confidence is too low to treat this as settled." };
  const maxAgeDays = isProfileBackedMemoryKey(fact.key) ? reviewDays[fact.key] : 180;
  const ageDays = Math.max(0, Math.floor((now.getTime() - fact.confirmedAt.getTime()) / DAY_MS));
  if (ageDays > maxAgeDays) return { state: "stale", source, reason: `This fact was last confirmed ${ageDays} days ago and should be checked again.` };
  return { state: "current", source, reason: "This fact is confirmed and inside its review window." };
}

export function projectManagerMemoryForReasoning<T extends KnowledgeMemoryFact>(profile: KnowledgeProfile, memoryFacts: T[]): T[] {
  if (!profile) return memoryFacts;
  const canonical = managerProfileMemoryValues(profile);
  return memoryFacts.map((fact) => isProfileBackedMemoryKey(fact.key) ? {
    ...fact,
    value: canonical[fact.key],
    sourceType: "operating_profile",
    sourceId: profile.id,
    confidence: 1,
    confirmedAt: profile.updatedAt
  } : fact);
}

export function deterministicManagerKnowledgeHealth(input: { profile: KnowledgeProfile; memoryFacts: KnowledgeMemoryFact[] }, now = new Date()): ManagerKnowledgeHealth {
  const items = input.memoryFacts.map((fact) => {
    const assessment = stateForFact(fact, input.profile, now);
    return {
      factId: fact.id,
      key: fact.key,
      state: assessment.state,
      authoritativeSource: assessment.source,
      reason: assessment.reason,
      confirmedAt: fact.confirmedAt,
      evidenceIds: [fact.id, ...(assessment.source === "operating_profile" && input.profile ? [input.profile.id] : [])]
    };
  });
  const counts: ManagerKnowledgeHealth["counts"] = { current: 0, stale: 0, unconfirmed: 0, low_confidence: 0, conflicted: 0 };
  for (const item of items) counts[item.state] += 1;
  const deductions = counts.conflicted * 35 + counts.unconfirmed * 25 + counts.low_confidence * 20 + counts.stale * 15;
  const score = Math.max(0, Math.min(100, items.length ? 100 - deductions : 60));
  const status: ManagerKnowledgeHealth["status"] = counts.conflicted ? "conflicted" : !items.length || counts.stale || counts.unconfirmed || counts.low_confidence ? "attention" : "healthy";
  const summary = status === "healthy"
    ? "The Manager's saved knowledge is consistent with the operating profile and currently confirmed."
    : status === "conflicted"
      ? "Some saved knowledge conflicts with the operating profile. StoryBoard will use the profile until the duplicate memory is repaired."
      : items.length ? "Some saved knowledge needs confirmation before it should influence long-range advice." : "The Manager has no saved band knowledge to verify yet.";
  const next = items.find((item) => item.state === "conflicted") ?? items.find((item) => item.state === "unconfirmed") ?? items.find((item) => item.state === "low_confidence") ?? items.find((item) => item.state === "stale");
  return {
    policyVersion: "manager_knowledge_v1",
    status,
    score,
    summary,
    items,
    counts,
    nextAction: next
      ? next.authoritativeSource === "operating_profile"
        ? `Review ${next.key.replaceAll("_", " ")} in the operating profile.`
        : `Confirm or correct ${next.key.replaceAll("_", " ")} in Manager memory.`
      : items.length ? "Keep the operating profile and saved memory current as the band changes." : "Complete the operating profile before relying on long-range advice.",
    evidenceIds: [...new Set(items.flatMap((item) => item.evidenceIds))]
  };
}
