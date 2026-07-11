"use client";
import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { BrainCircuit, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BookingAdvisorRun } from "@/lib/types";

export function BookingAdvisorClient({ initialRun }: { initialRun: BookingAdvisorRun | null }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function generate() { setBusy(true); setError(null); try { await apiFetch("/booking-advisor/generate", { method: "POST" }); router.refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not generate advice"); } finally { setBusy(false); } }
  async function feedback(helpful: boolean) {
    if (!initialRun) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/booking-advisor/${initialRun.id}/feedback`, { method: "POST", json: { helpful } });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save feedback");
    } finally {
      setBusy(false);
    }
  }
  if (!initialRun) return <div className="space-y-4">{error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}<EmptyState title="No advisor run yet" description="Generate a reviewable booking brief from current sprint, campaign, delivery, and outcome data." icon={<BrainCircuit className="h-6 w-6" />} action={<button className="sb-btn-primary" onClick={() => void generate()} disabled={busy}>Generate booking brief</button>} /></div>;
  const advice = initialRun.advice;
  return <div className="space-y-6">{error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}<SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-[var(--accent)]" /><h2 className="font-semibold text-[var(--text-primary)]">Current booking brief</h2></div><p className="mt-2 text-sm text-[var(--text-secondary)]">{advice.summary}</p><p className="mt-2 text-xs text-[var(--text-muted)]">Mode: {initialRun.mode} · prompt {initialRun.promptVersion}</p></div><button className="sb-btn-secondary" onClick={() => void generate()} disabled={busy}>Refresh brief</button></div></SurfaceCard><div className="grid gap-4">{advice.opportunities.map((item) => <SurfaceCard key={item.title}><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-[var(--text-primary)]">{item.title}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{item.reason}</p><p className="mt-3 text-sm text-[var(--accent)]">Next: {item.nextAction}</p></div><Badge variant={item.priority === "high" ? "danger" : item.priority === "med" ? "warning" : "neutral"}>{item.priority}</Badge></div></SurfaceCard>)}</div><SurfaceCard><h2 className="font-semibold text-[var(--text-primary)]">Improve the next brief</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">Your vote is stored with this run and aggregate feedback is included in later advice. No email content or contact details are sent to the advisor.</p><div className="mt-4 flex gap-2"><button className="sb-btn-secondary" onClick={() => void feedback(true)}><ThumbsUp className="h-4 w-4" />Helpful</button><button className="sb-btn-secondary" onClick={() => void feedback(false)}><ThumbsDown className="h-4 w-4" />Not helpful</button></div></SurfaceCard></div>;
}
