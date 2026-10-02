import { PageHeader } from "@storyboard/ui";
import { TasksClient } from "./tasks-client";
import { serverApiFetch } from "@/lib/api-server";
import type { BandMember, BookingOpportunity, Task } from "@/lib/types";

export default async function TasksPage() {
  let tasks: Task[] = [];
  let opportunities: BookingOpportunity[] = [];
  let members: BandMember[] = [];
  let loadError = "";
  let artistId: string | null = null;
  let currentOperatorId: string | null = null;
  let canManage = false;
  try {
    const me = await serverApiFetch<{ operator: { id: string }; currentArtistId: string | null; memberships: { artistId: string; role: string }[] }>("/auth/me", { cache: "no-store" });
    artistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId) ? me.currentArtistId : me.memberships[0]?.artistId ?? null;
    if (!artistId) throw new Error("Band access could not be verified");
    currentOperatorId = me.operator.id;
    const role = me.memberships.find((membership) => membership.artistId === artistId)?.role;
    canManage = role === "owner" || role === "member";
    [tasks, opportunities, members] = await Promise.all([
      serverApiFetch<Task[]>("/tasks", { cache: "no-store", artistId }),
      serverApiFetch<BookingOpportunity[]>("/booking-opportunities", {
        cache: "no-store", artistId
      }),
      serverApiFetch<BandMember[]>("/manager/members", { cache: "no-store", artistId })
    ]);
  } catch {
    loadError = "Tasks could not be loaded. Reload to see your commitments.";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tasks"
        description="Own, schedule, unblock, and close the band's commitments without silently losing the reason work slipped."
      />
      <TasksClient key={artistId ?? "unverified"} artistId={artistId} currentOperatorId={currentOperatorId} canManage={canManage && !loadError} initialTasks={tasks} opportunities={opportunities} members={members} loadError={loadError} />
    </div>
  );
}
