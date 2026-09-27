import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BookingReply, BookingReplySettings } from "@/lib/types";
import { BookingInboxClient } from "./booking-inbox-client";

const unavailable: BookingReplySettings = {
  syncEnabled: false,
  aiAnalysisEnabled: false,
  deploymentEnabled: false,
  scopeReady: false,
  reconnectRequired: false
};

export default async function BookingInboxPage() {
  let replies: BookingReply[] = [];
  let settings = unavailable;
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  let loadError = "";
  const [repliesResult, settingsResult, meResult] = await Promise.allSettled([
    serverApiFetch<BookingReply[]>("/booking-replies", { cache: "no-store" }),
    serverApiFetch<BookingReplySettings>("/booking-replies/settings", { cache: "no-store" }),
    serverApiFetch<{
      currentArtistId: string | null;
      memberships: { artistId: string; role: string }[];
    }>("/auth/me", { cache: "no-store" })
  ]);
  if (repliesResult.status === "fulfilled") replies = repliesResult.value;
  if (settingsResult.status === "fulfilled") settings = settingsResult.value;
  if (meResult.status === "fulfilled") {
    const me = meResult.value;
    const artistId =
      me.currentArtistId &&
      me.memberships.some((membership) => membership.artistId === me.currentArtistId)
        ? me.currentArtistId
        : me.memberships[0]?.artistId ?? null;
    const role = me.memberships.find((membership) => membership.artistId === artistId)?.role;
    accessState =
      role === "owner" || role === "member"
        ? "manage"
        : role === "viewer"
          ? "read_only"
          : "unavailable";
  }
  if ([repliesResult, settingsResult, meResult].some((result) => result.status === "rejected")) {
    loadError = "The booking inbox could not be loaded. Reload before reviewing replies or changing sync settings.";
    accessState = "unavailable";
  }
  return (
    <div className="space-y-8">
      <PageHeader
        title="Booking inbox"
        description="Review replies from pitch threads StoryBoard created, capture offer details, and prepare a human-approved response."
      />
      <BookingInboxClient
        initialReplies={replies}
        initialSettings={settings}
        accessState={accessState}
        loadError={loadError}
      />
    </div>
  );
}
