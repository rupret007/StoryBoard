import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { EventDayOfResponse } from "@/lib/types";
import { DayOfClient } from "./day-of-client";

export default async function EventDayOfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await serverApiFetch<EventDayOfResponse>(`/events/${encodeURIComponent(id)}/day-of`, { cache: "no-store" });
  return <div className="space-y-6">
    <PageHeader title={data.event.title} description="The live show plan: what matters now, what happens next, and what still needs attention." />
    <DayOfClient initialData={data} />
  </div>;
}
