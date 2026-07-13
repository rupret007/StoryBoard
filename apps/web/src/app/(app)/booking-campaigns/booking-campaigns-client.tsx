"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { CheckCircle2, MailCheck, Plus, Send, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { BuyerContactLinker } from "@/components/buyer-contact-linker";
import type {
  BookingCampaign,
  BookingMarketSprint,
  BookingCampaignRecipient,
  BookingProspect,
  Contact
} from "@/lib/types";

type Preview = {
  recipientId: string;
  to: string;
  subject: string;
  body: string;
  followUpDueAt: string;
};

type PreparedCampaign = {
  approval: { actionType: string };
  previews: Preview[];
};

const defaultSubject = "Booking inquiry — {{artistName}}";
const defaultBody = `Hi {{contactName}},

{{bookingPitch}}

We'd love to talk about {{prospectName}} in {{market}}.
{{pressKitUrl}}

Thanks,
{{artistName}}`;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function BookingCampaignsClient({
  initialCampaigns,
  qualifiedProspects,
  contacts,
  sprints
}: {
  initialCampaigns: BookingCampaign[];
  qualifiedProspects: BookingProspect[];
  contacts: Contact[];
  sprints: BookingMarketSprint[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    subjectTemplate: defaultSubject,
    bodyTemplate: defaultBody,
    defaultFollowUpDays: "7",
    deliveryMode: "draft_only" as "draft_only" | "send_on_execution",
    marketSprintId: ""
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [previewDeliveryMode, setPreviewDeliveryMode] = useState<"draft_only" | "send_on_execution">("draft_only");

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError(null);
    try {
      await apiFetch("/booking-campaigns", {
        method: "POST",
        json: {
          name: form.name,
          subjectTemplate: form.subjectTemplate,
          bodyTemplate: form.bodyTemplate,
          defaultFollowUpDays: Number(form.defaultFollowUpDays),
          deliveryMode: form.deliveryMode,
          marketSprintId: form.marketSprintId || null
        }
      });
      setForm({ ...form, name: "" });
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function addRecipient(campaignId: string, prospectId: string) {
    setBusy(`add-${campaignId}`);
    setError(null);
    try {
      await apiFetch(`/booking-campaigns/${campaignId}/recipients`, {
        method: "POST",
        json: { prospectId }
      });
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function prepare(campaignId: string) {
    setBusy(`prepare-${campaignId}`);
    setError(null);
    try {
      const result = await apiFetch<PreparedCampaign>(
        `/booking-campaigns/${campaignId}/prepare-approval`,
        { method: "POST", json: {} }
      );
      setPreviews(result.previews);
      setPreviewDeliveryMode(result.approval.actionType === "outbound_email_send_batch" ? "send_on_execution" : "draft_only");
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  async function updateRecipient(
    campaignId: string,
    recipientId: string,
    json: Record<string, unknown>
  ) {
    setBusy(`recipient-${recipientId}`);
    setError(null);
    try {
      await apiFetch(`/booking-campaigns/${campaignId}/recipients/${recipientId}`, {
        method: "PATCH",
        json
      });
      router.refresh();
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
      <SurfaceCard>
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">New draft campaign</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Available variables: artistName, contactName, prospectName, market, bookingPitch, and pressKitUrl.</p>
        </div>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void create(event)}>
          <label className="block"><span className="sb-label">Campaign name</span><input required className="sb-input mt-1.5" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Fall rooms — Chicago" /></label>
          <div className="grid gap-3 md:grid-cols-[1fr_160px]"><label className="block"><span className="sb-label">Subject template</span><input required className="sb-input mt-1.5" value={form.subjectTemplate} onChange={(event) => setForm({ ...form, subjectTemplate: event.target.value })} /></label><label className="block"><span className="sb-label">Follow-up days</span><input required min="1" max="90" type="number" className="sb-input mt-1.5" value={form.defaultFollowUpDays} onChange={(event) => setForm({ ...form, defaultFollowUpDays: event.target.value })} /></label></div>
          <label className="block"><span className="sb-label">Delivery after approval</span><select className="sb-select mt-1.5" value={form.deliveryMode} onChange={(event) => setForm({ ...form, deliveryMode: event.target.value as typeof form.deliveryMode })}><option value="draft_only">Create Gmail drafts only (recommended)</option><option value="send_on_execution">Send immediately when an approved batch is executed</option></select><span className="mt-1 block text-xs text-[var(--text-muted)]">Drafts are the safe default. Both modes require approval and a separate Execute action.</span></label>
          <label className="block"><span className="sb-label">Market sprint</span><select className="sb-select mt-1.5" value={form.marketSprintId} onChange={(event) => setForm({ ...form, marketSprintId: event.target.value })}><option value="">Unassigned</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name}</option>)}</select></label>
          <label className="block"><span className="sb-label">Email template</span><textarea required className="sb-input mt-1.5 min-h-48 font-mono text-sm" value={form.bodyTemplate} onChange={(event) => setForm({ ...form, bodyTemplate: event.target.value })} /></label>
          <div><button className="sb-btn-primary" disabled={busy === "create"} type="submit"><Plus className="h-4 w-4" />Create campaign</button></div>
        </form>
      </SurfaceCard>

      {previews.length > 0 ? <SurfaceCard><div className="flex items-center gap-2"><MailCheck className="h-4 w-4 text-[var(--accent)]" /><h2 className="text-sm font-semibold text-[var(--text-primary)]">Personalized email preview</h2></div><p className="mt-1 text-xs text-[var(--text-muted)]">{previewDeliveryMode === "send_on_execution" ? "These messages are pending approval. They send only after a person approves the batch and separately chooses Execute." : "These messages are pending approval. Execution creates Gmail drafts only; it never sends them."}</p><div className="mt-4 space-y-3">{previews.map((preview) => <div key={preview.recipientId} className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-3"><p className="text-xs text-[var(--text-muted)]">To: {preview.to}</p><p className="mt-1 font-medium text-[var(--text-primary)]">{preview.subject}</p><pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-[var(--text-secondary)]">{preview.body}</pre><p className="mt-2 text-xs text-[var(--text-muted)]">Follow up: {new Date(preview.followUpDueAt).toLocaleDateString()}</p></div>)}</div><a className="sb-btn-secondary mt-4" href="/approvals"><CheckCircle2 className="h-4 w-4" />Open approval center</a></SurfaceCard> : null}

      {initialCampaigns.length === 0 ? <EmptyState title="No pitch campaigns yet" description="Complete your quick booking profile, qualify a prospect, then create a carefully reviewed batch of Gmail drafts." icon={<Send className="h-6 w-6" />} /> : <div className="space-y-5">{initialCampaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} qualifiedProspects={qualifiedProspects} contacts={contacts} busy={busy} onAdd={addRecipient} onPrepare={prepare} onUpdateRecipient={updateRecipient} />)}</div>}
    </div>
  );
}

function CampaignCard({ campaign, qualifiedProspects, contacts, busy, onAdd, onPrepare, onUpdateRecipient }: { campaign: BookingCampaign; qualifiedProspects: BookingProspect[]; contacts: Contact[]; busy: string | null; onAdd: (campaignId: string, prospectId: string) => Promise<void>; onPrepare: (campaignId: string) => Promise<void>; onUpdateRecipient: (campaignId: string, recipientId: string, json: Record<string, unknown>) => Promise<void> }) {
  const [prospectId, setProspectId] = useState("");
  const available = qualifiedProspects.filter((prospect) => !campaign.recipients.some((recipient) => recipient.prospect.id === prospect.id));
  const canPrepare = campaign.status === "draft" && campaign.recipients.some((recipient) => recipient.status === "ready");
  return <SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-base font-semibold text-[var(--text-primary)]">{campaign.name}</h2><Badge variant={campaign.status === "draft" ? "accent" : campaign.status === "active" ? "warning" : "neutral"}>{campaign.status}</Badge></div><p className="mt-1 text-xs text-[var(--text-muted)]">{campaign.recipients.length} recipient(s) · {campaign.deliveryMode === "send_on_execution" ? "send after approval + execution" : "create drafts after approval + execution"} · follow up after {campaign.defaultFollowUpDays} days</p></div>{canPrepare ? <button aria-label={`Preview campaign ${campaign.name}`} type="button" className="sb-btn-primary" disabled={busy === `prepare-${campaign.id}`} onClick={() => void onPrepare(campaign.id)}><MailCheck className="h-4 w-4" />Preview & request approval</button> : campaign.approvalRequestId ? <a className="sb-btn-secondary" href="/approvals">View approval</a> : null}</div>{campaign.status === "draft" && available.length > 0 ? <div className="mt-4 flex flex-col gap-2 sm:flex-row"><select aria-label={`Prospect for ${campaign.name}`} className="sb-select flex-1" value={prospectId} onChange={(event) => setProspectId(event.target.value)}><option value="">Add a qualified prospect</option>{available.map((prospect) => <option key={prospect.id} value={prospect.id}>{prospect.name} · {prospect.city}</option>)}</select><button aria-label={`Add recipient to ${campaign.name}`} type="button" className="sb-btn-secondary" disabled={!prospectId || busy === `add-${campaign.id}`} onClick={() => { void onAdd(campaign.id, prospectId); setProspectId(""); }}><UserRoundPlus className="h-4 w-4" />Add recipient</button></div> : null}<div className="mt-4 space-y-2">{campaign.recipients.map((recipient) => <RecipientRow key={recipient.id} campaign={campaign} recipient={recipient} contacts={contacts} busy={busy} onUpdate={onUpdateRecipient} />)}{campaign.recipients.length === 0 ? <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--text-muted)]">Add a qualified prospect. Recipients without an email stay in “needs contact” until a buyer or promoter is linked.</p> : null}</div></SurfaceCard>;
}

function RecipientRow({ campaign, recipient, contacts, busy, onUpdate }: { campaign: BookingCampaign; recipient: BookingCampaignRecipient; contacts: Contact[]; busy: string | null; onUpdate: (campaignId: string, recipientId: string, json: Record<string, unknown>) => Promise<void> }) {
  const [date, setDate] = useState(recipient.followUpDueAt?.slice(0, 10) ?? "");
  const canSetOutcome = recipient.status === "drafted" || recipient.status === "sent" || recipient.status === "replied";
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-3"><div><div className="flex items-center gap-2"><p className="font-medium text-[var(--text-primary)]">{recipient.prospect.name}</p><Badge variant={recipient.status === "drafted" ? "warning" : recipient.status === "ready" ? "success" : "neutral"}>{recipient.status.replace("_", " ")}</Badge></div><p className="mt-1 text-xs text-[var(--text-muted)]">{recipient.contact?.email ?? "No contact email yet."}</p></div><div className="flex flex-wrap items-center gap-2">{recipient.status === "needs_contact" && campaign.status === "draft" ? <BuyerContactLinker prospectId={recipient.prospect.id} contacts={contacts} onLinked={(contact) => onUpdate(campaign.id, recipient.id, { contactId: contact.id })} /> : null}{recipient.status === "drafted" || recipient.status === "sent" ? <><input aria-label={`Follow-up date for ${recipient.prospect.name}`} type="date" className="sb-input w-36 py-2 text-xs" value={date} onChange={(event) => setDate(event.target.value)} onBlur={() => { if (date) void onUpdate(campaign.id, recipient.id, { followUpDueAt: `${date}T12:00:00.000Z` }); }} /></> : null}{canSetOutcome ? <><button type="button" className="sb-btn-secondary py-2 text-xs" disabled={busy === `recipient-${recipient.id}`} onClick={() => void onUpdate(campaign.id, recipient.id, { status: "replied" })}>Replied</button><button type="button" className="sb-btn-secondary py-2 text-xs" disabled={busy === `recipient-${recipient.id}`} onClick={() => void onUpdate(campaign.id, recipient.id, { status: "declined" })}>Declined</button><button type="button" className="sb-btn-secondary py-2 text-xs" disabled={busy === `recipient-${recipient.id}`} onClick={() => void onUpdate(campaign.id, recipient.id, { status: "booked" })}>Booked</button></> : null}</div></div>;
}
