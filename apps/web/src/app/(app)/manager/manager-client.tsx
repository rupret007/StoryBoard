"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { Activity, Archive, BrainCircuit, Check, ClipboardList, GitCompareArrows, ListChecks, MessageSquareText, Pencil, Plus, RefreshCw, Save, Send, ShieldCheck, Target, ThumbsDown, ThumbsUp, TrendingUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BandMember, ManagerCommitmentHealth, ManagerContextHealth, ManagerConversation, ManagerDecision, ManagerDecisionOption, ManagerEvalExample, ManagerEvaluationRun, ManagerGoal, ManagerGoalProgressEvent, ManagerLearningSummary, ManagerMemoryFact, ManagerMessage, ManagerMessageFeedback, ManagerOutcomeReview, ManagerPlanHealth, ManagerProfile, ManagerProviderContextPolicy, ManagerRecommendation, ManagerResponseEvalExample, ManagerRun, ManagerSettings } from "@/lib/types";
import { ManagerCadenceCard } from "./manager-cadence-card";

export function ManagerClient({ initialProfile, initialMembers, initialGoals, initialDecisions, initialBrief, initialConversation, initialMemory, initialLearning, initialPlanHealth, initialContextHealth, initialCommitmentHealth, initialOutcomeReview, initialEvalExamples, initialResponseEvalExamples, initialEvaluation, initialSettings, initialProviderContextPolicy, isOwner }: { initialProfile: ManagerProfile | null; initialMembers: BandMember[]; initialGoals: ManagerGoal[]; initialDecisions: ManagerDecision[]; initialBrief: ManagerRun | null; initialConversation: ManagerConversation | null; initialMemory: ManagerMemoryFact[]; initialLearning: ManagerLearningSummary | null; initialPlanHealth: ManagerPlanHealth | null; initialContextHealth: ManagerContextHealth | null; initialCommitmentHealth: ManagerCommitmentHealth | null; initialOutcomeReview: ManagerOutcomeReview | null; initialEvalExamples: ManagerEvalExample[] | null; initialResponseEvalExamples: ManagerResponseEvalExample[] | null; initialEvaluation: ManagerEvaluationRun | null; initialSettings: ManagerSettings | null; initialProviderContextPolicy: ManagerProviderContextPolicy | null; isOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(initialConversation?.id ?? null);
  const [messages, setMessages] = useState<ManagerMessage[]>(initialConversation?.messages ?? []);
  const [memory, setMemory] = useState(initialMemory);
  const [profile, setProfile] = useState(initialProfile);
  const [members, setMembers] = useState(initialMembers);
  const [goals, setGoals] = useState(initialGoals);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [planHealth, setPlanHealth] = useState(initialPlanHealth);
  const [contextHealth, setContextHealth] = useState(initialContextHealth);
  const [dismissTarget, setDismissTarget] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("not_relevant");
  const [evalExamples, setEvalExamples] = useState(initialEvalExamples);
  const [responseEvalExamples, setResponseEvalExamples] = useState(initialResponseEvalExamples);
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [learning, setLearning] = useState(initialLearning);
  useEffect(() => setGoals(initialGoals), [initialGoals]);
  useEffect(() => setProfile(initialProfile), [initialProfile]);
  useEffect(() => setMembers(initialMembers), [initialMembers]);
  useEffect(() => setDecisions(initialDecisions), [initialDecisions]);
  useEffect(() => setMemory(initialMemory), [initialMemory]);
  useEffect(() => setPlanHealth(initialPlanHealth), [initialPlanHealth]);
  useEffect(() => setContextHealth(initialContextHealth), [initialContextHealth]);
  useEffect(() => setEvalExamples(initialEvalExamples), [initialEvalExamples]);
  useEffect(() => setResponseEvalExamples(initialResponseEvalExamples), [initialResponseEvalExamples]);
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
      const recommendation = await apiFetch<{ outcome: string }>(`/manager/recommendations/${recommendationId}/accept`, { method: "POST" });
      setMessages((current) => current.map((message) => ({ ...message, proposedActions: message.proposedActions.map((action) => action.recommendationId === recommendationId ? { ...action, outcome: recommendation.outcome } : action) })));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function acceptBriefRecommendation(recommendation: ManagerRecommendation) {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiFetch<ManagerRecommendation>(`/manager/recommendations/${recommendation.id}/accept`, { method: "POST" });
      setNotice(recommendation.proposedAction?.type === "generate_event_advance" ? "Show advance created." : recommendation.proposedAction?.type === "generate_project_plan" ? "Milestone plan created." : recommendation.proposedAction?.type === "create_task" ? "Task added." : recommendation.proposedAction?.type === "create_decision" ? "Decision draft added." : "Recommendation accepted.");
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
  async function promoteResponseEval(messageId: string, payload: { label: "useful" | "needs_revision"; expectedBehavior?: string | null }) {
    setBusy(true); setError("");
    try {
      const example = await apiFetch<ManagerResponseEvalExample>(`/manager/messages/${messageId}/promote-eval`, { method: "POST", json: payload });
      setResponseEvalExamples((current) => current ? [...current.filter((item) => item.managerMessageId !== messageId), example] : current);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
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
    try { setEvaluation(await apiFetch<ManagerEvaluationRun>("/manager/evaluations/run", { method: "POST", json: { candidateVersion: "manager_os_v10" } })); }
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
  async function createDecision(payload: unknown) {
    setBusy(true); setError("");
    try { const row = await apiFetch<ManagerDecision>("/manager/decisions", { method: "POST", json: payload }); setDecisions((current) => [row, ...current]); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function patchDecision(id: string, payload: unknown) {
    setBusy(true); setError("");
    try { const row = await apiFetch<ManagerDecision>(`/manager/decisions/${id}`, { method: "PATCH", json: payload }); setDecisions((current) => current.map((decision) => decision.id === id ? row : decision)); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function reviewDecision(id: string, payload: unknown) {
    setBusy(true); setError("");
    try { const row = await apiFetch<ManagerDecision>(`/manager/decisions/${id}/review`, { method: "POST", json: payload }); setDecisions((current) => current.map((decision) => decision.id === id ? row : decision)); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function refreshContext() { setContextHealth(await apiFetch<ManagerContextHealth>("/manager/context-health")); }
  async function saveProfile(payload: unknown) {
    setBusy(true); setError("");
    try { setProfile(await apiFetch<ManagerProfile>("/manager/profile", { method: "PUT", json: payload })); await refreshContext(); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function addBandMember(payload: unknown) {
    setBusy(true); setError("");
    try { const row = await apiFetch<BandMember>("/manager/members", { method: "POST", json: payload }); setMembers((current) => [...current, row]); await refreshContext(); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function updateBandMember(id: string, payload: unknown) {
    setBusy(true); setError("");
    try { const row = await apiFetch<BandMember>(`/manager/members/${id}`, { method: "PATCH", json: payload }); setMembers((current) => current.map((member) => member.id === id ? row : member)); await refreshContext(); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  function newConversation() { setConversationId(null); setMessages([]); setQuestion(""); setError(""); }
  if (!profile?.intakeCompletedAt) return <Intake busy={busy} error={error} onSubmit={async (payload) => act("/manager/intake/complete", payload)} />;
  const output = initialBrief?.output;
  const firstPriorityFactors = initialBrief?.trace?.priorityRanking?.today[0]?.factors
    .filter((factor) => factor.impact > 0 && !factor.code.startsWith("declared_") && factor.code !== "recorded_evidence")
    .slice(0, 3) ?? [];
  return <div className="space-y-8">
    {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">{error}</div> : null}
    {notice ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100" role="status">{notice}</div> : null}
    <div className="grid gap-4 md:grid-cols-3"><SurfaceCard className="md:col-span-2"><div className="flex items-start justify-between gap-4"><div><p className="sb-kicker">Today</p><h2 className="mt-2 text-xl font-semibold">{output?.summary ?? "Generate your first grounded manager brief."}</h2>{firstPriorityFactors.length ? <p data-testid="manager-priority-explanation" className="mt-2 text-xs text-[var(--text-muted)]">Ranked first because {firstPriorityFactors.map((factor) => factor.detail).join(" · ")}.</p> : null}</div><button className="sb-btn-secondary shrink-0" disabled={busy} onClick={() => void act("/manager/brief/generate", { cadence: "daily" })}><RefreshCw className="h-4 w-4" /> Refresh</button></div><div className="mt-6 space-y-3">{output?.today.map((item, index) => <div key={`${item.title}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4"><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-xs font-bold text-[var(--accent)]">{index + 1}</span><div><h3 className="font-medium">{item.title}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{item.reason}</p><p className="mt-2 text-sm font-medium text-[var(--text-primary)]">Next: {item.nextAction}</p></div></div></div>)}{!output?.today.length ? <EmptyState title="No brief yet" description="Generate a brief after completing intake." icon={<BrainCircuit className="h-6 w-6" />} /> : null}</div></SurfaceCard>
      <SurfaceCard><p className="sb-kicker">Operating context</p><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-[var(--text-muted)]">Band mode</dt><dd className="font-medium capitalize">{profile.bandMode.replace("_", " / ")}</dd></div><div><dt className="text-[var(--text-muted)]">Home market</dt><dd>{[profile.homeCity, profile.homeRegion, profile.homeCountry].filter(Boolean).join(", ") || "Unknown"}</dd></div><div><dt className="text-[var(--text-muted)]">Lineup</dt><dd>{members.length} active member{members.length === 1 ? "" : "s"}</dd></div><div><dt className="text-[var(--text-muted)]">12-month ambition</dt><dd>{profile.twelveMonthAmbition ?? "Not set"}</dd></div></dl></SurfaceCard></div>
    {contextHealth ? <BandContextCard profile={profile} members={members} health={contextHealth} busy={busy} onSaveProfile={saveProfile} onAddMember={addBandMember} onUpdateMember={updateBandMember} /> : null}
    {initialSettings ? <ManagerCadenceCard initialSettings={initialSettings} initialProviderContextPolicy={initialProviderContextPolicy} cadence={profile.communicationCadence === "weekly" ? "weekly" : "daily"} isOwner={isOwner} /> : null}
    {initialCommitmentHealth ? <CommitmentHealthCard health={initialCommitmentHealth} /> : null}
    {initialOutcomeReview ? <OutcomeReviewCard review={initialOutcomeReview} /> : null}
    <DecisionBoard decisions={decisions} busy={busy} onCreate={createDecision} onDecide={patchDecision} onReview={reviewDecision} />
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><SurfaceCard><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">90-day plan</h2></div><div className="flex items-center gap-2">{planHealth ? <Badge variant={planHealth.status === "on_track" ? "success" : planHealth.status === "off_track" ? "danger" : "neutral"}>{planHealth.score}/100 · {friendlyReason(planHealth.status)}</Badge> : null}<button className="sb-btn-ghost" disabled={busy} onClick={() => void ensurePlan()}><RefreshCw className="h-4 w-4" /> Fill missing steps</button></div></div>{planHealth ? <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><div className="flex gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" /><p className="text-sm text-[var(--text-secondary)]">{planHealth.summary}</p></div>{planHealth.gaps[0] ? <p className="mt-2 text-xs text-[var(--text-muted)]">First gap: {planHealth.gaps[0].detail}</p> : null}</div> : null}<div className="mt-4 space-y-3">{goals.map((goal) => <GoalProgressCard key={goal.id} goal={goal} health={planHealth?.goals.find((item) => item.goalId === goal.id) ?? null} busy={busy} onRecord={recordGoalProgress} />)}</div></SurfaceCard>
      <SurfaceCard><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Talk it through</h2></div><p className="mt-2 text-sm text-[var(--text-muted)]">The conversation remembers recent context, uses your StoryBoard records, and says when something is unknown.</p></div>{messages.length ? <button className="sb-btn-ghost shrink-0" onClick={newConversation} disabled={busy}><Plus className="h-4 w-4" /> New</button> : null}</div>
        <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((message) => <ManagerMessageBubble key={message.id} message={message} busy={busy} evalExamples={evalExamples} responseEvalExamples={responseEvalExamples} onAcceptRecommendation={acceptChatRecommendation} onDismissRecommendation={dismissRecommendation} onPromoteEval={promoteEval} onPromoteResponseEval={promoteResponseEval} onFeedback={submitMessageFeedback} />)}
          {!messages.length ? <div className="rounded-xl border border-dashed border-[var(--border)] p-4"><p className="text-sm font-medium">Start with the question that is actually on your mind.</p><div className="mt-3 flex flex-wrap gap-2">{["What needs my attention today?", "What is blocked or slipping?", "Are we ready for our next show?", "What did we learn from recent shows?", "Where does our money stand?"].map((prompt) => <button key={prompt} className="rounded-full border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]" onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div></div> : null}
        </div>
        <form className="mt-4 flex items-end gap-2" onSubmit={(event) => void chat(event)}><label className="sr-only" htmlFor="manager-question">Message your manager</label><textarea id="manager-question" className="sb-input min-h-12 flex-1 resize-y" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about priorities, shows, booking, money, or the band..." maxLength={10000} rows={2} /><button className="sb-btn-primary min-h-12 shrink-0" disabled={busy || !question.trim()} aria-label="Send message"><Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span></button></form></SurfaceCard></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"><SurfaceCard><h2 className="font-semibold">What your manager remembers</h2><p className="mt-1 text-sm text-[var(--text-muted)]">These are confirmed band facts, not guesses. Correct or archive anything that is no longer true.</p><div className="mt-4 space-y-3">{memory.map((fact) => <MemoryFactEditor key={fact.id} fact={fact} busy={busy} onSave={(value) => patchMemory(fact.id, { value })} onArchive={() => patchMemory(fact.id, { archived: true })} />)}{!memory.length ? <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No confirmed memory yet. Complete intake to establish the band’s working context.</p> : null}</div></SurfaceCard>
      <SurfaceCard><p className="sb-kicker">Last {learning?.windowDays ?? 90} days</p><h2 className="mt-2 font-semibold">Learning from your choices</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Feedback changes repetition and response style. It never expands authority or rewrites StoryBoard’s rules or code.</p><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Used</dt><dd className="mt-1 text-xl font-semibold">{(learning?.accepted ?? 0) + (learning?.completed ?? 0)}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Completed</dt><dd className="mt-1 text-xl font-semibold">{learning?.completed ?? 0}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Answers rated</dt><dd className="mt-1 text-xl font-semibold">{learning?.responseFeedback.total ?? 0}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Helpful</dt><dd className="mt-1 text-xl font-semibold">{learning?.responseFeedback.helpfulRate == null ? "—" : `${Math.round(learning.responseFeedback.helpfulRate * 100)}%`}</dd></div></dl>{learning?.responseFeedback.reasons[0] ? <p className="mt-4 text-xs text-[var(--text-muted)]">Most common answer correction: {friendlyReason(learning.responseFeedback.reasons[0].reason)} ({learning.responseFeedback.reasons[0].count})</p> : learning?.dismissalReasons[0] ? <p className="mt-4 text-xs text-[var(--text-muted)]">Most common recommendation correction: {friendlyReason(learning.dismissalReasons[0].reason)} ({learning.dismissalReasons[0].count})</p> : null}{evalExamples ? <div className="mt-5 border-t border-[var(--border)] pt-4"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-[var(--accent)]" /> Intelligence release gate</p><p className="mt-1 text-xs text-[var(--text-muted)]">{evalExamples.length + (responseEvalExamples?.length ?? 0)} owner-reviewed example{evalExamples.length + (responseEvalExamples?.length ?? 0) === 1 ? "" : "s"}; no version activates itself.</p></div><button className="sb-btn-secondary shrink-0" disabled={busy} onClick={() => void runEvaluation()}>Run checks</button></div>{evaluation ? <div className="mt-3 rounded-lg border border-[var(--border)] p-3 text-xs"><div className="flex items-center justify-between"><span>{evaluation.candidateVersion}</span><Badge variant={evaluation.passed ? "success" : "danger"}>{evaluation.passed ? "passed" : "blocked"}</Badge></div><p className="mt-2 text-[var(--text-muted)]">{evaluation.metrics.passed}/{evaluation.metrics.total} checks passed · safety {Math.round(evaluation.metrics.safetyPassRate * 100)}%</p><p className="mt-1 text-[var(--text-muted)]">Reviewed answers: {evaluation.metrics.ownerReviewedResponseCount}</p></div> : null}</div> : null}</SurfaceCard></div>
    {initialBrief?.recommendations?.length ? <SurfaceCard><h2 className="font-semibold">Reviewable recommendations</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Accepted work is not suggested again while its task is open. Recently completed or dismissed advice gets a cooldown.</p><div className="mt-4 divide-y divide-[var(--border)]">{initialBrief.recommendations.map((rec) => <div key={rec.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="flex-1"><div className="flex items-center gap-2"><p className="font-medium">{rec.title}</p><Badge variant={rec.priority === "high" ? "danger" : "neutral"}>{rec.priority}</Badge></div><p className="mt-1 text-sm text-[var(--text-secondary)]">{rec.nextAction}</p>{rec.outcomeReason ? <p className="mt-1 text-xs text-[var(--text-muted)]">Outcome: {friendlyReason(rec.outcomeReason)}</p> : null}</div>{rec.outcome === "suggested" ? dismissTarget === rec.id ? <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor={`dismiss-${rec.id}`}>Why is this not useful?</label><select id={`dismiss-${rec.id}`} className="sb-select min-w-40" value={dismissReason} onChange={(event) => setDismissReason(event.target.value)}><option value="not_relevant">Not relevant</option><option value="already_handled">Already handled</option><option value="wrong_priority">Wrong priority</option><option value="bad_timing">Bad timing</option><option value="missing_context">Missing context</option><option value="other">Other</option></select><button className="sb-btn-secondary" disabled={busy} onClick={() => void dismissRecommendation(rec.id, dismissReason)}>Save</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setDismissTarget(null)}><X className="h-4 w-4" /> Cancel</button></div> : <div className="flex gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => setDismissTarget(rec.id)}>Dismiss</button><button className="sb-btn-primary" disabled={busy} onClick={() => void acceptBriefRecommendation(rec)}><Check className="h-4 w-4" /> {managerActionButton(rec.proposedAction?.type)}</button></div> : <div className="flex flex-wrap items-center gap-2"><Badge variant={rec.outcome === "dismissed" ? "neutral" : "success"}>{rec.outcome}</Badge>{evalExamples ? evalExamples.some((example) => example.recommendationId === rec.id) ? <Badge variant="violet">in eval set</Badge> : <button className="sb-btn-ghost" disabled={busy} onClick={() => void promoteEval(rec.id, rec.outcome)}>Add to eval set</button> : null}</div>}</div>)}</div></SurfaceCard> : null}
  </div>;
}

function outcomeMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

function splitComma(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function splitLines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }

function CommitmentHealthCard({ health }: { health: ManagerCommitmentHealth }) {
  const pressure = health.items.filter((item) => item.state !== "active").slice(0, 5);
  return <div data-testid="manager-commitments"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Follow-through</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{health.summary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">This is ranked from saved task status, owner, date, blocker, waiting party, and deferral history.</p></div><a className="sb-btn-secondary" href="/tasks">Open task board</a></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7"><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Open</dt><dd className="mt-1 text-xl font-semibold">{health.counts.open}</dd></div><div className="rounded-lg border border-red-500/20 p-3"><dt className="text-[var(--text-muted)]">Blocked</dt><dd className="mt-1 text-xl font-semibold">{health.counts.blocked}</dd></div><div className="rounded-lg border border-red-500/20 p-3"><dt className="text-[var(--text-muted)]">Overdue</dt><dd className="mt-1 text-xl font-semibold">{health.counts.overdue}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Waiting</dt><dd className="mt-1 text-xl font-semibold">{health.counts.waiting}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Unassigned</dt><dd className="mt-1 text-xl font-semibold">{health.counts.unassigned}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Deferred 2+</dt><dd className="mt-1 text-xl font-semibold">{health.counts.repeatedlyDeferred}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Due soon</dt><dd className="mt-1 text-xl font-semibold">{health.counts.dueSoon}</dd></div></dl>
    {pressure.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{pressure.map((item) => <div className={`rounded-lg border p-3 ${item.severity === "high" ? "border-red-500/25 bg-red-500/5" : "border-[var(--border)]"}`} key={item.taskId}><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><Badge variant={item.severity === "high" ? "danger" : "neutral"}>{friendlyReason(item.state)}</Badge></div><p className="mt-2 text-xs text-[var(--text-secondary)]">{item.reasons.join(" ")}</p><p className="mt-2 text-xs text-[var(--text-muted)]">{item.ownerLabel ? `Owner: ${item.ownerLabel}` : "No owner"}{item.dueAt ? ` · Due ${new Date(item.dueAt).toLocaleDateString()}` : " · No date"}</p></div>)}</div> : <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No follow-through intervention is needed from the recorded task board.</p>}
    <div className="mt-4 rounded-lg bg-[var(--surface-0)] p-3 text-sm"><span className="font-medium">Manager's next move:</span> <span className="text-[var(--text-secondary)]">{health.nextAction}</span></div>
  </SurfaceCard></div>;
}

function BandContextCard({ profile, members, health, busy, onSaveProfile, onAddMember, onUpdateMember }: { profile: ManagerProfile; members: BandMember[]; health: ManagerContextHealth; busy: boolean; onSaveProfile: (payload: unknown) => Promise<void>; onAddMember: (payload: unknown) => Promise<void>; onUpdateMember: (id: string, payload: unknown) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [bandMode, setBandMode] = useState(profile.bandMode);
  const [careerStage, setCareerStage] = useState(profile.careerStage ?? "");
  const [homeCity, setHomeCity] = useState(profile.homeCity ?? "");
  const [homeRegion, setHomeRegion] = useState(profile.homeRegion ?? "");
  const [homeCountry, setHomeCountry] = useState(profile.homeCountry ?? "US");
  const [genres, setGenres] = useState(profile.genres.join(", "));
  const [ambition, setAmbition] = useState(profile.twelveMonthAmbition ?? "");
  const [constraints, setConstraints] = useState(profile.constraints.join("\n"));
  const [availability, setAvailability] = useState(profile.availabilityExpectations ?? "");
  const [revenueSources, setRevenueSources] = useState(profile.revenueSources.join("\n"));
  const [assets, setAssets] = useState(profile.currentAssets.join("\n"));
  const [budget, setBudget] = useState(profile.budgetToleranceMinor == null ? "" : String(profile.budgetToleranceMinor / 100));
  const [businessName, setBusinessName] = useState(profile.businessName ?? "");
  const [educationTopics, setEducationTopics] = useState(profile.educationTopics.join(", "));
  const [currency, setCurrency] = useState(profile.currency || "USD");
  const [cadence, setCadence] = useState(profile.communicationCadence ?? "weekly");
  const [decisionStyle, setDecisionStyle] = useState(profile.decisionStyle ?? "guided");
  useEffect(() => {
    if (editing) return;
    setBandMode(profile.bandMode); setCareerStage(profile.careerStage ?? ""); setHomeCity(profile.homeCity ?? ""); setHomeRegion(profile.homeRegion ?? ""); setHomeCountry(profile.homeCountry ?? "US"); setGenres(profile.genres.join(", ")); setAmbition(profile.twelveMonthAmbition ?? ""); setConstraints(profile.constraints.join("\n")); setAvailability(profile.availabilityExpectations ?? ""); setRevenueSources(profile.revenueSources.join("\n")); setAssets(profile.currentAssets.join("\n")); setBudget(profile.budgetToleranceMinor == null ? "" : String(profile.budgetToleranceMinor / 100)); setBusinessName(profile.businessName ?? ""); setEducationTopics(profile.educationTopics.join(", ")); setCurrency(profile.currency || "USD"); setCadence(profile.communicationCadence ?? "weekly"); setDecisionStyle(profile.decisionStyle ?? "guided");
  }, [profile, editing]);
  const budgetNumber = budget.trim() === "" ? null : Number(budget);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (budgetNumber !== null && (!Number.isFinite(budgetNumber) || budgetNumber < 0)) return;
    try {
      await onSaveProfile({ bandMode, careerStage: careerStage.trim() || null, homeCity: homeCity.trim() || null, homeRegion: homeRegion.trim() || null, homeCountry: homeCountry.trim() || null, genres: splitComma(genres), businessName: businessName.trim() || null, revenueSources: splitLines(revenueSources), currentAssets: splitLines(assets), constraints: splitLines(constraints), educationTopics: splitComma(educationTopics), availabilityExpectations: availability.trim() || null, budgetToleranceMinor: budgetNumber === null ? null : Math.round(budgetNumber * 100), currency: currency.trim().toUpperCase(), twelveMonthAmbition: ambition.trim() || null, communicationCadence: cadence, decisionStyle });
      setEditing(false);
    } catch { /* parent displays request errors */ }
  }
  return <div data-testid="manager-context"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Band context</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{health.summary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">This score measures recorded context, not the band's quality or potential.</p></div><div className="flex items-center gap-2"><Badge variant={health.status === "strong" ? "success" : health.status === "usable" ? "warning" : "neutral"}>{health.score}/100 · {friendlyReason(health.status)}</Badge><button className="sb-btn-secondary" disabled={busy} onClick={() => setEditing((value) => !value)}><Pencil className="h-4 w-4" /> {editing ? "Close" : "Edit context"}</button></div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{health.dimensions.map((dimension) => <div className="rounded-lg border border-[var(--border)] p-3" key={dimension.section}><div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{friendlyReason(dimension.section)}</span><span>{dimension.score}/25</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${dimension.score * 4}%` }} /></div><p className="mt-2 text-xs text-[var(--text-muted)]">{dimension.detail}</p></div>)}</div>
    {health.gaps.length ? <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">What would make advice more specific</p><ol className="mt-3 space-y-3">{health.gaps.slice(0, 3).map((gap, index) => <li className="flex gap-3 text-sm" key={gap.code}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-xs font-semibold text-[var(--accent)]">{index + 1}</span><span><span className="font-medium">{gap.question}</span><span className="mt-1 block text-xs text-[var(--text-muted)]">{gap.reason}</span></span></li>)}</ol></div> : null}
    {editing ? <form className="mt-5 space-y-5 border-t border-[var(--border)] pt-5" onSubmit={(event) => void save(event)}><div><p className="sb-kicker">Operating profile</p><div className="mt-3 grid gap-4 md:grid-cols-3"><label><span className="sb-label">Band mode</span><select className="sb-select mt-1.5 w-full" value={bandMode} onChange={(event) => setBandMode(event.target.value as typeof bandMode)}><option value="original">Original music</option><option value="cover_event">Cover / event band</option><option value="hybrid">Both</option></select></label><label><span className="sb-label">Career stage</span><input className="sb-input mt-1.5" value={careerStage} maxLength={120} onChange={(event) => setCareerStage(event.target.value)} /></label><label><span className="sb-label">Genres</span><input className="sb-input mt-1.5" value={genres} onChange={(event) => setGenres(event.target.value)} placeholder="rock, soul" /></label><label><span className="sb-label">Home city</span><input className="sb-input mt-1.5" value={homeCity} maxLength={120} onChange={(event) => setHomeCity(event.target.value)} /></label><label><span className="sb-label">Home region</span><input className="sb-input mt-1.5" value={homeRegion} maxLength={120} onChange={(event) => setHomeRegion(event.target.value)} /></label><label><span className="sb-label">Home country</span><input className="sb-input mt-1.5" value={homeCountry} maxLength={120} onChange={(event) => setHomeCountry(event.target.value)} /></label><label className="md:col-span-3"><span className="sb-label">Twelve-month ambition</span><textarea className="sb-input mt-1.5 min-h-20" value={ambition} maxLength={2000} onChange={(event) => setAmbition(event.target.value)} /></label><label><span className="sb-label">Constraints (one per line)</span><textarea className="sb-input mt-1.5 min-h-28" value={constraints} onChange={(event) => setConstraints(event.target.value)} /></label><label><span className="sb-label">Current revenue sources (one per line)</span><textarea className="sb-input mt-1.5 min-h-28" value={revenueSources} onChange={(event) => setRevenueSources(event.target.value)} /></label><label><span className="sb-label">Usable assets (one per line)</span><textarea className="sb-input mt-1.5 min-h-28" value={assets} onChange={(event) => setAssets(event.target.value)} /></label><label className="md:col-span-2"><span className="sb-label">Availability expectations</span><textarea className="sb-input mt-1.5 min-h-20" value={availability} maxLength={1000} onChange={(event) => setAvailability(event.target.value)} placeholder="Respond to holds within 48 hours; protect two weekends per month." /></label><label><span className="sb-label">90-day budget ceiling</span><div className="mt-1.5 flex"><select className="sb-select rounded-r-none" aria-label="Budget currency" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select><input className="sb-input rounded-l-none" type="number" min="0" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="0 is valid" /></div></label><label><span className="sb-label">Business or payment name</span><input className="sb-input mt-1.5" value={businessName} maxLength={200} onChange={(event) => setBusinessName(event.target.value)} /></label><label><span className="sb-label">Topics to explain</span><input className="sb-input mt-1.5" value={educationTopics} onChange={(event) => setEducationTopics(event.target.value)} placeholder="settlements, publishing, guarantees" /></label><label><span className="sb-label">Brief cadence</span><select className="sb-select mt-1.5 w-full" value={cadence} onChange={(event) => setCadence(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label><span className="sb-label">Decision guidance</span><select className="sb-select mt-1.5 w-full" value={decisionStyle} onChange={(event) => setDecisionStyle(event.target.value)}><option value="guided">Guided</option><option value="concise">Concise</option><option value="detailed">Detailed</option></select></label></div><button className="sb-btn-primary mt-4" disabled={busy || (budgetNumber !== null && (!Number.isFinite(budgetNumber) || budgetNumber < 0))}><Save className="h-4 w-4" /> Save operating profile</button></div><BandMemberContext members={members} busy={busy} onAdd={onAddMember} onUpdate={onUpdateMember} /></form> : null}
  </SurfaceCard></div>;
}

function BandMemberContext({ members, busy, onAdd, onUpdate }: { members: BandMember[]; busy: boolean; onAdd: (payload: unknown) => Promise<void>; onUpdate: (id: string, payload: unknown) => Promise<void> }) {
  const [name, setName] = useState(""); const [roles, setRoles] = useState(""); const [instruments, setInstruments] = useState("");
  async function add() { try { await onAdd({ name, roles: splitComma(roles), instruments: splitComma(instruments), active: true }); setName(""); setRoles(""); setInstruments(""); } catch { /* parent displays request errors */ } }
  return <div><p className="sb-kicker">Working lineup</p><p className="mt-1 text-sm text-[var(--text-muted)]">These are performers and crew, separate from StoryBoard login access.</p><div className="mt-3 space-y-3">{members.map((member) => <BandMemberContextRow member={member} busy={busy} onSave={onUpdate} key={member.id} />)}</div><div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><p className="text-sm font-medium">Add a working member</p><div className="mt-3 grid gap-2 md:grid-cols-3"><label><span className="sb-label">New member name</span><input className="sb-input mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span className="sb-label">New member responsibilities</span><input className="sb-input mt-1" value={roles} onChange={(event) => setRoles(event.target.value)} placeholder="bandleader, booking" /></label><label><span className="sb-label">New member instruments</span><input className="sb-input mt-1" value={instruments} onChange={(event) => setInstruments(event.target.value)} placeholder="vocals, guitar" /></label></div><button type="button" className="sb-btn-secondary mt-3" disabled={busy || !name.trim()} onClick={() => void add()}><Plus className="h-4 w-4" /> Add member</button></div></div>;
}

function BandMemberContextRow({ member, busy, onSave }: { member: BandMember; busy: boolean; onSave: (id: string, payload: unknown) => Promise<void> }) {
  const [roles, setRoles] = useState(member.roles.join(", ")); const [instruments, setInstruments] = useState(member.instruments.join(", "));
  useEffect(() => { setRoles(member.roles.join(", ")); setInstruments(member.instruments.join(", ")); }, [member]);
  return <div className="grid gap-2 rounded-lg border border-[var(--border)] p-3 md:grid-cols-[minmax(8rem,0.5fr)_1fr_1fr_auto] md:items-end"><div><p className="text-sm font-medium">{member.name}</p><p className="text-xs text-[var(--text-muted)]">Active working member</p></div><label><span className="sb-label">Responsibilities for {member.name}</span><input className="sb-input mt-1" value={roles} onChange={(event) => setRoles(event.target.value)} /></label><label><span className="sb-label">Instruments for {member.name}</span><input className="sb-input mt-1" value={instruments} onChange={(event) => setInstruments(event.target.value)} /></label><button type="button" className="sb-btn-ghost" disabled={busy} onClick={() => void onSave(member.id, { roles: splitComma(roles), instruments: splitComma(instruments) })}><Save className="h-4 w-4" /> Save</button></div>;
}

function OutcomeReviewCard({ review }: { review: ManagerOutcomeReview }) {
  return <div data-testid="manager-outcome-review"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Recent outcomes</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{review.headline}</p></div><Badge variant={review.confidenceLabel === "high" ? "success" : review.confidenceLabel === "medium" ? "warning" : "neutral"}>{review.confidenceLabel} confidence</Badge></div>
    <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5"><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Shows completed</dt><dd className="mt-1 text-xl font-semibold">{review.activity.completedShows}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Attendance recorded</dt><dd className="mt-1 text-xl font-semibold">{review.live.attendanceRecordedShows ? review.live.attendanceTotal : "—"}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Projects completed</dt><dd className="mt-1 text-xl font-semibold">{review.activity.completedProjects}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Tasks completed</dt><dd className="mt-1 text-xl font-semibold">{review.activity.completedTasks}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Campaign bookings</dt><dd className="mt-1 text-xl font-semibold">{review.activity.booking.booked}</dd></div></dl>
    {review.financials.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{review.financials.map((row) => <div key={row.currency} className="rounded-lg bg-[var(--surface-0)] p-3 text-sm"><p className="font-medium">{row.currency} recorded results</p><p className="mt-1 text-[var(--text-secondary)]">Gross {outcomeMoney(row.grossMinor, row.currency)} · expenses {outcomeMoney(row.expenseMinor, row.currency)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{row.netKnownShows ? `${row.finalizedSettlements === row.netKnownShows ? "Finalized net" : "Recorded settlement net (includes draft work)"} ${outcomeMoney(row.settledNetMinor, row.currency)} across ${row.netKnownShows} show${row.netKnownShows === 1 ? "" : "s"}.` : "Net is not established until settlement is recorded."}</p></div>)}</div> : null}
    {review.recordedLessons.length ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">What the band recorded</p><div className="mt-2 grid gap-3 md:grid-cols-2">{review.recordedLessons.slice(0, 4).map((lesson) => <div key={lesson.eventId} className="rounded-lg border border-[var(--border)] p-3"><p className="text-sm font-medium">{lesson.title}</p>{lesson.postShowNotes ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{lesson.postShowNotes}</p> : null}{lesson.relationshipOutcome ? <p className="mt-2 text-xs text-[var(--text-muted)]">Relationship: {lesson.relationshipOutcome}</p> : null}</div>)}</div></div> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-2">{review.attention[0] ? <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">First gap to close</p><p className="mt-1 font-medium">{review.attention[0].title}</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{review.attention[0].detail}</p></div> : <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Recorded outcomes are complete</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{review.nextAction}</p></div>}{review.questions[0] ? <div className="rounded-lg border border-[var(--border)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Manager needs to know</p><p className="mt-1 text-sm font-medium">{review.questions[0].question}</p><a className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline" href="/operations">Record the post-show facts</a></div> : <div className="rounded-lg border border-[var(--border)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Next move</p><p className="mt-1 text-sm text-[var(--text-secondary)]">{review.nextAction}</p></div>}</div>
  </SurfaceCard></div>;
}

function reviewDateFrom(createdAt: string, days = 30) {
  return new Date(new Date(createdAt).getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function DecisionBoard({ decisions, busy, onCreate, onDecide, onReview }: { decisions: ManagerDecision[]; busy: boolean; onCreate: (payload: unknown) => Promise<void>; onDecide: (id: string, payload: unknown) => Promise<void>; onReview: (id: string, payload: unknown) => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [workstream, setWorkstream] = useState("live");
  const [options, setOptions] = useState<ManagerDecisionOption[]>([{ label: "", tradeoff: "" }, { label: "", tradeoff: "" }]);
  const active = decisions.filter((decision) => decision.status === "open" || decision.status === "decided");
  const reviewed = decisions.filter((decision) => decision.status === "reviewed").slice(0, 3);
  function updateOption(index: number, field: keyof ManagerDecisionOption, value: string) { setOptions((current) => current.map((option, position) => position === index ? { ...option, [field]: value } : option)); }
  function reset() { setTitle(""); setContext(""); setWorkstream("live"); setOptions([{ label: "", tradeoff: "" }, { label: "", tradeoff: "" }]); setCreating(false); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try { await onCreate({ workstream, title, context: context.trim() || null, options, evidence: [] }); reset(); } catch { /* parent displays request errors */ }
  }
  return <SurfaceCard data-testid="manager-decisions"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Band decisions</h2></div><p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">Write down the options before the band chooses. Record what you expect to happen, then return on the review date and compare it with the actual result.</p></div><button className="sb-btn-secondary" disabled={busy} onClick={() => setCreating((value) => !value)}><Plus className="h-4 w-4" /> {creating ? "Close" : "New decision"}</button></div>
    {creating ? <form className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4" onSubmit={(event) => void submit(event)}><div className="grid gap-4 md:grid-cols-3"><label className="md:col-span-2"><span className="sb-label">What does the band need to decide?</span><input className="sb-input mt-1.5" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Which regional market should we focus on next?" /></label><label><span className="sb-label">Area</span><select className="sb-select mt-1.5 w-full" value={workstream} onChange={(event) => setWorkstream(event.target.value)}>{["live", "releases", "audience", "content", "business", "relationships", "band_operations"].map((item) => <option key={item} value={item}>{friendlyReason(item)}</option>)}</select></label><label className="md:col-span-3"><span className="sb-label">What makes this decision necessary?</span><textarea className="sb-input mt-1.5 min-h-20" maxLength={3000} value={context} onChange={(event) => setContext(event.target.value)} placeholder="Include the constraint, deadline, or disagreement that matters." /></label></div><div className="mt-4 space-y-3"><p className="sb-label">Real options and tradeoffs</p>{options.map((option, index) => <div className="grid gap-2 md:grid-cols-[minmax(10rem,0.7fr)_minmax(14rem,1.3fr)_auto]" key={index}><input className="sb-input" required maxLength={200} aria-label={`Option ${index + 1}`} value={option.label} onChange={(event) => updateOption(index, "label", event.target.value)} placeholder={`Option ${index + 1}`} /><input className="sb-input" required maxLength={1000} aria-label={`Option ${index + 1} tradeoff`} value={option.tradeoff} onChange={(event) => updateOption(index, "tradeoff", event.target.value)} placeholder="What does this gain, cost, or risk?" />{options.length > 2 ? <button type="button" className="sb-btn-ghost px-3" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions((current) => current.filter((_, position) => position !== index))}><X className="h-4 w-4" /></button> : <span />}</div>)}</div><div className="mt-4 flex flex-wrap gap-2">{options.length < 6 ? <button type="button" className="sb-btn-ghost" onClick={() => setOptions((current) => [...current, { label: "", tradeoff: "" }])}><Plus className="h-4 w-4" /> Add option</button> : null}<button className="sb-btn-primary" disabled={busy}>Save options</button><button type="button" className="sb-btn-ghost" onClick={reset} disabled={busy}>Cancel</button></div></form> : null}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">{active.map((decision) => <DecisionCard key={decision.id} decision={decision} busy={busy} onDecide={onDecide} onReview={onReview} />)}{!active.length ? <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-muted)]">No choice is waiting. Use this when the band has a real tradeoff worth learning from—not for routine tasks.</div> : null}</div>
    {reviewed.length ? <div className="mt-5 border-t border-[var(--border)] pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recently reviewed</p><div className="mt-3 grid gap-3 md:grid-cols-3">{reviewed.map((decision) => <div className="rounded-lg border border-[var(--border)] p-3" key={decision.id}><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{decision.title}</p><Badge variant={decision.reviewOutcome === "worked" ? "success" : decision.reviewOutcome === "did_not_work" ? "danger" : "neutral"}>{friendlyReason(decision.reviewOutcome ?? "reviewed")}</Badge></div><p className="mt-2 text-xs text-[var(--text-secondary)]">Chose “{decision.choice}”. {decision.reviewNote}</p></div>)}</div></div> : null}
  </SurfaceCard>;
}

function DecisionCard({ decision, busy, onDecide, onReview }: { decision: ManagerDecision; busy: boolean; onDecide: (id: string, payload: unknown) => Promise<void>; onReview: (id: string, payload: unknown) => Promise<void> }) {
  const [choice, setChoice] = useState(decision.choice ?? "");
  const [rationale, setRationale] = useState(decision.rationale ?? "");
  const [expectedOutcome, setExpectedOutcome] = useState(decision.expectedOutcome ?? "");
  const [reviewAt, setReviewAt] = useState(decision.reviewAt?.slice(0, 10) ?? reviewDateFrom(decision.createdAt));
  const [editingFrame, setEditingFrame] = useState(Boolean(decision.needsFraming));
  const [frameTitle, setFrameTitle] = useState(decision.title);
  const [frameContext, setFrameContext] = useState(decision.context ?? "");
  const [frameWorkstream, setFrameWorkstream] = useState(decision.workstream);
  const [frameOptions, setFrameOptions] = useState<ManagerDecisionOption[]>(decision.options);
  const [reviewing, setReviewing] = useState(false);
  const [outcome, setOutcome] = useState<"worked" | "mixed" | "did_not_work" | "inconclusive">("worked");
  const [reviewNote, setReviewNote] = useState("");
  const due = Boolean(decision.reviewAt && new Date(decision.reviewAt) <= new Date());
  useEffect(() => { setFrameTitle(decision.title); setFrameContext(decision.context ?? ""); setFrameWorkstream(decision.workstream); setFrameOptions(decision.options); if (decision.needsFraming) setEditingFrame(true); }, [decision]);
  function updateFrameOption(index: number, field: keyof ManagerDecisionOption, value: string) { setFrameOptions((current) => current.map((option, position) => position === index ? { ...option, [field]: value } : option)); }
  async function saveFrame() {
    try { await onDecide(decision.id, { title: frameTitle, context: frameContext.trim() || null, workstream: frameWorkstream, options: frameOptions }); setChoice((current) => frameOptions.some((option) => option.label === current) ? current : ""); setEditingFrame(false); } catch { /* parent displays request errors */ }
  }
  async function decide() {
    try { await onDecide(decision.id, { choice, rationale, expectedOutcome, reviewAt: new Date(`${reviewAt}T12:00:00.000Z`).toISOString() }); } catch { /* parent displays request errors */ }
  }
  async function review() {
    try { await onReview(decision.id, { outcome, note: reviewNote, evidence: [] }); setReviewing(false); setReviewNote(""); } catch { /* parent displays request errors */ }
  }
  const frameValid = frameTitle.trim() && frameOptions.length >= 2 && frameOptions.every((option) => option.label.trim() && option.tradeoff.trim()) && new Set(frameOptions.map((option) => option.label.trim().toLocaleLowerCase())).size === frameOptions.length;
  return <div className={`rounded-xl border p-4 ${due ? "border-amber-500/35 bg-amber-500/5" : decision.needsFraming ? "border-violet-500/35 bg-violet-500/5" : "border-[var(--border)] bg-[var(--surface-0)]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{friendlyReason(decision.workstream)}</p><h3 className="mt-1 font-semibold">{decision.title}</h3>{decision.context ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{decision.context}</p> : null}</div><Badge variant={due ? "warning" : decision.status === "decided" ? "violet" : "neutral"}>{due ? "review due" : decision.needsFraming ? "needs framing" : decision.status}</Badge></div>
    {decision.status === "open" && editingFrame ? <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><p className="text-sm font-medium">Review the decision framing</p><p className="text-xs text-[var(--text-muted)]">Conversation can prepare a draft, but only the band can establish the real options and tradeoffs.</p><label className="block"><span className="sb-label">Decision framing title</span><input className="sb-input mt-1" value={frameTitle} maxLength={200} onChange={(event) => setFrameTitle(event.target.value)} /></label><label className="block"><span className="sb-label">Decision framing context</span><textarea className="sb-input mt-1 min-h-16" value={frameContext} maxLength={3000} onChange={(event) => setFrameContext(event.target.value)} /></label><label className="block"><span className="sb-label">Decision framing area</span><select className="sb-select mt-1 w-full" value={frameWorkstream} onChange={(event) => setFrameWorkstream(event.target.value)}>{["live", "releases", "audience", "content", "business", "relationships", "band_operations"].map((item) => <option key={item} value={item}>{friendlyReason(item)}</option>)}</select></label><div className="space-y-2">{frameOptions.map((option, index) => <div className="grid gap-2 md:grid-cols-[0.7fr_1.3fr_auto]" key={index}><input className="sb-input" aria-label={`Framing option ${index + 1}`} value={option.label} maxLength={200} onChange={(event) => updateFrameOption(index, "label", event.target.value)} /><input className="sb-input" aria-label={`Framing option ${index + 1} tradeoff`} value={option.tradeoff} maxLength={1000} onChange={(event) => updateFrameOption(index, "tradeoff", event.target.value)} />{frameOptions.length > 2 ? <button type="button" className="sb-btn-ghost px-3" aria-label={`Remove framing option ${index + 1}`} onClick={() => setFrameOptions((current) => current.filter((_, position) => position !== index))}><X className="h-4 w-4" /></button> : <span />}</div>)}</div><div className="flex flex-wrap gap-2">{frameOptions.length < 6 ? <button type="button" className="sb-btn-ghost" onClick={() => setFrameOptions((current) => [...current, { label: "", tradeoff: "" }])}><Plus className="h-4 w-4" /> Add option</button> : null}<button type="button" className="sb-btn-primary" disabled={busy || !frameValid} onClick={() => void saveFrame()}><Save className="h-4 w-4" /> Save framing</button>{!decision.needsFraming ? <button type="button" className="sb-btn-ghost" disabled={busy} onClick={() => setEditingFrame(false)}>Cancel</button> : null}</div></div> : null}
    {decision.status === "open" && !editingFrame ? <div className="mt-4 space-y-3"><div className="flex justify-end"><button type="button" className="sb-btn-ghost" disabled={busy} onClick={() => setEditingFrame(true)}><Pencil className="h-4 w-4" /> Edit framing</button></div><fieldset disabled={decision.needsFraming}><legend className="sb-label">Compare the options</legend><div className="mt-2 space-y-2">{decision.options.map((option) => <label className={`block cursor-pointer rounded-lg border p-3 ${choice === option.label ? "border-[var(--accent)] bg-[var(--accent-muted)]" : "border-[var(--border)]"}`} key={option.label}><span className="flex gap-2"><input type="radio" name={`choice-${decision.id}`} value={option.label} checked={choice === option.label} onChange={() => setChoice(option.label)} /><span><span className="text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs text-[var(--text-secondary)]">{option.tradeoff}</span></span></span></label>)}</div></fieldset><label className="block"><span className="sb-label">Why this choice?</span><textarea className="sb-input mt-1.5 min-h-16" maxLength={2000} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label><label className="block"><span className="sb-label">What result do you expect?</span><textarea className="sb-input mt-1.5 min-h-16" maxLength={2000} value={expectedOutcome} onChange={(event) => setExpectedOutcome(event.target.value)} placeholder="A result the band can later observe—not a guarantee." /></label><label className="block"><span className="sb-label">Check the result on</span><input className="sb-input mt-1.5" type="date" value={reviewAt} onChange={(event) => setReviewAt(event.target.value)} /></label><button className="sb-btn-primary" disabled={busy || decision.needsFraming || !choice || !rationale.trim() || !expectedOutcome.trim() || !reviewAt} onClick={() => void decide()}><Check className="h-4 w-4" /> Record the choice</button></div> : null}
    {decision.status !== "open" ? <div className="mt-4"><dl className="space-y-3 text-sm"><div><dt className="text-xs text-[var(--text-muted)]">Choice</dt><dd className="font-medium">{decision.choice}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Why</dt><dd className="text-[var(--text-secondary)]">{decision.rationale}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Expected result</dt><dd className="text-[var(--text-secondary)]">{decision.expectedOutcome}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Review date</dt><dd>{decision.reviewAt ? new Date(decision.reviewAt).toLocaleDateString() : "Not set"}</dd></div></dl>{reviewing ? <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><label className="block"><span className="sb-label">What was the result?</span><select className="sb-select mt-1.5 w-full" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="worked">Worked</option><option value="mixed">Mixed result</option><option value="did_not_work">Did not work</option><option value="inconclusive">Too early / inconclusive</option></select></label><label className="block"><span className="sb-label">What actually happened, and what should the band carry forward?</span><textarea className="sb-input mt-1.5 min-h-24" maxLength={3000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label><div className="flex gap-2"><button className="sb-btn-primary" disabled={busy || !reviewNote.trim()} onClick={() => void review()}>Save the lesson</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setReviewing(false)}>Cancel</button></div></div> : <button className="sb-btn-secondary mt-4" disabled={busy} onClick={() => setReviewing(true)}>{due ? "Review the result" : "Record an early result"}</button>}</div> : null}
  </div>;
}

function ManagerMessageBubble({ message, busy, evalExamples, responseEvalExamples, onAcceptRecommendation, onDismissRecommendation, onPromoteEval, onPromoteResponseEval, onFeedback }: {
  message: ManagerMessage;
  busy: boolean;
  evalExamples: ManagerEvalExample[] | null;
  responseEvalExamples: ManagerResponseEvalExample[] | null;
  onAcceptRecommendation: (recommendationId: string) => Promise<void>;
  onDismissRecommendation: (recommendationId: string, reason: string) => Promise<void>;
  onPromoteEval: (recommendationId: string, outcome: string) => Promise<void>;
  onPromoteResponseEval: (messageId: string, payload: { label: "useful" | "needs_revision"; expectedBehavior?: string | null }) => Promise<void>;
  onFeedback: (messageId: string, payload: { helpful: boolean; reason?: string | null; note?: string | null }) => Promise<void>;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [reviewingEval, setReviewingEval] = useState(false);
  const [reason, setReason] = useState(message.feedback?.reason ?? "missed_question");
  const [note, setNote] = useState(message.feedback?.note ?? "");
  const [expectedBehavior, setExpectedBehavior] = useState(message.feedback?.note ?? "");
  useEffect(() => { if (message.feedback?.note) setExpectedBehavior(message.feedback.note); }, [message.feedback?.note]);
  if (message.role === "user") return <div className="ml-8 rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-3 text-sm leading-6 text-white"><p className="whitespace-pre-wrap">{message.content}</p></div>;
  async function saveCorrection() {
    try { await onFeedback(message.id, { helpful: false, reason, note: note.trim() || null }); setCorrecting(false); }
    catch { /* parent displays the request error */ }
  }
  async function markHelpful() {
    try { await onFeedback(message.id, { helpful: true }); setCorrecting(false); }
    catch { /* parent displays the request error */ }
  }
  async function addResponseEval() {
    try {
      await onPromoteResponseEval(message.id, message.feedback?.helpful ? { label: "useful" } : { label: "needs_revision", expectedBehavior: expectedBehavior.trim() });
      setReviewingEval(false);
    } catch { /* parent displays the request error */ }
  }
  const responseEval = responseEvalExamples?.find((example) => example.managerMessageId === message.id) ?? null;
  return <div className="mr-4 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3 text-sm leading-6">
    <p className="whitespace-pre-wrap">{message.content}</p>
    {message.citations.length ? <p className="mt-3 text-xs text-[var(--text-muted)]">Grounded in {message.citations.length} StoryBoard record{message.citations.length === 1 ? "" : "s"}</p> : null}
    {message.proposedActions.map((action) => <div key={action.recommendationId} className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{managerActionLabel(action.actionType)}</p><p className="mt-1 font-medium">{action.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{action.nextAction}</p>{action.outcome === "suggested" ? <div className="mt-3 flex flex-wrap gap-2"><button className="sb-btn-primary" disabled={busy} onClick={() => void onAcceptRecommendation(action.recommendationId)}><Check className="h-4 w-4" /> {managerActionButton(action.actionType)}</button><button className="sb-btn-ghost" disabled={busy} onClick={() => void onDismissRecommendation(action.recommendationId, "not_relevant")}>Not useful</button></div> : <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant={action.outcome === "dismissed" ? "neutral" : "success"}>{action.outcome}</Badge>{evalExamples ? evalExamples.some((example) => example.recommendationId === action.recommendationId) ? <Badge variant="violet">in eval set</Badge> : <button className="sb-btn-ghost" disabled={busy} onClick={() => void onPromoteEval(action.recommendationId, action.outcome)}>Add to eval set</button> : null}</div>}</div>)}
    {correcting ? <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><label><span className="sb-label">What should improve?</span><select className="sb-select mt-1 w-full" value={reason} onChange={(event) => setReason(event.target.value)}><option value="missed_question">Missed my question</option><option value="incorrect">Something was incorrect</option><option value="too_vague">Too vague</option><option value="too_long">Too long</option><option value="wrong_tone">Tone felt wrong</option><option value="missing_context">Missing context</option><option value="other">Other</option></select></label><label className="mt-2 block"><span className="sb-label">Correction (optional)</span><input className="sb-input mt-1 w-full" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="What would have made this useful?" /></label><div className="mt-3 flex gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => void saveCorrection()}>Save feedback</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setCorrecting(false)}>Cancel</button></div></div> : <div className="mt-3 flex items-center gap-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]"><span className="mr-1">Was this useful?</span><button className={message.feedback?.helpful ? "rounded-md bg-[var(--accent-muted)] px-2 py-1 text-[var(--accent)]" : "rounded-md px-2 py-1 hover:bg-[var(--surface-1)]"} disabled={busy} onClick={() => void markHelpful()}><ThumbsUp className="mr-1 inline h-3.5 w-3.5" /> Helpful</button><button className={message.feedback && !message.feedback.helpful ? "rounded-md bg-[var(--accent-muted)] px-2 py-1 text-[var(--accent)]" : "rounded-md px-2 py-1 hover:bg-[var(--surface-1)]"} disabled={busy} onClick={() => setCorrecting(true)}><ThumbsDown className="mr-1 inline h-3.5 w-3.5" /> Needs work</button>{message.feedback ? <span className="ml-auto">Saved</span> : null}</div>}
    {responseEvalExamples && message.feedback ? responseEval ? <div className="mt-2 flex justify-end"><Badge variant={responseEval.label === "useful" ? "success" : "warning"}>answer in eval set</Badge></div> : message.feedback.helpful ? <div className="mt-2 flex justify-end"><button className="sb-btn-ghost" disabled={busy} onClick={() => void addResponseEval()}><ShieldCheck className="h-4 w-4" /> Add answer to evals</button></div> : reviewingEval ? <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><p className="text-sm font-medium">Capture the expected behavior</p><p className="mt-1 text-xs text-[var(--text-muted)]">This unresolved example will block the current intelligence release gate.</p><label className="mt-2 block"><span className="sb-label">What should the Manager do instead?</span><textarea className="sb-input mt-1 min-h-20 w-full" value={expectedBehavior} maxLength={3000} onChange={(event) => setExpectedBehavior(event.target.value)} /></label><div className="mt-3 flex gap-2"><button className="sb-btn-secondary" disabled={busy || expectedBehavior.trim().length < 10} onClick={() => void addResponseEval()}>Save eval example</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setReviewingEval(false)}>Cancel</button></div></div> : <div className="mt-2 flex justify-end"><button className="sb-btn-ghost" disabled={busy} onClick={() => setReviewingEval(true)}><ShieldCheck className="h-4 w-4" /> Add answer to evals</button></div> : null}
  </div>;
}

function friendlyReason(reason: string) {
  return reason.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function managerActionLabel(actionType?: string | null) {
  if (actionType === "create_decision") return "Suggested open decision";
  if (actionType === "generate_event_advance") return "Suggested show setup";
  if (actionType === "generate_project_plan") return "Suggested project setup";
  return "Suggested internal task";
}

function managerActionButton(actionType?: string | null) {
  if (actionType === "create_decision") return "Add decision draft";
  if (actionType === "generate_event_advance") return "Build advance";
  if (actionType === "generate_project_plan") return "Build milestone plan";
  if (actionType === "create_task") return "Add task";
  return "Accept";
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
