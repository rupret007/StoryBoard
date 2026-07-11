import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingAdvisorRun } from "@/lib/types";
import { BookingAdvisorClient } from "./booking-advisor-client";

export default async function AdvisorPage() {
  let latest: BookingAdvisorRun | null = null;
  try { latest = await serverApiFetch<BookingAdvisorRun | null>("/booking-advisor/latest", { cache: "no-store" }); } catch { /* usable initial state */ }
  return <div className="space-y-8"><PageHeader title="Booking advisor" description="Turn current booking outcomes and explicit feedback into reviewable next steps. It never sends or changes records on its own." /><BookingAdvisorClient initialRun={latest} /></div>;
}
