"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { Activity, Archive, BrainCircuit, Check, MessageSquareText, Pencil, Plus, RefreshCw, Save, Send, ShieldCheck, Target, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BandMember, ManagerConversation, ManagerEvalExample, ManagerEvaluationRun, ManagerGoal, ManagerGoalProgressEvent, ManagerLearningSummary, ManagerMemoryFact, ManagerMessage, ManagerMessageFeedback, ManagerPlanHealth, ManagerProfile, ManagerRun } from "@/lib/types";

export function ManagerClient({ initialProfile, initialMembers, initialGoals, initialBrief, initialConversation, initialMemory, initialLearning, initialPlanHealth, initialEvalExamples, initialEvaluation }: { initialProfile: ManagerProfile | null; initialMembers: BandMember[]; initialGoals: ManagerGoal[]; initialBrief: ManagerRun | null; initialConversation: ManagerConversation | null; initialMemory: ManagerMemoryFact[]; initialLearning: ManagerLearningSummary | null; initialPlanHealth: ManagerPlanHealth | null; initialEvalExamples: ManagerEvalExample[] | null; initialEvaluation: ManagerEvaluationRun | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(initialConversation?.id ?? null);
  const [messages, setMessages] = useState<ManagerMessage[]>(initialConversation?.messages ?? []);
  const [memory, setMemory] = useState(initialMemory);
  const [goals, setGoals] = useState(initialGoals);
  const [planHealth, setPlanHealth] = useState(initialPlanHealth);
  const [dismissTarget, setDismissTarget] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("not_relevant");
  const [evalExamples, setEvalExamples] = useState(initialEvalExamples);
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [learning, setLearning] = useState(initialLearning);
  useEffect(() => setGoals(initialGoals), [initialGoals]);
  useEffect(() => setMemory(initialMemory), [initialMemory]);
  useEffect(() => setPlanHealth(initialPlanHealth), [initialPlanHealth]);
  useEffect(() => setEvalExamples(initialEvalExamples), [initialEvalExamples]);
  useEffect(() => setEvaluation(initialEvaluation), [initialEvaluation]);
  useEffect(() => setLearning(initialLearning), [initialLearning]);
  async function act(path: string, json?: unknown) { setBusy(true); setError(""); try { await apiFetch(path, { method: "POST", ...(json === undefined ? {} : { json }) }); router.refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); } }
  async function chat(event: React.FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked) return;
    const userMessage: ManagerMessage = { id: `local-${Date.now()}`, role: "user", content: asked, citations: [], proposedActions: [], createdAt: new Date().toISOString() };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ conversationId: string; message: ManagerMessage }>("/manager/chat", { method: "POST", json: { message: asked, ...(conversationId ? { conversationId } : {}) } });
      setMessages((current) => [...current, result.message]);
      setConversationId(result.conversationId);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function acceptChatRecommendation(recommendationId: string) {
    setBusy(true); setError("");
    try {
      await apiFetch(`/manager/recommendations/${recommendationId}/accept`, { method: "POST" });
      setMessages((current) => current.map((message) => ({ ...message, proposedActions: message.proposedActions.map((action) => action.recommendationId === recommendationId ? { ...action, outcome: "accepted" } : action) })));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function dismissRecommendation(recommendationId: string, reason: string) {
    setBusy(true); setError("");
    try {
      await apiFetch(`/manager/recommendations/${recommendationId}/dismiss`, { method: "POST", json: { reason } });
      setMessages((current) => current.map((message) => ({ ...message, proposedActions: message.proposedActions.map((action) => action.recommendationId === recommendationId ? { ...action, outcome: "dismissed" } : action) })));
      setDismissTarget(null); setDismissReason("not_relevant"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function patchMemory(id: string, json: { value?: unknown; archived?: boolean }) {
    setBusy(true); setError("");
    try {
      const updated = await apiFetch<ManagerMemoryFact>(`/manager/memory/${id}`, { method: "PATCH", json });
      setMemory((current) => json.archived ? current.filter((fact) => fact.id !== id) : current.map((fact) => fact.id === id ? updated : fact));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function promoteEval(recommendationId: string, outcome: string) {
    setBusy(true); setError("");
    try {
      const example = await apiFetch<ManagerEvalExample>(`/manager/recommendations/${recommendationId}/promote-eval`, { method: "POST", json: { label: outcome === "dismissed" ? "not_useful" : "useful" } });
      setEvalExamples((current) => current ? [...current.filter((item) => item.recommendationId !== recommendationId), example] : current);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function recordGoalProgress(goalId: string, value: number, note: string | null) {
    setBusy(true); setError("");
    try {
      const event = await apiFetch<ManagerGoalProgressEvent>(`/manager/goals/${goalId}/progress`, { method: "POST", json: { value, note } });
      setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, currentValue: event.value, progressEvents: [event, ...(goal.progressEvents ?? [])].slice(0, 10) } : goal));
      setPlanHealth(await apiFetch<ManagerPlanHealth>("/manager/plan-health"));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function runEvaluation() {
    setBusy(true); setError("");
    try { setEvaluation(await apiFetch<ManagerEvaluationRun>("/manager/evaluations/run", { method: "POST", json: { candidateVersion: "manager_os_v4" } })); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function submitMessageFeedback(messageId: string, payload: { helpful: boolean; reason?: string | null; note?: string | null }) {
    setBusy(true); setError("");
    try {
      const feedback = await apiFetch<ManagerMessageFeedback>(`/manager/messages/${messageId}/feedback`, { method: "POST", json: payload });
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, feedback } : message));
      setLearning(await apiFetch<ManagerLearningSummary>("/manager/learning"));
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function ensurePlan() {
    setBusy(true); setError("");
    try {
      await apiFetch("/manager/plan/ensure", { method: "POST" });
      const [nextGoals, nextHealth] = await Promise.all([apiFetch<ManagerGoal[]>("/manager/goals"), apiFetch<ManagerPlanHealth>("/manager/plan-health")]);
      setGoals(nextGoals); setPlanHealth(nextHealth); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  function newConversation() { setConversationId(null); setMessages([]); setQuestion(""); setError(""); }
  if (!initialProfile?.intakeCompletedAt) return <Intake busy={busy} error={error} onSubmit={async (payload) => act("/manager/intake/complete", payload)} />;
  const output = initialBrief?.output;
  return <div className="space-y-8">
    {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">{error}</div> : null}
    <div className="grid gap-4 md:grid-cols-3"><SurfaceCard className="md:col-span-2"><div className="flex items-start justify-between gap-4"><div><p className="sb-kicker">Today</p><h2 className="mt-2 text-xl font-semibold">{output?.summary ?? "Generate your first grounded manager brief."}</h2></div><button className="sb-btn-secondary shrink-0" disabled={busy} onClick={() => void act("/manager/brief/generate", { cadence: "daily" })}><RefreshCw className="h-4 w-4" /> Refresh</button></div><div className="mt-6 space-y-3">{output?.today.map((item, index) => <div key={`${item.title}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4"><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-xs font-bold text-[var(--accent)]">{index + 1}</span><div><h3 className="font-medium">{item.title}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{item.reason}</p><p className="mt-2 text-sm font-medium text-[var(--text-primary)]">Next: {item.nextAction}</p></div></div></div>)}{!output?.today.length ? <EmptyState title="No brief yet" description="Generate a brief after completing intake." icon={<BrainCircuit className="h-6 w-6" />} /> : null}</div></SurfaceCard>
      <SurfaceCard><p className="sb-kicker">Operating context</p><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-[var(--text-muted)]">Band mode</dt><dd className="font-medium capitalize">{initialProfile.bandMode.replace("_", " / ")}</dd></div><div><dt className="text-[var(--text-muted)]">Home market</dt><dd>{[initialProfile.homeCity, initialProfile.homeRegion, initialProfile.homeCountry].filter(Boolean).join(", ") || "Unknown"}</dd></div><div><dt className="text-[var(--text-muted)]">Lineup</dt><dd>{initialMembers.length} active member{initialMembers.length === 1 ? "" : "s"}</dd></div><div><dt className="text-[var(--text-muted)]">12-month ambition</dt><dd>{initialProfile.twelveMonthAmbition ?? "Not set"}</dd></div></dl></SurfaceCard></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><SurfaceCard><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">90-day plan</h2></div><div className="flex items-center gap-2">{planHealth ? <Badge variant={planHealth.status === "on_track" ? "success" : planHealth.status === "off_track" ? "danger" : "neutral"}>{planHealth.score}/100 · {friendlyReason(planHealth.status)}</Badge> : null}<button className="sb-btn-ghost" disabled={busy} onClick={() => void ensurePlan()}><RefreshCw className="h-4 w-4" /> Fill missing steps</button></div></div>{planHealth ? <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><div className="flex gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" /><p className="text-sm text-[var(--text-secondary)]">{planHealth.summary}</p></div>{planHealth.gaps[0] ? <p className="mt-2 text-xs text-[var(--text-muted)]">First gap: {planHealth.gaps[0].detail}</p> : null}</div> : null}<div className="mt-4 space-y-3">{goals.map((goal) => <GoalProgressCard key={goal.id} goal={goal} health={planHealth?.goals.find((item) => item.goalId === goal.id) ?? null} busy={busy} onRecord={recordGoalProgress} />)}</div></SurfaceCard>
      <SurfaceCard><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Talk it through</h2></div><p className="mt-2 text-sm text-[var(--text-muted)]">The conversation remembers recent context, uses your StoryBoard records, and says when something is unknown.</p></div>{messages.length ? <button className="sb-btn-ghost shrink-0" onClick={newConversation} disabled={busy}><Plus className="h-4 w-4" /> New</button> : null}</div>
        <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((message) => <ManagerMessageBubble key={message.id} message={message} busy={busy} evalExamples={evalExamples} onAcceptRecommendation={acceptChatRecommendation} onDismissRecommendation={dismissRecommendation} onPromoteEval={promoteEval} onFeedback={submitMessageFeedback} />)}
          {!messages.length ? <div className="rounded-xl border border-dashed border-[var(--border)] p-4"><p className="text-sm font-medium">Start with the question that is actually on your mind.</p><div className="mt-3 flex flex-wrap gap-2">{["What needs my attention today?", "Are we ready for our next show?", "Where does our money stand?"].map((prompt) => <button key={prompt} className="rounded-full border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]" onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div></div> : null}
        </div>
        <form className="mt-4 flex items-end gap-2" onSubmit={(event) => void chat(event)}><label className="sr-only" htmlFor="manager-question">Message your manager</label><textarea id="manager-question" className="sb-input min-h-12 flex-1 resize-y" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about priorities, shows, booking, money, or the band..." maxLength={10000} rows={2} /><button className="sb-btn-primary min-h-12 shrink-0" disabled={busy || !question.trim()} aria-label="Send message"><Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span></button></form></SurfaceCard></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"><SurfaceCard><h2 className="font-semibold">What your manager remembers</h2><p className="mt-1 text-sm text-[var(--text-muted)]">These are confirmed band facts, not guesses. Correct or archive anything that is no longer true.</p><div className="mt-4 space-y-3">{memory.map((fact) => <MemoryFactEditor key={fact.id} fact={fact} busy={busy} onSave={(value) => patchMemory(fact.id, { value })} onArchive={() => patchMemory(fact.id, { archived: true })} />)}{!memory.length ? <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No confirmed memory yet. Complete intake to establish the band’s working context.</p> : null}</div></SurfaceCard>
      <SurfaceCard><p className="sb-kicker">Last {learning?.windowDays ?? 90} days</p><h2 className="mt-2 font-semibold">Learning from your choices</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Feedback changes repetition and response style. It never expands authority or rewrites StoryBoard’s rules or code.</p><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Used</dt><dd className="mt-1 text-xl font-semibold">{(learning?.accepted ?? 0) + (learning?.completed ?? 0)}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Completed</dt><dd className="mt-1 text-xl font-semibold">{learning?.completed ?? 0}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Answers rated</dt><dd className="mt-1 text-xl font-semibold">{learning?.responseFeedback.total ?? 0}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Helpful</dt><dd className="mt-1 text-xl font-semibold">{learning?.responseFeedback.helpfulRate == null ? "—" : `${Math.round(learning.responseFeedback.helpfulRate * 100)}%`}</dd></div></dl>{learning?.responseFeedback.reasons[0] ? <p className="mt-4 text-xs text-[var(--text-muted)]">Most common answer correction: {friendlyReason(learning.responseFeedback.reasons[0].reason)} ({learning.responseFeedback.reasons[0].count})</p> : learning?.dismissalReasons[0] ? <p className="mt-4 text-xs text-[var(--text-muted)]">Most common recommendation correction: {friendlyReason(learning.dismissalReasons[0].reason)} ({learning.dismissalReasons[0].count})</p> : null}{evalExamples ? <div className="mt-5 border-t border-[var(--border)] pt-4"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-[var(--accent)]" /> Intelligence release gate</p><p className="mt-1 text-xs text-[var(--text-muted)]">{evalExamples.length} owner-reviewed example{evalExamples.length === 1 ? "" : "s"}; no version activates itself.</p></div><button className="sb-btn-secondary shrink-0" disabled={busy} onClick={() => void runEvaluation()}>Run checks</button></div>{evaluation ? <div className="mt-3 rounded-lg border border-[var(--border)] p-3 text-xs"><div className="flex items-center justify-between"><span>{evaluation.candidateVersion}</span><Badge variant={evaluation.passed ? "success" : "danger"}>{evaluation.passed ? "passed" : "blocked"}</Badge></div><p className="mt-2 text-[var(--text-muted)]">{evaluation.metrics.passed}/{evaluation.metrics.total} checks passed · safety {Math.round(evaluation.metrics.safetyPassRate * 100)}%</p></div> : null}</div> : null}</SurfaceCard></div>
    {initialBrief?.recommendations?.length ? <SurfaceCard><h2 className="font-semibold">Reviewable recommendations</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Accepted work is not suggested again while its task is open. Recently completed or dismissed advice gets a cooldown.</p><div className="mt-4 divide-y divide-[var(--border)]">{initialBrief.recommendations.map((rec) => <div key={rec.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="flex-1"><div className="flex items-center gap-2"><p className="font-medium">{rec.title}</p><Badge variant={rec.priority === "high" ? "danger" : "neutral"}>{rec.priority}</Badge></div><p className="mt-1 text-sm text-[var(--text-secondary)]">{rec.nextAction}</p>{rec.outcomeReason ? <p className="mt-1 text-xs text-[var(--text-muted)]">Outcome: {friendlyReason(rec.outcomeReason)}</p> : null}</div>{rec.outcome === "suggested" ? dismissTarget === rec.id ? <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor={`dismiss-${rec.id}`}>Why is this not useful?</label><select id={`dismiss-${rec.id}`} className="sb-select min-w-40" value={dismissReason} onChange={(event) => setDismissReason(event.target.value)}><option value="not_relevant">Not relevant</option><option value="already_handled">Already handled</option><option value="wrong_priority">Wrong priority</option><option value="bad_timing">Bad timing</option><option value="missing_context">Missing context</option><option value="other">Other</option></select><button className="sb-btn-secondary" disabled={busy} onClick={() => void dismissRecommendation(rec.id, dismissReason)}>Save</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setDismissTarget(null)}><X className="h-4 w-4" /> Cancel</button></div> : <div className="flex gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => setDismissTarget(rec.id)}>Dismiss</button><button className="sb-btn-primary" disabled={busy} onClick={() => void act(`/manager/recommendations/${rec.id}/accept`)}><Check className="h-4 w-4" /> Accept</button></div> : <div className="flex flex-wrap items-center gap-2"><Badge variant={rec.outcome === "dismissed" ? "neutral" : "success"}>{rec.outcome}</Badge>{evalExamples ? evalExamples.some((example) => example.recommendationId === rec.id) ? <Badge variant="violet">in eval set</Badge> : <button className="sb-btn-ghost" disabled={busy} onClick={() => void promoteEval(rec.id, rec.outcome)}>Add to eval set</button> : null}</div>}</div>)}</div></SurfaceCard> : null}
  </div>;
}

function ManagerMessageBubble({ message, busy, evalExamples, onAcceptRecommendation, onDismissRecommendation, onPromoteEval, onFeedback }: {
  message: ManagerMessage;
  busy: boolean;
  evalExamples: ManagerEvalExample[] | null;
  onAcceptRecommendation: (recommendationId: string) => Promise<void>;
  onDismissRecommendation: (recommendationId: string, reason: string) => Promise<void>;
  onPromoteEval: (recommendationId: string, outcome: string) => Promise<void>;
  onFeedback: (messageId: string, payload: { helpful: boolean; reason?: string | null; note?: string | null }) => Promise<void>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState(message.feedback?.reason ?? "missed_question");
  const [note, setNote] = useState(message.feedback?.note ?? "");
  if (message.role === "user") return <div className="ml-8 rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-3 text-sm leading-6 text-white"><p className="whitespace-pre-wrap">{message.content}</p></div>;
  async function saveCorrection() {
    try { await onFeedback(message.id, { helpful: false, reason, note: note.trim() || null }); setCorrecting(false); }
    catch { /* parent displays the request error */ }
  }
  async function markHelpful() {
    try { await onFeedback(message.id, { helpful: true }); setCorrecting(false); }
    catch { /* parent displays the request error */ }
  }
  return <div className="mr-4 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3 text-sm leading-6">
    <p className="whitespace-pre-wrap">{message.content}</p>
    {message.citations.length ? <p className="mt-3 text-xs text-[var(--text-muted)]">Grounded in {message.citations.length} StoryBoard record{message.citations.length === 1 ? "" : "s"}</p> : null}
    {message.proposedActions.map((action) => <div key={action.recommendationId} className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Suggested internal task</p><p className="mt-1 font-medium">{action.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{action.nextAction}</p>{action.outcome === "suggested" ? <div className="mt-3 flex flex-wrap gap-2"><button className="sb-btn-primary" disabled={busy} onClick={() => void onAcceptRecommendation(action.recommendationId)}><Check className="h-4 w-4" /> Add task</button><button className="sb-btn-ghost" disabled={busy} onClick={() => void onDismissRecommendation(action.recommendationId, "not_relevant")}>Not useful</button></div> : <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant={action.outcome === "dismissed" ? "neutral" : "success"}>{action.outcome}</Badge>{evalExamples ? evalExamples.some((example) => example.recommendationId === action.recommendationId) ? <Badge variant="violet">in eval set</Badge> : <button className="sb-btn-ghost" disabled={busy} onClick={() => void onPromoteEval(action.recommendationId, action.outcome)}>Add to eval set</button> : null}</div>}</div>)}
    {correcting ? <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><label><span className="sb-label">What should improve?</span><select className="sb-select mt-1 w-full" value={reason} onChange={(event) => setReason(event.target.value)}><option value="missed_question">Missed my question</option><option value="incorrect">Something was incorrect</option><option value="too_vague">Too vague</option><option value="too_long">Too long</option><option value="wrong_tone">Tone felt wrong</option><option value="missing_context">Missing context</option><option value="other">Other</option></select></label><label className="mt-2 block"><span className="sb-label">Correction (optional)</span><input className="sb-input mt-1 w-full" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="What would have made this useful?" /></label><div className="mt-3 flex gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => void saveCorrection()}>Save feedback</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setCorrecting(false)}>Cancel</button></div></div> : <div className="mt-3 flex items-center gap-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]"><span className="mr-1">Was this useful?</span><button className={message.feedback?.helpful ? "rounded-md bg-[var(--accent-muted)] px-2 py-1 text-[var(--accent)]" : "rounded-md px-2 py-1 hover:bg-[var(--surface-1)]"} disabled={busy} onClick={() => void markHelpful()}><ThumbsUp className="mr-1 inline h-3.5 w-3.5" /> Helpful</button><button className={message.feedback && !message.feedback.helpful ? "rounded-md bg-[var(--accent-muted)] px-2 py-1 text-[var(--accent)]" : "rounded-md px-2 py-1 hover:bg-[var(--surface-1)]"} disabled={busy} onClick={() => setCorrecting(true)}><ThumbsDown className="mr-1 inline h-3.5 w-3.5" /> Needs work</button>{message.feedback ? <span className="ml-auto">Saved</span> : null}</div>}
  </div>;
}

function friendlyReason(reason: string) {
  return reason.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function memoryValueText(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join("\n");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${friendlyReason(key)}: ${item ?? ""}`).join("\n");
  return value == null ? "" : String(value);
}

function parseMemoryValue(text: string, original: unknown) {
  if (Array.isArray(original)) return text.split("\n").map((value) => value.trim()).filter(Boolean);
  if (original && typeof original === "object") {
    const originalKeys = Object.keys(original);
    const entries = text.split("\n").map((line) => { const separator = line.indexOf(":"); return separator < 0 ? null : [line.slice(0, separator).trim().toLowerCase().replaceAll(" ", "_"), line.slice(separator + 1).trim() || null] as const; }).filter((entry): entry is readonly [string, string | null] => Boolean(entry));
    const parsed = Object.fromEntries(entries);
    return Object.fromEntries(originalKeys.map((key) => [key, parsed[key] ?? null]));
  }
  if (typeof original === "number") { const value = Number(text); if (!Number.isFinite(value)) throw new Error("Enter a valid number"); return value; }
  if (typeof original === "boolean") return ["true", "yes", "1"].includes(text.trim().toLowerCase());
  return text.trim();
}

function GoalProgressCard({ goal, health, busy, onRecord }: { goal: ManagerGoal; health: ManagerPlanHealth["goals"][number] | null; busy: boolean; onRecord: (goalId: string, value: number, note: string | null) => Promise<void> }) {
  const [value, setValue] = useState(goal.currentValue?.toString() ?? "");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  async function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    try { await onRecord(goal.id, parsed, note.trim() || null); setNote(""); setEditing(false); } catch { /* parent displays request errors */ }
  }
  const progress = goal.targetValue && goal.currentValue != null ? Math.max(0, Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))) : null;
  return <div className="rounded-lg border border-[var(--border)] p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{goal.title}</p><p className="mt-1 text-xs capitalize text-[var(--text-muted)]">{goal.workstream.replace("_", " ")}{goal.deadline ? ` · due ${new Date(goal.deadline).toLocaleDateString()}` : ""}</p></div><Badge variant={health?.status === "on_track" ? "success" : health?.status === "off_track" ? "danger" : "neutral"}>{health ? friendlyReason(health.status) : goal.status}</Badge></div>{progress !== null ? <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-[var(--text-muted)]">{goal.currentValue} of {goal.targetValue} {goal.targetUnit ?? ""} · {progress}%</p></div> : <p className="mt-3 text-xs text-[var(--text-muted)]">Progress is not measurable yet.</p>}{health?.reasons[0] ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{health.reasons[0]}</p> : null}{goal.initiatives?.map((initiative) => <div key={initiative.id} className="mt-3 rounded-lg bg-[var(--surface-0)] p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{initiative.title}</p><span className="text-[11px] capitalize text-[var(--text-muted)]">{initiative.status}</span></div><ol className="mt-2 space-y-1.5">{initiative.tasks?.filter((task) => task.status !== "done").slice(0, 3).map((task) => <li key={task.id} className="flex gap-2 text-xs text-[var(--text-secondary)]"><span className="text-[var(--accent)]">•</span><span>{task.title}{task.dueAt ? ` · ${new Date(task.dueAt).toLocaleDateString()}` : ""} · {task.ownerLabel ?? "Unassigned"}</span></li>)}</ol>{initiative.tasks?.some((task) => task.status !== "done" && !task.ownerLabel) ? <a className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline" href="/tasks">Assign owners in Tasks</a> : null}{initiative.tasks?.every((task) => task.status === "done") ? <p className="mt-2 text-xs text-[var(--text-muted)]">All linked steps are complete.</p> : null}</div>)}{editing ? <div className="mt-3 space-y-2 rounded-lg bg-[var(--surface-0)] p-3"><label><span className="sb-label">Current value</span><input className="sb-input mt-1" type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} /></label><label><span className="sb-label">What changed? (optional)</span><input className="sb-input mt-1" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Booked the second regional show" /></label><div className="flex gap-2"><button className="sb-btn-primary" disabled={busy || !Number.isFinite(Number(value))} onClick={() => void save()}><Save className="h-4 w-4" /> Record</button><button className="sb-btn-ghost" disabled={busy} onClick={() => { setValue(goal.currentValue?.toString() ?? ""); setNote(""); setEditing(false); }}>Cancel</button></div></div> : <button className="sb-btn-ghost mt-2" disabled={busy} onClick={() => setEditing(true)}>Update progress</button>}</div>;
}

function MemoryFactEditor({ fact, busy, onSave, onArchive }: { fact: ManagerMemoryFact; busy: boolean; onSave: (value: unknown) => Promise<void>; onArchive: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => memoryValueText(fact.value));
  async function save() { try { await onSave(parseMemoryValue(text, fact.value)); setEditing(false); } catch { /* parent displays the request error */ } }
  async function archive() { try { await onArchive(); } catch { /* parent displays the request error */ } }
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{friendlyReason(fact.key)}</p>{editing ? <textarea className="sb-input mt-2 min-h-20" value={text} onChange={(event) => setText(event.target.value)} aria-label={`Correct ${friendlyReason(fact.key)}`} /> : <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{memoryValueText(fact.value) || "Not specified"}</p>}<p className="mt-2 text-[11px] text-[var(--text-muted)]">{fact.confirmedAt ? `Confirmed ${new Date(fact.confirmedAt).toLocaleDateString()}` : "Needs confirmation"}</p></div>{editing ? <div className="flex shrink-0 gap-1"><button className="sb-btn-primary px-3" disabled={busy} onClick={() => void save()} aria-label={`Save ${friendlyReason(fact.key)}`}><Save className="h-4 w-4" /></button><button className="sb-btn-ghost px-3" disabled={busy} onClick={() => { setText(memoryValueText(fact.value)); setEditing(false); }} aria-label="Cancel correction"><X className="h-4 w-4" /></button></div> : <div className="flex shrink-0 gap-1"><button className="sb-btn-ghost px-3" disabled={busy} onClick={() => setEditing(true)} aria-label={`Correct ${friendlyReason(fact.key)}`}><Pencil className="h-4 w-4" /></button><button className="sb-btn-ghost px-3" disabled={busy} onClick={() => void archive()} aria-label={`Archive ${friendlyReason(fact.key)}`}><Archive className="h-4 w-4" /></button></div>}</div></div>;
}

function Intake({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit: (payload: unknown) => Promise<void> }) {
  const [mode, setMode] = useState<"original"|"cover_event"|"hybrid">("original"); const [stage, setStage] = useState(""); const [market, setMarket] = useState(""); const [genres, setGenres] = useState(""); const [ambition, setAmbition] = useState(""); const [constraints, setConstraints] = useState(""); const [memberNames, setMemberNames] = useState("");
  return <SurfaceCard className="mx-auto max-w-3xl"><p className="sb-kicker">Guided setup</p><h2 className="mt-2 text-2xl font-semibold">Tell StoryBoard enough to manage the tradeoffs</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">No music-business vocabulary required. Draft details can change later; unknowns stay unknown.</p>{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}<form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const [homeCity, homeRegion] = market.split(",").map((value) => value.trim()); void onSubmit({ profile: { bandMode: mode, careerStage: stage || null, homeCity: homeCity || null, homeRegion: homeRegion || null, homeCountry: "US", genres: genres.split(",").map((v) => v.trim()).filter(Boolean), businessName: null, currentAssets: [], revenueSources: [], constraints: constraints.split("\n").map((v) => v.trim()).filter(Boolean), budgetToleranceMinor: null, twelveMonthAmbition: ambition || null, communicationCadence: "weekly", decisionStyle: "guided", educationTopics: [], availabilityExpectations: null, currency: "USD" }, members: memberNames.split("\n").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, roles: [], instruments: [], active: true })) }); }}><label><span className="sb-label">What kind of band?</span><select className="sb-select mt-1.5" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="original">Original music</option><option value="cover_event">Cover / event band</option><option value="hybrid">Both</option></select></label><label><span className="sb-label">Career stage</span><input className="sb-input mt-1.5" value={stage} onChange={(event) => setStage(event.target.value)} placeholder="New, local draw, regional..." /></label><label><span className="sb-label">Home market</span><input required className="sb-input mt-1.5" value={market} onChange={(event) => setMarket(event.target.value)} placeholder="Chicago, IL" /></label><label><span className="sb-label">Genres</span><input className="sb-input mt-1.5" value={genres} onChange={(event) => setGenres(event.target.value)} placeholder="indie rock, soul" /></label><label className="sm:col-span-2"><span className="sb-label">What would a great next 12 months look like?</span><textarea required className="sb-input mt-1.5 min-h-24" value={ambition} onChange={(event) => setAmbition(event.target.value)} /></label><label><span className="sb-label">Band member names</span><textarea className="sb-input mt-1.5 min-h-28" value={memberNames} onChange={(event) => setMemberNames(event.target.value)} placeholder={"One name per line"} /></label><label><span className="sb-label">Constraints</span><textarea className="sb-input mt-1.5 min-h-28" value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder={"Work schedules\nLimited budget"} /></label><div className="sm:col-span-2"><button className="sb-btn-primary" disabled={busy}>{busy ? "Building plan..." : "Build my 90-day operating plan"}</button></div></form></SurfaceCard>;
}
