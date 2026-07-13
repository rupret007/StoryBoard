import { publicApiBaseUrl } from "@/lib/api";

export function SignInGate({ showDevLogin }: { showDevLogin: boolean }) {
  const api = publicApiBaseUrl();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--canvas)] px-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] px-8 py-10 shadow-lg">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          Sign in to StoryBoard
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Your session is managed by the StoryBoard API. Sign in to access
          artists you belong to.
        </p>
        <a
          href={`${api}/auth/operator/google/start`}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#05080d] hover:opacity-95"
        >
          Continue with Google
        </a>
        {showDevLogin ? (
          <a
            href={`${api}/auth/dev/login`}
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
          >
            Dev login (local only)
          </a>
        ) : null}
        <p className="mt-4 text-xs text-[var(--text-muted)]">
          New operators can create an artist or accept an invite after sign-in.
          For local convenience you may still run
          <code className="mx-1 rounded bg-[var(--surface-2)] px-1">
            pnpm db:seed
          </code>
          .
        </p>
      </div>
    </div>
  );
}
