import { Badge, PageHeader, SurfaceCard } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type {
  ApprovalRequest,
  CommandRun,
  DashboardInsights,
  Task,
  WeeklySummary
} from "@/lib/types";
import Link from "next/link";

export default async function SummaryPage() {
  let summary: WeeklySummary | null = null;
  let insights: DashboardInsights | null = null;
  let error: string | null = null;
  try {
    [summary, insights] = await Promise.all([
      serverApiFetch<WeeklySummary>("/weekly-summary", { cache: "no-store" }),
      serverApiFetch<DashboardInsights>("/dashboard/insights", {
        cache: "no-store"
      }).catch(() => null)
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load summary";
  }

  if (error || !summary) {
    return (
      <div className="space-y-6">
        <PageHeader title="Weekly briefing" description="Could not load data." />
        <SurfaceCard className="border-red-500/25 bg-red-950/20">
          <p className="text-sm text-red-300">{error}</p>
        </SurfaceCard>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Weekly briefing"
        description={`Generated ${new Date(summary.generatedAt).toLocaleString()} from live Postgres — your manager snapshot.`}
      />

      {insights ? (
        <SurfaceCard elevated className="border-[var(--border-strong)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Operational snapshot
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Booking health {insights.bookingHealth.score}/100 ·{" "}
                {insights.bookingHealth.label}. Same deterministic signals as the
                command center; see the{" "}
                <Link
                  href="/dashboard"
                  className="text-[var(--accent)] hover:text-[var(--accent-hover)]"
                >
                  dashboard
                </Link>{" "}
                for priority actions.
              </p>
            </div>
            <Badge
              variant={
                insights.bookingHealth.label === "Healthy"
                  ? "success"
                  : insights.bookingHealth.label === "Attention"
                    ? "warning"
                    : "danger"
              }
            >
              {insights.bookingHealth.label}
            </Badge>
          </div>
          <ul className="mt-3 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-3">
            <li>
              Overdue (after grace):{" "}
              <span className="font-mono text-[var(--text-primary)]">
                {insights.signals.overdueTaskCount}
              </span>
            </li>
            <li>
              Stale follow-ups:{" "}
              <span className="font-mono text-[var(--text-primary)]">
                {insights.signals.staleFollowUpCount}
              </span>
            </li>
            <li>
              Aged pending approvals:{" "}
              <span className="font-mono text-[var(--text-primary)]">
                {insights.signals.pendingApprovalAgingCount}
              </span>
              <span className="text-[var(--text-muted)]">
                {" "}
                (≥{insights.signals.approvalAgingThresholdDays}d)
              </span>
            </li>
          </ul>
        </SurfaceCard>
      ) : null}

      <SurfaceCard elevated>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Booking pipeline
        </h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(summary.bookingPipelineByStage).map(
            ([stage, count]) => (
              <li
                key={stage}
                className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2.5 text-sm"
              >
                <span className="text-[var(--text-secondary)]">{stage}</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">
                  {String(Number(count))}
                </span>
              </li>
            )
          )}
        </ul>
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          Active opportunities (excl. closed/confirmed):{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {summary.activeOpportunities}
          </span>
        </p>
      </SurfaceCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SurfaceCard className="border-amber-500/20">
          <h2 className="text-sm font-semibold text-amber-100">
            Overdue (due date)
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            {summary.overdueTasks.map((t: Task) => (
              <li key={t.id} className="flex items-center gap-2">
                <Badge variant="danger">due</Badge>
                {t.title}
              </li>
            ))}
            {summary.overdueTasks.length === 0 ? (
              <li className="text-[var(--text-muted)]">None</li>
            ) : null}
          </ul>
        </SurfaceCard>
        <SurfaceCard className="border-amber-500/20">
          <h2 className="text-sm font-semibold text-amber-100">
            Stale follow-ups (7d+ since update)
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            {summary.staleFollowUpsOlderThan7d.map((t: Task) => (
              <li key={t.id}>{t.title}</li>
            ))}
            {summary.staleFollowUpsOlderThan7d.length === 0 ? (
              <li className="text-[var(--text-muted)]">None</li>
            ) : null}
          </ul>
        </SurfaceCard>
      </div>

      <SurfaceCard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Approval work
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Decisions, explicit execution, and provider reconciliation are separate steps.
            </p>
          </div>
          <Link href="/approvals" className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]">
            Open approval center
          </Link>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ApprovalSummaryList
            title="Needs reconciliation"
            count={summary.approvalWorkQueue.counts.needsReconciliation}
            items={summary.approvalWorkQueue.needsReconciliation}
            href="/approvals#needs-reconciliation"
            variant="danger"
            empty="No failed or uncertain attempts."
          />
          <ApprovalSummaryList
            title="Ready to execute"
            count={summary.approvalWorkQueue.counts.readyToExecute}
            items={summary.approvalWorkQueue.readyToExecute}
            href="/approvals#ready-to-execute"
            variant="warning"
            empty="No approved provider work waiting."
          />
          <ApprovalSummaryList
            title="Decisions waiting"
            count={summary.approvalWorkQueue.counts.pendingDecision}
            items={summary.approvalWorkQueue.pendingDecision}
            href="/approvals#pending-decisions"
            variant="neutral"
            empty="No approval decisions waiting."
          />
        </div>
        {summary.approvalWorkQueue.counts.approvedNotExecutable > 0 ? (
          <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs text-[var(--text-muted)]">
            {summary.approvalWorkQueue.counts.approvedNotExecutable} approved record{summary.approvalWorkQueue.counts.approvedNotExecutable === 1 ? " has" : "s have"} no provider execution step.
          </p>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Recommendations
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          {summary.recommendations.map((r: string, i: number) => (
            <li
              key={i}
              className="border-l-2 border-[var(--accent-muted)] pl-4"
            >
              {r}
            </li>
          ))}
          {summary.recommendations.length === 0 ? (
            <li className="text-[var(--text-muted)]">No tips this week.</li>
          ) : null}
        </ul>
      </SurfaceCard>

      <SurfaceCard>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Recent commands
        </h2>
        <ul className="mt-4 space-y-2 font-mono text-xs text-[var(--text-muted)]">
          {summary.recentCommands.map((c: CommandRun) => (
            <li
              key={c.id}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2"
            >
              <span className="text-[var(--accent)]">
                {c.intent ?? "unknown"}
              </span>{" "}
              — {c.rawInput}
            </li>
          ))}
          {summary.recentCommands.length === 0 ? (
            <li className="text-[var(--text-muted)]">No commands yet.</li>
          ) : null}
        </ul>
      </SurfaceCard>
    </div>
  );
}

function ApprovalSummaryList({
  title,
  count,
  items,
  href,
  variant,
  empty
}: {
  title: string;
  count: number;
  items: ApprovalRequest[];
  href: string;
  variant: "danger" | "warning" | "neutral";
  empty: string;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
          {title}
        </h3>
        <Badge variant={variant}>{count}</Badge>
      </div>
      <ul className="mt-3 space-y-2 text-xs text-[var(--text-secondary)]">
        {items.slice(0, 3).map((approval) => (
          <li key={approval.id}>
            <Link
              href={href}
              className="line-clamp-2 hover:text-[var(--text-primary)]"
            >
              {approval.title}
            </Link>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-[var(--text-muted)]">{empty}</li>
        ) : null}
        {items.length > 3 ? (
          <li className="text-[var(--text-muted)]">
            +{items.length - 3} more in the Approval Center
          </li>
        ) : null}
      </ul>
    </section>
  );
}
