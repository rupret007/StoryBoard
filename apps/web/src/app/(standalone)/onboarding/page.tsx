"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiFetch } from "@/lib/api";

function OnboardingInviteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("invite")?.trim() ?? "";
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/memberships/invites/accept", {
        method: "POST",
        json: { token: token.trim() }
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not accept invitation"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-lg font-semibold text-[var(--text-primary)]">
        Accept invitation
      </h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Use the token from your invite link. You must be signed in with the
        same email the invitation was sent to.
      </p>
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mt-8 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6"
      >
        <label className="block text-sm text-[var(--text-secondary)]">
          Token
          <input
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#05080d] disabled:opacity-50"
        >
          {busy ? "Joining…" : "Join artist"}
        </button>
        {error ? (
          <p className="text-sm text-amber-200/90">{error}</p>
        ) : null}
      </form>
      <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
        <Link href="/" className="text-[var(--accent)] hover:underline">
          Back to StoryBoard
        </Link>
      </p>
    </div>
  );
}

export default function StandaloneOnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingInviteInner />
    </Suspense>
  );
}
