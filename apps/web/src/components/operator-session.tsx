"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function OperatorSession({
  email,
  memberships,
  currentArtistId
}: {
  email: string;
  memberships: { artistId: string; artistName: string }[];
  currentArtistId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      setBusy(false);
      router.refresh();
      window.location.href = "/";
    }
  }

  async function switchArtist(artistId: string) {
    if (artistId === currentArtistId) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/auth/session/artist", {
        method: "POST",
        json: { artistId }
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-[var(--border)] px-4 py-3">
      <p className="truncate text-xs text-[var(--text-muted)]" title={email}>
        {email}
      </p>
      {memberships.length > 1 ? (
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Artist
          <select
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
            value={currentArtistId ?? memberships[0]?.artistId ?? ""}
            disabled={busy}
            onChange={(e) => void switchArtist(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.artistId} value={m.artistId}>
                {m.artistName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void logout()}
        className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  );
}
