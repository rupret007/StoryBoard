import { publicApiBaseUrl } from "@/lib/api";

export function SignInGate({ showDevLogin, inviteToken, authError }: { showDevLogin: boolean; inviteToken?: string; authError?: boolean }) {
  const api = publicApiBaseUrl();
  const inviteQuery = inviteToken ? `?invite=${encodeURIComponent(inviteToken)}` : "";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--canvas)] px-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-8 py-10 shadow-lg">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          Sign in to StoryBoard
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {inviteToken ? "Sign in with the email on your invitation. You will return here to join the band." : "Sign in to see your bands, upcoming shows, and assigned work."}
        </p>
        {authError ? <p role="alert" className="mt-4 text-sm text-amber-200">Sign-in did not finish. Try again with the email on your invitation.</p> : null}
        <a
          href={`${api}/auth/operator/google/start${inviteQuery}`}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#05080d] hover:opacity-95"
        >
          Continue with Google
        </a>
        {showDevLogin ? (
          <a
            href={`${api}/auth/dev/login${inviteQuery}`}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
          >
            Dev login (local only)
          </a>
        ) : null}
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          New here? You can accept an invitation or create your band after sign-in.
        </p>
      </div>
    </div>
  );
}
