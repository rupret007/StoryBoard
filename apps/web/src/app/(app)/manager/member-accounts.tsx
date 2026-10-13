"use client";

import { SurfaceCard } from "@storyboard/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BandMember } from "@/lib/types";

export type MemberAccount = { operatorId: string; role: string; operator: { name: string | null; email: string } };

export function MemberAccounts({ artistId, members, accounts, loadError }: { artistId: string; members: BandMember[]; accounts: MemberAccount[]; loadError: boolean }) {
  const router = useRouter();
  return <SurfaceCard>
    <h2 id="member-accounts" className="font-semibold">Member accounts</h2>
    <p className="mt-2 text-sm text-[var(--text-muted)]">Link each performer to their accepted account so they can find My tasks and their availability. This does not invite anyone or change access.</p>
    {loadError ? <p role="alert" className="mt-3 text-sm">Member accounts could not be loaded. <button type="button" className="sb-btn-secondary" onClick={() => router.refresh()}>Reload accounts</button></p> : <>
      {!members.length ? <p className="mt-3 text-sm">Add the working lineup in Band context first.</p> : null}
      <div className="mt-4 space-y-3">{members.map((member) => <MemberAccountRow key={`${artistId}:${member.id}:${member.linkedOperatorId ?? "none"}`} artistId={artistId} member={member} members={members} accounts={accounts} onSaved={() => router.refresh()} />)}</div>
      <a href="/team" className="mt-4 inline-block text-sm text-[var(--accent)]">Open Team to invite bandmates</a>
    </>}
  </SurfaceCard>;
}

function MemberAccountRow({ artistId, member, members, accounts, onSaved }: { artistId: string; member: BandMember; members: BandMember[]; accounts: MemberAccount[]; onSaved: () => void }) {
  const [selected, setSelected] = useState(member.linkedOperatorId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const changed = selected !== (member.linkedOperatorId ?? "");
  const linkedAccount = accounts.find((account) => account.operatorId === member.linkedOperatorId);
  async function save() {
    setBusy(true); setError(""); setSaved(false);
    try {
      await apiFetch(`/manager/members/${member.id}`, { method: "PATCH", artistId, json: { linkedOperatorId: selected || null } });
      setSaved(true); onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save account link"); }
    finally { setBusy(false); }
  }
  return <div className="rounded-lg border border-[var(--border)] p-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1"><span className="sb-label">Account for {member.name}{member.active ? "" : " (inactive)"}</span>
        <select className="sb-select mt-1 w-full" value={selected} disabled={busy} onChange={(event) => { setSelected(event.target.value); setSaved(false); }}>
          <option value="">No account linked</option>
          {member.linkedOperatorId && !linkedAccount ? <option value={member.linkedOperatorId} disabled>Linked account no longer belongs to this band</option> : null}
          {accounts.map((account) => {
            const elsewhere = members.find((other) => other.id !== member.id && other.linkedOperatorId === account.operatorId);
            return <option key={account.operatorId} value={account.operatorId} disabled={Boolean(elsewhere) || account.role === "viewer"}>{account.operator.name || account.operator.email} · {account.operator.email}{elsewhere ? ` (linked to ${elsewhere.name})` : account.role === "viewer" ? " (read-only account)" : ""}</option>;
          })}
        </select>
      </label>
      <button type="button" className="sb-btn-secondary" disabled={busy || !changed} onClick={() => void save()}>Save account for {member.name}</button>
    </div>
    {error ? <p className="mt-2 text-sm text-red-300" role="alert">{error}</p> : null}
    {saved ? <p className="mt-2 text-sm" role="status">Account link saved.</p> : null}
  </div>;
}
