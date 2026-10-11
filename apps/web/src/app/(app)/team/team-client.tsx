"use client";

import { TEAM_INVITE_HEADING, TEAM_ROLE_HINTS } from "@storyboard/shared";
import { EmptyState } from "@storyboard/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

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

function deliveryLabel(inv: InviteRow): string {
  switch (inv.deliveryChannel) {
    case "gmail_draft":
      return inv.deliveredAt
        ? `Draft ready — not sent · ${new Date(inv.deliveredAt).toLocaleString()}`
        : "Draft only — not sent";
    case "mock":
      return "No email sent — share the invite link";
    case "failed":
      return inv.deliveryLastError
        ? `Delivery failed · ${inv.deliveryLastError.slice(0, 80)}`
        : "Delivery failed";
    case "skipped":
      return "Skipped";
    default:
      return "Preparing a draft — no email sent";
  }
}

const ROLES = ["owner", "member", "viewer"] as const;

export function TeamClient({
  artistId,
  isOwner,
  initialMembers,
  initialInvites,
  currentOperatorId,
  loadError = false
}: {
  artistId: string;
  isOwner: boolean;
  initialMembers: MemberRow[];
  initialInvites: InviteRow[];
  currentOperatorId: string;
  loadError?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [bandName, setBandName] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{ url: string; email: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    router.refresh();
  }

  if (!isOwner) {
    return (
      <EmptyState
        title="Owner only"
        description="Only artist owners can manage team members and invitations."
      />
    );
  }

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteResult(null);
    setBusy(true);
    try {
      const res = await apiFetch<{
        inviteId: string;
        token: string;
        acceptUrl: string;
        expiresAt: string;
      }>("/memberships/invites", {
        method: "POST",
        json: {
          artistId,
          email: email.trim(),
          role: inviteRole
        },
        artistId
      });
      setInviteResult({ url: res.acceptUrl, email: email.trim(), expires: res.expiresAt });
      setCopied(false);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create invitation"
      );
    } finally {
      setBusy(false);
    }
  }

  async function createBand(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/onboarding/additional-artist", {
        method: "POST", artistId, json: { name: bandName.trim(), sourceArtistId: artistId }
      });
      setBandName("");
      router.refresh();
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "Could not confirm the new workspace"}. Check the band selector before trying again.`);
    } finally { setBusy(false); }
  }

  async function revokeInvite(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/memberships/invites/${id}/revoke`, {
        method: "POST",
        json: { artistId },
        artistId
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Change could not be confirmed. Refresh and check before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(operatorId: string, role: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/memberships", {
        method: "PATCH",
        json: { artistId, operatorId, role },
        artistId
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Change could not be confirmed. Refresh and check before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(operatorId: string) {
    if (!confirm("Remove this member from the artist?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ artistId, operatorId });
      await apiFetch(`/memberships?${qs.toString()}`, {
        method: "DELETE",
        artistId
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Change could not be confirmed. Refresh and check before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {TEAM_INVITE_HEADING}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Manage access to this band. Invitations need to be shared or sent manually.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      ) : null}
      {loadError ? <div role="alert" className="rounded border border-amber-500/30 p-4">
        <p>Some team information could not be loaded. Existing members or invites may be missing.</p>
        <button type="button" onClick={() => router.refresh()} className="mt-2 underline">Retry team</button>
      </div> : null}
      {inviteResult ? (
        <div role="status" className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm">
          <p>No email has been sent. Share this link with {inviteResult.email}.</p>
          <input aria-label="Invitation link" readOnly value={inviteResult.url} onFocus={(e) => e.target.select()}
            className="w-full rounded bg-[var(--surface-0)] p-2 text-xs" />
          <button type="button" className="min-h-11 underline" onClick={() => {
            void navigator.clipboard.writeText(inviteResult.url).then(() => setCopied(true)).catch(() => setError("Select the invitation link and copy it manually."));
          }}>{copied ? "Link copied" : "Copy invitation link"}</button>
          <p className="text-xs">Expires {new Date(inviteResult.expires).toLocaleDateString()}. Keep this link until your bandmate joins.</p>
        </div>
      ) : null}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {TEAM_INVITE_HEADING}
        </h2>
        <form
          onSubmit={(e) => void onInvite(e)}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <label className="block flex-1 text-xs text-[var(--text-muted)]">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="colleague@example.com"
            />
          </label>
          <label className="block text-xs text-[var(--text-muted)]">
            Role
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-40"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {TEAM_ROLE_HINTS[r].label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#05080d] disabled:opacity-50"
          >
            Invite
          </button>
        </form>
        <ul className="mt-4 space-y-1 text-xs text-[var(--text-muted)]">
          {ROLES.map((role) => (
            <li key={role}>
              <span className="font-semibold text-[var(--text-secondary)]">{TEAM_ROLE_HINTS[role].label}.</span>{" "}
              {TEAM_ROLE_HINTS[role].hint}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Pending invitations
        </h2>
        {initialInvites.length === 0 && !loadError ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            No pending invites.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
            {initialInvites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--text-primary)]">
                    {inv.email}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {inv.role} · expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {deliveryLabel(inv)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Revoke invitation for ${inv.email}`}
                  onClick={() => void revokeInvite(inv.id)}
                  className="min-h-11 px-2 text-xs font-medium text-amber-200 hover:underline disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Members
        </h2>
        {initialMembers.length === 0 && !loadError ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            No members yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)]">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Operator</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {initialMembers.map((m) => (
                  <tr key={m.id} className="text-[var(--text-secondary)]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text-primary)]">
                        {m.operator.email}
                      </p>
                      {m.operator.name ? (
                        <p className="text-xs text-[var(--text-muted)]">
                          {m.operator.name}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {m.operatorId === currentOperatorId ? (
                        <span className="capitalize">{m.role}</span>
                      ) : (
                        <select
                          aria-label={`Role for ${m.operator.email}`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            void changeRole(m.operatorId, e.target.value)
                          }
                          className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1 text-xs capitalize text-[var(--text-primary)]"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.operatorId !== currentOperatorId ? (
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={`Remove ${m.operator.email}`}
                          onClick={() => void removeMember(m.operatorId)}
                          className="min-h-11 px-2 text-xs font-medium text-amber-200 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">
                          You
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-2xl border border-[var(--border)] p-6">
        <h2 className="text-sm font-semibold">Manage another band</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Create a separate workspace. Members, songs, shows, and tasks are not copied.</p>
        <form onSubmit={(e) => void createBand(e)} className="mt-4 space-y-3">
          <label className="block text-sm">New band name
            <input required value={bandName} onChange={(e) => setBandName(e.target.value)}
              className="mt-1 block w-full rounded border border-[var(--border)] bg-[var(--surface-0)] p-2" />
          </label>
          <button type="submit" disabled={busy || !bandName.trim()} className="rounded bg-[var(--accent)] px-4 py-2 text-[#05080d] disabled:opacity-50">Create separate band</button>
        </form>
      </section>
    </div>
  );
}
