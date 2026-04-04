import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandBar } from "@/components/command-bar";
import { IntegrationStatusStrip } from "@/components/integration-status-strip";
import { WorkflowNotificationsStrip } from "@/components/workflow-notifications-strip";

export function AppShell({
  children,
  pendingApprovals,
  artistId,
  operatorEmail,
  memberships,
  currentArtistId,
  showTeamLink
}: {
  children: ReactNode;
  pendingApprovals: number;
  artistId?: string;
  operatorEmail?: string;
  memberships?: { artistId: string; artistName: string }[];
  currentArtistId?: string | null;
  /** Owners see Team / membership admin */
  showTeamLink?: boolean;
}) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar
        pendingApprovals={pendingApprovals}
        {...(operatorEmail ? { operatorEmail } : {})}
        memberships={memberships ?? []}
        currentArtistId={currentArtistId ?? null}
        {...(showTeamLink ? { showTeamLink: true } : {})}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <main className="relative flex-1 px-6 py-8 md:px-10 lg:px-12">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <div className="sticky bottom-0 z-30 border-t border-[var(--border)] bg-[var(--canvas)]/90 px-6 py-4 backdrop-blur-lg md:px-10 lg:px-12">
          <div className="mx-auto flex max-w-6xl flex-col gap-3">
            {artistId ? <WorkflowNotificationsStrip artistId={artistId} /> : null}
            {artistId ? <IntegrationStatusStrip artistId={artistId} /> : null}
            <CommandBar {...(artistId ? { artistId } : {})} />
          </div>
        </div>
      </div>
    </div>
  );
}
