import { EmptyState, PageHeader, SurfaceCard } from "@storyboard/ui";
import { Activity as ActivityIcon } from "lucide-react";
import { serverApiFetch } from "@/lib/api-server";
import type { AuditEvent } from "@/lib/types";

export default async function ActivityPage() {
  let events: AuditEvent[] = [];
  try {
    events = await serverApiFetch<AuditEvent[]>("/audit-events?take=80", {
      cache: "no-store"
    });
  } catch {
    events = [];
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Activity"
        description="Immutable-style audit log — approvals, CRM edits, and commands land here."
      />

      {events.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="As you use StoryBoard, important actions will appear in this timeline."
          icon={<ActivityIcon className="h-6 w-6" />}
        />
      ) : (
        <SurfaceCard padding="lg" className="relative overflow-hidden">
          <div
            className="absolute bottom-0 left-[1.35rem] top-8 w-px bg-[var(--border-strong)]"
            aria-hidden
          />
          <ul className="relative space-y-0">
            {events.map((e) => (
              <li key={e.id} className="relative flex gap-4 pb-8 pl-1 last:pb-0">
                <div className="relative z-10 mt-1.5 flex h-3 w-3 shrink-0 rounded-full border-2 border-[var(--accent)] bg-[var(--surface-1)] shadow-[0_0_12px_rgba(34,211,238,0.35)]" />
                <div className="min-w-0 flex-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {e.action}
                    </span>
                    <time className="text-xs tabular-nums text-[var(--text-muted)]">
                      {new Date(e.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {e.aggregateType} · {e.aggregateId}
                    {e.actorLabel ? ` · ${e.actorLabel}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      )}
    </div>
  );
}
