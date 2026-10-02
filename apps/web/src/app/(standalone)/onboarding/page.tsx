import { Suspense } from "react";
import { SignInGate } from "@/components/sign-in-gate";
import { ApiHttpError, serverApiFetch } from "@/lib/api-server";
import { InviteClient } from "./invite-client";

export default async function StandaloneOnboardingPage({ searchParams }: {
  searchParams: Promise<{ invite?: string; authError?: string }>;
}) {
  const params = await searchParams;
  const inviteToken = typeof params.invite === "string" && /^[A-Za-z0-9_-]{43}$/.test(params.invite) ? params.invite : undefined;
  let me: { operator: { email: string } };
  try {
    me = await serverApiFetch("/auth/me", { cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 401) {
      return <SignInGate showDevLogin={process.env.AUTH_DEV_BYPASS === "true"}
        {...(inviteToken ? { inviteToken } : {})} authError={Boolean(params.authError)} />;
    }
    return <main className="mx-auto max-w-md p-8"><h1>Unable to check your sign-in</h1>
      <p>Your invitation is still in this link. Try again when StoryBoard is reachable.</p>
      <a href={inviteToken ? `/onboarding?invite=${encodeURIComponent(inviteToken)}` : "/onboarding"}>Try again</a>
    </main>;
  }
  return <Suspense fallback={null}><InviteClient email={me.operator.email} /></Suspense>;
}
