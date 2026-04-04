import { PageHeader } from "@storyboard/ui";
import { TasksClient } from "./tasks-client";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingOpportunity, Task } from "@/lib/types";

export default async function TasksPage() {
  let tasks: Task[] = [];
  let opportunities: BookingOpportunity[] = [];
  try {
    [tasks, opportunities] = await Promise.all([
      serverApiFetch<Task[]>("/tasks", { cache: "no-store" }),
      serverApiFetch<BookingOpportunity[]>("/booking-opportunities", {
        cache: "no-store"
      })
    ]);
  } catch {
    // empty
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Tasks"
        description="Follow-ups tied to the pipeline — overdue highlights use due dates."
      />
      <TasksClient initialTasks={tasks} opportunities={opportunities} />
    </div>
  );
}
