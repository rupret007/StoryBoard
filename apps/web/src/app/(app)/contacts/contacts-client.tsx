"use client";

import { EmptyState, SurfaceCard } from "@storyboard/ui";
import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Contact, Venue } from "@/lib/types";

const KINDS = ["general", "promoter", "venue_staff"] as const;

export function ContactsClient({
  initialContacts,
  venues
}: {
  initialContacts: Contact[];
  venues: Venue[];
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [contactKind, setContactKind] =
    useState<(typeof KINDS)[number]>("general");
  const [email, setEmail] = useState("");
  const [venueId, setVenueId] = useState("");
  const [busy, setBusy] = useState(false);

  async function createContact(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/contacts", {
        method: "POST",
        json: {
          fullName: fullName.trim(),
          contactKind,
          email: email.trim() || undefined,
          venueId: venueId || undefined
        }
      });
      setFullName("");
      setEmail("");
      setVenueId("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <SurfaceCard>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Add contact
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Promoters, venue staff, or general — link to a venue when it helps
          outreach.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(ev) => void createContact(ev)}
        >
          <label className="sm:col-span-2">
            <span className="sb-label">Full name</span>
            <input
              required
              className="sb-input mt-1.5"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label>
            <span className="sb-label">Kind</span>
            <select
              className="sb-select mt-1.5"
              value={contactKind}
              onChange={(e) =>
                setContactKind(e.target.value as (typeof KINDS)[number])
              }
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sb-label">Email</span>
            <input
              type="email"
              className="sb-input mt-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="sb-label">Venue</span>
            <select
              className="sb-select mt-1.5"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
            >
              <option value="">None</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.city})
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end sm:col-span-2">
            <button type="submit" disabled={busy} className="sb-btn-primary">
              Create contact
            </button>
          </div>
        </form>
      </SurfaceCard>

      {initialContacts.length === 0 ? (
        <EmptyState
          title="No contacts"
          description="Build your promoter and venue rolodex — linked venues help command-driven outreach."
          icon={<Users className="h-6 w-6" />}
        />
      ) : (
        <SurfaceCard padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Venue</th>
                </tr>
              </thead>
              <tbody>
                {initialContacts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--surface-0)]/80"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                      {c.fullName}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {c.contactKind}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {c.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {c.venue ? c.venue.name : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
