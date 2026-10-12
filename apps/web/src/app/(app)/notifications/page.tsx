import { NotificationsClient } from "@/app/(app)/notifications/notifications-client";
import { EmptyState, PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import { Bell } from "lucide-react";
import Link from "next/link";

type AuthMeResponse = {
  memberships: {
    artistId: string;
    role: string;
  }[];
  currentArtistId: string | null;
};

export default async function NotificationsPage() {
  let me: AuthMeResponse | null = null;
  try {
    me = await serverApiFetch<AuthMeResponse>("/auth/me", {
      cache: "no-store"
    });
  } catch {
    return (
      <div className="space-y-8">
        <PageHeader title="Notifications" description="Telegram and escalation settings for this band." />
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Notification settings could not verify your session. Refresh to try again.
        </p>
      </div>
    );
  }

  const activeArtistId =
    me.currentArtistId &&
    me.memberships.some((m) => m.artistId === me.currentArtistId)
      ? me.currentArtistId
      : me.memberships[0]?.artistId;

  if (!activeArtistId) {
    return (
      <div className="space-y-8">
        <PageHeader title="Notifications" description="Telegram and escalation settings for this band." />
        <EmptyState
          title="No band on this account"
          description="Create or join a band before changing notification settings. A blank page is not the same as empty settings."
          icon={<Bell className="h-6 w-6" />}
          action={<Link href="/" className="sb-btn-secondary">Back to StoryBoard</Link>}
        />
      </div>
    );
  }

  const role = me.memberships.find((m) => m.artistId === activeArtistId)?.role;
  const isOwner = role === "owner";

  return <NotificationsClient artistId={activeArtistId} isOwner={isOwner} />;
}
