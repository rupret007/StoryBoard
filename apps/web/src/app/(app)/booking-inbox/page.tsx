import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingReply, BookingReplySettings } from "@/lib/types";
import { BookingInboxClient } from "./booking-inbox-client";

const unavailable: BookingReplySettings = { syncEnabled: false, aiAnalysisEnabled: false, deploymentEnabled: false, scopeReady: false, reconnectRequired: false };

export default async function BookingInboxPage() {
  let replies: BookingReply[] = [];
  let settings = unavailable;
  try { [replies, settings] = await Promise.all([serverApiFetch<BookingReply[]>("/booking-replies", { cache: "no-store" }), serverApiFetch<BookingReplySettings>("/booking-replies/settings", { cache: "no-store" })]); } catch { /* render unavailable state */ }
  return <div className="space-y-8"><PageHeader title="Booking inbox" description="Review replies from pitch threads StoryBoard created, capture offer details, and prepare a human-approved response." /><BookingInboxClient initialReplies={replies} initialSettings={settings} /></div>;
}
