import { TeamClient } from "@/app/(app)/team/team-client";
import { ApiHttpError, serverApiFetch } from "@/lib/api-server";

type AuthMeResponse = {
  operator: { id: string; email: string; name: string | null };
  memberships: {
    artistId: string;
    role: string;
    artistName: string;
  }[];
  currentArtistId: string | null;
};

type MemberRow = {
  id: string;
  operatorId: string;
  artistId: string;
  role: string;
  operator: { id: string; email: string; name: string | null };
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  deliveredAt: string | null;
  deliveryChannel: string;
  deliveryLastError: string | null;
};

export default async function TeamPage() {
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

  const currentRole = me.memberships.find(
    (m) => m.artistId === activeArtistId
  )?.role;
  const isOwner = currentRole === "owner";

  let members: MemberRow[] = [];
  let invites: InviteRow[] = [];

  if (isOwner) {
    try {
      members = await serverApiFetch<MemberRow[]>(
        `/memberships?artistId=${encodeURIComponent(activeArtistId)}`,
        { cache: "no-store", artistId: activeArtistId }
      );
    } catch (e) {
      if (!(e instanceof ApiHttpError)) {
        throw e;
      }
    }
    try {
      invites = await serverApiFetch<InviteRow[]>(
        `/memberships/invites?artistId=${encodeURIComponent(activeArtistId)}`,
        { cache: "no-store", artistId: activeArtistId }
      );
    } catch (e) {
      if (!(e instanceof ApiHttpError)) {
        throw e;
      }
    }
  }

  return (
    <TeamClient
      artistId={activeArtistId}
      isOwner={isOwner}
      initialMembers={members}
      initialInvites={invites}
      currentOperatorId={me.operator.id}
    />
  );
}
