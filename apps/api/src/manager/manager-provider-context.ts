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
