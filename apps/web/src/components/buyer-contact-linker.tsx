"use client";

import { Plus, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BookingProspect, Contact } from "@/lib/types";

type AttachResponse = { prospect: BookingProspect; created: boolean };

export function BuyerContactLinker({
  prospectId,
  contacts,
  onLinked
}: {
  prospectId: string;
  contacts: Contact[];
  onLinked: (contact: Contact) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(
    contacts.length ? "existing" : "new"
  );
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [form, setForm] = useState({ fullName: "", email: "", role: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<AttachResponse>(
        `/booking-prospects/${prospectId}/contact`,
        {
          method: "PUT",
          json:
            mode === "existing"
              ? { contactId }
              : {
                  contact: {
                    fullName: form.fullName,
                    email: form.email,
                    role: form.role || null
                  }
                }
        }
      );
      if (!result.prospect.contact) {
        throw new Error("The contact was not linked to this prospect.");
      }
      await onLinked(result.prospect.contact);
      setOpen(false);
      setForm({ fullName: "", email: "", role: "" });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not link the buyer."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="sb-btn-secondary py-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <UserRoundPlus className="h-4 w-4" />
        Add/link buyer
      </button>
    );
  }

  return (
    <form
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"
      onSubmit={(event) => void save(event)}
    >
      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className={mode === "existing" ? "sb-btn-secondary py-1.5" : "sb-btn-ghost py-1.5"}
          onClick={() => setMode("existing")}
          disabled={!contacts.length}
        >
          Existing contact
        </button>
        <button
          type="button"
          className={mode === "new" ? "sb-btn-secondary py-1.5" : "sb-btn-ghost py-1.5"}
          onClick={() => setMode("new")}
        >
          New buyer/promoter
        </button>
      </div>
      {mode === "existing" ? (
        <label className="mt-3 block">
          <span className="sb-label">Contact</span>
          <select
            required
            className="sb-select mt-1.5"
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
          >
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.fullName}{contact.email ? ` · ${contact.email}` : " · no email"}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="block"><span className="sb-label">Name</span><input required className="sb-input mt-1" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
          <label className="block"><span className="sb-label">Email</span><input required type="email" className="sb-input mt-1" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label className="block"><span className="sb-label">Role</span><input className="sb-input mt-1" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Talent buyer" /></label>
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--text-muted)]">An email makes a campaign recipient ready for review.</p>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-200">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button className="sb-btn-primary py-2 text-xs" disabled={busy || (mode === "existing" && !contactId)} type="submit"><Plus className="h-4 w-4" />Save buyer</button>
        <button className="sb-btn-ghost py-2 text-xs" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
