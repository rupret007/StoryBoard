import { PageHeader } from "@storyboard/ui";
import { serverApiFetch, serverBandAccess } from "@/lib/api-server";
import type { BookingReply, BookingReplySettings } from "@/lib/types";
import { BookingInboxClient } from "./booking-inbox-client";

const unavailable: BookingReplySettings = { syncEnabled: false, aiAnalysisEnabled: false, deploymentEnabled: false, scopeReady: false, reconnectRequired: false };

export default async function BookingInboxPage() {
  let replies: BookingReply[] = [];
  let settings = unavailable;
  let artistId: string | null = null;
  let canManage = false;
  let isOwner = false;
  let loadError = "";
  try {
    const access = await serverBandAccess();
    artistId = access.artistId;
    canManage = access.canManage;
    isOwner = access.isOwner;
    [replies, settings] = await Promise.all([
      serverApiFetch<BookingReply[]>("/booking-replies", { cache: "no-store", artistId }),
      serverApiFetch<BookingReplySettings>("/booking-replies/settings", { cache: "no-store", artistId })
    ]);
  } catch {
    loadError = "Booking inbox could not be loaded. Reload to verify your band and try again.";
  }
  return (
    <div className="space-y-8">
      <PageHeader title="Booking inbox" description="Review replies from pitch threads StoryBoard created, capture offer details, and prepare a human-approved response." />
      {loadError ? <p role="alert" className="text-sm text-rose-200">{loadError}</p> : (
        <BookingInboxClient key={artistId ?? "unverified"} artistId={artistId} canManage={canManage} isOwner={isOwner} initialReplies={replies} initialSettings={settings} />
      )}
    </div>
  );
}
