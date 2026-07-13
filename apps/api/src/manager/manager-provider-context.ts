export type ManagerProviderMemoryFact = {
  sensitivity: "normal" | "sensitive" | "restricted" | string;
};

export type ManagerProviderContextPolicy = {
  mode: "disabled" | "redacted" | "full";
  fullContextEnabled: boolean;
  includesOperatingNotes: boolean;
  memory: {
    normal: number;
    sensitive: number;
    restricted: number;
    included: number;
    excluded: number;
  };
  restrictedMemoryNeverShared: true;
};

export type ManagerFullContextSourceBinding = {
  sourceMessageId: string | null;
  sourceMessageCreatedAt: string | null;
};

export type ManagerOwnerOnlyRunSource = {
  trace?: unknown;
  message?: { visibility?: string | null } | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function managerRunFullContextSourceBinding(
  managerRun: { trace?: unknown } | null | undefined
): ManagerFullContextSourceBinding | null {
  const trace = record(managerRun?.trace);
  const providerContext = record(trace?.providerContext);
  // The privacy boundary is established when full context is selected, not
  // after a provider response is accepted. A failed request, rejected output,
  // or deterministic fallback may still have received or been derived from
  // the owner-only source turn.
  if (providerContext?.fullContextEnabled !== true) return null;
  const sourceMessageId = typeof providerContext.sourceMessageId === "string" && providerContext.sourceMessageId
    ? providerContext.sourceMessageId
    : null;
  const sourceMessageCreatedAt = typeof providerContext.sourceMessageCreatedAt === "string" && !Number.isNaN(Date.parse(providerContext.sourceMessageCreatedAt))
    ? providerContext.sourceMessageCreatedAt
    : null;
  return { sourceMessageId, sourceMessageCreatedAt };
}

export function managerRunUsesOwnerOnlyContext(
  managerRun: ManagerOwnerOnlyRunSource | null | undefined
) {
  return managerRun?.message?.visibility === "owner_only" || Boolean(managerRunFullContextSourceBinding(managerRun));
}

export function managerFullProviderContextEnabled(
  settings: { aiEnabled: boolean; fullContextEnabled: boolean },
  actorIsOwner: boolean
) {
  return actorIsOwner && settings.aiEnabled && settings.fullContextEnabled;
}

export function projectManagerMemoryForProvider<T extends ManagerProviderMemoryFact>(
  memoryFacts: T[],
  fullContextEnabled: boolean
) {
  return memoryFacts.filter((fact) =>
    fact.sensitivity === "normal" ||
    (fullContextEnabled && fact.sensitivity === "sensitive")
  );
}

export function managerProviderContextPolicy(
  memoryFacts: ManagerProviderMemoryFact[],
  settings: { aiEnabled: boolean; fullContextEnabled: boolean }
): ManagerProviderContextPolicy {
  const fullContextEnabled = settings.aiEnabled && settings.fullContextEnabled;
  const normal = memoryFacts.filter((fact) => fact.sensitivity === "normal").length;
  const sensitive = memoryFacts.filter((fact) => fact.sensitivity === "sensitive").length;
  const restricted = memoryFacts.filter((fact) => fact.sensitivity === "restricted").length;
  const included = settings.aiEnabled ? normal + (fullContextEnabled ? sensitive : 0) : 0;
  return {
    mode: settings.aiEnabled ? (fullContextEnabled ? "full" : "redacted") : "disabled",
    fullContextEnabled,
    includesOperatingNotes: fullContextEnabled,
    memory: {
      normal,
      sensitive,
      restricted,
      included,
      excluded: normal + sensitive + restricted - included
    },
    restrictedMemoryNeverShared: true
  };
}
