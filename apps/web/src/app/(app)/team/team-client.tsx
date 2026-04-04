"use client";

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
        ? `Invite email draft · ${new Date(inv.deliveredAt).toLocaleString()}`
        : "Gmail draft";
    case "mock":
      return "Mock email draft (no Gmail)";
    case "failed":
      return inv.deliveryLastError
        ? `Delivery failed · ${inv.deliveryLastError.slice(0, 80)}`
        : "Delivery failed";
    case "skipped":
      return "Skipped";
    default:
      return "Queued or pending delivery";
  }
}

const ROLES = ["owner", "member", "viewer"] as const;

export function TeamClient({
  artistId,
  isOwner,
  initialMembers,
  initialInvites,
  currentOperatorId
}: {
  artistId: string;
  isOwner: boolean;
  initialMembers: MemberRow[];
  initialInvites: InviteRow[];
  currentOperatorId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

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
      setInviteResult(
        `Invite created. Share this link: ${res.acceptUrl} (expires ${res.expiresAt})`
      );
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

  async function revokeInvite(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/memberships/invites/${id}/revoke`, {
        method: "POST",
        json: { artistId },
        artistId
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(operatorId: string, role: string) {
    setBusy(true);
    try {
      await apiFetch("/memberships", {
        method: "PATCH",
        json: { artistId, operatorId, role },
        artistId
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(operatorId: string) {
    if (!confirm("Remove this member from the artist?")) {
      return;
    }
    setBusy(true);
    try {
      const qs = new URLSearchParams({ artistId, operatorId });
      await apiFetch(`/memberships?${qs.toString()}`, {
        method: "DELETE",
        artistId
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Team
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Members, roles, and pending invitations for this artist.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      ) : null}
      {inviteResult ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-secondary)] break-all">
          {inviteResult}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Invite operator
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
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)]"
              placeholder="colleague@example.com"
            />
          </label>
          <label className="block text-xs text-[var(--text-muted)]">
            Role
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-40"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#05080d] disabled:opacity-50"
          >
            Invite
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Pending invitations
        </h2>
        {initialInvites.length === 0 ? (
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
                  onClick={() => void revokeInvite(inv.id)}
                  className="text-xs font-medium text-amber-200 hover:underline disabled:opacity-50"
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
        {initialMembers.length === 0 ? (
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
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            void changeRole(m.operatorId, e.target.value)
                          }
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1 text-xs capitalize text-[var(--text-primary)]"
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
                          onClick={() => void removeMember(m.operatorId)}
                          className="text-xs font-medium text-amber-200 hover:underline disabled:opacity-50"
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
    </div>
  );
}
