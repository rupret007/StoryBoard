import { TeamClient } from "@/app/(app)/team/team-client";
import { EmptyState, PageHeader } from "@storyboard/ui";
import { ApiHttpError, serverApiFetch } from "@/lib/api-server";
import { UsersRound } from "lucide-react";
import Link from "next/link";

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
  let me: AuthMeResponse | null = null;
  try {
    me = await serverApiFetch<AuthMeResponse>("/auth/me", {
      cache: "no-store"
    });
  } catch {
    return (
      <div className="space-y-8">
        <PageHeader title="Team" description="Invite members and keep roles explicit." />
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Team could not verify your session. Refresh to try again.
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
        <PageHeader title="Team" description="Invite members and keep roles explicit." />
        <EmptyState
          title="No band on this account"
          description="Create or join a band before inviting members. A blank Team page is not the same as an empty roster."
          icon={<UsersRound className="h-6 w-6" />}
          action={<Link href="/" className="sb-btn-secondary">Back to StoryBoard</Link>}
        />
      </div>
    );
  }

  const currentRole = me.memberships.find(
    (m) => m.artistId === activeArtistId
  )?.role;
  const isOwner = currentRole === "owner";

  let loadError = false;
  let members: MemberRow[] = [];
  let invites: InviteRow[] = [];

  if (isOwner) {
    try {
      members = await serverApiFetch<MemberRow[]>(
        `/memberships?artistId=${encodeURIComponent(activeArtistId)}`,
        { cache: "no-store", artistId: activeArtistId }
      );
    } catch (e) {
      loadError = true;
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
      loadError = true;
      if (!(e instanceof ApiHttpError)) {
        throw e;
      }
    }
  }

  return (
    <TeamClient
      key={activeArtistId}
      artistId={activeArtistId}
      isOwner={isOwner}
      loadError={loadError}
      initialMembers={members}
      initialInvites={invites}
      currentOperatorId={me.operator.id}
    />
  );
}
