"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function OnboardingGate({ showDevHint }: { showDevHint: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "invite" | null>(null);

  async function onCreateArtist(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("create");
    try {
      await apiFetch("/onboarding/artist", {
        method: "POST",
        json: { name: name.trim() }
      });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create artist"
      );
    } finally {
      setBusy(null);
    }
  }

  async function onAcceptInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("invite");
    try {
      await apiFetch("/memberships/invites/accept", {
        method: "POST",
        json: { token: token.trim() }
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--canvas)] px-6 py-16">
      <div className="w-full max-w-lg space-y-10">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Welcome to StoryBoard
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Create an artist workspace or accept an invitation from a teammate.
          </p>
        </div>

        <form
          onSubmit={(e) => void onCreateArtist(e)}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            New artist
          </p>
          <label className="mt-3 block text-sm text-[var(--text-secondary)]">
            Artist name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[var(--text-primary)]"
              placeholder="e.g. North River Band"
              autoComplete="organization"
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null}
            className="mt-4 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#05080d] hover:opacity-95 disabled:opacity-50"
          >
            {busy === "create" ? "Creating…" : "Create workspace"}
          </button>
        </form>

        <form
          onSubmit={(e) => void onAcceptInvite(e)}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Have an invite?
          </p>
          <label className="mt-3 block text-sm text-[var(--text-secondary)]">
            Invite token
            <input
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
              placeholder="Paste the token from your invite link"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            disabled={busy !== null}
            className="mt-4 w-full rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {busy === "invite" ? "Accepting…" : "Accept invitation"}
          </button>
        </form>

        {error ? (
          <p className="text-center text-sm text-amber-200/90">{error}</p>
        ) : null}

        {showDevHint ? (
          <p className="text-center text-xs text-[var(--text-muted)]">
            Dev tip: you can still run{" "}
            <code className="rounded bg-[var(--surface-2)] px-1">
              pnpm db:seed
            </code>{" "}
            for a pre-linked operator.
          </p>
        ) : null}
      </div>
    </div>
  );
}
