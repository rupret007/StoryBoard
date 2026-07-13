"use client";

import { Badge, EmptyState, SurfaceCard } from "@storyboard/ui";
import { Activity, Archive, ArrowUpRight, BrainCircuit, CalendarRange, Check, CircleAlert, CircleHelp, ClipboardList, Clock3, GitCompareArrows, ListChecks, MessageSquareText, Pencil, Plus, RefreshCw, Route, Save, Send, ShieldCheck, Target, ThumbsDown, ThumbsUp, TrendingUp, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { BandMember, BandMemberCheckIn, ManagerCommitmentHealth, ManagerContextHealth, ManagerConversation, ManagerConversationSummary, ManagerDecision, ManagerDecisionOption, ManagerEvalExample, ManagerEvaluationRun, ManagerEvidenceHealth, ManagerFollowThrough, ManagerFollowThroughItem, ManagerGoal, ManagerGoalMeasurement, ManagerGoalMeasurementKind, ManagerGoalPath, ManagerGoalProgressEvent, ManagerGoalTargetDirection, ManagerKnowledgeHealth, ManagerLearningSummary, ManagerMemoryFact, ManagerMessage, ManagerMessageFeedback, ManagerOutcomeReview, ManagerPlanHealth, ManagerProfile, ManagerProviderContextPolicy, ManagerRecommendation, ManagerRecommendationEvalReviewQueue, ManagerResponseEvalExample, ManagerResponseEvalReviewQueue, ManagerResponseReviewQueue, ManagerRun, ManagerSettings, ManagerTeamLoad, ManagerWorkSequence } from "@/lib/types";
import { ManagerCadenceCard } from "./manager-cadence-card";

export function ManagerClient({ activeArtistId, initialProfile, initialMembers, initialMemberCheckIns, initialGoals, initialGoalMeasurements, initialDecisions, initialBrief, initialConversations, initialConversation, initialMemory, initialLearning, initialFollowThrough, initialRecommendationEvalReview, initialResponseReview, initialResponseEvalReview, initialPlanHealth, initialContextHealth, initialKnowledgeHealth, initialEvidenceHealth, initialGoalPath, initialWorkSequence, initialCommitmentHealth, initialTeamLoad, initialOutcomeReview, initialEvalExamples, initialResponseEvalExamples, initialEvaluation, initialSettings, initialProviderContextPolicy, isOwner, canManage }: { activeArtistId: string | null; initialProfile: ManagerProfile | null; initialMembers: BandMember[]; initialMemberCheckIns: BandMemberCheckIn[]; initialGoals: ManagerGoal[]; initialGoalMeasurements: ManagerGoalMeasurement[]; initialDecisions: ManagerDecision[]; initialBrief: ManagerRun | null; initialConversations: ManagerConversationSummary[]; initialConversation: ManagerConversation | null; initialMemory: ManagerMemoryFact[]; initialLearning: ManagerLearningSummary | null; initialFollowThrough: ManagerFollowThrough | null; initialRecommendationEvalReview: ManagerRecommendationEvalReviewQueue | null; initialResponseReview: ManagerResponseReviewQueue | null; initialResponseEvalReview: ManagerResponseEvalReviewQueue | null; initialPlanHealth: ManagerPlanHealth | null; initialContextHealth: ManagerContextHealth | null; initialKnowledgeHealth: ManagerKnowledgeHealth | null; initialEvidenceHealth: ManagerEvidenceHealth | null; initialGoalPath: ManagerGoalPath | null; initialWorkSequence: ManagerWorkSequence | null; initialCommitmentHealth: ManagerCommitmentHealth | null; initialTeamLoad: ManagerTeamLoad | null; initialOutcomeReview: ManagerOutcomeReview | null; initialEvalExamples: ManagerEvalExample[] | null; initialResponseEvalExamples: ManagerResponseEvalExample[] | null; initialEvaluation: ManagerEvaluationRun | null; initialSettings: ManagerSettings | null; initialProviderContextPolicy: ManagerProviderContextPolicy | null; isOwner: boolean; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(initialConversation?.id ?? null);
  const [conversations, setConversations] = useState(initialConversations);
  const conversationArtistId = useRef(activeArtistId);
  const [messages, setMessages] = useState<ManagerMessage[]>(initialConversation?.messages ?? []);
  const [memory, setMemory] = useState(initialMemory);
  const [profile, setProfile] = useState(initialProfile);
  const [members, setMembers] = useState(initialMembers);
  const [memberCheckIns, setMemberCheckIns] = useState(initialMemberCheckIns);
  const [teamLoad, setTeamLoad] = useState(initialTeamLoad);
  const [goals, setGoals] = useState(initialGoals);
  const [goalMeasurements, setGoalMeasurements] = useState(initialGoalMeasurements);
  const [decisions, setDecisions] = useState(initialDecisions);
  const [planHealth, setPlanHealth] = useState(initialPlanHealth);
  const [contextHealth, setContextHealth] = useState(initialContextHealth);
  const [knowledgeHealth, setKnowledgeHealth] = useState(initialKnowledgeHealth);
  const [dismissTarget, setDismissTarget] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("not_relevant");
  const [evalExamples, setEvalExamples] = useState(initialEvalExamples);
  const [responseEvalExamples, setResponseEvalExamples] = useState(initialResponseEvalExamples);
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [learning, setLearning] = useState(initialLearning);
  const [followThrough, setFollowThrough] = useState(initialFollowThrough);
  const [recommendationEvalReview, setRecommendationEvalReview] = useState(initialRecommendationEvalReview);
  const [responseReview, setResponseReview] = useState(initialResponseReview);
  const [responseEvalReview, setResponseEvalReview] = useState(initialResponseEvalReview);
  const [brief, setBrief] = useState(initialBrief);
  const [briefCadence, setBriefCadence] = useState<"daily" | "weekly">(initialBrief?.cadence === "weekly" ? "weekly" : initialProfile?.communicationCadence === "weekly" ? "weekly" : "daily");
  const briefArtistId = useRef(activeArtistId);
  const briefCadenceChosen = useRef(false);
  useEffect(() => setGoals(initialGoals), [initialGoals]);
  useEffect(() => setGoalMeasurements(initialGoalMeasurements), [initialGoalMeasurements]);
  useEffect(() => setProfile(initialProfile), [initialProfile]);
  useEffect(() => setMembers(initialMembers), [initialMembers]);
  useEffect(() => setMemberCheckIns(initialMemberCheckIns), [initialMemberCheckIns]);
  useEffect(() => setTeamLoad(initialTeamLoad), [initialTeamLoad]);
  useEffect(() => setDecisions(initialDecisions), [initialDecisions]);
  useEffect(() => setMemory(initialMemory), [initialMemory]);
  useEffect(() => setPlanHealth(initialPlanHealth), [initialPlanHealth]);
  useEffect(() => setContextHealth(initialContextHealth), [initialContextHealth]);
  useEffect(() => setKnowledgeHealth(initialKnowledgeHealth), [initialKnowledgeHealth]);
  useEffect(() => setEvalExamples(initialEvalExamples), [initialEvalExamples]);
  useEffect(() => setResponseEvalExamples(initialResponseEvalExamples), [initialResponseEvalExamples]);
  useEffect(() => setEvaluation(initialEvaluation), [initialEvaluation]);
  useEffect(() => setLearning(initialLearning), [initialLearning]);
  useEffect(() => setFollowThrough(initialFollowThrough), [initialFollowThrough]);
  useEffect(() => setRecommendationEvalReview(initialRecommendationEvalReview), [initialRecommendationEvalReview]);
  useEffect(() => setResponseReview(initialResponseReview), [initialResponseReview]);
  useEffect(() => setResponseEvalReview(initialResponseEvalReview), [initialResponseEvalReview]);
  useEffect(() => {
    const artistChanged = briefArtistId.current !== activeArtistId;
    if (artistChanged) {
      briefArtistId.current = activeArtistId;
      briefCadenceChosen.current = false;
    }
    if (!artistChanged && briefCadenceChosen.current && initialBrief?.cadence !== briefCadence) return;
    setBrief(initialBrief);
    setBriefCadence(initialBrief?.cadence === "weekly" ? "weekly" : initialProfile?.communicationCadence === "weekly" ? "weekly" : "daily");
  }, [activeArtistId, briefCadence, initialBrief, initialProfile?.communicationCadence]);
  useEffect(() => {
    if (conversationArtistId.current !== activeArtistId) {
      conversationArtistId.current = activeArtistId;
      setConversations(initialConversations);
      setConversationId(initialConversation?.id ?? null);
      setMessages(initialConversation?.messages ?? []);
      return;
    }
    setConversations((current) => {
      const merged = new Map(initialConversations.map((item) => [item.id, item]));
      for (const item of current) {
        const server = merged.get(item.id);
        if (!server || new Date(item.updatedAt).getTime() >= new Date(server.updatedAt).getTime()) merged.set(item.id, item);
      }
      return [...merged.values()].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()).slice(0, 10);
    });
  }, [activeArtistId, initialConversation, initialConversations]);
  async function act(path: string, json?: unknown) { setBusy(true); setError(""); try { await apiFetch(path, { method: "POST", ...(json === undefined ? {} : { json }) }); router.refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); } }
  async function chat(event: React.FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked) return;
    const userMessage: ManagerMessage = { id: `local-${Date.now()}`, role: "user", content: asked, citations: [], proposedActions: [], canSubmitFeedback: false, createdAt: new Date().toISOString() };
    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setBusy(true); setError("");
    try {
      const result = await apiFetch<{ conversationId: string; message: ManagerMessage; feedbackApplied?: { messageId: string; feedback: ManagerMessageFeedback } | null }>("/manager/chat", { method: "POST", json: { message: asked, ...(conversationId ? { conversationId } : {}) } });
      setMessages((current) => [...current.map((message) => result.feedbackApplied?.messageId === message.id ? { ...message, feedback: result.feedbackApplied.feedback } : message), result.message]);
      setConversationId(result.conversationId);
      setConversations((current) => {
        const existing = current.find((item) => item.id === result.conversationId);
        const summary: ManagerConversationSummary = {
          id: result.conversationId,
          title: existing?.title ?? asked.slice(0, 80),
          updatedAt: result.message.createdAt,
          messageCount: (existing?.messageCount ?? 0) + 2,
          messages: [{ id: result.message.id, role: result.message.role, content: result.message.content, createdAt: result.message.createdAt }]
        };
        return [summary, ...current.filter((item) => item.id !== result.conversationId)].slice(0, 10);
      });
      if (result.feedbackApplied) {
        await refreshResponseReviewQueues();
        router.refresh();
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function refreshFollowThrough() {
    const projection = await apiFetch<ManagerFollowThrough>("/manager/follow-through");
    setFollowThrough(projection);
    return projection;
  }
  async function refreshResponseReviewQueues() {
    const [learningResult, reviewResult, evalReviewResult] = await Promise.allSettled([
      apiFetch<ManagerLearningSummary>("/manager/learning"),
      apiFetch<ManagerResponseReviewQueue>("/manager/response-review?limit=3"),
      isOwner ? apiFetch<ManagerResponseEvalReviewQueue>("/manager/response-eval-review?limit=3") : Promise.resolve(null)
    ]);
    if (learningResult.status === "fulfilled") setLearning(learningResult.value);
    if (reviewResult.status === "fulfilled") setResponseReview(reviewResult.value);
    if (evalReviewResult.status === "fulfilled" && evalReviewResult.value) setResponseEvalReview(evalReviewResult.value);
  }
  async function refreshTeamLoad() {
    const projection = await apiFetch<ManagerTeamLoad>("/manager/team-load");
    setTeamLoad(projection);
    return projection;
  }
  function updateRecommendationReceipt(recommendation: ManagerRecommendation) {
    setMessages((current) => current.map((message) => ({
      ...message,
      proposedActions: message.proposedActions.map((action) => action.recommendationId === recommendation.id ? {
        ...action,
        outcome: recommendation.outcome,
        followThrough: recommendation.followThrough ?? action.followThrough ?? null
      } : action)
    })));
    setBrief((current) => current ? {
      ...current,
      recommendations: current.recommendations.map((item) => item.id === recommendation.id ? { ...item, ...recommendation } : item)
    } : current);
  }
  async function settleRecommendation(recommendationId: string, actionType?: string | null) {
    const recommendation = actionType
      ? await apiFetch<ManagerRecommendation>(`/manager/recommendations/${recommendationId}/accept`, { method: "POST" })
      : await apiFetch<ManagerRecommendation>(`/manager/recommendations/${recommendationId}/complete`, { method: "POST", json: { reason: "already_handled" } });
    updateRecommendationReceipt(recommendation);
    await refreshFollowThrough().catch(() => null);
    return recommendation;
  }
  async function acceptChatRecommendation(recommendationId: string) {
    const actionType = messages.flatMap((message) => message.proposedActions).find((action) => action.recommendationId === recommendationId)?.actionType;
    setBusy(true); setError(""); setNotice("");
    try {
      const recommendation = await settleRecommendation(recommendationId, actionType);
      if (actionType === "update_profile_context") await refreshContext();
      if (actionType === "assign_task" || actionType === "assign_conversation_task" || actionType === "create_task" || actionType === "create_conversation_task") await refreshTeamLoad().catch(() => null);
      if (actionType === "create_conversation_project") setNotice("Project and milestone plan created.");
      if (actionType === "create_conversation_event") setNotice("Event and availability list created.");
      if (actionType === "update_conversation_event_availability") setNotice("Member availability updated.");
      if (actionType === "prepare_event_logistics_approvals") setNotice("Calendar and Drive approvals prepared for review.");
      if (!actionType) setNotice(recommendation.followThrough?.detail ?? "Guidance marked as handled.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function acceptBriefRecommendation(recommendation: ManagerRecommendation) {
    setBusy(true); setError(""); setNotice("");
    try {
      const updated = await settleRecommendation(recommendation.id, recommendation.proposedAction?.type);
      setNotice(recommendation.proposedAction?.type === "generate_event_advance" ? "Show advance created." : recommendation.proposedAction?.type === "prepare_event_logistics_approvals" ? "Calendar and Drive approvals prepared for review." : recommendation.proposedAction?.type === "generate_project_plan" ? "Milestone plan created." : recommendation.proposedAction?.type === "remember_fact" ? "Band memory saved." : recommendation.proposedAction?.type === "update_profile_context" ? "Band context saved." : recommendation.proposedAction?.type === "create_task" || recommendation.proposedAction?.type === "create_conversation_task" ? "Task added." : recommendation.proposedAction?.type === "create_decision" ? "Decision draft added." : updated.followThrough?.detail ?? "Guidance marked as handled.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function markFollowThroughHandled(recommendationId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const recommendation = await settleRecommendation(recommendationId, null);
      setNotice(recommendation.followThrough?.detail ?? "Guidance marked as handled.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function reconcileFollowThrough(recommendationId: string) {
    const note = window.prompt("Describe what you verified or replaced before closing this receipt. This does not claim that an outside action succeeded.");
    if (note === null) return;
    if (note.trim().length < 10) { setError("Add at least 10 characters describing the reconciliation."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const recommendation = await apiFetch<ManagerRecommendation>(`/manager/recommendations/${recommendationId}/complete`, { method: "POST", json: { reason: "reconciled", note: note.trim() } });
      updateRecommendationReceipt(recommendation);
      await refreshFollowThrough().catch(() => null);
      setNotice("Receipt closed after human review. No provider success was inferred.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function dismissRecommendation(recommendationId: string, reason: string) {
    setBusy(true); setError("");
    try {
      const recommendation = await apiFetch<ManagerRecommendation>(`/manager/recommendations/${recommendationId}/dismiss`, { method: "POST", json: { reason } });
      updateRecommendationReceipt(recommendation);
      await refreshFollowThrough().catch(() => null);
      setDismissTarget(null); setDismissReason("not_relevant"); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function patchMemory(id: string, json: { value?: unknown; confirmed?: boolean; archived?: boolean }) {
    setBusy(true); setError("");
    try {
      const updated = await apiFetch<ManagerMemoryFact>(`/manager/memory/${id}`, { method: "PATCH", json });
      setMemory((current) => json.archived ? current.filter((fact) => fact.id !== id) : current.map((fact) => fact.id === id ? updated : fact));
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function promoteRecommendationEval(recommendationId: string, payload: { label: "useful" | "not_useful" | "needs_revision"; notes?: string | null }) {
    setBusy(true); setError("");
    try {
      const example = await apiFetch<ManagerEvalExample>(`/manager/recommendations/${recommendationId}/promote-eval`, { method: "POST", json: payload });
      setEvalExamples((current) => current ? [...current.filter((item) => item.recommendationId !== recommendationId), example] : current);
      setRecommendationEvalReview((current) => current ? { ...current, eligibleCount: Math.max(0, current.eligibleCount - (current.items.some((item) => item.recommendationId === recommendationId) ? 1 : 0)), stableKeyCount: Math.max(0, current.stableKeyCount - (current.items.some((item) => item.recommendationId === recommendationId) ? 1 : 0)), items: current.items.filter((item) => item.recommendationId !== recommendationId) } : current);
      const [learningResult, reviewResult] = await Promise.allSettled([apiFetch<ManagerLearningSummary>("/manager/learning"), apiFetch<ManagerRecommendationEvalReviewQueue>("/manager/recommendation-eval-review?limit=3")]);
      if (learningResult.status === "fulfilled") setLearning(learningResult.value);
      if (reviewResult.status === "fulfilled") setRecommendationEvalReview(reviewResult.value);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function promoteEval(recommendationId: string, outcome: string) {
    try { await promoteRecommendationEval(recommendationId, { label: outcome === "dismissed" ? "not_useful" : "useful" }); }
    catch { /* parent displays the request error */ }
  }
  async function promoteResponseEval(messageId: string, payload: { label: "useful" | "needs_revision"; expectedBehavior?: string | null }) {
    setBusy(true); setError("");
    try {
      const example = await apiFetch<ManagerResponseEvalExample>(`/manager/messages/${messageId}/promote-eval`, { method: "POST", json: payload });
      setResponseEvalExamples((current) => current ? [...current.filter((item) => item.managerMessageId !== messageId), example] : current);
      setResponseEvalReview((current) => current ? { ...current, eligibleCount: Math.max(0, current.eligibleCount - (current.items.some((item) => item.messageId === messageId) ? 1 : 0)), items: current.items.filter((item) => item.messageId !== messageId) } : current);
      const [evalReviewResult, reviewResult] = await Promise.allSettled([
        apiFetch<ManagerResponseEvalReviewQueue>("/manager/response-eval-review?limit=3"),
        apiFetch<ManagerResponseReviewQueue>("/manager/response-review?limit=3")
      ]);
      if (evalReviewResult.status === "fulfilled") setResponseEvalReview(evalReviewResult.value);
      if (reviewResult.status === "fulfilled") setResponseReview(reviewResult.value);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function recordGoalProgress(goalId: string, value: number, note: string | null) {
    setBusy(true); setError("");
    try {
      const event = await apiFetch<ManagerGoalProgressEvent>(`/manager/goals/${goalId}/progress`, { method: "POST", json: { value, note } });
      setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, currentValue: event.value, progressEvents: [event, ...(goal.progressEvents ?? [])].slice(0, 10) } : goal));
      const [nextHealth, nextMeasurements] = await Promise.all([apiFetch<ManagerPlanHealth>("/manager/plan-health"), apiFetch<ManagerGoalMeasurement[]>("/manager/goal-measurements")]);
      setPlanHealth(nextHealth); setGoalMeasurements(nextMeasurements);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function setGoalMeasurementKind(goalId: string, measurementKind: ManagerGoalMeasurementKind) {
    setBusy(true); setError(""); setNotice("");
    try {
      const goal = await apiFetch<ManagerGoal>(`/manager/goals/${goalId}`, { method: "PATCH", json: { measurementKind } });
      const [nextMeasurements, nextHealth] = await Promise.all([apiFetch<ManagerGoalMeasurement[]>("/manager/goal-measurements"), apiFetch<ManagerPlanHealth>("/manager/plan-health")]);
      setGoals((current) => current.map((item) => item.id === goalId ? { ...item, ...goal } : item));
      setGoalMeasurements(nextMeasurements); setPlanHealth(nextHealth);
      setNotice(measurementKind === "manual" ? "Goal progress is now manual." : "Goal measurement source updated. Review any difference before reconciling.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function setGoalTargetDirection(goalId: string, targetDirection: ManagerGoalTargetDirection) {
    setBusy(true); setError(""); setNotice("");
    try {
      const goal = await apiFetch<ManagerGoal>(`/manager/goals/${goalId}`, { method: "PATCH", json: { targetDirection } });
      const nextHealth = await apiFetch<ManagerPlanHealth>("/manager/plan-health");
      setGoals((current) => current.map((item) => item.id === goalId ? { ...item, ...goal } : item));
      setPlanHealth(nextHealth);
      setNotice("Goal target meaning updated. Manager advice now uses this direction everywhere.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function syncGoalProgress(goalId: string, observedValue: number) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiFetch<{ measurement: ManagerGoalMeasurement; progressEvent: ManagerGoalProgressEvent | null }>(`/manager/goals/${goalId}/sync-progress`, { method: "POST", json: { observedValue } });
      setGoalMeasurements((current) => current.map((measurement) => measurement.goalId === goalId ? result.measurement : measurement));
      setGoals((current) => current.map((goal) => goal.id === goalId ? { ...goal, currentValue: result.measurement.recordedValue, ...(result.progressEvent ? { progressEvents: [result.progressEvent, ...(goal.progressEvents ?? [])].slice(0, 10) } : {}) } : goal));
      setPlanHealth(await apiFetch<ManagerPlanHealth>("/manager/plan-health"));
      setNotice(result.progressEvent ? `Goal progress reconciled to ${observedValue}.` : "Goal progress already matched the selected source.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function runEvaluation() {
    setBusy(true); setError("");
    try { setEvaluation(await apiFetch<ManagerEvaluationRun>("/manager/evaluations/run", { method: "POST", json: { candidateVersion: "manager_os_v33" } })); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function submitMessageFeedback(messageId: string, payload: { helpful: boolean; reason?: string | null; note?: string | null }) {
    setBusy(true); setError("");
    try {
      const feedback = await apiFetch<ManagerMessageFeedback>(`/manager/messages/${messageId}/feedback`, { method: "POST", json: payload });
      setMessages((current) => current.map((message) => message.id === messageId ? { ...message, feedback } : message));
      setResponseReview((current) => current ? { ...current, eligibleCount: Math.max(0, current.eligibleCount - (current.items.some((item) => item.messageId === messageId) ? 1 : 0)), items: current.items.filter((item) => item.messageId !== messageId) } : current);
      await refreshResponseReviewQueues();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function ensurePlan() {
    setBusy(true); setError("");
    try {
      await apiFetch("/manager/plan/ensure", { method: "POST" });
      const [nextGoals, nextHealth, nextMeasurements] = await Promise.all([apiFetch<ManagerGoal[]>("/manager/goals"), apiFetch<ManagerPlanHealth>("/manager/plan-health"), apiFetch<ManagerGoalMeasurement[]>("/manager/goal-measurements")]);
      setGoals(nextGoals); setPlanHealth(nextHealth); setGoalMeasurements(nextMeasurements); router.refresh();
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
  async function recordMemberCheckIn(id: string, payload: unknown) {
    setBusy(true); setError(""); setNotice("");
    try {
      const row = await apiFetch<BandMemberCheckIn>(`/manager/members/${id}/check-ins`, { method: "POST", json: payload });
      setMemberCheckIns((current) => [row, ...current]);
      await refreshTeamLoad();
      setNotice(`${row.bandMember.name}'s capacity check-in was saved.`);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); throw err; } finally { setBusy(false); }
  }
  async function switchConversation(id: string) {
    if (id === conversationId) return;
    setBusy(true); setError(""); setQuestion("");
    try {
      const selected = await apiFetch<ManagerConversation>(`/manager/conversations/${id}`);
      setConversationId(selected.id); setMessages(selected.messages);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function switchBriefCadence(cadence: "daily" | "weekly") {
    if (cadence === briefCadence && brief) return;
    setBusy(true); setError(""); setNotice("");
    try {
      setBrief(await apiFetch<ManagerRun | null>(`/manager/brief?cadence=${cadence}`));
      setBriefCadence(cadence);
      briefCadenceChosen.current = true;
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  async function refreshBrief() {
    setBusy(true); setError(""); setNotice("");
    try {
      setBrief(await apiFetch<ManagerRun>("/manager/brief/generate", { method: "POST", json: { cadence: briefCadence } }));
      setNotice(`${briefCadence === "weekly" ? "Weekly" : "Daily"} manager brief refreshed.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); } finally { setBusy(false); }
  }
  function newConversation() { setConversationId(null); setMessages([]); setQuestion(""); setError(""); }
  if (!profile?.intakeCompletedAt) return canManage
    ? <Intake busy={busy} error={error} onSubmit={async (payload) => act("/manager/intake/complete", payload)} />
    : <SurfaceCard className="mx-auto max-w-3xl"><p className="sb-kicker">Manager setup</p><h2 className="mt-2 text-xl font-semibold">The operating profile has not been completed</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">You have read-only access. An owner or member can complete the guided setup; the Manager workspace will become readable here afterward.</p><Badge variant="neutral" className="mt-4">Read only</Badge></SurfaceCard>;
  const firstPriorityFactors = brief?.trace?.priorityRanking?.today[0]?.factors
    .filter((factor) => factor.impact > 0 && !factor.code.startsWith("declared_") && factor.code !== "recorded_evidence")
    .slice(0, 3) ?? [];
  const coachingPrompts = profile.educationTopics.length
    ? profile.educationTopics.slice(0, 3).map((topic) => `Explain ${topic} in plain language.`)
    : ["How does a show settlement work?", "What is a show advance?", "Guarantee vs. door deal: what is the difference?"];
  const knowledgeByFactId = new Map(knowledgeHealth?.items.map((item) => [item.factId, item]) ?? []);
  return <div className="space-y-8">
    {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">{error}</div> : null}
    {notice ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100" role="status">{notice}</div> : null}
    {followThrough ? <ManagerFollowThroughCard projection={followThrough} busy={busy} canManage={canManage} onMarkHandled={markFollowThroughHandled} onReconcile={reconcileFollowThrough} /> : null}
    <div className="grid gap-4 md:grid-cols-3"><ManagerBriefPriorityCard brief={brief} cadence={briefCadence} busy={busy} canRefresh={canManage} priorityFactors={firstPriorityFactors} onCadence={switchBriefCadence} onRefresh={refreshBrief} />
      <SurfaceCard><p className="sb-kicker">Operating context</p><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-[var(--text-muted)]">Band mode</dt><dd className="font-medium capitalize">{profile.bandMode.replace("_", " / ")}</dd></div><div><dt className="text-[var(--text-muted)]">Home market</dt><dd>{[profile.homeCity, profile.homeRegion, profile.homeCountry].filter(Boolean).join(", ") || "Unknown"}</dd></div><div><dt className="text-[var(--text-muted)]">Lineup</dt><dd>{members.length} active member{members.length === 1 ? "" : "s"}</dd></div><div><dt className="text-[var(--text-muted)]">12-month ambition</dt><dd>{profile.twelveMonthAmbition ?? "Not set"}</dd></div></dl></SurfaceCard></div>
    {brief ? <ManagerBriefReview brief={brief} /> : null}
    {contextHealth ? <BandContextCard profile={profile} members={members} health={contextHealth} busy={busy} canManage={canManage} onSaveProfile={saveProfile} onAddMember={addBandMember} onUpdateMember={updateBandMember} /> : null}
    {initialEvidenceHealth ? <EvidenceHealthCard health={initialEvidenceHealth} /> : null}
    {initialGoalPath ? <GoalPathCard path={initialGoalPath} /> : null}
    {initialWorkSequence ? <WorkSequenceCard sequence={initialWorkSequence} /> : null}
    {initialSettings ? <ManagerCadenceCard initialSettings={initialSettings} initialProviderContextPolicy={initialProviderContextPolicy} cadence={profile.communicationCadence === "weekly" ? "weekly" : "daily"} isOwner={isOwner} /> : null}
    {initialCommitmentHealth ? <CommitmentHealthCard health={initialCommitmentHealth} /> : null}
    {teamLoad ? <TeamLoadCard load={teamLoad} /> : null}
    <MemberCheckInsCard members={members.filter((member) => member.active)} checkIns={memberCheckIns} load={teamLoad} busy={busy} canManage={canManage} onRecord={recordMemberCheckIn} />
    {initialOutcomeReview ? <OutcomeReviewCard review={initialOutcomeReview} /> : null}
    <DecisionBoard decisions={decisions} busy={busy} canManage={canManage} onCreate={createDecision} onDecide={patchDecision} onReview={reviewDecision} />
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><SurfaceCard><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Target className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">90-day plan</h2></div><div className="flex items-center gap-2">{planHealth ? <Badge variant={planHealth.status === "on_track" ? "success" : planHealth.status === "off_track" ? "danger" : "neutral"}>{planHealth.score}/100 · {friendlyReason(planHealth.status)}</Badge> : null}{canManage ? <button className="sb-btn-ghost" disabled={busy} onClick={() => void ensurePlan()}><RefreshCw className="h-4 w-4" /> Fill missing steps</button> : <Badge variant="neutral">Read only</Badge>}</div></div>{planHealth ? <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><div className="flex gap-2"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" /><p className="text-sm text-[var(--text-secondary)]">{planHealth.summary}</p></div>{planHealth.gaps[0] ? <p className="mt-2 text-xs text-[var(--text-muted)]">First gap: {planHealth.gaps[0].detail}</p> : null}</div> : null}<div className="mt-4 space-y-3">{goals.map((goal) => <GoalProgressCard key={goal.id} goal={goal} measurement={goalMeasurements.find((measurement) => measurement.goalId === goal.id) ?? null} health={planHealth?.goals.find((item) => item.goalId === goal.id) ?? null} busy={busy} canManage={canManage} onRecord={recordGoalProgress} onMeasurementKind={setGoalMeasurementKind} onTargetDirection={setGoalTargetDirection} onSync={syncGoalProgress} />)}</div></SurfaceCard>
      <SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><MessageSquareText className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Talk it through</h2></div><p className="mt-2 text-sm text-[var(--text-muted)]">Each thread keeps its own recent context. Switch back to earlier band decisions without mixing conversations.</p></div><div className="flex flex-wrap items-center gap-2">{conversations.length ? <><label className="sr-only" htmlFor="manager-conversation-history">Manager conversation history</label><select id="manager-conversation-history" aria-label="Manager conversation history" className="sb-select max-w-56" value={conversationId ?? "__new__"} disabled={busy} onChange={(event) => event.target.value === "__new__" ? newConversation() : void switchConversation(event.target.value)}>{canManage ? <option value="__new__">New conversation</option> : !conversationId ? <option value="__new__">No conversation selected</option> : null}{conversations.map((item) => <option key={item.id} value={item.id}>{`${item.title?.trim() || item.messages[0]?.content.slice(0, 50) || "Untitled conversation"} · ${new Date(item.updatedAt).toLocaleDateString()}`}</option>)}</select></> : null}{canManage && (conversationId || messages.length) ? <button className="sb-btn-ghost shrink-0" onClick={newConversation} disabled={busy}><Plus className="h-4 w-4" /> New</button> : !canManage ? <Badge variant="neutral">Read only</Badge> : null}</div></div>
        {canManage ? <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="manager-coaching-prompts"><span className="text-xs font-medium text-[var(--text-muted)]">Learn as you go</span>{coachingPrompts.map((prompt) => <button key={prompt} type="button" className="rounded-full border border-[var(--border)] px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]" onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div> : null}
        <div className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1" aria-live="polite" data-testid="manager-conversation-messages">
          {messages.map((message) => <ManagerMessageBubble key={message.id} message={message} busy={busy} canManage={canManage} evalExamples={evalExamples} responseEvalExamples={responseEvalExamples} onAcceptRecommendation={acceptChatRecommendation} onDismissRecommendation={dismissRecommendation} onPromoteEval={promoteEval} onPromoteResponseEval={promoteResponseEval} onFeedback={submitMessageFeedback} />)}
          {!messages.length ? <div className="rounded-xl border border-dashed border-[var(--border)] p-4"><p className="text-sm font-medium">{canManage ? "Start with the question that is actually on your mind." : "No Manager conversation has been recorded yet."}</p>{canManage ? <div className="mt-3 flex flex-wrap gap-2">{["What needs my attention today?", "What is blocked or slipping?", "Are we ready for our next show?", "What did we learn from recent shows?", "Where does our money stand?"].map((prompt) => <button key={prompt} className="rounded-full border border-[var(--border)] px-3 py-2 text-left text-xs text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]" onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div> : <p className="mt-2 text-xs text-[var(--text-muted)]">An owner or member can start a conversation.</p>}</div> : null}
        </div>
        {canManage ? <form className="mt-4 flex items-end gap-2" onSubmit={(event) => void chat(event)}><label className="sr-only" htmlFor="manager-question">Message your manager</label><textarea id="manager-question" className="sb-input min-h-12 flex-1 resize-y" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about priorities, shows, booking, money, or the band..." maxLength={10000} rows={2} /><button className="sb-btn-primary min-h-12 shrink-0" disabled={busy || !question.trim()} aria-label="Send message"><Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span></button></form> : null}</SurfaceCard></div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">What your manager remembers</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Operating-profile facts stay authoritative. Other saved facts must remain confirmed and current.</p></div>{knowledgeHealth ? <span data-testid="manager-knowledge-health"><Badge variant={knowledgeHealth.status === "healthy" ? "success" : knowledgeHealth.status === "conflicted" ? "danger" : "neutral"}>{knowledgeHealth.score}/100 · {friendlyReason(knowledgeHealth.status)}</Badge></span> : null}</div>{knowledgeHealth ? <p className="mt-3 text-xs text-[var(--text-secondary)]">{knowledgeHealth.summary}</p> : null}<div className="mt-4 space-y-3">{memory.map((fact) => <MemoryFactEditor key={fact.id} fact={fact} assessment={knowledgeByFactId.get(fact.id) ?? null} busy={busy} canManage={canManage} onSave={(value) => patchMemory(fact.id, { value })} onConfirm={() => patchMemory(fact.id, { confirmed: true })} onArchive={() => patchMemory(fact.id, { archived: true })} />)}{!memory.length ? <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No saved memory yet. Complete intake to establish the band’s working context.</p> : null}</div></SurfaceCard>
      <SurfaceCard><p className="sb-kicker">Last {learning?.windowDays ?? 90} days</p><h2 className="mt-2 font-semibold">Learning from your choices</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Feedback changes repetition and response style. It never expands authority or rewrites StoryBoard’s rules or code.</p><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Used</dt><dd className="mt-1 text-xl font-semibold">{(learning?.accepted ?? 0) + (learning?.completed ?? 0)}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Completed</dt><dd className="mt-1 text-xl font-semibold">{learning?.completed ?? 0}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Answers rated</dt><dd className="mt-1 text-xl font-semibold">{learning?.responseFeedback.total ?? 0}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Helpful answers</dt><dd className="mt-1 text-xl font-semibold">{learning?.responseFeedback.helpfulRate == null ? "—" : `${Math.round(learning.responseFeedback.helpfulRate * 100)}%`}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Advice reviewed</dt><dd className="mt-1 text-xl font-semibold">{learning?.recommendationReviews.total ?? 0}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Useful advice</dt><dd className="mt-1 text-xl font-semibold">{learning?.recommendationReviews.usefulRate == null ? "—" : `${Math.round(learning.recommendationReviews.usefulRate * 100)}%`}</dd></div></dl>{learning?.responseFeedback.reasons[0] ? <p className="mt-4 text-xs text-[var(--text-muted)]">Most common answer correction: {friendlyReason(learning.responseFeedback.reasons[0].reason)} ({learning.responseFeedback.reasons[0].count})</p> : learning?.dismissalReasons[0] ? <p className="mt-4 text-xs text-[var(--text-muted)]">Most common recommendation correction: {friendlyReason(learning.dismissalReasons[0].reason)} ({learning.dismissalReasons[0].count})</p> : null}{recommendationEvalReview ? <RecommendationEvalReviewInbox queue={recommendationEvalReview} busy={busy} onPromote={promoteRecommendationEval} /> : null}{responseReview ? <ResponseReviewInbox queue={responseReview} busy={busy} onFeedback={submitMessageFeedback} /> : null}{responseEvalReview ? <ResponseEvalReviewInbox queue={responseEvalReview} busy={busy} onPromote={promoteResponseEval} /> : null}{evalExamples ? <div className="mt-5 border-t border-[var(--border)] pt-4"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-[var(--accent)]" /> Intelligence release gate</p><p className="mt-1 text-xs text-[var(--text-muted)]">{evalExamples.length + (responseEvalExamples?.length ?? 0)} owner-reviewed example{evalExamples.length + (responseEvalExamples?.length ?? 0) === 1 ? "" : "s"}; no version activates itself.</p></div><button className="sb-btn-secondary shrink-0" disabled={busy} onClick={() => void runEvaluation()}>Run checks</button></div>{evaluation ? <div className="mt-3 rounded-lg border border-[var(--border)] p-3 text-xs"><div className="flex items-center justify-between"><span>{evaluation.candidateVersion}</span><Badge variant={evaluation.passed ? "success" : "danger"}>{evaluation.passed ? "passed" : "blocked"}</Badge></div><p className="mt-2 text-[var(--text-muted)]">{evaluation.metrics.passed}/{evaluation.metrics.total} checks passed · safety {Math.round(evaluation.metrics.safetyPassRate * 100)}%</p><p className="mt-1 text-[var(--text-muted)]">Reviewed recommendations: {evaluation.metrics.ownerReviewedRecommendationCount} · reviewed answers: {evaluation.metrics.ownerReviewedResponseCount}</p></div> : null}</div> : null}</SurfaceCard></div>
    {brief?.recommendations?.length ? <SurfaceCard><h2 className="font-semibold">Reviewable recommendations</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Accepted work is not suggested again while its task is open. Recently completed or dismissed advice gets a cooldown.</p><div className="mt-4 divide-y divide-[var(--border)]">{brief.recommendations.map((rec) => <div key={rec.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="flex-1"><div className="flex items-center gap-2"><p className="font-medium">{rec.title}</p><Badge variant={rec.priority === "high" ? "danger" : "neutral"}>{rec.priority}</Badge></div><p className="mt-1 text-sm text-[var(--text-secondary)]">{rec.nextAction}</p>{rec.proposedAction?.type === "remember_fact" ? <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-2 text-xs">{rec.proposedAction.value}</p> : null}{rec.outcomeReason ? <p className="mt-1 text-xs text-[var(--text-muted)]">Outcome: {friendlyReason(rec.outcomeReason)}</p> : null}</div>{rec.outcome === "suggested" ? !canManage ? <Badge variant="neutral">Read only</Badge> : dismissTarget === rec.id ? <div className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor={`dismiss-${rec.id}`}>Why is this not useful?</label><select id={`dismiss-${rec.id}`} className="sb-select min-w-40" value={dismissReason} onChange={(event) => setDismissReason(event.target.value)}><option value="not_relevant">Not relevant</option><option value="already_handled">Already handled</option><option value="wrong_priority">Wrong priority</option><option value="bad_timing">Bad timing</option><option value="missing_context">Missing context</option><option value="other">Other</option></select><button className="sb-btn-secondary" disabled={busy} onClick={() => void dismissRecommendation(rec.id, dismissReason)}>Save</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setDismissTarget(null)}><X className="h-4 w-4" /> Cancel</button></div> : <div className="flex gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => setDismissTarget(rec.id)}>Dismiss</button><button className="sb-btn-primary" disabled={busy} onClick={() => void acceptBriefRecommendation(rec)}><Check className="h-4 w-4" /> {managerActionButton(rec.proposedAction?.type)}</button></div> : <div className="flex flex-wrap items-center gap-2"><ManagerRecommendationOutcomeBadge recommendation={rec} />{evalExamples ? evalExamples.some((example) => example.recommendationId === rec.id) ? <Badge variant="violet">in eval set</Badge> : <button className="sb-btn-ghost" disabled={busy} onClick={() => void promoteEval(rec.id, rec.outcome)}>Add to eval set</button> : null}</div>}</div>)}</div></SurfaceCard> : null}
  </div>;
}

function ManagerFollowThroughCard({ projection, busy, canManage, onMarkHandled, onReconcile }: {
  projection: ManagerFollowThrough;
  busy: boolean;
  canManage: boolean;
  onMarkHandled: (recommendationId: string) => Promise<void>;
  onReconcile: (recommendationId: string) => Promise<void>;
}) {
  const sections: { state: ManagerFollowThroughItem["state"]; label: string }[] = [
    { state: "needs_action", label: "Needs your confirmation" },
    { state: "in_motion", label: "Active work" },
    { state: "blocked", label: "Blocked" },
    { state: "completed", label: "Recently completed" }
  ];
  const hasItems = projection.items.length > 0;
  return <div data-testid="manager-follow-through" aria-live="polite"><SurfaceCard className="border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent-muted)]/55 to-[var(--surface-1)]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-[var(--accent)]" /><p className="sb-kicker">Accepted work</p></div><h2 className="mt-2 text-xl font-semibold">In motion</h2><p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">StoryBoard follows accepted Manager work into the record that now owns it. Open that record for the current status and next step.</p></div><Badge variant={projection.counts.blocked ? "warning" : projection.counts.inMotion ? "success" : "neutral"}>{projection.counts.inMotion} active</Badge></div>
    <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <FollowThroughCount testId="manager-follow-through-count-needs-action" label="Needs confirmation" value={projection.counts.needsAction} />
      <FollowThroughCount testId="manager-follow-through-count-in-motion" label="In motion" value={projection.counts.inMotion} />
      <FollowThroughCount testId="manager-follow-through-count-blocked" label="Blocked" value={projection.counts.blocked} />
      <FollowThroughCount testId="manager-follow-through-count-completed" label="Completed recently" value={projection.counts.completed} />
    </dl>
    {hasItems ? <div className="mt-5 grid gap-4 xl:grid-cols-2">{sections.map((section) => {
      const items = projection.items.filter((item) => item.state === section.state);
      if (!items.length) return null;
      return <section key={section.state} aria-labelledby={`manager-follow-through-${section.state}`}><div className="mb-2 flex items-center justify-between gap-2"><h3 id={`manager-follow-through-${section.state}`} className="text-sm font-semibold">{section.label}</h3><Badge variant={section.state === "blocked" ? "warning" : section.state === "completed" ? "success" : "neutral"}>{items.length}</Badge></div><div className="space-y-2">{items.map((item) => <FollowThroughRow key={item.recommendationId} item={item} busy={busy} canManage={canManage} onMarkHandled={onMarkHandled} onReconcile={onReconcile} />)}</div></section>;
    })}</div> : <p className="mt-5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-0)] p-4 text-sm text-[var(--text-muted)]">Nothing accepted is waiting, blocked, or recently completed. When you accept a typed Manager action, its durable receipt will appear here.</p>}
  </SurfaceCard></div>;
}

function FollowThroughCount({ testId, label, value }: { testId: string; label: string; value: number }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)]/80 p-3" data-testid={testId}><dt className="text-xs text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>;
}

function FollowThroughRow({ item, busy, canManage, onMarkHandled, onReconcile }: { item: ManagerFollowThroughItem; busy: boolean; canManage: boolean; onMarkHandled: (recommendationId: string) => Promise<void>; onReconcile: (recommendationId: string) => Promise<void> }) {
  const destination = safeManagerDestination(item.destination);
  const canMarkHandled = item.canMutate && item.state === "needs_action" && item.stage === "needs_tracking" && item.outcome === "accepted" && !item.actionType;
  const reconciled = item.stage === "reconciled";
  const presentation = managerActionOutcomePresentation(item.outcome, item);
  return <article className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-3" data-testid="manager-follow-through-item" data-state={item.state} data-stage={item.stage} data-tone={presentation.tone} data-can-mutate={item.canMutate ? "true" : "false"}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{item.title}</p><p className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{friendlyReason(item.workstream)}</p></div><Badge variant={presentation.variant}>{item.statusLabel}</Badge></div>
    <p className="mt-2 text-xs text-[var(--text-secondary)]">{item.detail}</p>
    {item.nextAction ? <p className="mt-2 text-xs font-medium">Next: {item.nextAction}</p> : null}
    <div className="mt-3 flex flex-wrap items-center gap-2">{destination ? <a className="sb-btn-secondary" href={destination.href} data-testid="manager-follow-through-destination">{destination.label}<ArrowUpRight className="h-3.5 w-3.5" /></a> : null}{canManage && canMarkHandled ? <button className="sb-btn-primary" disabled={busy} onClick={() => void onMarkHandled(item.recommendationId)}><Check className="h-4 w-4" /> Mark handled</button> : null}{canManage && item.canReconcile ? <button className="sb-btn-ghost" disabled={busy} onClick={() => void onReconcile(item.recommendationId)} data-testid="manager-follow-through-reconcile">Close after review</button> : null}{item.state === "completed" && item.outcomeAt ? <span className="text-[11px] text-[var(--text-muted)]">{reconciled ? "Closed" : "Completed"} {briefDate(item.outcomeAt)}</span> : null}</div>
  </article>;
}

function safeManagerDestination(destination: ManagerFollowThroughItem["destination"]) {
  if (!destination || !destination.href.startsWith("/") || destination.href.startsWith("//") || destination.href.includes("\\")) return null;
  return destination;
}

function ManagerBriefPriorityCard({ brief, cadence, busy, canRefresh, priorityFactors, onCadence, onRefresh }: {
  brief: ManagerRun | null;
  cadence: "daily" | "weekly";
  busy: boolean;
  canRefresh: boolean;
  priorityFactors: { detail: string }[];
  onCadence: (cadence: "daily" | "weekly") => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const output = brief?.output;
  return <div className="md:col-span-2" data-testid="manager-brief-priorities"><SurfaceCard>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="sb-kicker">{cadence === "weekly" ? "Weekly operating brief" : "Daily operating brief"}</p><h2 className="mt-2 text-xl font-semibold">{output?.summary ?? "Generate your first grounded manager brief."}</h2>{priorityFactors.length ? <p data-testid="manager-priority-explanation" className="mt-2 text-xs text-[var(--text-muted)]">Ranked first because {priorityFactors.map((factor) => factor.detail).join(" · ")}.</p> : null}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-2" aria-label="Manager brief cadence">
        <div className="flex rounded-lg border border-[var(--border)] p-1">
          {(["daily", "weekly"] as const).map((option) => <button key={option} type="button" className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${cadence === option ? "bg-[var(--accent-muted)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`} aria-pressed={cadence === option} disabled={busy} onClick={() => void onCadence(option)}>{option}</button>)}
        </div>
        {canRefresh ? <button type="button" className="sb-btn-secondary" disabled={busy} onClick={() => void onRefresh()}><RefreshCw className="h-4 w-4" /> Refresh</button> : null}
      </div>
    </div>
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-2"><Target className="h-4 w-4 text-[var(--accent)]" /><h3 className="font-semibold">Today</h3><Badge variant="neutral">{output?.today.length ?? 0}/5</Badge></div>
      {output?.today.map((item, index) => <div key={`${item.title}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4"><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-muted)] text-xs font-bold text-[var(--accent)]">{index + 1}</span><div><h3 className="font-medium">{item.title}</h3><p className="mt-1 text-sm text-[var(--text-secondary)]">{item.reason}</p><p className="mt-2 text-sm font-medium text-[var(--text-primary)]">Next: {item.nextAction}</p></div></div></div>)}
      {!output?.today.length ? <EmptyState title="No brief yet" description="Generate a brief after completing intake." icon={<BrainCircuit className="h-6 w-6" />} /> : null}
    </div>
  </SurfaceCard></div>;
}

function ManagerBriefReview({ brief }: { brief: ManagerRun }) {
  const output = brief.output;
  return <div data-testid="manager-brief-review" className="space-y-4">
    <SurfaceCard>
      <div className="flex items-start gap-3"><div className="rounded-lg bg-[var(--accent-muted)] p-2 text-[var(--accent)]"><CalendarRange className="h-4 w-4" /></div><div><p className="sb-kicker">This week</p><h2 className="mt-1 font-semibold">Work connected to the operating plan</h2><p className="mt-1 text-sm text-[var(--text-muted)]">These are bounded next actions from the same evidence used for Today, not a second task list.</p></div></div>
      {output.thisWeek.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{output.thisWeek.map((item, index) => <div key={`${item.title}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4"><div className="flex items-start gap-3"><span className="mt-0.5 text-xs font-semibold text-[var(--accent)]">{index + 1}</span><div><h3 className="text-sm font-medium">{item.title}</h3><p className="mt-1 text-xs text-[var(--text-secondary)]">{item.reason}</p><p className="mt-2 text-xs font-medium">Next: {item.nextAction}</p></div></div></div>)}</div> : <BriefSectionEmpty>There is no additional weekly action in the current StoryBoard brief.</BriefSectionEmpty>}
    </SurfaceCard>
    <div className="grid gap-4 lg:grid-cols-3">
      <BriefSignalCard icon={<CircleHelp className="h-4 w-4" />} title="Decisions needed" count={output.decisionsNeeded.length}>
        {output.decisionsNeeded.length ? output.decisionsNeeded.map((item, index) => <BriefSignalRow key={`${item.title}-${index}`} title={item.title} detail={item.explanation} />) : <BriefSectionEmpty>No open decision or approval is recorded here.</BriefSectionEmpty>}
      </BriefSignalCard>
      <BriefSignalCard icon={<Clock3 className="h-4 w-4" />} title="Waiting on" count={output.waitingOn.length}>
        {output.waitingOn.length ? output.waitingOn.map((item, index) => <BriefSignalRow key={`${item.title}-${index}`} title={item.title} detail={item.dueAt ? `Checkpoint ${briefDate(item.dueAt)}` : "No checkpoint date recorded"} />) : <BriefSectionEmpty>No dependency, reply, or outside party is recorded as waiting.</BriefSectionEmpty>}
      </BriefSignalCard>
      <BriefSignalCard icon={<CircleAlert className="h-4 w-4" />} title="Risks and opportunities" count={output.risksAndOpportunities.length}>
        {output.risksAndOpportunities.length ? output.risksAndOpportunities.map((item, index) => <BriefSignalRow key={`${item.title}-${index}`} title={item.title} detail={item.detail} footer={`Record confidence ${Math.round(item.confidence * 100)}%`} />) : <BriefSectionEmpty>No additional risk or opportunity signal is recorded.</BriefSectionEmpty>}
      </BriefSignalCard>
    </div>
  </div>;
}

function BriefSignalCard({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return <SurfaceCard><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[var(--text-primary)]"><span className="text-[var(--accent)]">{icon}</span><h2 className="font-semibold">{title}</h2></div><Badge variant="neutral">{count}</Badge></div><div className="mt-4 space-y-3">{children}</div></SurfaceCard>;
}

function BriefSignalRow({ title, detail, footer }: { title: string; detail: string; footer?: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{detail}</p>{footer ? <p className="mt-2 text-[0.68rem] uppercase tracking-wide text-[var(--text-muted)]">{footer}</p> : null}</div>;
}

function BriefSectionEmpty({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">{children}</p>;
}

function briefDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "date unavailable" : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function outcomeMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

function splitComma(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function splitLines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }

function EvidenceHealthCard({ health }: { health: ManagerEvidenceHealth }) {
  const attention = health.areas.filter((item) => item.state !== "current");
  return <div data-testid="manager-evidence-health"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">What the Manager can trust right now</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{health.summary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">This measures operating-record coverage, not the band's quality, potential, or real-world activity outside StoryBoard.</p></div><Badge variant={health.status === "strong" ? "success" : health.status === "usable" ? "warning" : "neutral"}>{health.confidenceLabel} confidence · {friendlyReason(health.status)}</Badge></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{health.areas.map((item) => <div key={item.area} className="rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{item.label}</p><Badge variant={item.state === "current" ? "success" : item.state === "conflicted" ? "danger" : item.state === "stale" ? "warning" : "neutral"}>{friendlyReason(item.state)}</Badge></div><p className="mt-2 text-xs text-[var(--text-secondary)]">{item.summary}</p></div>)}</div>
    {attention.length ? <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Confirm before relying on the full picture</p><ol className="mt-2 space-y-2">{health.priorityQuestions.map((item, index) => <li key={item.area} className="flex gap-2 text-sm text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-primary)]">{index + 1}.</span><span>{item.question}</span></li>)}</ol></div> : <p className="mt-4 text-sm text-emerald-200">No operating area currently needs a record check.</p>}
  </SurfaceCard></div>;
}

function GoalPathCard({ path }: { path: ManagerGoalPath }) {
  return <div data-testid="manager-goal-path"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Route className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Goals connected to real work</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{path.summary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Each path uses the saved target direction, initiative, measurement, task, and prerequisite chain. It does not estimate pace, probability, effort, conversion, duration, or private capacity.</p></div><Badge variant={path.status === "clear" ? "success" : path.status === "conflicted" || path.status === "blocked" ? "danger" : "warning"}>{friendlyReason(path.status)}</Badge></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{path.goals.map((goal) => <div key={goal.goalId} className={`rounded-lg border p-3 ${goal.status === "conflicted" || goal.status === "blocked" ? "border-red-500/25 bg-red-500/5" : goal.status === "ready" || goal.status === "in_progress" ? "border-emerald-500/20 bg-emerald-500/5" : "border-[var(--border)] bg-[var(--surface-0)]"}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{goal.goalTitle}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">Target {goal.target.targetLabel}{goal.deadline ? ` · due ${new Date(goal.deadline).toLocaleDateString()}` : ""}</p></div><Badge variant={goal.status === "ready" || goal.status === "in_progress" || goal.status === "target_reached" ? "success" : goal.status === "conflicted" || goal.status === "blocked" ? "danger" : "warning"}>{friendlyReason(goal.status)}</Badge></div><p className="mt-2 text-xs text-[var(--text-secondary)]">{goal.reason}</p>{goal.nextTask ? <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-2"><p className="text-xs font-medium">Next: {goal.nextTask.title}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{goal.nextTask.pathType === "prerequisite" ? "Ready prerequisite" : "Linked goal task"}{goal.nextTask.ownerLabel ? ` · ${goal.nextTask.ownerLabel}` : " · no owner recorded"}</p></div> : <p className="mt-3 text-xs font-medium text-[var(--text-primary)]">Next: {goal.nextAction}</p>}{goal.contradictions[0] ? <p className="mt-2 text-xs text-red-200">Conflict: {goal.contradictions[0].detail}</p> : null}</div>)}{!path.goals.length ? <p className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">Create or activate a measurable goal to build a path.</p> : null}</div>
  </SurfaceCard></div>;
}

function WorkSequenceCard({ sequence }: { sequence: ManagerWorkSequence }) {
  const ready = sequence.readyNow.slice(0, 4);
  const waiting = sequence.waiting.slice(0, 4);
  return <div data-testid="manager-work-sequence"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">What can move now</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{sequence.summary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">This uses saved task prerequisites and blockers. It does not estimate effort, duration, or private capacity.</p></div><a className="sb-btn-ghost" href="/tasks">Manage task order</a></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Ready now</p><div className="mt-2 space-y-2">{ready.map((item) => <div key={item.taskId} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><Badge variant={item.overdue ? "warning" : "success"}>{item.overdue ? "Overdue" : friendlyReason(item.state)}</Badge></div><p className="mt-1 text-xs text-[var(--text-secondary)]">{item.reason}</p>{item.ownerLabel ? <p className="mt-1 text-xs text-[var(--text-muted)]">Owner: {item.ownerLabel}</p> : null}</div>)}{!ready.length ? <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">No task is currently ready to start.</p> : null}</div></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Waiting</p><div className="mt-2 space-y-2">{waiting.map((item) => <div key={item.taskId} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><Badge variant={item.state === "conflicted" ? "danger" : "warning"}>{friendlyReason(item.state)}</Badge></div><p className="mt-1 text-xs text-[var(--text-secondary)]">{item.reason}</p></div>)}{!waiting.length ? <p className="rounded-lg border border-dashed border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">No task is waiting on another recorded task.</p> : null}</div></div></div>
  </SurfaceCard></div>;
}

function CommitmentHealthCard({ health }: { health: ManagerCommitmentHealth }) {
  const pressure = health.items.filter((item) => item.state !== "active").slice(0, 5);
  return <div data-testid="manager-commitments"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Follow-through</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{health.summary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">This is ranked from saved task status, owner, date, blocker, waiting party, and deferral history.</p></div><a className="sb-btn-secondary" href="/tasks">Open task board</a></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7"><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Open</dt><dd className="mt-1 text-xl font-semibold">{health.counts.open}</dd></div><div className="rounded-lg border border-red-500/20 p-3"><dt className="text-[var(--text-muted)]">Blocked</dt><dd className="mt-1 text-xl font-semibold">{health.counts.blocked}</dd></div><div className="rounded-lg border border-red-500/20 p-3"><dt className="text-[var(--text-muted)]">Overdue</dt><dd className="mt-1 text-xl font-semibold">{health.counts.overdue}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Waiting</dt><dd className="mt-1 text-xl font-semibold">{health.counts.waiting}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Unassigned</dt><dd className="mt-1 text-xl font-semibold">{health.counts.unassigned}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Deferred 2+</dt><dd className="mt-1 text-xl font-semibold">{health.counts.repeatedlyDeferred}</dd></div><div className="rounded-lg border border-[var(--border)] p-3"><dt className="text-[var(--text-muted)]">Due soon</dt><dd className="mt-1 text-xl font-semibold">{health.counts.dueSoon}</dd></div></dl>
    {pressure.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{pressure.map((item) => <div className={`rounded-lg border p-3 ${item.severity === "high" ? "border-red-500/25 bg-red-500/5" : "border-[var(--border)]"}`} key={item.taskId}><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><Badge variant={item.severity === "high" ? "danger" : "neutral"}>{friendlyReason(item.state)}</Badge></div><p className="mt-2 text-xs text-[var(--text-secondary)]">{item.reasons.join(" ")}</p><p className="mt-2 text-xs text-[var(--text-muted)]">{item.ownerLabel ? `Owner: ${item.ownerLabel}` : "No owner"}{item.dueAt ? ` · Due ${new Date(item.dueAt).toLocaleDateString()}` : " · No date"}</p></div>)}</div> : <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">No follow-through intervention is needed from the recorded task board.</p>}
    <div className="mt-4 rounded-lg bg-[var(--surface-0)] p-3 text-sm"><span className="font-medium">Manager's next move:</span> <span className="text-[var(--text-secondary)]">{health.nextAction}</span></div>
  </SurfaceCard></div>;
}

function TeamLoadCard({ load }: { load: ManagerTeamLoad }) {
  const suggestion = load.suggestions[0];
  return <div data-testid="manager-team-load"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><UsersRound className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Team workload</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{load.summary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Recorded tasks plus voluntary capacity check-ins · {load.confidenceLabel} coverage · {load.horizonDays}-day horizon. This does not estimate hours or anyone's personal circumstances.</p></div><a className="sb-btn-secondary" href="/tasks">Assign work</a></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{load.members.map((member) => <div className="rounded-lg border border-[var(--border)] p-3" key={member.memberId}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{member.name}</p><p className="mt-0.5 text-xs text-[var(--text-muted)]">{member.roles.length ? member.roles.join(", ") : "Responsibilities not recorded"}</p></div><div className="flex flex-col items-end gap-1"><Badge variant={member.pressure === "urgent" ? "danger" : member.pressure === "high" ? "warning" : "neutral"}>{member.pressure}</Badge><Badge variant={member.availability === "available" ? "success" : member.availability === "unavailable" ? "danger" : member.availability === "limited" ? "warning" : "neutral"}>{member.availabilityFreshness === "expired" ? "check-in expired" : member.availability}</Badge></div></div><dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-[var(--text-muted)]">Open</dt><dd className="mt-1 font-semibold">{member.openTasks}</dd></div><div><dt className="text-[var(--text-muted)]">Due soon</dt><dd className="mt-1 font-semibold">{member.dueWithinHorizon}</dd></div><div><dt className="text-[var(--text-muted)]">Overdue</dt><dd className="mt-1 font-semibold">{member.overdue}</dd></div></dl>{member.availabilityUntil && member.availabilityFreshness === "current" ? <p className="mt-2 text-xs text-[var(--text-muted)]">Capacity through {new Date(member.availabilityUntil).toLocaleDateString()}</p> : null}</div>)}</div>
    {suggestion ? <div className="mt-4 rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-muted)] p-3 text-sm"><p className="font-medium">Review one ownership match</p><p className="mt-1 text-[var(--text-secondary)]">“{suggestion.taskTitle}” → {suggestion.memberName}. {suggestion.reason}</p><p className="mt-2 text-xs text-[var(--text-muted)]">Ask “Who should own the unassigned work?” to review and accept the assignment in conversation.</p></div> : load.unassigned[0] ? <div className="mt-4 rounded-lg border border-[var(--border)] p-3 text-sm"><p className="font-medium">Ownership still needs a band decision</p><p className="mt-1 text-[var(--text-secondary)]">{load.nextAction}</p></div> : null}
  </SurfaceCard></div>;
}

function MemberCheckInsCard({ members, checkIns, load, busy, canManage, onRecord }: { members: BandMember[]; checkIns: BandMemberCheckIn[]; load: ManagerTeamLoad | null; busy: boolean; canManage: boolean; onRecord: (id: string, payload: unknown) => Promise<void> }) {
  return <div data-testid="manager-capacity-check-ins"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="sb-kicker">Capacity check-ins</p><h2 className="mt-2 font-semibold">Who has room for work right now?</h2><p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">Save a simple planning signal for each person. It helps the Manager avoid assigning work to someone who is unavailable; no private explanation is needed.</p></div><Badge variant="neutral">Append-only history</Badge></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{members.map((member) => <MemberCheckInRow key={member.id} member={member} latest={checkIns.find((checkIn) => checkIn.bandMemberId === member.id) ?? null} assessment={load?.members.find((item) => item.memberId === member.id) ?? null} busy={busy} canManage={canManage} onRecord={onRecord} />)}</div>
    {!members.length ? <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-muted)]">Add the working lineup before recording capacity.</p> : null}
  </SurfaceCard></div>;
}

function MemberCheckInRow({ member, latest, assessment, busy, canManage, onRecord }: { member: BandMember; latest: BandMemberCheckIn | null; assessment: ManagerTeamLoad["members"][number] | null; busy: boolean; canManage: boolean; onRecord: (id: string, payload: unknown) => Promise<void> }) {
  const [status, setStatus] = useState<BandMemberCheckIn["status"]>(assessment?.availability === "unknown" || !assessment ? "available" : assessment.availability);
  const [effectiveUntil, setEffectiveUntil] = useState(assessment?.availabilityUntil?.slice(0, 10) ?? "");
  const [note, setNote] = useState(assessment?.availabilityNote ?? "");
  async function save() {
    await onRecord(member.id, { status, note: note.trim() || null, effectiveUntil: effectiveUntil ? new Date(`${effectiveUntil}T23:59:59.000Z`).toISOString() : null });
  }
  const currentLabel = assessment?.availabilityFreshness === "current" ? assessment.availability : assessment?.availabilityFreshness === "expired" ? "expired" : "not checked in";
  return <div className="rounded-lg border border-[var(--border)] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{member.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Current signal: {currentLabel}{latest ? ` · last saved ${new Date(latest.createdAt).toLocaleDateString()}` : ""}</p></div><Badge variant={assessment?.availability === "available" && assessment.availabilityFreshness === "current" ? "success" : assessment?.availability === "unavailable" && assessment.availabilityFreshness === "current" ? "danger" : assessment?.availability === "limited" && assessment.availabilityFreshness === "current" ? "warning" : "neutral"}>{currentLabel}</Badge></div>{canManage ? <><div className="mt-3 grid gap-2 sm:grid-cols-2"><label><span className="sb-label">Capacity for {member.name}</span><select className="sb-select mt-1 w-full" value={status} disabled={busy} onChange={(event) => setStatus(event.target.value as BandMemberCheckIn["status"])}><option value="available">Available</option><option value="limited">Limited</option><option value="unavailable">Unavailable</option></select></label><label><span className="sb-label">Through (optional)</span><input className="sb-input mt-1" type="date" value={effectiveUntil} disabled={busy} onChange={(event) => setEffectiveUntil(event.target.value)} /></label><label className="sm:col-span-2"><span className="sb-label">Planning note (optional)</span><input className="sb-input mt-1" value={note} maxLength={500} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder="Keep it operational; no personal details needed" /></label></div><button type="button" className="sb-btn-secondary mt-3" disabled={busy} onClick={() => void save()}><Save className="h-4 w-4" /> Save check-in</button></> : assessment?.availabilityNote ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{assessment.availabilityNote}</p> : null}</div>;
}

function BandContextCard({ profile, members, health, busy, canManage, onSaveProfile, onAddMember, onUpdateMember }: { profile: ManagerProfile; members: BandMember[]; health: ManagerContextHealth; busy: boolean; canManage: boolean; onSaveProfile: (payload: unknown) => Promise<void>; onAddMember: (payload: unknown) => Promise<void>; onUpdateMember: (id: string, payload: unknown) => Promise<void> }) {
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
  return <div data-testid="manager-context"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Band context</h2></div><p className="mt-2 max-w-4xl text-sm text-[var(--text-secondary)]">{health.summary}</p><p className="mt-1 text-xs text-[var(--text-muted)]">This score measures recorded context, not the band's quality or potential.</p></div><div className="flex items-center gap-2"><Badge variant={health.status === "strong" ? "success" : health.status === "usable" ? "warning" : "neutral"}>{health.score}/100 · {friendlyReason(health.status)}</Badge>{canManage ? <button className="sb-btn-secondary" disabled={busy} onClick={() => setEditing((value) => !value)}><Pencil className="h-4 w-4" /> {editing ? "Close" : "Edit context"}</button> : <Badge variant="neutral">Read only</Badge>}</div></div>
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
  const savedRoles = member.roles.join(", "); const savedInstruments = member.instruments.join(", ");
  const [roles, setRoles] = useState(savedRoles); const [instruments, setInstruments] = useState(savedInstruments);
  useEffect(() => { setRoles(savedRoles); setInstruments(savedInstruments); }, [savedRoles, savedInstruments]);
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

function DecisionBoard({ decisions, busy, canManage, onCreate, onDecide, onReview }: { decisions: ManagerDecision[]; busy: boolean; canManage: boolean; onCreate: (payload: unknown) => Promise<void>; onDecide: (id: string, payload: unknown) => Promise<void>; onReview: (id: string, payload: unknown) => Promise<void> }) {
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
  return <div id="decisions" data-testid="manager-decisions" className="scroll-mt-6"><SurfaceCard><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><GitCompareArrows className="h-4 w-4 text-[var(--accent)]" /><h2 className="font-semibold">Band decisions</h2></div><p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">Write down the options before the band chooses. Record what you expect to happen, then return on the review date and compare it with the actual result.</p></div>{canManage ? <button className="sb-btn-secondary" disabled={busy} onClick={() => setCreating((value) => !value)}><Plus className="h-4 w-4" /> {creating ? "Close" : "New decision"}</button> : <Badge variant="neutral">Read only</Badge>}</div>
    {creating ? <form className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-4" onSubmit={(event) => void submit(event)}><div className="grid gap-4 md:grid-cols-3"><label className="md:col-span-2"><span className="sb-label">What does the band need to decide?</span><input className="sb-input mt-1.5" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Which regional market should we focus on next?" /></label><label><span className="sb-label">Area</span><select className="sb-select mt-1.5 w-full" value={workstream} onChange={(event) => setWorkstream(event.target.value)}>{["live", "releases", "audience", "content", "business", "relationships", "band_operations"].map((item) => <option key={item} value={item}>{friendlyReason(item)}</option>)}</select></label><label className="md:col-span-3"><span className="sb-label">What makes this decision necessary?</span><textarea className="sb-input mt-1.5 min-h-20" maxLength={3000} value={context} onChange={(event) => setContext(event.target.value)} placeholder="Include the constraint, deadline, or disagreement that matters." /></label></div><div className="mt-4 space-y-3"><p className="sb-label">Real options and tradeoffs</p>{options.map((option, index) => <div className="grid gap-2 md:grid-cols-[minmax(10rem,0.7fr)_minmax(14rem,1.3fr)_auto]" key={index}><input className="sb-input" required maxLength={200} aria-label={`Option ${index + 1}`} value={option.label} onChange={(event) => updateOption(index, "label", event.target.value)} placeholder={`Option ${index + 1}`} /><input className="sb-input" required maxLength={1000} aria-label={`Option ${index + 1} tradeoff`} value={option.tradeoff} onChange={(event) => updateOption(index, "tradeoff", event.target.value)} placeholder="What does this gain, cost, or risk?" />{options.length > 2 ? <button type="button" className="sb-btn-ghost px-3" aria-label={`Remove option ${index + 1}`} onClick={() => setOptions((current) => current.filter((_, position) => position !== index))}><X className="h-4 w-4" /></button> : <span />}</div>)}</div><div className="mt-4 flex flex-wrap gap-2">{options.length < 6 ? <button type="button" className="sb-btn-ghost" onClick={() => setOptions((current) => [...current, { label: "", tradeoff: "" }])}><Plus className="h-4 w-4" /> Add option</button> : null}<button className="sb-btn-primary" disabled={busy}>Save options</button><button type="button" className="sb-btn-ghost" onClick={reset} disabled={busy}>Cancel</button></div></form> : null}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">{active.map((decision) => <DecisionCard key={decision.id} decision={decision} busy={busy} canManage={canManage} onDecide={onDecide} onReview={onReview} />)}{!active.length ? <div className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--text-muted)]">No choice is waiting. Use this when the band has a real tradeoff worth learning from—not for routine tasks.</div> : null}</div>
    {reviewed.length ? <div className="mt-5 border-t border-[var(--border)] pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recently reviewed</p><div className="mt-3 grid gap-3 md:grid-cols-3">{reviewed.map((decision) => <div className="rounded-lg border border-[var(--border)] p-3" key={decision.id}><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{decision.title}</p><Badge variant={decision.reviewOutcome === "worked" ? "success" : decision.reviewOutcome === "did_not_work" ? "danger" : "neutral"}>{friendlyReason(decision.reviewOutcome ?? "reviewed")}</Badge></div><p className="mt-2 text-xs text-[var(--text-secondary)]">Chose “{decision.choice}”. {decision.reviewNote}</p></div>)}</div></div> : null}
  </SurfaceCard></div>;
}

function DecisionCard({ decision, busy, canManage, onDecide, onReview }: { decision: ManagerDecision; busy: boolean; canManage: boolean; onDecide: (id: string, payload: unknown) => Promise<void>; onReview: (id: string, payload: unknown) => Promise<void> }) {
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
  if (!canManage) return <div className={`rounded-xl border p-4 ${due ? "border-amber-500/35 bg-amber-500/5" : decision.needsFraming ? "border-violet-500/35 bg-violet-500/5" : "border-[var(--border)] bg-[var(--surface-0)]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{friendlyReason(decision.workstream)}</p><h3 className="mt-1 font-semibold">{decision.title}</h3>{decision.context ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{decision.context}</p> : null}</div><Badge variant={due ? "warning" : decision.status === "decided" ? "violet" : "neutral"}>{due ? "review due" : decision.needsFraming ? "needs framing" : decision.status}</Badge></div>{decision.status === "open" ? <div className="mt-4 space-y-2"><p className="sb-label">Options</p>{decision.options.map((option) => <div key={option.label} className="rounded-lg border border-[var(--border)] p-3"><p className="text-sm font-medium">{option.label}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{option.tradeoff}</p></div>)}</div> : <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-[var(--text-muted)]">Choice</dt><dd className="font-medium">{decision.choice}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Why</dt><dd className="text-[var(--text-secondary)]">{decision.rationale}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Expected result</dt><dd className="text-[var(--text-secondary)]">{decision.expectedOutcome}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Review date</dt><dd>{decision.reviewAt ? new Date(decision.reviewAt).toLocaleDateString() : "Not set"}</dd></div></dl>}</div>;
  return <div className={`rounded-xl border p-4 ${due ? "border-amber-500/35 bg-amber-500/5" : decision.needsFraming ? "border-violet-500/35 bg-violet-500/5" : "border-[var(--border)] bg-[var(--surface-0)]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{friendlyReason(decision.workstream)}</p><h3 className="mt-1 font-semibold">{decision.title}</h3>{decision.context ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{decision.context}</p> : null}</div><Badge variant={due ? "warning" : decision.status === "decided" ? "violet" : "neutral"}>{due ? "review due" : decision.needsFraming ? "needs framing" : decision.status}</Badge></div>
    {decision.status === "open" && editingFrame ? <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><p className="text-sm font-medium">Review the decision framing</p><p className="text-xs text-[var(--text-muted)]">Conversation can prepare a draft, but only the band can establish the real options and tradeoffs.</p><label className="block"><span className="sb-label">Decision framing title</span><input className="sb-input mt-1" value={frameTitle} maxLength={200} onChange={(event) => setFrameTitle(event.target.value)} /></label><label className="block"><span className="sb-label">Decision framing context</span><textarea className="sb-input mt-1 min-h-16" value={frameContext} maxLength={3000} onChange={(event) => setFrameContext(event.target.value)} /></label><label className="block"><span className="sb-label">Decision framing area</span><select className="sb-select mt-1 w-full" value={frameWorkstream} onChange={(event) => setFrameWorkstream(event.target.value)}>{["live", "releases", "audience", "content", "business", "relationships", "band_operations"].map((item) => <option key={item} value={item}>{friendlyReason(item)}</option>)}</select></label><div className="space-y-2">{frameOptions.map((option, index) => <div className="grid gap-2 md:grid-cols-[0.7fr_1.3fr_auto]" key={index}><input className="sb-input" aria-label={`Framing option ${index + 1}`} value={option.label} maxLength={200} onChange={(event) => updateFrameOption(index, "label", event.target.value)} /><input className="sb-input" aria-label={`Framing option ${index + 1} tradeoff`} value={option.tradeoff} maxLength={1000} onChange={(event) => updateFrameOption(index, "tradeoff", event.target.value)} />{frameOptions.length > 2 ? <button type="button" className="sb-btn-ghost px-3" aria-label={`Remove framing option ${index + 1}`} onClick={() => setFrameOptions((current) => current.filter((_, position) => position !== index))}><X className="h-4 w-4" /></button> : <span />}</div>)}</div><div className="flex flex-wrap gap-2">{frameOptions.length < 6 ? <button type="button" className="sb-btn-ghost" onClick={() => setFrameOptions((current) => [...current, { label: "", tradeoff: "" }])}><Plus className="h-4 w-4" /> Add option</button> : null}<button type="button" className="sb-btn-primary" disabled={busy || !frameValid} onClick={() => void saveFrame()}><Save className="h-4 w-4" /> Save framing</button>{!decision.needsFraming ? <button type="button" className="sb-btn-ghost" disabled={busy} onClick={() => setEditingFrame(false)}>Cancel</button> : null}</div></div> : null}
    {decision.status === "open" && !editingFrame ? <div className="mt-4 space-y-3"><div className="flex justify-end"><button type="button" className="sb-btn-ghost" disabled={busy} onClick={() => setEditingFrame(true)}><Pencil className="h-4 w-4" /> Edit framing</button></div><fieldset disabled={decision.needsFraming}><legend className="sb-label">Compare the options</legend><div className="mt-2 space-y-2">{decision.options.map((option) => <label className={`block cursor-pointer rounded-lg border p-3 ${choice === option.label ? "border-[var(--accent)] bg-[var(--accent-muted)]" : "border-[var(--border)]"}`} key={option.label}><span className="flex gap-2"><input type="radio" name={`choice-${decision.id}`} value={option.label} checked={choice === option.label} onChange={() => setChoice(option.label)} /><span><span className="text-sm font-medium">{option.label}</span><span className="mt-1 block text-xs text-[var(--text-secondary)]">{option.tradeoff}</span></span></span></label>)}</div></fieldset><label className="block"><span className="sb-label">Why this choice?</span><textarea className="sb-input mt-1.5 min-h-16" maxLength={2000} value={rationale} onChange={(event) => setRationale(event.target.value)} /></label><label className="block"><span className="sb-label">What result do you expect?</span><textarea className="sb-input mt-1.5 min-h-16" maxLength={2000} value={expectedOutcome} onChange={(event) => setExpectedOutcome(event.target.value)} placeholder="A result the band can later observe—not a guarantee." /></label><label className="block"><span className="sb-label">Check the result on</span><input className="sb-input mt-1.5" type="date" value={reviewAt} onChange={(event) => setReviewAt(event.target.value)} /></label><button className="sb-btn-primary" disabled={busy || decision.needsFraming || !choice || !rationale.trim() || !expectedOutcome.trim() || !reviewAt} onClick={() => void decide()}><Check className="h-4 w-4" /> Record the choice</button></div> : null}
    {decision.status !== "open" ? <div className="mt-4"><dl className="space-y-3 text-sm"><div><dt className="text-xs text-[var(--text-muted)]">Choice</dt><dd className="font-medium">{decision.choice}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Why</dt><dd className="text-[var(--text-secondary)]">{decision.rationale}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Expected result</dt><dd className="text-[var(--text-secondary)]">{decision.expectedOutcome}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">Review date</dt><dd>{decision.reviewAt ? new Date(decision.reviewAt).toLocaleDateString() : "Not set"}</dd></div></dl>{reviewing ? <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><label className="block"><span className="sb-label">What was the result?</span><select className="sb-select mt-1.5 w-full" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="worked">Worked</option><option value="mixed">Mixed result</option><option value="did_not_work">Did not work</option><option value="inconclusive">Too early / inconclusive</option></select></label><label className="block"><span className="sb-label">What actually happened, and what should the band carry forward?</span><textarea className="sb-input mt-1.5 min-h-24" maxLength={3000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label><div className="flex gap-2"><button className="sb-btn-primary" disabled={busy || !reviewNote.trim()} onClick={() => void review()}>Save the lesson</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setReviewing(false)}>Cancel</button></div></div> : <button className="sb-btn-secondary mt-4" disabled={busy} onClick={() => setReviewing(true)}>{due ? "Review the result" : "Record an early result"}</button>}</div> : null}
  </div>;
}

function RecommendationEvalReviewInbox({ queue, busy, onPromote }: {
  queue: ManagerRecommendationEvalReviewQueue;
  busy: boolean;
  onPromote: (recommendationId: string, payload: { label: "useful" | "not_useful" | "needs_revision"; notes?: string | null }) => Promise<void>;
}) {
  const item = queue.items[0] ?? null;
  const [correcting, setCorrecting] = useState(false);
  const [label, setLabel] = useState<"not_useful" | "needs_revision">("not_useful");
  const [notes, setNotes] = useState("");
  useEffect(() => { setCorrecting(false); setLabel("not_useful"); setNotes(""); }, [item?.recommendationId]);
  async function keepUseful() {
    if (!item) return;
    try { await onPromote(item.recommendationId, { label: "useful" }); }
    catch { /* parent displays the request error */ }
  }
  async function saveCorrection() {
    if (!item || notes.trim().length < 10) return;
    try { await onPromote(item.recommendationId, { label, notes: notes.trim() }); }
    catch { /* parent displays the request error */ }
  }
  const selectionLabel = item?.selectionReason === "completed_work" ? "Completed work" : item?.selectionReason === "dismissed_advice" ? "Dismissed advice" : "Blocked advice";
  return <div className="mt-5 border-t border-[var(--border)] pt-4" data-testid="manager-recommendation-eval-review">
    <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-medium"><TrendingUp className="h-4 w-4 text-[var(--accent)]" /> Review a Manager outcome</p><p className="mt-1 text-xs text-[var(--text-muted)]">Owner review only. Finishing work does not automatically mean the advice was useful.</p></div><Badge variant={queue.stableKeyCount ? "warning" : "success"}>{queue.stableKeyCount ? `${queue.stableKeyCount} to review` : "caught up"}</Badge></div>
    {item ? <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><div className="flex items-center justify-between gap-2"><Badge variant={item.outcome === "completed" ? "success" : item.outcome === "blocked" ? "warning" : "neutral"}>{selectionLabel}</Badge><span className="text-[11px] text-[var(--text-muted)]">{new Date(item.outcomeAt).toLocaleDateString()} · one result per advice pattern</span></div><p className="mt-2 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Why it was suggested: {item.reason}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Proposed next step: {item.nextAction}</p>{item.outcomeReason ? <p className="mt-2 text-xs text-[var(--text-muted)]">Recorded outcome: {friendlyReason(item.outcomeReason)}{item.outcomeNote ? ` — ${item.outcomeNote}` : ""}</p> : null}{item.task ? <p className="mt-1 text-xs text-[var(--text-muted)]">Linked task: {item.task.title} · {friendlyReason(item.task.status)}</p> : item.decision ? <p className="mt-1 text-xs text-[var(--text-muted)]">Linked decision: {item.decision.title} · {friendlyReason(item.decision.reviewOutcome ?? item.decision.status)}</p> : item.project ? <p className="mt-1 text-xs text-[var(--text-muted)]">Linked project: {item.project.name} · {friendlyReason(item.project.status)}</p> : item.event ? <p className="mt-1 text-xs text-[var(--text-muted)]">Linked event: {item.event.title} · {friendlyReason(item.event.status)}</p> : null}{correcting ? <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><label><span className="sb-label">How should this enter the release checks?</span><select aria-label="Recommendation review label" className="sb-select mt-1 w-full" value={label} onChange={(event) => setLabel(event.target.value as "not_useful" | "needs_revision")}><option value="not_useful">Do not repeat this advice</option><option value="needs_revision">Keep the need, revise the approach</option></select></label><label className="mt-2 block"><span className="sb-label">What should the Manager learn?</span><textarea className="sb-input mt-1 min-h-20 w-full" aria-label="What should the Manager learn?" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Name the missing context, wrong priority, or better next step." /></label><div className="mt-3 flex flex-wrap gap-2"><button className="sb-btn-secondary" disabled={busy || notes.trim().length < 10} onClick={() => void saveCorrection()}><ShieldCheck className="h-3.5 w-3.5" /> Add reviewed outcome</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setCorrecting(false)}>Cancel</button></div></div> : <div className="mt-3 flex flex-wrap gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => void keepUseful()}><ThumbsUp className="h-3.5 w-3.5" /> Keep as useful</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setCorrecting(true)}><ThumbsDown className="h-3.5 w-3.5" /> Needs work</button></div>}</div> : <p className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">No finished Manager recommendations from the last {queue.windowDays} days are waiting for owner review.</p>}
  </div>;
}

function ResponseReviewInbox({ queue, busy, onFeedback }: {
  queue: ManagerResponseReviewQueue;
  busy: boolean;
  onFeedback: (messageId: string, payload: { helpful: boolean; reason?: string | null; note?: string | null }) => Promise<void>;
}) {
  const item = queue.items[0] ?? null;
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("missed_question");
  const [note, setNote] = useState("");
  useEffect(() => { setCorrecting(false); setReason("missed_question"); setNote(""); }, [item?.messageId]);
  const reasonLabel = item?.selectionReason === "action_proposal"
    ? "Includes a proposed internal action"
    : item?.selectionReason === "grounded_answer"
      ? "Uses current StoryBoard records"
      : "Recent unrated answer";
  return <div className="mt-5 border-t border-[var(--border)] pt-4" data-testid="manager-response-review">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">Review a recent Manager answer</p><p className="mt-1 text-xs text-[var(--text-muted)]">Opening this inbox records nothing. Only your explicit rating becomes learning evidence.</p></div><Badge variant={queue.eligibleCount ? "warning" : "success"}>{queue.eligibleCount ? `${queue.eligibleCount} unrated` : "caught up"}</Badge></div>
    {item ? <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{reasonLabel}</p><p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">You asked: “{item.question}”</p><p className="mt-2 whitespace-pre-line text-sm leading-6">{item.answer}</p><p className="mt-2 text-[11px] text-[var(--text-muted)]">{new Date(item.createdAt).toLocaleDateString()} · one recent answer per conversation</p>{correcting ? <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3"><label><span className="sb-label">What should improve?</span><select className="sb-select mt-1 w-full" value={reason} onChange={(event) => setReason(event.target.value)}><option value="missed_question">Missed my question</option><option value="incorrect">Something was incorrect</option><option value="too_vague">Too vague</option><option value="too_long">Too long</option><option value="wrong_tone">Tone felt wrong</option><option value="missing_context">Missing context</option><option value="other">Other</option></select></label><label className="mt-2 block"><span className="sb-label">Correction (optional)</span><input className="sb-input mt-1 w-full" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="What would have made this useful?" /></label><div className="mt-3 flex gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => void onFeedback(item.messageId, { helpful: false, reason, note: note.trim() || null })}>Save feedback</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setCorrecting(false)}>Cancel</button></div></div> : <div className="mt-3 flex flex-wrap gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => void onFeedback(item.messageId, { helpful: true })}><ThumbsUp className="h-3.5 w-3.5" /> Helpful</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setCorrecting(true)}><ThumbsDown className="h-3.5 w-3.5" /> Needs work</button></div>}</div> : <p className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">No unrated Manager answers from the last {queue.windowDays} days.</p>}
  </div>;
}

function ResponseEvalReviewInbox({ queue, busy, onPromote }: {
  queue: ManagerResponseEvalReviewQueue;
  busy: boolean;
  onPromote: (messageId: string, payload: { label: "useful" | "needs_revision"; expectedBehavior?: string | null }) => Promise<void>;
}) {
  const item = queue.items[0] ?? null;
  const [expectedBehavior, setExpectedBehavior] = useState(item?.feedback.note ?? "");
  useEffect(() => { setExpectedBehavior(item?.feedback.note ?? ""); }, [item?.messageId, item?.feedback.note]);
  return <div className="mt-5 border-t border-[var(--border)] pt-4" data-testid="manager-response-eval-review">
    <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-[var(--accent)]" /> Add reviewed answers to release checks</p><p className="mt-1 text-xs text-[var(--text-muted)]">Owner review only. Nothing enters the regression set until you add it explicitly.</p></div><Badge variant={queue.eligibleCount ? "warning" : "success"}>{queue.eligibleCount ? `${queue.eligibleCount} to triage` : "caught up"}</Badge></div>
    {item ? <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3"><div className="flex items-center justify-between gap-2"><Badge variant={item.feedback.helpful ? "success" : "warning"}>{item.feedback.helpful ? "Helpful" : "Needs revision"}</Badge><span className="text-[11px] text-[var(--text-muted)]">{new Date(item.feedback.updatedAt).toLocaleDateString()}</span></div><p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">You asked: “{item.question}”</p><p className="mt-2 whitespace-pre-line text-sm leading-6">{item.answer}</p>{item.feedback.note ? <p className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-2 text-xs text-[var(--text-secondary)]">Review note: {item.feedback.note}</p> : null}{item.feedback.helpful ? <button className="sb-btn-secondary mt-3" disabled={busy} onClick={() => void onPromote(item.messageId, { label: "useful" })}><ShieldCheck className="h-3.5 w-3.5" /> Add helpful answer to evals</button> : <div className="mt-3"><label><span className="sb-label">Expected Manager behavior</span><textarea className="sb-input mt-1 min-h-20 w-full" maxLength={3000} value={expectedBehavior} onChange={(event) => setExpectedBehavior(event.target.value)} placeholder="What should the Manager do instead?" /></label><button className="sb-btn-secondary mt-2" disabled={busy || expectedBehavior.trim().length < 10} onClick={() => void onPromote(item.messageId, { label: "needs_revision", expectedBehavior: expectedBehavior.trim() })}><ShieldCheck className="h-3.5 w-3.5" /> Add correction to evals</button></div>}</div> : <p className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">No rated answers are waiting for evaluation review.</p>}
  </div>;
}

function ManagerMessageBubble({ message, busy, canManage, evalExamples, responseEvalExamples, onAcceptRecommendation, onDismissRecommendation, onPromoteEval, onPromoteResponseEval, onFeedback }: {
  message: ManagerMessage;
  busy: boolean;
  canManage: boolean;
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
  if (!canManage) {
    if (message.role === "user") return <div className="ml-8 rounded-2xl rounded-br-md bg-[var(--accent)] px-4 py-3 text-sm leading-6 text-white"><p className="whitespace-pre-wrap">{message.content}</p></div>;
    return <div className="mr-4 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3 text-sm leading-6" data-feedback-allowed="false"><p className="whitespace-pre-wrap">{message.content}</p>{message.citations.length ? <p className="mt-3 text-xs text-[var(--text-muted)]">Grounded in {message.citations.length} StoryBoard record{message.citations.length === 1 ? "" : "s"}</p> : null}{message.proposedActions.map((action) => { const presentation = managerActionOutcomePresentation(action.outcome, action.followThrough); return <div key={action.recommendationId} className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{managerActionLabel(action.actionType)}</p><p className="mt-1 font-medium">{action.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{action.nextAction}</p>{action.preview ? <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-2 text-xs" data-testid="manager-memory-preview">{action.preview}</p> : null}{action.followThrough ? <div className="mt-3"><ManagerActionReceipt item={action.followThrough} /></div> : null}<div className="mt-3"><span data-testid="manager-action-outcome" data-tone={presentation.tone}><Badge variant={presentation.variant}>{action.outcome === "suggested" ? "Read only" : presentation.label}</Badge></span></div></div>; })}</div>;
  }
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
  return <div className="mr-4 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3 text-sm leading-6" data-feedback-allowed={message.canSubmitFeedback ? "true" : "false"}>
    <p className="whitespace-pre-wrap">{message.content}</p>
    {message.citations.length ? <p className="mt-3 text-xs text-[var(--text-muted)]">Grounded in {message.citations.length} StoryBoard record{message.citations.length === 1 ? "" : "s"}</p> : null}
    {message.proposedActions.map((action) => {
      const outcomePresentation = managerActionOutcomePresentation(action.outcome, action.followThrough);
      return <div key={action.recommendationId} className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{managerActionLabel(action.actionType)}</p><p className="mt-1 font-medium">{action.title}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{action.nextAction}</p>{action.preview ? <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-2 text-xs" data-testid="manager-memory-preview">{action.preview}</p> : null}{action.outcome === "suggested" ? canManage ? <div className="mt-3 flex flex-wrap gap-2"><button className="sb-btn-primary" disabled={busy} onClick={() => void onAcceptRecommendation(action.recommendationId)}><Check className="h-4 w-4" /> {managerActionButton(action.actionType)}</button><button className="sb-btn-ghost" disabled={busy} onClick={() => void onDismissRecommendation(action.recommendationId, "not_relevant")}>Not useful</button></div> : <div className="mt-3"><Badge variant="neutral">Read only</Badge></div> : <div className="mt-3 space-y-2">{action.followThrough ? <ManagerActionReceipt item={action.followThrough} /> : null}<div className="flex flex-wrap items-center gap-2"><span data-testid="manager-action-outcome" data-tone={outcomePresentation.tone}><Badge variant={outcomePresentation.variant}>{outcomePresentation.label}</Badge></span>{evalExamples ? evalExamples.some((example) => example.recommendationId === action.recommendationId) ? <Badge variant="violet">in eval set</Badge> : <button className="sb-btn-ghost" disabled={busy} onClick={() => void onPromoteEval(action.recommendationId, action.outcome)}>Add to eval set</button> : null}</div></div>}</div>;
    })}
    {message.canSubmitFeedback ? (correcting ? <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><label><span className="sb-label">What should improve?</span><select className="sb-select mt-1 w-full" value={reason} onChange={(event) => setReason(event.target.value)}><option value="missed_question">Missed my question</option><option value="incorrect">Something was incorrect</option><option value="too_vague">Too vague</option><option value="too_long">Too long</option><option value="wrong_tone">Tone felt wrong</option><option value="missing_context">Missing context</option><option value="other">Other</option></select></label><label className="mt-2 block"><span className="sb-label">Correction (optional)</span><input className="sb-input mt-1 w-full" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="What would have made this useful?" /></label><div className="mt-3 flex gap-2"><button className="sb-btn-secondary" disabled={busy} onClick={() => void saveCorrection()}>Save feedback</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setCorrecting(false)}>Cancel</button></div></div> : <div className="mt-3 flex items-center gap-1 border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]"><span className="mr-1">Was this useful?</span><button className={message.feedback?.helpful ? "rounded-md bg-[var(--accent-muted)] px-2 py-1 text-[var(--accent)]" : "rounded-md px-2 py-1 hover:bg-[var(--surface-1)]"} disabled={busy} onClick={() => void markHelpful()}><ThumbsUp className="mr-1 inline h-3.5 w-3.5" /> Helpful</button><button className={message.feedback && !message.feedback.helpful ? "rounded-md bg-[var(--accent-muted)] px-2 py-1 text-[var(--accent)]" : "rounded-md px-2 py-1 hover:bg-[var(--surface-1)]"} disabled={busy} onClick={() => setCorrecting(true)}><ThumbsDown className="mr-1 inline h-3.5 w-3.5" /> Needs work</button>{message.feedback ? <span className="ml-auto">Saved</span> : null}</div>) : null}
    {message.canSubmitFeedback && responseEvalExamples && message.feedback ? responseEval ? <div className="mt-2 flex justify-end"><Badge variant={responseEval.label === "useful" ? "success" : "warning"}>answer in eval set</Badge></div> : message.feedback.helpful ? <div className="mt-2 flex justify-end"><button className="sb-btn-ghost" disabled={busy} onClick={() => void addResponseEval()}><ShieldCheck className="h-4 w-4" /> Add answer to evals</button></div> : reviewingEval ? <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"><p className="text-sm font-medium">Capture the expected behavior</p><p className="mt-1 text-xs text-[var(--text-muted)]">This unresolved example will block the current intelligence release gate.</p><label className="mt-2 block"><span className="sb-label">What should the Manager do instead?</span><textarea className="sb-input mt-1 min-h-20 w-full" value={expectedBehavior} maxLength={3000} onChange={(event) => setExpectedBehavior(event.target.value)} /></label><div className="mt-3 flex gap-2"><button className="sb-btn-secondary" disabled={busy || expectedBehavior.trim().length < 10} onClick={() => void addResponseEval()}>Save eval example</button><button className="sb-btn-ghost" disabled={busy} onClick={() => setReviewingEval(false)}>Cancel</button></div></div> : <div className="mt-2 flex justify-end"><button className="sb-btn-ghost" disabled={busy} onClick={() => setReviewingEval(true)}><ShieldCheck className="h-4 w-4" /> Add answer to evals</button></div> : null}
  </div>;
}

function friendlyReason(reason: string) {
  return reason.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function managerActionLabel(actionType?: string | null) {
  if (actionType === "create_conversation_task") return "Suggested shared task";
  if (actionType === "update_conversation_task") return "Suggested task update";
  if (actionType === "assign_conversation_task") return "Suggested task owner";
  if (actionType === "create_conversation_project") return "Suggested band project";
  if (actionType === "create_conversation_event") return "Suggested band event";
  if (actionType === "update_conversation_event_availability") return "Suggested availability update";
  if (actionType === "remember_fact") return "Suggested band memory";
  if (actionType === "update_profile_context") return "Suggested band context";
  if (actionType === "create_decision") return "Suggested open decision";
  if (actionType === "generate_event_advance") return "Suggested show setup";
  if (actionType === "prepare_event_logistics_approvals") return "Suggested event logistics approvals";
  if (actionType === "generate_project_plan") return "Suggested project setup";
  if (actionType === "assign_task") return "Suggested task owner";
  if (actionType === "create_task") return "Suggested internal task";
  return "Manager guidance";
}

function managerActionButton(actionType?: string | null) {
  if (actionType === "remember_fact") return "Remember this";
  if (actionType === "update_profile_context") return "Save context";
  if (actionType === "create_decision") return "Add decision draft";
  if (actionType === "generate_event_advance") return "Build advance";
  if (actionType === "prepare_event_logistics_approvals") return "Prepare approvals";
  if (actionType === "generate_project_plan") return "Build milestone plan";
  if (actionType === "create_conversation_project") return "Create project and plan";
  if (actionType === "create_conversation_event") return "Create event";
  if (actionType === "update_conversation_event_availability") return "Update availability";
  if (actionType === "assign_task") return "Assign task";
  if (actionType === "create_task" || actionType === "create_conversation_task") return "Add task";
  if (actionType === "update_conversation_task") return "Update task";
  if (actionType === "assign_conversation_task") return "Assign task";
  return "Mark handled";
}

type ManagerActionTone = "success" | "warning" | "danger" | "neutral";

function ManagerRecommendationOutcomeBadge({ recommendation }: { recommendation: ManagerRecommendation }) {
  const presentation = managerActionOutcomePresentation(recommendation.outcome, recommendation.followThrough);
  return <span data-testid="manager-recommendation-outcome" data-tone={presentation.tone}><Badge variant={presentation.variant}>{presentation.label}</Badge></span>;
}

function managerActionOutcomePresentation(outcome: string, followThrough?: ManagerFollowThroughItem | null): { tone: ManagerActionTone; variant: ManagerActionTone; label: string } {
  if (followThrough?.stage === "approval_failed") return { tone: "danger", variant: "danger", label: "Approval failed" };
  if (followThrough?.stage === "approval_rejected") return { tone: "warning", variant: "warning", label: followThrough.statusLabel };
  if (followThrough?.stage === "execution_in_progress") return { tone: "neutral", variant: "neutral", label: "Execution in progress" };
  if (followThrough?.stage === "execution_unknown") return { tone: "warning", variant: "warning", label: "Execution unknown" };
  if (followThrough?.stage === "approval_simulated") return { tone: "warning", variant: "warning", label: "Simulation only" };
  if (followThrough?.stage === "reconciled") return { tone: "neutral", variant: "neutral", label: "Closed after review" };
  if (followThrough?.state === "blocked") return { tone: "warning", variant: "warning", label: "Blocked" };
  if (followThrough?.state === "needs_action") return { tone: "warning", variant: "warning", label: "Needs action" };
  if (outcome === "dismissed") return { tone: "neutral", variant: "neutral", label: "Dismissed" };
  if (followThrough?.state === "completed") return { tone: "success", variant: "success", label: "Completed" };
  if (followThrough?.state === "in_motion") return { tone: "success", variant: "success", label: friendlyReason(outcome) };
  if (outcome === "blocked") return { tone: "warning", variant: "warning", label: "Blocked" };
  return { tone: "success", variant: "success", label: friendlyReason(outcome) };
}

function ManagerActionReceipt({ item }: { item: ManagerFollowThroughItem }) {
  const destination = safeManagerDestination(item.destination);
  const presentation = managerActionReceiptPresentation(item);
  return <div className={`rounded-lg border p-3 ${presentation.containerClass}`} data-testid="manager-action-receipt" data-tone={presentation.tone} data-state={item.state} data-stage={item.stage}><div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-xs font-semibold ${presentation.labelClass}`}>{item.statusLabel}</p><span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{friendlyReason(item.stage)}</span></div><p className="mt-1 text-xs text-[var(--text-secondary)]">{item.detail}</p>{item.nextAction ? <p className="mt-2 text-xs font-medium">Next: {item.nextAction}</p> : null}{destination ? <a className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline" href={destination.href} data-testid="manager-action-receipt-destination">{destination.label}<ArrowUpRight className="h-3.5 w-3.5" /></a> : null}</div>;
}

function managerActionReceiptPresentation(item: ManagerFollowThroughItem): { tone: ManagerActionTone; containerClass: string; labelClass: string } {
  if (item.stage === "approval_failed") return { tone: "danger", containerClass: "border-red-500/25 bg-red-500/5", labelClass: "text-red-200" };
  if (item.stage === "execution_in_progress") return { tone: "neutral", containerClass: "border-blue-500/25 bg-blue-500/5", labelClass: "text-blue-100" };
  if (item.state === "blocked" || item.stage === "execution_unknown" || item.stage === "approval_simulated") return { tone: "warning", containerClass: "border-amber-500/30 bg-amber-500/5", labelClass: "text-amber-200" };
  if (item.state === "needs_action") return { tone: "warning", containerClass: "border-amber-500/30 bg-amber-500/5", labelClass: "text-amber-200" };
  if (item.stage === "reconciled") return { tone: "neutral", containerClass: "border-[var(--border)] bg-[var(--surface-0)]", labelClass: "text-[var(--text-primary)]" };
  if (item.state === "completed" || item.state === "in_motion") return { tone: "success", containerClass: "border-emerald-500/25 bg-emerald-500/5", labelClass: "text-emerald-100" };
  return { tone: "neutral", containerClass: "border-[var(--border)] bg-[var(--surface-0)]", labelClass: "text-[var(--text-primary)]" };
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

function GoalProgressCard({ goal, measurement, health, busy, canManage, onRecord, onMeasurementKind, onTargetDirection, onSync }: { goal: ManagerGoal; measurement: ManagerGoalMeasurement | null; health: ManagerPlanHealth["goals"][number] | null; busy: boolean; canManage: boolean; onRecord: (goalId: string, value: number, note: string | null) => Promise<void>; onMeasurementKind: (goalId: string, kind: ManagerGoalMeasurementKind) => Promise<void>; onTargetDirection: (goalId: string, direction: ManagerGoalTargetDirection) => Promise<void>; onSync: (goalId: string, observedValue: number) => Promise<void> }) {
  const [value, setValue] = useState(goal.currentValue?.toString() ?? "");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setValue(goal.currentValue?.toString() ?? ""); }, [goal.currentValue, editing]);
  async function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    try { await onRecord(goal.id, parsed, note.trim() || null); setNote(""); setEditing(false); } catch { /* parent displays request errors */ }
  }
  const progress = health?.target.progressRatio === null || health?.target.progressRatio === undefined ? null : Math.max(0, Math.min(100, Math.round(health.target.progressRatio * 100)));
  const targetDirection = goal.targetDirection ?? "at_least";
  return <div className="rounded-lg border border-[var(--border)] p-3">
    <div className="flex items-start justify-between gap-2"><div><p className="font-medium">{goal.title}</p><p className="mt-1 text-xs capitalize text-[var(--text-muted)]">{goal.workstream.replace("_", " ")}{goal.deadline ? ` · due ${new Date(goal.deadline).toLocaleDateString()}` : ""}</p></div><Badge variant={health?.status === "on_track" || health?.status === "target_reached" ? "success" : health?.status === "off_track" ? "danger" : "neutral"}>{health ? friendlyReason(health.status) : goal.status}</Badge></div>
    {progress !== null ? <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-[var(--text-muted)]">{goal.currentValue} of at least {goal.targetValue} {goal.targetUnit ?? ""} · {progress}%</p></div> : health?.target ? <p className="mt-3 text-xs text-[var(--text-muted)]">Target: {health.target.targetLabel}. Current: {goal.currentValue ?? "not recorded"} {goal.targetUnit ?? ""}.</p> : <p className="mt-3 text-xs text-[var(--text-muted)]">Progress is not measurable yet.</p>}
    {health?.reasons[0] ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{health.reasons[0]}</p> : null}
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-0)] p-3" data-testid={`goal-measurement-${goal.id}`}>
      {canManage ? <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs"><span className="sb-label">Target means</span><select data-testid={`goal-target-direction-${goal.id}`} className="sb-select mt-1 w-full" value={targetDirection} disabled={busy} onChange={(event) => void onTargetDirection(goal.id, event.target.value as ManagerGoalTargetDirection)}><option value="at_least">Reach at least</option><option value="at_most">Stay at or below</option><option value="exact">Match exactly</option></select></label>
        <label className="text-xs"><span className="sb-label">Progress source</span><select className="sb-select mt-1 w-full" value={goal.measurementKind} disabled={busy} onChange={(event) => void onMeasurementKind(goal.id, event.target.value as ManagerGoalMeasurementKind)}><option value="manual">Manual</option><option value="qualified_prospects">Qualified prospects</option><option value="confirmed_gigs">Confirmed gigs in goal window</option><option value="completed_gigs">Completed gigs in goal window</option><option value="completed_projects">Completed linked projects</option></select></label>
      </div> : <p className="text-xs text-[var(--text-muted)]">Target: {friendlyReason(targetDirection)} · source: {friendlyReason(goal.measurementKind)}</p>}
      {health?.target ? <div className="mt-3 flex items-start justify-between gap-2"><p className="text-xs text-[var(--text-secondary)]">{health.target.summary}</p><Badge variant={health.target.state === "met" ? "success" : health.target.state === "not_met" ? "warning" : "neutral"}>{friendlyReason(health.target.state)}</Badge></div> : null}
      {measurement ? <><div className="mt-3 flex items-center justify-between gap-2"><p className="text-xs text-[var(--text-secondary)]">{measurement.summary}</p><Badge variant={measurement.status === "in_sync" ? "success" : measurement.status === "recorded_ahead" ? "warning" : "neutral"}>{friendlyReason(measurement.status)}</Badge></div>{canManage && measurement.observedValue !== null && measurement.status !== "in_sync" ? <button className="sb-btn-secondary mt-2" disabled={busy} onClick={() => void onSync(goal.id, measurement.observedValue as number)}><GitCompareArrows className="h-4 w-4" /> Reconcile to {measurement.observedValue}</button> : null}</> : null}
    </div>
    {goal.initiatives?.map((initiative) => <div key={initiative.id} className="mt-3 rounded-lg bg-[var(--surface-0)] p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{initiative.title}</p><span className="text-[11px] capitalize text-[var(--text-muted)]">{initiative.status}</span></div><ol className="mt-2 space-y-1.5">{initiative.tasks?.filter((task) => task.status !== "done").slice(0, 3).map((task) => <li key={task.id} className="flex gap-2 text-xs text-[var(--text-secondary)]"><span className="text-[var(--accent)]">•</span><span>{task.title}{task.dueAt ? ` · ${new Date(task.dueAt).toLocaleDateString()}` : ""} · {task.ownerLabel ?? "Unassigned"}</span></li>)}</ol>{initiative.tasks?.some((task) => task.status !== "done" && !task.ownerLabel) ? <a className="mt-2 inline-block text-xs font-medium text-[var(--accent)] hover:underline" href="/tasks">Assign owners in Tasks</a> : null}{initiative.tasks?.every((task) => task.status === "done") ? <p className="mt-2 text-xs text-[var(--text-muted)]">All linked steps are complete.</p> : null}</div>)}
    {canManage ? editing ? <div className="mt-3 space-y-2 rounded-lg bg-[var(--surface-0)] p-3"><label><span className="sb-label">Current value</span><input className="sb-input mt-1" type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} /></label><label><span className="sb-label">What changed? (optional)</span><input className="sb-input mt-1" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Booked the second regional show" /></label><div className="flex gap-2"><button className="sb-btn-primary" disabled={busy || !Number.isFinite(Number(value))} onClick={() => void save()}><Save className="h-4 w-4" /> Record</button><button className="sb-btn-ghost" disabled={busy} onClick={() => { setValue(goal.currentValue?.toString() ?? ""); setNote(""); setEditing(false); }}>Cancel</button></div></div> : <button className="sb-btn-ghost mt-2" disabled={busy} onClick={() => setEditing(true)}>Update progress</button> : null}
  </div>;
}

function MemoryFactEditor({ fact, assessment, busy, canManage, onSave, onConfirm, onArchive }: { fact: ManagerMemoryFact; assessment: ManagerKnowledgeHealth["items"][number] | null; busy: boolean; canManage: boolean; onSave: (value: unknown) => Promise<void>; onConfirm: () => Promise<void>; onArchive: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => memoryValueText(fact.value));
  const profileManaged = fact.sourceType === "operating_profile" || assessment?.authoritativeSource === "operating_profile";
  async function save() { try { await onSave(parseMemoryValue(text, fact.value)); setEditing(false); } catch { /* parent displays the request error */ } }
  async function confirm() { try { await onConfirm(); } catch { /* parent displays the request error */ } }
  async function archive() { try { await onArchive(); } catch { /* parent displays the request error */ } }
  return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-0)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{friendlyReason(fact.key)}</p>{editing && canManage ? <textarea className="sb-input mt-2 min-h-20" value={text} onChange={(event) => setText(event.target.value)} aria-label={`Correct ${friendlyReason(fact.key)}`} /> : <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{memoryValueText(fact.value) || "Not specified"}</p>}<p className="mt-2 text-[11px] text-[var(--text-muted)]">{profileManaged ? "Managed by the operating profile" : assessment ? friendlyReason(assessment.state) : fact.confirmedAt ? `Confirmed ${new Date(fact.confirmedAt).toLocaleDateString()}` : "Needs confirmation"}{!profileManaged && fact.confirmedAt ? ` · ${new Date(fact.confirmedAt).toLocaleDateString()}` : ""}</p>{assessment && assessment.state !== "current" ? <p className="mt-1 text-[11px] text-[var(--text-muted)]">{assessment.reason}</p> : null}</div>{profileManaged ? <Badge variant="neutral">Profile source</Badge> : canManage ? editing ? <div className="flex shrink-0 gap-1"><button className="sb-btn-primary px-3" disabled={busy} onClick={() => void save()} aria-label={`Save ${friendlyReason(fact.key)}`}><Save className="h-4 w-4" /></button><button className="sb-btn-ghost px-3" disabled={busy} onClick={() => { setText(memoryValueText(fact.value)); setEditing(false); }} aria-label="Cancel correction"><X className="h-4 w-4" /></button></div> : <div className="flex shrink-0 gap-1">{assessment && assessment.state !== "current" ? <button className="sb-btn-ghost px-3" disabled={busy} onClick={() => void confirm()} aria-label={`Confirm ${friendlyReason(fact.key)}`}><Check className="h-4 w-4" /></button> : null}<button className="sb-btn-ghost px-3" disabled={busy} onClick={() => setEditing(true)} aria-label={`Correct ${friendlyReason(fact.key)}`}><Pencil className="h-4 w-4" /></button><button className="sb-btn-ghost px-3" disabled={busy} onClick={() => void archive()} aria-label={`Archive ${friendlyReason(fact.key)}`}><Archive className="h-4 w-4" /></button></div> : <Badge variant="neutral">Read only</Badge>}</div></div>;
}

function Intake({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit: (payload: unknown) => Promise<void> }) {
  const [mode, setMode] = useState<"original"|"cover_event"|"hybrid">("original"); const [stage, setStage] = useState(""); const [market, setMarket] = useState(""); const [genres, setGenres] = useState(""); const [ambition, setAmbition] = useState(""); const [constraints, setConstraints] = useState(""); const [memberNames, setMemberNames] = useState("");
  return <SurfaceCard className="mx-auto max-w-3xl"><p className="sb-kicker">Guided setup</p><h2 className="mt-2 text-2xl font-semibold">Tell StoryBoard enough to manage the tradeoffs</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">No music-business vocabulary required. Draft details can change later; unknowns stay unknown.</p>{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}<form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const [homeCity, homeRegion] = market.split(",").map((value) => value.trim()); void onSubmit({ profile: { bandMode: mode, careerStage: stage || null, homeCity: homeCity || null, homeRegion: homeRegion || null, homeCountry: "US", genres: genres.split(",").map((v) => v.trim()).filter(Boolean), businessName: null, currentAssets: [], revenueSources: [], constraints: constraints.split("\n").map((v) => v.trim()).filter(Boolean), budgetToleranceMinor: null, twelveMonthAmbition: ambition || null, communicationCadence: "weekly", decisionStyle: "guided", educationTopics: [], availabilityExpectations: null, currency: "USD" }, members: memberNames.split("\n").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, roles: [], instruments: [], active: true })) }); }}><label><span className="sb-label">What kind of band?</span><select className="sb-select mt-1.5" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="original">Original music</option><option value="cover_event">Cover / event band</option><option value="hybrid">Both</option></select></label><label><span className="sb-label">Career stage</span><input className="sb-input mt-1.5" value={stage} onChange={(event) => setStage(event.target.value)} placeholder="New, local draw, regional..." /></label><label><span className="sb-label">Home market</span><input required className="sb-input mt-1.5" value={market} onChange={(event) => setMarket(event.target.value)} placeholder="Chicago, IL" /></label><label><span className="sb-label">Genres</span><input className="sb-input mt-1.5" value={genres} onChange={(event) => setGenres(event.target.value)} placeholder="indie rock, soul" /></label><label className="sm:col-span-2"><span className="sb-label">What would a great next 12 months look like?</span><textarea required className="sb-input mt-1.5 min-h-24" value={ambition} onChange={(event) => setAmbition(event.target.value)} /></label><label><span className="sb-label">Band member names</span><textarea className="sb-input mt-1.5 min-h-28" value={memberNames} onChange={(event) => setMemberNames(event.target.value)} placeholder={"One name per line"} /></label><label><span className="sb-label">Constraints</span><textarea className="sb-input mt-1.5 min-h-28" value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder={"Work schedules\nLimited budget"} /></label><div className="sm:col-span-2"><button className="sb-btn-primary" disabled={busy}>{busy ? "Building plan..." : "Build my 90-day operating plan"}</button></div></form></SurfaceCard>;
}
