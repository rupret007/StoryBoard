import { PageHeader } from "@storyboard/ui";
import { TasksClient } from "./tasks-client";
import { serverApiFetch } from "@/lib/api-server";
import type { BandMember, BookingOpportunity, Task } from "@/lib/types";

export default async function TasksPage() {
  let tasks: Task[] = [];
  let opportunities: BookingOpportunity[] = [];
  let members: BandMember[] = [];
  try {
    [tasks, opportunities, members] = await Promise.all([
      serverApiFetch<Task[]>("/tasks", { cache: "no-store" }),
      serverApiFetch<BookingOpportunity[]>("/booking-opportunities", {
        cache: "no-store"
      }),
      serverApiFetch<BandMember[]>("/manager/members", { cache: "no-store" })
    ]);
  } catch {
    // empty
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tasks"
        description="Own, schedule, unblock, and close the band's commitments without silently losing the reason work slipped."
      />
      <TasksClient initialTasks={tasks} opportunities={opportunities} members={members} />
    </div>
  );
}
