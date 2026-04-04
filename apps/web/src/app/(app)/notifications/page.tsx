import { NotificationsClient } from "@/app/(app)/notifications/notifications-client";
import { serverApiFetch } from "@/lib/api-server";

type AuthMeResponse = {
  memberships: {
    artistId: string;
    role: string;
  }[];
  currentArtistId: string | null;
};

export default async function NotificationsPage() {
  const me = await serverApiFetch<AuthMeResponse>("/auth/me", {
    cache: "no-store"
  });

  const activeArtistId =
    me.currentArtistId &&
    me.memberships.some((m) => m.artistId === me.currentArtistId)
      ? me.currentArtistId
      : me.memberships[0]?.artistId;

  if (!activeArtistId) {
    return null;
  }

  const role = me.memberships.find((m) => m.artistId === activeArtistId)?.role;
  const isOwner = role === "owner";

  return <NotificationsClient artistId={activeArtistId} isOwner={isOwner} />;
}
