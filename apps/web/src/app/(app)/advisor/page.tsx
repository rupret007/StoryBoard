import { PageHeader } from "@storyboard/ui";
import { serverApiFetch, serverBandAccess } from "@/lib/api-server";
import type { BookingAdvisorRun } from "@/lib/types";
import { BookingAdvisorClient } from "./booking-advisor-client";

export default async function AdvisorPage() {
  let latest: BookingAdvisorRun | null = null;
  let artistId: string | null = null;
  let canManage = false;
  let loadError = "";
  try {
    const access = await serverBandAccess();
    artistId = access.artistId;
    canManage = access.canManage;
    latest = await serverApiFetch<BookingAdvisorRun | null>("/booking-advisor/latest", { cache: "no-store", artistId });
  } catch {
    loadError = "Booking advisor could not be loaded. Reload to verify your band and try again.";
  }
  return (
    <div className="space-y-8">
      <PageHeader title="Booking advisor" description="Turn current booking outcomes and explicit feedback into reviewable next steps. It never sends or changes records on its own." />
      {loadError ? <p role="alert" className="text-sm text-rose-200">{loadError}</p> : (
        <BookingAdvisorClient key={artistId ?? "unverified"} artistId={artistId} canManage={canManage} initialRun={latest} />
      )}
    </div>
  );
}
