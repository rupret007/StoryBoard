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
  let artistId: string | null = null;
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  let loadError = "";
  try {
    const me = await serverApiFetch<{
      currentArtistId: string | null;
      memberships: { artistId: string; role: string }[];
    }>("/auth/me", { cache: "no-store" });
    artistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId)
      ? me.currentArtistId : me.memberships[0]?.artistId ?? null;
    const role = me.memberships.find((membership) => membership.artistId === artistId)?.role;
    accessState = role === "owner" || role === "member" ? "manage" : role === "viewer" ? "read_only" : "unavailable";
    if (!artistId) throw new Error("No band available");
    const readOptions = { artistId, cache: "no-store" as const };
    [opportunities, venues] = await Promise.all([
      serverApiFetch<BookingOpportunity[]>("/booking-opportunities", readOptions),
      serverApiFetch<Venue[]>("/venues", readOptions)
    ]);
    const insights = await serverApiFetch<DashboardInsights>("/dashboard/insights", readOptions).catch(() => null);
    if (insights) {
      opportunityRisks = Object.fromEntries(insights.opportunityRisks.map((r) => [r.opportunityId, r.level]));
    }
  } catch {
    loadError = "The pipeline could not be loaded. Reload to see your opportunities.";
    accessState = "unavailable";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Booking pipeline"
        description="Stage opportunities from target to close. Travis books; each card names the next recorded action. StoryBoard will not pitch."
      />
      <BookingClient
        key={artistId ?? "unavailable"}
        artistId={artistId}
        accessState={accessState}
        loadError={loadError}
        initialOpportunities={opportunities}
        venues={venues}
        opportunityRisks={opportunityRisks}
      />
    </div>
  );
}
