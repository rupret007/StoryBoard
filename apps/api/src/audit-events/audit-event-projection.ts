import type { AuditEvent, Prisma } from "../generated/prisma/client";

export type AuditEventForRead = Omit<AuditEvent, "metadata"> & {
  metadata: Prisma.JsonValue;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMemoryKeyField(field: string) {
  const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized === "key" || normalized === "memorykey";
}

function redactMemoryKeyFields(value: unknown): { value: unknown; redacted: boolean } {
  if (Array.isArray(value)) {
    let redacted = false;
    const projected = value.map((item) => {
      const result = redactMemoryKeyFields(item);
      redacted ||= result.redacted;
      return result.value;
    });
    return { value: projected, redacted };
  }
  if (!isRecord(value)) return { value, redacted: false };

  let redacted = false;
  const projected: Record<string, unknown> = {};
  for (const [field, nested] of Object.entries(value)) {
    if (isMemoryKeyField(field)) {
      redacted = true;
      continue;
    }
    const result = redactMemoryKeyFields(nested);
    redacted ||= result.redacted;
    projected[field] = result.value;
  }
  return { value: projected, redacted };
}

/**
 * Remove legacy content-derived Manager memory keys at the read boundary.
 * Stored AuditEvent rows remain immutable; every caller receives a cloned projection.
 */
export function projectAuditEventForRead<T extends { aggregateType: string; metadata: unknown }>(event: T): T {
  if (event.aggregateType !== "ManagerMemoryFact") return event;
  const projected = redactMemoryKeyFields(event.metadata);
  if (!projected.redacted) return event;
  const metadata = isRecord(projected.value)
    ? { ...projected.value, memoryKeyRedacted: true }
    : projected.value;
  return { ...event, metadata } as T;
}

export function projectAuditEventsForRead<T extends { aggregateType: string; metadata: unknown }>(events: T[]): T[] {
  return events.map(projectAuditEventForRead);
}
