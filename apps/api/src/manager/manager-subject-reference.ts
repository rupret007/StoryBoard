export const MANAGER_SUBJECT_REFERENCE_POLICY_VERSION = "manager_subject_reference_v1" as const;

export const managerSubjectKinds = ["goal", "task", "event", "project", "decision", "opportunity", "prospect", "deal", "invoice", "settlement"] as const;
export type ManagerSubjectKind = typeof managerSubjectKinds[number];

export type ManagerSubjectCandidate = {
  id: string;
  kind: ManagerSubjectKind;
  label: string;
  aliases: string[];
};

export type ManagerSubjectReference = {
  policyVersion: typeof MANAGER_SUBJECT_REFERENCE_POLICY_VERSION;
  status: "not_requested" | "resolved" | "needs_clarification";
  confidence: number;
  matchType: "none" | "full_label" | "quoted_fragment" | "unique_typed_token" | "ambiguous" | "missing_quoted_subject";
  kindHints: ManagerSubjectKind[];
  subject: ManagerSubjectCandidate | null;
  candidates: ManagerSubjectCandidate[];
  clarification: string | null;
};

type ManagerSubjectFacts = {
  goals?: { id: string; title: string }[];
  tasks?: { id: string; title: string }[];
  events?: { id: string; title: string }[];
  projects?: { id: string; name: string }[];
  decisions?: { id: string; title: string }[];
  opportunities?: { id: string; title: string }[];
  prospects?: { id: string; name: string }[];
  deals?: { id: string; title: string }[];
  invoices?: { id: string; number: string }[];
  settlements?: { id: string; event: { title: string } }[];
};

const KIND_LABELS: Record<ManagerSubjectKind, string> = {
  goal: "goal",
  task: "task",
  event: "event",
  project: "project",
  decision: "decision",
  opportunity: "booking opportunity",
  prospect: "prospect",
  deal: "offer",
  invoice: "invoice",
  settlement: "settlement"
};

const STOP_TOKENS = new Set([
  "about", "active", "again", "blocking", "current", "doing", "first", "going", "good", "have", "last", "latest", "next", "one", "ready", "right", "second", "should", "still", "that", "their", "there", "these", "third", "this", "those", "track", "what", "when", "where", "which", "with", "would", "your",
  "album", "balance", "booking", "campaign", "choice", "contract", "decision", "deal", "event", "goal", "invoice", "offer", "opportunity", "payment", "project", "prospect", "release", "rehearsal", "settlement", "show", "single", "target", "task", "tour"
]);

function normalize(value: string) {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return normalize(value).split(" ").filter((token) => (token.length >= 4 || (token.length >= 2 && /\d/.test(token))) && !STOP_TOKENS.has(token));
}

function containsPhrase(text: string, phrase: string) {
  return phrase.length >= 3 && tokens(phrase).length > 0 && ` ${text} `.includes(` ${phrase} `);
}

function kindHints(question: string): ManagerSubjectKind[] {
  const text = normalize(question);
  const hints = new Set<ManagerSubjectKind>();
  if (/\b(goal|target)\b/.test(text)) hints.add("goal");
  if (/\b(task|action|todo|to do)\b/.test(text)) hints.add("task");
  if (/\b(show|gig|event|rehearsal|soundcheck|load in|doors|set time|curfew)\b/.test(text)) hints.add("event");
  if (/\b(project|release|single|album|ep|campaign|tour)\b/.test(text)) hints.add("project");
  if (/\b(decision|choice|option|tradeoff)\b/.test(text)) hints.add("decision");
  if (/\b(opportunity|hold|booking)\b/.test(text)) hints.add("opportunity");
  if (/\b(prospect|lead|buyer|festival|venue)\b/.test(text)) hints.add("prospect");
  if (/\b(deal|offer|contract|guarantee)\b/.test(text)) hints.add("deal");
  if (/\b(invoice|balance|payment|deposit|overdue)\b/.test(text)) hints.add("invoice");
  if (/\b(settlement|payout|split)\b/.test(text)) hints.add("settlement");
  return [...hints];
}

function uniqueCandidates(candidates: ManagerSubjectCandidate[]) {
  return [...new Map(candidates.map((candidate) => [`${candidate.kind}:${candidate.id}`, candidate])).values()];
}

function aliases(candidate: ManagerSubjectCandidate) {
  return uniqueCandidates([candidate]).flatMap((item) => [item.label, ...item.aliases]).map(normalize).filter(Boolean);
}

function filterByHints(candidates: ManagerSubjectCandidate[], hints: ManagerSubjectKind[]) {
  if (!hints.length) return candidates;
  const hinted = candidates.filter((candidate) => hints.includes(candidate.kind));
  return hinted.length ? hinted : candidates;
}

function clarification(candidates: ManagerSubjectCandidate[]) {
  const choices = candidates.slice(0, 4).map((candidate) => `“${candidate.label}” (${KIND_LABELS[candidate.kind]})`);
  return `Which record do you mean: ${choices.join(", ")}?`;
}

export function managerSubjectCandidates(facts: ManagerSubjectFacts): ManagerSubjectCandidate[] {
  return uniqueCandidates([
    ...(facts.goals ?? []).map((item) => ({ id: item.id, kind: "goal" as const, label: item.title, aliases: [] })),
    ...(facts.tasks ?? []).map((item) => ({ id: item.id, kind: "task" as const, label: item.title, aliases: [] })),
    ...(facts.events ?? []).map((item) => ({ id: item.id, kind: "event" as const, label: item.title, aliases: [] })),
    ...(facts.projects ?? []).map((item) => ({ id: item.id, kind: "project" as const, label: item.name, aliases: [] })),
    ...(facts.decisions ?? []).map((item) => ({ id: item.id, kind: "decision" as const, label: item.title, aliases: [] })),
    ...(facts.opportunities ?? []).map((item) => ({ id: item.id, kind: "opportunity" as const, label: item.title, aliases: [] })),
    ...(facts.prospects ?? []).map((item) => ({ id: item.id, kind: "prospect" as const, label: item.name, aliases: [] })),
    ...(facts.deals ?? []).map((item) => ({ id: item.id, kind: "deal" as const, label: item.title, aliases: [] })),
    ...(facts.invoices ?? []).map((item) => ({ id: item.id, kind: "invoice" as const, label: `Invoice ${item.number}`, aliases: [item.number] })),
    ...(facts.settlements ?? []).map((item) => ({ id: item.id, kind: "settlement" as const, label: `Settlement for ${item.event.title}`, aliases: [item.event.title] }))
  ]);
}

export function resolveManagerSubjectReference(question: string, candidates: ManagerSubjectCandidate[]): ManagerSubjectReference {
  const normalizedQuestion = normalize(question);
  const hints = kindHints(question);
  const base = { policyVersion: MANAGER_SUBJECT_REFERENCE_POLICY_VERSION, kindHints: hints } as const;
  const fullMatches = uniqueCandidates(candidates.filter((candidate) => aliases(candidate).some((label) => containsPhrase(normalizedQuestion, label))));
  const hintedFull = filterByHints(fullMatches, hints);
  if (hintedFull.length === 1) return { ...base, status: "resolved", confidence: 1, matchType: "full_label", subject: hintedFull[0]!, candidates: hintedFull, clarification: null };
  if (hintedFull.length > 1) return { ...base, status: "needs_clarification", confidence: 1, matchType: "ambiguous", subject: null, candidates: hintedFull.slice(0, 4), clarification: clarification(hintedFull) };

  const quoted = [...question.matchAll(/[“"]([^”"]{2,120})[”"]/g)].map((match) => normalize(match[1] ?? "")).filter(Boolean);
  if (quoted.length) {
    const quoteMatches = uniqueCandidates(candidates.filter((candidate) => aliases(candidate).some((label) => quoted.some((fragment) => containsPhrase(label, fragment) || containsPhrase(fragment, label)))));
    const hintedQuoted = filterByHints(quoteMatches, hints);
    if (hintedQuoted.length === 1) return { ...base, status: "resolved", confidence: 0.97, matchType: "quoted_fragment", subject: hintedQuoted[0]!, candidates: hintedQuoted, clarification: null };
    if (hintedQuoted.length > 1) return { ...base, status: "needs_clarification", confidence: 0.97, matchType: "ambiguous", subject: null, candidates: hintedQuoted.slice(0, 4), clarification: clarification(hintedQuoted) };
    return { ...base, status: "needs_clarification", confidence: 1, matchType: "missing_quoted_subject", subject: null, candidates: [], clarification: `I do not see a current StoryBoard record matching “${quoted[0]}”. Which task, show, goal, project, booking record, or money record do you mean?` };
  }

  if (hints.length) {
    const questionTokens = new Set(tokens(question));
    const hintedCandidates = candidates.filter((candidate) => hints.includes(candidate.kind));
    const tokenOwners = new Map<string, ManagerSubjectCandidate[]>();
    for (const candidate of hintedCandidates) {
      for (const token of new Set(aliases(candidate).flatMap(tokens))) {
        const owners = tokenOwners.get(token) ?? [];
        owners.push(candidate);
        tokenOwners.set(token, owners);
      }
    }
    const tokenMatches = uniqueCandidates([...questionTokens].flatMap((token) => tokenOwners.get(token)?.length === 1 ? tokenOwners.get(token)! : []));
    if (tokenMatches.length === 1) return { ...base, status: "resolved", confidence: 0.9, matchType: "unique_typed_token", subject: tokenMatches[0]!, candidates: tokenMatches, clarification: null };
    if (tokenMatches.length > 1) return { ...base, status: "needs_clarification", confidence: 0.9, matchType: "ambiguous", subject: null, candidates: tokenMatches.slice(0, 4), clarification: clarification(tokenMatches) };
  }

  return { ...base, status: "not_requested", confidence: 1, matchType: "none", subject: null, candidates: [], clarification: null };
}
