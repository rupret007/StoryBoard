import { PageHeader } from "@storyboard/ui";
import { BookingClient } from "./booking-client";
import { serverApiFetch } from "@/lib/api-server";
import type {
  BookingOpportunity,
  DashboardInsights,
  Venue
} from "@/lib/types";

export default async function BookingPage() {
  let opportunities: BookingOpportunity[] = [];
  let venues: Venue[] = [];
  let opportunityRisks: Record<string, "low" | "med" | "high"> = {};
  try {
    [opportunities, venues] = await Promise.all([
      serverApiFetch<BookingOpportunity[]>("/booking-opportunities", {
        cache: "no-store"
      }),
      serverApiFetch<Venue[]>("/venues", { cache: "no-store" })
    ]);
    const insights = await serverApiFetch<DashboardInsights>(
      "/dashboard/insights",
      { cache: "no-store" }
    ).catch(() => null);
    if (insights) {
      opportunityRisks = Object.fromEntries(
        insights.opportunityRisks.map((r) => [r.opportunityId, r.level])
      );
    }
  } catch {
    // empty
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Booking pipeline"
        description="Stage opportunities from target to close — structured like a modern CRM board."
      />
      <BookingClient
        initialOpportunities={opportunities}
        venues={venues}
        opportunityRisks={opportunityRisks}
      />
    </div>
  );
}
