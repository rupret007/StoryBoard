import { ApiUnreachableCard } from "@/components/api-unreachable-card";
import { AppShell } from "@/components/app-shell";
import { OnboardingGate } from "@/components/onboarding-gate";
import { SignInGate } from "@/components/sign-in-gate";
import { serverApiFetch } from "@/lib/api-server";
import type { ApprovalLifecycleCounts, DashboardStats } from "@/lib/types";
import { classifyAppAuthLoadError } from "@storyboard/shared";
import type { ReactNode } from "react";

type AuthMeResponse = {
  operator: { id: string; email: string; name: string | null };
  memberships: {
    artistId: string;
    role: string;
    artistName: string;
    artistSlug: string;
  }[];
  currentArtistId: string | null;
};

export default async function AppLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  let me: AuthMeResponse | null = null;
  let needsSignIn = false;

  try {
    me = await serverApiFetch<AuthMeResponse>("/auth/me", {
      cache: "no-store"
    });
  } catch (e) {
    if (classifyAppAuthLoadError(e) === "sign_in") {
      needsSignIn = true;
    } else {
      return <ApiUnreachableCard />;
    }
  }

  if (needsSignIn || !me) {
    const showDev = process.env.AUTH_DEV_BYPASS === "true";
    return <SignInGate showDevLogin={showDev} />;
  }

  if (me.memberships.length === 0) {
    const showDev = process.env.AUTH_DEV_BYPASS === "true";
    return <OnboardingGate showDevHint={showDev} />;
  }

  const activeArtistId =
    me.currentArtistId &&
    me.memberships.some((m) => m.artistId === me.currentArtistId)
      ? me.currentArtistId
      : me.memberships[0]!.artistId;

  const currentRole = me.memberships.find(
    (m) => m.artistId === activeArtistId
  )?.role;
  const showTeamLink = currentRole === "owner";

  let approvalAttention: ApprovalLifecycleCounts | null = null;
  try {
    const stats = await serverApiFetch<DashboardStats>("/dashboard/stats", {
      cache: "no-store",
      artistId: activeArtistId
    });
    approvalAttention = stats.approvalAttention;
  } catch {
    approvalAttention = null;
  }

  const memberships = me.memberships.map((m) => ({
    artistId: m.artistId,
    artistName: m.artistName
  }));

  const shellCurrentArtistId =
    me.currentArtistId &&
    me.memberships.some((m) => m.artistId === me.currentArtistId)
      ? me.currentArtistId
      : activeArtistId;

  return (
    <AppShell
      key={activeArtistId}
      approvalAttention={approvalAttention}
      artistId={activeArtistId}
      {...(me.operator.email ? { operatorEmail: me.operator.email } : {})}
      memberships={memberships}
      currentArtistId={shellCurrentArtistId}
      showTeamLink={showTeamLink}
    >
      {children}
    </AppShell>
  );
}
