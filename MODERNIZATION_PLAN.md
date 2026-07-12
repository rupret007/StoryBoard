# StoryBoard Modernization Plan

Last reviewed: 2026-07-12
Baseline for this round: `main` at `2881dac`

## Product and current architecture

StoryBoard is an operator-facing management system for bands and artists. It
combines venue and contact CRM, booking opportunities, tasks, approvals,
workflow notifications, and constrained external integrations. The pnpm
monorepo contains a Next.js web app, NestJS/Fastify API, Prisma/PostgreSQL data
model, Redis/BullMQ automation, shared Zod contracts, and reusable UI
components.

Preserve the API-only write boundary, per-artist membership roles, audit trail,
approval-gated provider side effects, encrypted integration credentials, and
mock-safe provider adapters.

## Priorities

### P0 — security and tenant integrity

- [x] Prevent cross-artist references when contacts link to venues, booking
  opportunities link to venues, and tasks link to opportunities. Validate input
  at the HTTP boundary and re-check the related record in the domain service on
  create and update. Return a generic not-found result for inaccessible IDs.
- [x] Bind the operator Google OAuth callback to the browser that initiated the
  flow with a short-lived, single-use, HttpOnly `SameSite=Lax` state cookie.
- [x] Replace the API placeholder test with regression coverage for tenant
  isolation and request schemas. OAuth coverage remains with the OAuth task.

### P1 — reliable delivery verification

- [x] Add an opt-in integration suite that only accepts
  `STORYBOARD_TEST_DATABASE_URL`; it must never use `DATABASE_URL`.
- [x] Add CI for Prisma generation, type checking, linting, tests, and builds
  on Node 22 and pnpm 10.
- [x] Verify registration binding, role enforcement, and audit writes against
  the explicit test database.

### P0 — booking acquisition (completed 2026-07-10)

- [x] Add a forward-only booking profile/prospect model. Profiles support
  incomplete drafts but must contain a home market, genre, capacity range, and
  pitch before conversion or campaigns.
- [x] Add artist-scoped venue, festival, private-event, and corporate-event
  prospects with audited, tenant-safe relationship links and Ticketmaster
  provider-reference deduplication.
- [x] Implement one-city-at-a-time Find shows. Ticketmaster returns bounded,
  normalized venue/event signals when configured; absent or failed provider
  calls return explicit manual mode with no generated leads.
- [x] Convert qualified prospects atomically and idempotently. Only physical
  venue prospects create `Venue` rows; private/corporate/festival prospects
  create venue-less target opportunities and optional buyer contacts.
- [x] Add approval-gated pitch campaigns with a strict template-variable
  allowlist, recipient state machine, recipient previews, and Gmail draft-only
  execution. Successful execution creates one linked, editable follow-up task
  per recipient (seven days by default), without automatic stage changes.
- [x] Remove Bandsintown market/competitor venue derivation. It is now limited
  to artist-owned event context; stored venue ranking remains CRM-only.
- [x] Add Find shows and Pitch campaigns responsive workspaces and surface due
  campaign follow-ups in dashboard priority actions.

### P1 — release confidence (completed 2026-07-10)

- [x] Add a Chromium Playwright booking workflow test and make `pnpm test:e2e`
  self-contained: it requires the explicit test database URL, applies only
  forward migrations, builds current production artifacts, and starts isolated
  API/web servers with dev authentication and mock-safe providers.
- [x] Correct browser-facing API integration defects exposed by that test:
  explicit 302 redirects for login/callback responses and a CORS preflight
  policy that permits the API's PUT/PATCH/DELETE mutations.
- [x] Add a safe unauthenticated `GET /ready` dependency probe. It reports
  boolean database/Redis/worker state without configuration or credentials and
  returns 503 while database or Redis is unavailable.

### P0 — booking market sprints and approved delivery (completed 2026-07-11)

- [x] Add tenant-safe market sprints that connect city-focused prospects and campaigns, with funnel counts and overdue follow-ups.
- [x] Add explicit campaign delivery modes. Existing campaigns retain draft-only behavior; a send-on-execution campaign remains approval-gated and sends only after a separate Execute action.
- [x] Persist per-recipient delivery state and create follow-up work only after a successful send. Unknown delivery results are not retried automatically.
- [x] Complete browser coverage, documentation, and final release validation.

### P1 — bounded adaptive booking advisor (completed 2026-07-11)

- [x] Add an opt-in, structured booking advisor that is useful without external
  credentials and never mutates data or sends messages.
- [x] Persist aggregate facts, prompt version, advice, and explicit
  helpful/not-helpful feedback so subsequent advice can improve from outcomes.
- [x] Complete UI/browser validation and final release checks.

### P1 — tracked booking replies and negotiation assistance (completed 2026-07-11)

- [x] Persist Gmail thread identity for approved campaign drafts and sends, then poll only those known threads through an owner-enabled, deployment-gated integration.
- [x] Add the Booking inbox with bounded reply metadata, manual synchronization, periodic BullMQ checks, reconnect status, outcome review, and tenant-safe audit events.
- [x] Add explicit per-artist AI email-analysis consent. Full message bodies are fetched transiently for a selected reply; only structured analysis, confidence, and proposed deal facts are retained.
- [x] Require members to apply extracted terms explicitly and route threaded reply drafts through the existing approval center. No reply is automatically sent and no opportunity stage changes automatically.
- [ ] Enable in production only after Google restricted-scope verification, security/privacy review, and real Gmail acceptance testing. `GMAIL_REPLY_SYNC_ENABLED` remains false by default.

### P0 — Manager brain and guided operating system (completed 2026-07-11)

- [x] Add a guided, novice-safe Manager intake for original, cover/event, and
  hybrid bands, with operating profile, separate band-member roster, durable
  goals/initiatives/decisions, confirmed memory with provenance, and settings.
- [x] Add deterministic daily/weekly briefs and optional structured Responses
  API reasoning through one explicit read-only snapshot function, with a
  balanced manager model, known-record evidence filtering, redacted local
  traces, token/latency metadata, prompt/model versions, and safe fallback.
- [x] Add conversational explanation and typed recommendation outcomes. The
  code-owned action policy permits only low-risk internal work directly;
  provider, legal, financial, unknown, and irreversible actions cannot bypass
  roles or Approvals.
- [x] Add versioned original/cover/hybrid golden scenarios and regressions for
  strict intake, unsupported facts, adversarial text, action authorization,
  tenant isolation, and acceptance behavior.
- [x] Ship the Manager workspace and preserve the booking-advisor API for
  compatibility.
- [x] Owner-enabled Manager brief schedules run through the existing BullMQ
  worker. Scheduled briefs are deterministic unless the owner separately opts
  into model usage; external actions remain approval-gated.

### P0 — Coherent, grounded Manager conversation (completed 2026-07-12)

- [x] Replace the generic deterministic chat reply with intent-aware answers for
  priorities, live readiness, booking, lineup/availability, and money. Keep the
  result useful when OpenAI is disabled or unavailable.
- [x] Expand the bounded manager snapshot to pending approvals, unread tracked
  booking replies, campaign follow-ups, qualified prospects, and draft
  settlements without expanding Gmail access beyond StoryBoard-owned threads.
- [x] Persist and resume a tenant-scoped conversation, supply the current
  question plus at most 12 recent messages to the reasoning path, and expose
  bounded read endpoints for the workspace.
- [x] Fix Responses API continuation so the final response retains the actual
  operator request as well as the function result. Reject the entire generated
  brief/chat result when any evidence ID is unknown or an action is outside the
  code allowlist; use deterministic fallback instead.
- [x] Let chat prepare at most one reviewable internal-task recommendation via
  the existing recommendation acceptance path. Keep email, calendar, Drive,
  legal, financial, publishing, and irreversible actions in Approvals.
- [x] Replace the single-answer chat card with a persistent thread, quick
  starting questions, natural message flow, reload recovery, and inline task
  acceptance. Correct the fast-follow-up input race found by Playwright.
- [x] Collect structured usefulness/dismissal reasons, suppress stale/repeated
  recommendations with bounded cooldowns, and attribute completed tasks back to
  their accepted recommendation.
- [x] Add a confirm/correct/archive memory UI with normal memory available to
  members and sensitive/restricted memory remaining owner-controlled.
- [x] Add owner-reviewed, tenant-scoped eval promotion. Stored examples contain
  the recommendation and outcome snapshot, not raw provider data, conversation
  history, or the full manager input. Promotion never activates a prompt or
  policy version automatically.
- [x] Add deterministic goal/initiative plan health with an explainable score,
  per-goal evidence, measurement/deadline gaps, blockers, and linked task state.
- [x] Add append-only, tenant-safe, audited goal progress events. Numeric
  progress stays explicit; completed recommendation tasks contribute through
  their linked initiative without inventing a numeric goal increment.
- [x] Add an owner-triggered offline evaluation runner over versioned golden
  scenarios (currently sixteen) plus owner-reviewed examples. Candidate versions are code-allowlisted,
  unresolved same-version revision labels fail the run, results are persisted,
  and there is no automatic activation endpoint.
- [x] Make guided intake deliver the promised executable 90-day plan: two
  editable band-mode goals, linked initiatives, and six dated first actions.
  Stable nullable source keys make fill-missing generation idempotent without
  replacing user edits or intentional status changes.
- [x] Prefer the next existing linked plan task in briefs instead of proposing
  duplicate generic work. Flag unassigned owners and progress behind elapsed
  timeline in plan health, and support task-owner editing in the Tasks UI.
- [x] Invalidate briefs created before completed intake and synchronize Manager
  client state after server refresh. Reset only the explicit E2E database so
  first-use intake remains a real regression path.

### P0 — Reviewed response quality and bounded learning (completed 2026-07-12)

- [x] Link each delivered Manager answer to the exact `ManagerRun` that
  produced it and persist one tenant-scoped, per-operator helpful/correction
  verdict without duplicating conversation content.
- [x] Accept a strict correction taxonomy plus an optional human note. Feed only
  aggregate reasons—not raw notes—into a small code-owned presentation mapping;
  feedback cannot add tools, change risk, or expand authority.
- [x] Add a deterministic natural-response gate for configured length,
  excessive formatting, canned assistant openings, implementation/meta
  language, and unverified claims of completed external actions. Failed model
  output falls back to the grounded deterministic answer.
- [x] Promote the reviewed policy to `manager_os_v4` / `manager_evals_v3` with
  explicit natural-voice, meta/action-claim rejection, and feedback-guidance
  checks. No version activates itself.
- [x] Expose response feedback in the Manager conversation and 90-day learning
  summary; preserve viewer read-only rules, member mutation permissions, audit
  history, and tenant isolation.
- [x] Clean-room the design from Andrea_NanoBot's exact-response feedback and
  outcome-led learning concepts; no source code, runtime, database, or broad
  assistant authority is imported.

### P0 — Evidence-backed post-show learning loop (completed 2026-07-12)

- [x] Expose the existing attendance, gross-revenue, post-show lesson, and
  relationship-outcome fields in the gig editor so completed work no longer
  disappears before the band can record what happened.
- [x] Add a bounded, tenant-scoped `GET /manager/outcome-review?days=7..365`
  projection over completed/cancelled shows and projects, completed tasks,
  explicit campaign outcomes, invoices, expenses, and settlements.
- [x] Derive confidence from recorded premises, cite source record IDs, keep
  unsupported net income unknown, aggregate each currency separately, and ask
  focused questions for missing attendance, lessons, or relationship results.
- [x] Use the same review in the Manager workspace, retrospective conversation,
  safe model snapshot, grounding allowlist, and weekly brief. No second AI-owned
  outcome truth or provider authority was introduced.
- [x] Correct settlement math to deduct only event expenses whose currency
  matches the settlement. Link included expenses at finalization, recalculate
  draft totals/splits at finalization, and surface later or historical expense
  drift without mutating the finalized document.
- [x] Cover empty/complete/incomplete/multi-currency outcomes, tenant isolation,
  database settlement evidence, and the full browser path from show completion
  through Manager retrospective advice.

### P0 — Evidence-to-decision learning loop (completed 2026-07-12)

- [x] Turn the existing write-only `ManagerDecision` record into a practical
  Manager workspace for two to six options and explicit tradeoffs.
- [x] Require a recorded choice to include rationale, an observable expected
  result, and a review date. Validate unique option labels and exact choice
  membership at both the boundary and service layer.
- [x] Add one immutable reviewed result (`worked`, `mixed`, `did_not_work`, or
  `inconclusive`) plus the band's observed lesson. Preserve reviewed history
  instead of rewriting it after the result is known.
- [x] Use tenant-scoped compare-and-set writes for choice and review transitions
  so concurrent members cannot silently replace one another's decision. Stale
  writes fail without a mutation or audit event.
- [x] Promote due reviews into the daily brief and decisions-needed list. Keep
  recent reviewed choices in the bounded Manager snapshot and conversational
  recall as one observation, never an automatically generalized rule.
- [x] Add forward migration `20260713160000_manager_decision_reviews`, strict
  shared schemas, member/owner mutation routes, audited service behavior, and
  viewer-readable retrieval.
- [x] Promote the reviewed policy to `manager_os_v5` / `manager_evals_v4` with
  a decision-grounding case. The offline gate passes 13/13 at 100% safety and
  still has no self-activation path.
- [x] Cover validation, wrong-tenant access, incomplete choice, concurrent
  updates, immutable review, brief/chat grounding, database audit history, and
  the production browser path from option framing through conversational
  lesson recall.

### P0 — Guided operating context and active unknowns (completed 2026-07-12)

- [x] Add one deterministic, non-persistent context-health policy over the
  operating profile, active working lineup, goals, events, projects, and booking
  opportunities. Keep the policy shared by API, brief, conversation, model
  snapshot, and UI instead of letting each surface invent its own completeness.
- [x] Make coverage transparent as four 25-point dimensions: identity/strategy,
  people/responsibilities, business facts, and current execution. Explicitly
  state that the score measures recorded context—not talent, quality, success,
  or potential.
- [x] Order missing questions by operational value and preserve unknowns as
  questions. Treat zero budget as a known answer and never fill missing revenue,
  assets, availability rules, responsibilities, or commitments with guesses.
- [x] Expose viewer-readable `GET /manager/context-health`; retain member/owner
  permissions and existing audited profile/member mutation routes.
- [x] Add a post-intake Band context workspace for the complete operating
  profile plus working-member onstage/offstage responsibilities and instruments.
  Refresh context coverage immediately after each tenant-scoped write.
- [x] Feed thin context into Today, usable gaps into This week, and answer
  “what do you still need to know?” in direct, respectful language with evidence.
- [x] Promote the reviewed policy to `manager_os_v6` / `manager_evals_v5`; the
  14/14 offline gate retains 100% safety and no self-activation path.
- [x] Cover thin/strong scoring, question order, zero/unknown distinctions,
  database updates/isolation, and the production browser path from 45/100 novice
  context through structured completion and grounded 82/100 explanation.

### P0 — Conversation-to-decision operating loop (completed 2026-07-12)

- [x] Recognize only explicit two-option questions or unambiguous decision
  language. Generic “what should we do?” questions retain their normal booking,
  plan, project, money, or show routing.
- [x] Add `create_decision` as a separate code-allowlisted internal proposal.
  Conversation may prepare an open draft, but cannot choose, review, create a
  provider action, or broaden the allowlist.
- [x] Require a member to correct and save the title, context, workstream,
  options, and real tradeoffs in a separate audited write before any choice.
  Placeholder tradeoffs remain explicitly unknown.
- [x] Link the accepted recommendation to exactly one tenant-owned decision.
  Reviewing that decision closes the recommendation as `decision_reviewed`;
  acceptance remains compare-and-set and idempotent.
- [x] Add forward migration `20260713170000_manager_conversation_decisions`,
  strict action grounding, tenant-reference diagnostics, and a complete UI path
  from chat proposal through framing, choice, observed outcome, and recall.
- [x] Promote the reviewed policy to `manager_os_v7` / `manager_evals_v6`.
  The 15/15 offline gate retains 100% safety and no self-activation path.

### P0 — Evidence-ranked commitment follow-through (completed 2026-07-12)

- [x] Make blocked work explainable. A blocked task must carry a concise reason;
  work may also name the person or organization the band is waiting on.
- [x] Let members reschedule task due dates from the primary task workflow.
  Count deliberate deferrals and preserve the last deferral time so repeatedly
  slipping work is visible instead of silently appearing current.
- [x] Use tenant-scoped compare-and-set task updates so two members cannot
  overwrite each other's status, owner, blocker, or date from stale screens.
- [x] Add one deterministic, non-persistent commitment projection over open
  tasks. Rank blocked, overdue, repeatedly deferred, waiting, ownerless, and
  due-soon work from recorded facts and expose the reason for every rank.
- [x] Feed that projection into Manager Today, Waiting on, risk signals,
  conversation, and a focused Follow-through workspace. Do not create new work
  when the correct action is to resolve, reassign, reschedule, or close existing
  work.
- [x] Add forward migration `20260713180000_task_commitment_followthrough`,
  strict schemas, tenant/audit regression coverage, a new golden evaluation,
  database coverage, and a production
  browser path. Keep provider, legal, financial, and external authority
  unchanged.

### P0 — Opt-in Manager operating cadence (completed 2026-07-12)

- [x] Complete the dormant Manager schedule boundary rather than adding a
  second planner. The operating profile's daily/weekly cadence, owner-selected
  IANA timezone, hour, and weekly day determine when the existing brief runs.
- [x] Keep scheduling off by default. Owners choose owners-only or team in-app
  delivery; no email, Telegram, calendar, provider write, or record mutation is
  implied by a scheduled brief.
- [x] Keep scheduled briefs deterministic by default. Optional model reasoning
  has a separate owner consent because it may use provider tokens; full-context
  consent remains distinct and the same evidence/action guardrails apply.
- [x] Scan through BullMQ rather than an ad hoc timer. Compare-and-set local
  period claims, stale-claim recovery, and a unique `ManagerRun.scheduleKey`
  prevent duplicate runs across restarts or multiple workers.
- [x] Persist the run, claim completion, and `manager_brief_ready` notifications
  atomically. Notifications carry only a safe internal `/manager` link and
  bounded brief text.
- [x] Add forward migration `20260713190000_manager_operating_cadence`, strict
  settings/timezone validation, queue dispatch, database idempotency, owner UI,
  notification navigation, and production-browser coverage.

### P0 — Manager-to-operations action bridge (completed 2026-07-12)

- [x] Close the gap where Manager could diagnose a missing show advance or
  project plan but could only tell the band to navigate elsewhere or create a
  generic task.
- [x] Add exactly two code-owned internal actions:
  `generate_event_advance` and `generate_project_plan`. They reuse the existing
  event/project records and Task authority; no second planner or action engine
  is introduced.
- [x] Require cited, current, same-artist targets and the corresponding
  readiness gap before model output is accepted. Revalidate tenant ownership,
  event date, and project deadline again at recommendation acceptance.
- [x] Execute recommendation claim plus source-keyed task creation in one
  transaction. Successful immediate actions finish with `action_executed`;
  stale clicks and replays cannot create another task set.
- [x] Make manual and Manager show-advance generation share
  `show_advance_v1` specifications and artist-unique source keys, preserving
  compatibility with older unsourced advance tasks.
- [x] Promote the strict output/action policy to `manager_os_v9` and the golden
  set to `manager_evals_v8`, including exact show/project action-selection and
  continued provider-action refusal.
- [x] Add explicit Manager UI controls and immediate success confirmation, plus
  unit, tenant/database, offline-eval, and production-browser coverage. No
  Prisma migration or new provider access is required.

### P0 — Manager provider-context privacy boundary (completed 2026-07-12)

- [x] Close the gap where the default redacted Manager snapshot retained
  owner-controlled `sensitive` and `restricted` memory even though full context
  is a separate consent.
- [x] Make sensitivity part of the code-owned provider projection: normal
  memory is eligible for redacted context, sensitive memory requires the
  owner's full-context opt-in, and restricted memory never enters a provider
  snapshot.
- [x] Validate model evidence IDs against the same projected view, so withheld
  memory cannot be cited merely because its local record exists.
- [x] Keep persisted `ManagerRun.inputFacts` redacted in every mode. Record only
  policy counts, whether a provider snapshot was attempted, and whether its
  output passed guardrails; do not copy withheld values into traces.
- [x] Add an owner-only policy endpoint and visible Manager disclosure with
  current mode and included/withheld memory counts.
- [x] Promote the offline dataset to `manager_evals_v9` with a dedicated safety
  case, plus unit, disposable-database, and production-browser coverage. No
  Prisma migration or provider credential is required.

### P0 — Owner-reviewed Manager response release gate (completed 2026-07-12)

- [x] Let owners promote the exact question, Manager answer, feedback, bounded
  citations, and action types into a local evaluation set without duplicating
  the linked run's redacted input facts.
- [x] Require a concrete expected behavior for answers marked not useful or in
  need of revision. An unresolved negative example blocks the current
  candidate; the version that produced the failure cannot mark itself fixed.
- [x] Replay useful answers against response-quality and evidence-grounding
  rules, and require negative examples to be explicitly resolved by a later
  code-registered Manager version.
- [x] Keep evaluation promotion, resolution, and execution owner-only,
  artist-scoped, audited, bounded, and offline. Reviewed examples never rewrite
  prompts, policies, schemas, or code and never activate a candidate version.
- [x] Add forward migration `20260713200000_manager_response_evals`, API/UI
  controls, relationship diagnostics, unit/database/browser coverage, and
  promote the dataset contract to `manager_evals_v10`.

### P0 — Global Manager pressure ranking (completed 2026-07-12)

- [x] Close the insertion-order failure where `Today` stopped collecting after
  five candidates, allowing later code branches such as a same-day show,
  overdue invoice, or campaign follow-up to disappear before comparison.
- [x] Gather every deterministic candidate, suppress already handled work, then
  rank globally by declared importance plus record-backed urgency: event timing
  and readiness, member conflicts, commitment state, reply freshness, approval
  state, invoice lateness, due reviews, follow-ups, and project health.
- [x] Keep the policy deterministic and inspectable as `manager_priority_v1`.
  Store only rule codes, bounded factor labels, impacts, and omitted candidate
  summaries in `ManagerRun.trace`; never store hidden reasoning.
- [x] Merge grounded model suggestions with the deterministic candidate set so
  a model cannot omit a code-owned pressure. Deduplicate overlapping evidence,
  retain stable keys, apply suppression, and rerank before persistence.
- [x] Invalidate cached briefs from prior policy versions or newer audited
  operating-record changes, and show the band a plain-language “ranked first
  because” explanation in Manager.
- [x] Promote the code/prompt contract to `manager_os_v10` and the offline set
  to `manager_evals_v11` with a competing-pressure golden scenario. No schema
  migration, new provider, or expanded action authority is required.

### P0 — Manager knowledge integrity and freshness (completed 2026-07-12)

- [x] Close the duplicate-truth gap where band mode, home market, ambition, and
  constraints were saved in both `ArtistOperatingProfile` and Manager memory,
  but later profile edits could leave the memory copy contradictory.
- [x] Make the operating profile the code-owned authority for those four keys.
  Profile writes now synchronize memory in the same transaction, and generic
  memory PATCH rejects attempts to bypass that source boundary.
- [x] Add forward data migration
  `20260713210000_manager_profile_memory_source` to repair historical duplicate
  intake rows without deleting memory, audit history, or overwriting operator
  corrections. Human corrections remain visible as conflicts until the band
  explicitly saves the authoritative profile.
- [x] Add deterministic `manager_knowledge_v1` assessment for current, stale,
  unconfirmed, low-confidence, and conflicted facts. Runtime reasoning projects
  the profile value over any duplicate conflict and asks for review rather than
  asserting unreliable memory.
- [x] Feed knowledge health into briefs, risk signals, chat, provider snapshots,
  and redacted traces without expanding action authority. Operational pressure
  still outranks routine context refresh.
- [x] Show knowledge score, authoritative source, and confirmation controls in
  Manager. Profile-owned facts are edited only through Band context; other
  normal memory remains confirmable/correctable/archivable by members.
- [x] Promote the contract to `manager_os_v11` / `manager_evals_v12` with a
  source-precedence safety scenario and deterministic unit/database/browser
  coverage.

### P0 — Evidence-reconciled Manager goals (completed 2026-07-12)

- [x] Close the plan-truth gap where StoryBoard could hold authoritative
  qualified prospects, confirmed/completed gigs, or completed linked projects
  while a Manager goal continued to report a manually entered zero.
- [x] Add explicit goal measurement sources: manual, current
  qualified/converted prospects, confirmed gigs in the goal window, completed
  gigs in the goal window, and completed projects explicitly linked to the
  goal. Unsupported goals remain manual rather than being guessed from text.
- [x] Derive `manager_goal_measurement_v1` status as manual, not recorded, in
  sync, records ahead, or recorded ahead. The projection names its source,
  observed value, difference, evidence IDs, and next review action.
- [x] Keep reconciliation human-controlled. A member must review the observed
  value and send that exact value back; the API recomputes inside a serializable
  transaction, rejects stale evidence, records one append-only progress event,
  and audits a real change. Replay produces no duplicate event or audit.
- [x] Make starter live-pipeline and release-cycle goals select qualified
  prospects and completed linked projects respectively. Existing user-created
  goals remain manual; migration `20260713220000_manager_goal_measurements`
  adds the source without rewriting titles, targets, or progress.
- [x] Feed measurement drift into plan health, briefs, conversation, redacted
  provider context, and evidence validation. Routine positive drift stays
  behind urgent operating work; unsupported recorded progress receives a
  stronger review signal.
- [x] Add Manager UI source selection and explicit reconciliation, then promote
  the release contract to `manager_os_v12` / `manager_evals_v13` with unit,
  disposable-database, and production-browser coverage.

### P0 — Explicit, reviewable conversational memory (completed 2026-07-12)

- [x] Let an operator explicitly ask Manager to remember a durable, normal-
  sensitivity band fact. Merely mentioning a fact never creates memory.
- [x] Present the exact proposed value in conversation and require a separate
  member acceptance before saving it as a confirmed operator note. The
  accepted recommendation links to the resulting memory fact and is
  transactionally single-use, tenant-scoped, audited, and replay-safe.
- [x] Keep canonical operating-profile facts in Band context rather than
  creating duplicate truths. Refuse credentials, financial identifiers, and
  health information without repeating the submitted secret in the response.
- [x] Reject model-created, mismatched, or brief-created memory actions unless
  they exactly match the current operator's explicit request. No new provider
  or arbitrary write authority was introduced.
- [x] Add migration `20260713230000_manager_conversational_memory`, unit,
  disposable-database, evaluation, relationship-diagnostic, and Chromium
  coverage; promote the contract to `manager_os_v13` / `manager_evals_v14`.

### P0 — Novice-safe Manager coaching (completed 2026-07-12)

- [x] Close the gap where a novice asking “What is a settlement?” received
  generic priority advice whenever OpenAI was disabled. Add a bounded,
  code-owned coaching catalog for common booking, deal, show-production,
  settlement, and release-rights concepts.
- [x] Answer explicit learning questions in plain language with four practical
  parts: definition, why it matters, what to do in StoryBoard, and the specific
  ambiguity or legal/financial boundary to watch. Compare common pairs such as
  guarantee versus door deal and stage plot versus input list directly.
- [x] Make coaching workspace-aware without inventing facts. Relevant draft
  settlements, unpaid invoices, active deals, upcoming shows, and qualified
  prospects are cited only from the current artist; absent records remain
  absent rather than becoming hypothetical claims.
- [x] Keep education read-only. Recognized coaching questions bypass provider
  generation, never propose an action, and remain subordinate to the existing
  refusal for send/pay/sign/publish requests.
- [x] Surface “Learn as you go” prompts in Manager, personalized from the
  operating profile's saved topics with practical defaults for new bands.
- [x] Promote the reviewed contract to `manager_os_v14` /
  `manager_evals_v15` with unit, database, golden-eval, and Chromium coverage.

### P0 — Accountable team workload and assignment (completed 2026-07-12)

- [x] Replace ambiguous person ownership with an additive optional
  `Task.bandMemberId` relation while preserving `ownerLabel` as a display and
  legacy-import field. Validate the member on create and patch; another
  artist's member ID must return generic not-found before write or audit.
- [x] Derive a bounded `manager_team_load_v1` view from active members, their
  recorded roles, and current tasks. Distinguish real member assignments from
  system placeholders such as `Show advance`; show overdue, blocked, due-soon,
  unscheduled, and concentrated work without claiming to know hours, effort, or
  personal capacity that StoryBoard has not recorded.
- [x] Answer natural ownership and workload questions from that same view. A
  role-matched, uniquely supported assignment may become one reviewable
  `assign_task` proposal; ambiguous matches must remain questions, and
  acceptance must revalidate the open task, active member, tenant, and stale
  assignment state before an audited internal update.
- [x] Update Tasks, project milestones, Manager UI, relationship diagnostics,
  and documentation to use linked owners while remaining compatible with
  historical labels. Do not backfill or rewrite existing tasks automatically.
- [x] Add unit, disposable-database, golden-eval, and Chromium coverage for
  linked assignment, cross-artist rejection, system-placeholder handling,
  role-based suggestions, ambiguity, stale acceptance, and explainable team
  pressure. The promoted contract is `manager_os_v15` / `manager_evals_v16`.

Implementation and validation notes:

- Migration `20260713232000_task_band_member_ownership` is additive and does
  not rewrite historical `ownerLabel` values. Linked member identity is now
  canonical; the label remains a compatibility/display snapshot.
- Assignment suggestions use only recorded responsibilities and current task
  pressure. Equal matches remain unresolved, urgent members are excluded, and
  every response states that StoryBoard does not know real personal capacity.
- Acceptance revalidates the same-artist open task, active member, placeholder
  ownership premise, and optimistic write. It records both the completed
  recommendation and `task.assigned` audit history.
- Validation passed 94 compiled API tests, two shared-package tests, three
  disposable Postgres workflows across all 32 migrations, three production
  Chromium workflows, 29/29 offline Manager checks at 100% safety, typecheck,
  lint, production builds, relationship diagnostics, and container smoke.
- Clean-room review of other agent-management patterns reinforced three
  boundaries already used here: canonical records stay separate from derived
  judgment, a proposal should be the smallest reversible action, and execution
  does not equal outcome closure. No external code, runtime, or data was copied.

### P0 — Current member capacity check-ins (completed 2026-07-12)

- [x] Add append-only, artist-scoped `BandMemberCheckIn` records for
  `available`, `limited`, and `unavailable` status, an optional bounded note,
  and an optional expiry. No check-in means unknown; an expired check-in must
  not be presented as current.
- [x] Let viewers read current check-ins and members/owners record one for any
  active working member. Validate tenant ownership before write, audit every
  check-in, retain history, and never require or encourage medical/private
  explanations.
- [x] Extend `manager_team_load_v2` to combine current check-ins with recorded
  task pressure. Exclude explicitly unavailable members from assignment,
  prefer an available member only as a tie-break after responsibility fit,
  label limited/unknown status honestly, and continue to avoid hour/effort or
  wellbeing claims.
- [x] Answer availability, workload, and delegation questions from the same
  current projection. Trace the exact check-in evidence and revalidate current
  availability when accepting an assignment so an expired or superseded
  premise fails closed.
- [x] Add a low-friction Manager UI for team check-ins and freshness, plus
  unit, database, golden-eval, relationship-diagnostic, and Chromium coverage.
  Promote a new Manager contract only after the full gate passes.

Implementation and validation notes:

- Migration `20260713234000_band_member_check_ins` adds append-only history and
  does not rewrite members or tasks. Current state is derived from the latest
  row; missing and expired rows remain unknown.
- The Manager UI records a bounded status, optional expiry, and optional
  operational note. Notes stay tenant-local: provider projections and audit
  metadata retain the status/evidence but omit note content.
- `manager_team_load_v2` uses responsibility fit before availability, excludes
  currently unavailable members, and binds every accepted assignment to the
  exact check-in premise. A superseded or unavailable premise fails before the
  recommendation claim or task write.
- The promoted contract is `manager_os_v16` / `manager_evals_v17`. Validation
  passed 96 compiled API tests, two shared tests, three disposable Postgres
  workflows across all 33 migrations, three production Chromium workflows,
  30/30 offline Manager checks at 100% safety, typecheck, lint, repeatable
  production builds, relationship diagnostics, and a rebuilt healthy container.
- The normal API build now runs strict typecheck followed by the same SWC emitter
  used by the container. Test imports normalize CommonJS modules so unit and
  integration coverage is emitter-independent; repeated parallel builds no
  longer depend on Node's default heap peak.

### P0 — Shared show-readiness intelligence (completed 2026-07-12)

- [x] Replace disconnected show-status heuristics with one deterministic,
  tenant-scoped policy over active lineup, schedule, contacts, deal/payment,
  advance, setlist, and production records.
- [x] Make every result explainable with category scores, premise-coverage
  confidence, source record IDs, date-aware severity, and a concrete first
  action. A missing date or unavailable performer blocks readiness.
- [x] Expose bounded read APIs for one show or the next 1–365 days and render
  the same signal in Band operations, including direct generation of a missing
  advance checklist.
- [x] Make the readiness diagnosis actionable in the event card: record every
  active member's availability and edit artist-owned venue/contact/setlist,
  location, ordered show-day timing, money, production notes, and technical
  links without leaving the workflow.
- [x] Validate partial event schedule edits against the merged saved record so
  impossible load-in/soundcheck/doors/set/curfew ordering cannot be introduced
  by changing a single field.
- [x] Feed the shared signal into Manager briefs and conversation so the model
  and deterministic fallback cannot create competing readiness opinions.
- [x] Add a derived day-of operating view with current/next timing, open and
  overdue work, lineup state, contacts, setlist/production facts, and recorded
  fee/deposit/payment/balance state. Keep it evidence-backed and non-persistent.
- [x] Ship the phone-oriented `/operations/events/:id` workspace with explicit
  availability and task completion actions, and let Manager prioritize the
  same day-of signal only inside the 24-hour show window.
- [x] Add deterministic regressions for incomplete records, urgency,
  unavailable-performer blocking, confidence, evidence, and a fully recorded
  ready show. No migration or provider access is required.

### P1 — Editable run-of-show operations (completed 2026-07-12)

- [x] Close the current data-entry gap around the existing
  `EventScheduleItem` model. Add strict, tenant-safe create, patch, and remove
  routes for custom show-day checkpoints without changing the canonical
  load-in, soundcheck, doors, set, or curfew fields.
- [x] Validate title, offset datetimes, optional end time, location, notes, and
  bounded sort order at the HTTP boundary. End time must follow start time;
  another artist's event or schedule-item ID must return generic not-found
  before any write or audit.
- [x] Make the phone-oriented event workspace an actual run-of-show editor:
  members can add travel calls, meals, support slots, changeovers, meet-and-
  greets, and other real checkpoints, correct them inline, and remove obsolete
  rows. Viewers remain read-only through the existing role policy.
- [x] Keep one source of truth: the existing day-of timeline, Manager day-of
  priority, and evidence trace must consume the saved schedule rows immediately
  rather than creating a separate itinerary model or generated prose copy.
- [x] Add unit, disposable-database, golden-eval, relationship-diagnostic, and
  Chromium coverage. Update the runbook, domain/architecture docs, README, and
  handoff after the complete gate passes.

Implementation and validation notes:

- Added strict shared create/patch contracts plus member/owner REST writes for
  custom schedule rows. Service checks resolve ownership through the exact
  artist/event/item chain, validate the merged time range, and return generic
  not-found before writes or audits on a foreign chain. No schema migration was
  needed because the forward-only `EventScheduleItem` model already existed.
- Added the inline day-of editor and kept canonical load-in through curfew in
  the main event editor. The same persisted rows immediately drive the ordered
  day-of timeline, evidence IDs, and within-24-hours Manager priority.
- Validation passed: `pnpm typecheck`, `pnpm lint`, 97 API + 2 shared tests,
  `pnpm build`, 3 disposable-Postgres workflows, the complete relationship
  diagnostic including schedule→event ownership, 3 Chromium journeys with
  create/edit/reload persistence, `git diff --check`, and the
  `manager_os_v16` / `manager_evals_v18` gate at 31/31 safety/usefulness checks.

### P1 — Manager operating-evidence calibration (completed 2026-07-12)

- [x] Add one deterministic, non-persistent evidence-health projection across
  live work, booking, projects, money, goals, and the working team. Distinguish
  current, needs-confirmation, stale, missing, and conflicted records; measure
  record coverage rather than band quality, business health, or artistic value.
- [x] Use that projection in deterministic and optional-model conversation so
  an empty or aging StoryBoard area cannot be presented as a complete real-world
  picture. Attach at most one relevant confidence note and one targeted question
  instead of generic disclaimers or a second planning system.
- [x] Surface the same evidence check in the Manager workspace and read-only API.
  Keep existing context, memory, readiness, plan, and outcome projections as the
  canonical specialist sources; the new layer only explains whether the inputs
  needed for a type of answer are present and current enough.
- [x] Persist the bounded projection in redacted Manager traces/provider
  snapshots, update the prompt/policy and eval dataset versions, and add golden,
  unit, database, and Chromium coverage for stale booking data, absent money
  records, goal drift, and a fully grounded operating picture.

Design evidence:

- The adjacent `Andrea_NanoBot` project validates explicit signal state,
  confidence calibration, targeted refresh questions, and “no second planner”
  as useful orchestration boundaries. StoryBoard will reuse the design pattern
  only; it will not copy Andrea's channel/runtime code or its currently dirty
  working tree.

Implementation and validation notes:

- Added the clean-room `manager_evidence_v1` projection across live, booking,
  projects, money, goals, and team records. It distinguishes current,
  needs-confirmation, stale, missing, and conflicted inputs without persisting a
  second source of truth. Missing explicitly means StoryBoard has no records;
  it never means the band has no real-world work, money, or obligations.
- Applied the same code-owned calibration after deterministic and optional-model
  responses, with at most one relevant record check in a normal answer and at
  most three targeted questions in the read-only explanation. The projection
  cannot authorize an action and only bounded status metadata enters traces.
- Added `GET /manager/evidence-health` plus a Manager workspace card, promoted
  `manager_os_v17` / `manager_evals_v19`, and added golden, unit, disposable-
  database, and Chromium coverage. No schema migration was needed.
- Validation passed: `pnpm typecheck`, `pnpm lint`, 99 API + 2 shared tests,
  `pnpm build`, 3 disposable-Postgres workflows, the complete relationship
  diagnostic, 3 Chromium journeys, `git diff --check`, and the 34/34 Manager
  safety/usefulness gate.

### P0 — Dependency-aware work sequencing (completed 2026-07-12)

- [x] Add first-class artist-scoped Task prerequisites. A dependency links one
  existing task to one prerequisite task; self-links, duplicate links,
  cross-artist IDs, and cycles must fail before write or audit.
- [x] Preserve credible execution order. A task cannot be completed while a
  prerequisite remains open, and reopening a prerequisite cannot silently make
  already-completed downstream work inconsistent. Date conflicts must be
  identified before the dependency is accepted.
- [x] Add one deterministic, non-persistent `manager_work_sequence_v1`
  projection over the canonical Tasks graph. Distinguish ready-now work from
  manually blocked work and work waiting on unfinished prerequisites; identify
  which ready task unlocks downstream commitments without inventing duration,
  effort, or actual member capacity.
- [x] Apply the projection to Manager briefs and conversation so downstream
  work is not recommended as actionable while its prerequisites remain open.
  Surface the same sequence in Manager and let members manage prerequisites in
  Tasks; viewers remain read-only and all writes remain audited.
- [x] Add a forward-only migration, relationship diagnostic, strict boundary
  validation, and unit/database/Chromium/eval coverage for cross-artist links,
  cycles, conflicting dates, idempotent links, completion/reopen guards, and
  prerequisite-aware Manager guidance.

Design evidence:

- StoryBoard already has canonical Tasks, explicit manual blockers, ownership,
  dates, and stale-write protection, but no structured relationship for “B
  cannot start until A is done.” The clean-room design borrows only the
  committed Andrea action-preflight principle that declared prerequisites and
  contradictions are checked before action and the strictest failing signal
  wins. Andrea's runtime code and its concurrently dirty working tree remain
  untouched.

Implementation and validation:

- Added the forward-only `TaskDependency` migration and tenant-safe task APIs.
  Serializable preflight and optimistic task updates enforce idempotency,
  acyclic ordering, compatible due dates, prerequisite completion, downstream
  reopen safety, and one audit event per actual relationship change.
- Added `manager_work_sequence_v1` as a code-owned projection and exposed it in
  Manager and Tasks. Brief and chat grounding reject downstream-as-actionable
  model output unless its ready prerequisite is also cited; direct sequence
  questions bypass the model. Traces retain only bounded policy/status counts.
- Promoted `manager_os_v18` / `manager_evals_v20`. Validation passed:
  `pnpm typecheck`, `pnpm lint`, 101 API + 2 shared tests, `pnpm build`, 3
  disposable-Postgres workflows across all 34 migrations, the complete
  relationship diagnostic including graph cycles/state/date order, 3 Chromium
  journeys, `git diff --check`, and the 36/36 Manager safety/usefulness gate.

### P0 — Goal-to-action reasoning (completed 2026-07-12)

- [x] Add one deterministic, non-persistent `manager_goal_path_v1` projection
  that joins each active goal to its active initiative, linked tasks, explicit
  prerequisites, and current measurement state.
- [x] Distinguish a credible ready next move from in-progress, waiting, blocked,
  missing-initiative, missing-task, measurement-drift, completed-target, and
  date-conflict states. Do not infer task duration, effort, conversion rate, or
  human capacity.
- [x] Replace the generic goal fallback that can create an unlinked task. Reuse
  the real ready task or prerequisite when it exists; only prepare a new task
  when a real initiative has no task, and bind that task to the initiative.
- [x] Apply the same path to Manager briefs, direct goal questions, provider
  grounding, traces, and the Manager workspace so model prose cannot substitute
  a different or orphan next move.
- [x] Add unit, disposable-database, Chromium, and golden-eval coverage for
  prerequisite unlockers, missing links, measurement drift, deadline conflicts,
  tenant isolation, and linked-task acceptance. No schema migration is needed.

Design evidence:

- StoryBoard already owns goals, initiatives, tasks, measurements, and task
  prerequisites, but evaluates them in separate projections. The clean-room
  design uses only Andrea's committed principle that causal claims name their
  evidence, contradictions, confidence limits, and safest next verification.
  No Andrea source, runtime, data model, or dirty working-tree content is copied.

Implementation and validation:

- `GET /manager/goal-paths`, briefs, chat, traces, provider grounding, and the
  Manager workspace now share the same code-owned path. Existing linked tasks
  and transitive ready prerequisites win over generated work; a missing task is
  prepared only against its existing active initiative.
- Recommendation acceptance recomputes the path before the transaction and
  rechecks the goal, initiative, open-task premise, measurement state, and date
  bounds inside the serializable write. A stale recommendation is rejected
  without a duplicate task or audit event.
- Validation passed: `pnpm typecheck`, `pnpm lint`, 102 API + 2 shared tests,
  `pnpm build`, 3 disposable-Postgres workflows across all 34 migrations, the
  complete relationship diagnostic, 3 Chromium journeys, the 38/38 Manager
  evaluation gate at 100% safety, container health/readiness checks, and
  `git diff --check`.

### P0 — Evidence-calibrated goal targets and plan health (completed 2026-07-12)

- [x] Add an explicit goal target direction: `at_least`, `at_most`, or
  `exact`. Preserve existing goals with an `at_least` default and expose the
  choice in the Manager workspace so growth, budget-cap, and exact-delivery
  goals cannot be interpreted as the same kind of target.
- [x] Create one code-owned `manager_goal_target_v1` assessment for target
  state, remaining gap, and display language. Reuse it in goal paths, plan
  health, deterministic chat, provider grounding, and acceptance revalidation.
- [x] Remove the current linear elapsed-time pace assumption. Releases,
  completed projects, and other lumpy outcomes must not be called behind pace
  merely because their count has not advanced evenly through the goal window.
- [x] Treat target reached, deadline missed, measurement drift, blocked or
  overdue work, missing plan links, and insufficient evidence as distinct
  states. “On track” means no recorded contradiction or blocker; it is never a
  probability or promise that the band will hit the target.
- [x] Add forward-only migration, boundary validation, tenant-safe database
  coverage, direct-question and provider-grounding tests, Chromium coverage,
  and golden scenarios for increase, cap, exact, and lumpy-delivery goals.

Root cause and design evidence:

- `deterministicManagerPlanHealth` currently compares a generic numeric ratio
  with the elapsed share of `createdAt → deadline`. That silently assumes every
  band goal advances linearly and that larger values are always better. A
  release can validly remain at zero until it ships, while a spending cap is
  successful only when the value stays below its target.
- The clean-room design uses only Andrea's committed evidence-contract idea:
  classify what the records prove separately from confidence and request a
  verification step when they cannot support a prediction. No Andrea code,
  runtime, schema, or dirty working-tree content is copied.

Implementation and validation:

- Added migration `20260713235000_manager_goal_target_direction`, strict shared
  create/PATCH validation, and an editable target-meaning control. PATCH no
  longer inherits create defaults, preventing partial edits from resetting a
  goal's status or measurement source.
- `manager_goal_target_v1` now drives goal paths, `manager_plan_health_v2`,
  deterministic plan answers, provider grounding, traces, and serializable
  recommendation revalidation. At-most/exact targets stay provisional until
  deadline; lumpy goals never receive an invented elapsed-time forecast.
- Validation passed: 103 API + 2 shared tests, 3 disposable-Postgres workflows
  across all 35 migrations, 3 Chromium journeys, the complete relationship
  diagnostic, the 41/41 `manager_os_v20` / `manager_evals_v22` gate at 100%
  safety, typecheck, lint, production builds, container readiness, and
  `git diff --check`.

### P0 — Grounded Manager conversation continuity (completed 2026-07-12)

- [x] Add one code-owned `manager_conversation_continuity_v1` classifier for
  bounded follow-ups such as “why that?”, “is that still right?”, “what is
  blocking it?”, “tell me more”, and “do that”. Store only classification and
  referenced record IDs in traces, never hidden reasoning.
- [x] Resolve a follow-up only from the immediately preceding structured
  Manager recommendation in the same artist conversation. Do not infer a
  referent from assistant prose, another tenant, or an old unrelated thread;
  missing or multiple candidates must produce one concise clarification.
- [x] Recheck the prior recommendation's stable key or exact typed-action
  identity against the current deterministic brief and source projection
  before calling it current. Explain the recorded reason and evidence, but do
  not duplicate the recommendation or accept an action from a pronoun.
- [x] Make this behavior identical with OpenAI enabled or disabled by routing
  resolved/ambiguous follow-ups through the code-owned path. Keep all existing
  approval and serializable acceptance checks as the only execution boundary.
- [x] Add unit, prompt-injection, disposable-database, Chromium, and golden-eval
  coverage; update the Manager policy/dataset versions and operator docs.

Root cause and design evidence:

- `ManagerService.chat` loads bounded conversation history for the optional
  provider, but `deterministicManagerChat` receives only the latest message.
  A short natural follow-up therefore loses its subject whenever the provider
  is off or fails, and can accidentally fall through to an unrelated global
  priority response.
- The clean-room design adopts only the principle visible in Andrea_NanoBot's
  committed cognitive-executive routing: classify reference-bound asks with an
  explicit reason/confidence and choose clarification when the subject is not
  grounded. No Andrea code, schema, runtime, or dirty worktree content is
  copied.

Implementation and validation:

- The continuity classifier resolves five bounded follow-up intents from the
  immediately preceding assistant run, ignores prose-only history, and records
  only policy, classification, confidence, reason, and reference metadata.
  Missing or multiple structured recommendations ask one clarification.
- Prior advice is compared with the current deterministic brief or exact
  typed-action source projection. The browser run exposed and fixed a real
  cross-route identity case where team-load and global-brief stable keys differ;
  task, member, check-in, and availability must all still match.
- No schema migration was needed. Validation passed 107 API + 2 shared tests,
  all 35 migrations and 3 disposable-Postgres workflows, the complete
  relationship diagnostic, 3 Chromium journeys, the 45/45
  `manager_os_v21` / `manager_evals_v23` gate at 100% safety, typecheck, lint,
  production builds, container readiness, and `git diff --check`.

### P0 — Tenant-grounded Manager subject resolution (completed 2026-07-12)

- [x] Add one code-owned `manager_subject_reference_v1` resolver for named
  goals, tasks, events, projects, decisions, opportunities, prospects, deals,
  invoices, and settlements. Candidate records come only from the current
  artist's bounded Manager facts.
- [x] Resolve only full normalized labels, explicitly quoted fragments, or a
  unique distinctive token paired with a compatible record-kind word. Do not
  use fuzzy embeddings, cross-tenant search, or silent first-record selection.
- [x] Bind direct answers to the resolved record and its existing projection:
  show readiness, project readiness, goal health/path, task commitment state,
  decision status, booking stage, or financial balance. Cite that subject and
  do not recommend work for a different record.
- [x] When two current records remain plausible, name the bounded choices and
  ask which one the operator means. Keep the same behavior with OpenAI enabled
  or disabled, and persist only resolution metadata in the Manager trace.
- [x] Add unit, tenant-database, Chromium, and golden-eval coverage; update the
  current Manager policy/dataset versions and operator documentation.

Root cause and design evidence:

- `deterministicManagerChat` currently routes from broad keywords, then often
  lists the first three events, first five projects, first pressured task, or
  first decision. Even an explicitly named later record can receive an answer
  about another subject. Goal matching is a one-off full-title check rather
  than a shared record-selection contract.
- The clean-room design applies only Andrea_NanoBot's committed subject-data
  principle: continuation or routing is valid when it is attached to explicit
  structured state, otherwise it falls back or clarifies. No Andrea code,
  schema, runtime, or dirty worktree content is copied.

Implementation and validation:

- `manager_subject_reference_v1` builds a bounded candidate list from the
  current artist's Manager facts and resolves only conservative label, quoted,
  or typed-token matches. Generic asks retain normal aggregate routing, while
  missing quoted records and same-name collisions ask a bounded clarification.
- Deterministic chat now answers the selected goal, task, event, project,
  decision, opportunity, prospect, offer, invoice, or settlement from that
  record's current projection. Exact-record routes bypass the optional model,
  cite only supporting tenant records, and cannot attach a recommendation for
  another subject. Traces retain resolution metadata rather than free-form
  inference.
- No schema migration was needed. Validation passed 109 API + 2 shared tests,
  all 35 migrations and 3 disposable-Postgres workflows (including owned and
  foreign invoice subject checks), the complete relationship diagnostic, 3
  Chromium journeys including exact invoice selection, the 48/48
  `manager_os_v22` / `manager_evals_v24` gate at 100% safety, typecheck, lint,
  production builds, container readiness, and `git diff --check`.

### P0 — Events, projects, music, and internal deal operations (completed 2026-07-11)

- [x] Add the artist-scoped `BandEvent` spine, participants/availability,
  logistics, idempotent booking-confirmation conversion, show advance offsets,
  and approval preparation for Calendar and Drive folders.
- [x] Add songs, setlists, release/content/tour/business projects, versioned
  offers/memos, owner-reviewed document templates, agreement PDF snapshots,
  invoices, idempotent manual payments, expenses, settlements, and member
  splits using integer minor units.
- [x] Add a responsive Band operations workspace and feed upcoming event
  readiness, overdue invoice, and overdue project risks into dashboard actions.
  The workspace covers owner-reviewed templates, agreement generation,
  invoices/manual payments, expenses, and settlement finalization as well as
  offers.
- [x] Extend the disposable-database suite for intake memory, event
  idempotency, availability, advance generation, payment replay, settlement
  calculations, immutable PDF snapshots, audit rows, and cross-artist rejection.
- [x] Extend production-mode Chromium coverage through Manager intake/chat,
  event/song/release-project/offer creation, reviewed agreement generation,
  invoice/deposit recording, event expense, and settlement PDF finalization.
- [ ] Direct PDF upload/attachment to Drive/Gmail remains an adapter package:
  current delivery creates a reviewed Gmail draft referencing the immutable
  snapshot, and requires the human to attach it. Do not claim automatic
  attachment until binary Drive upload and Gmail attachment adapters pass real
  provider acceptance tests.
- [ ] Rich schedule-item editing, project budget line-item UI,
  technician public setlist pages, and evidence-file upload are follow-on UX
  packages; their underlying event/project/document boundaries are in place.

### P0 — Executable release and project management (completed 2026-07-12)

- [x] Reuse artist-scoped Tasks as project milestones and permit tenant-checked
  nullable `projectId` links through the task API; do not create a competing
  milestone authority.
- [x] Add `project_plan_v1` release, content campaign, tour, and business
  templates dated backward from the project's real target date. Stable source
  keys make generation idempotent without overwriting user work.
- [x] Derive explainable readiness from date, milestone completion/ownership,
  overdue/blocked work, metrics, assets, budget/spend, expenses, and events.
- [x] Ship a focused project workspace for milestone owners/status, project
  facts, success metrics, budget, and working asset links.
- [x] Feed the same project readiness and next milestone into Manager briefs
  and release/project conversation; unsupported project outcomes remain unknown.
- [x] Cover tailored templates, risk classification, foreign project-link
  rejection, generation replay, audits, browser execution, and Manager grounding.

### P2 — requires deployment or product decisions

- [x] Add a one-command, production-built local container bundle with
  Postgres, Redis, migrations, seed, API, and web. It intentionally preserves
  the current single API/worker topology.
- [ ] Define a separate queue-worker deployment and runtime metrics before
  horizontally scaling the API.
- [ ] Add cursor pagination and query limits to high-volume list endpoints once
  expected data volumes and API compatibility requirements are agreed. The
  existing list responses are arrays; changing them to envelopes is a public
  interface decision and should be coordinated with API consumers.
- [ ] Assess routing optimization, provider-backed payments/signatures,
  merchandise, royalties, and deeper private/corporate intake only with
  validated operator demand. Do not add scraping, lead brokers, or auto-send.

### P1 — responsive manager workspace (completed 2026-07-11)

- [x] Replace the phone-width persistent sidebar with an accessible navigation drawer and touch-sized controls.
- [x] Add a guided empty-workspace dashboard path that takes a new manager from booking profile to lead to reviewed pitch.

## Release checks

Run `pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and
`pnpm build`. Run database integration tests only with a disposable database
identified by `STORYBOARD_TEST_DATABASE_URL`.

Before release, run a read-only diagnostic for historical relationships whose
artist IDs disagree. Do not repair or delete such data automatically.

## Progress log

- 2026-07-12: Added voluntary, append-only capacity check-ins for active working
  members and upgraded team-load reasoning to `manager_team_load_v2`. The
  Manager now distinguishes available, limited, unavailable, expired, and
  unknown signals; never requests a private explanation; keeps note content out
  of provider context and audit metadata; and revalidates the exact check-in
  before accepting a task assignment. The Manager UI, tenant API, diagnostics,
  database workflow, golden evals, and Chromium journey use the same policy.
  The release contract is `manager_os_v16` / `manager_evals_v17`; validation
  passed 96 API tests, two shared tests, three database workflows across all 33
  migrations, three Chromium workflows, 30/30 Manager checks at 100% safety,
  the complete static/build gate, relationship diagnostics, and a cold healthy
  container bundle. The API build also moved to typecheck-plus-SWC emission to
  eliminate intermittent parallel-build heap failures without weakening types.
- 2026-07-12: Made band work accountable to the real working lineup. Tasks now
  support an additive tenant-checked `bandMemberId`, while legacy labels remain
  readable without an automatic backfill. The shared `manager_team_load_v1`
  projection distinguishes linked, legacy, placeholder, and unknown ownership;
  reports only recorded pressure; and may prepare one uniquely role-grounded
  assignment for review. Acceptance rechecks the same-artist open task, active
  member, current owner premise, and stale write before an audited update. Tasks,
  project milestones, event views, Manager chat/UI, diagnostics, and docs use
  the same relationship. The release contract is `manager_os_v15` /
  `manager_evals_v16`; validation passed 94 API tests, two shared tests, three
  database workflows across all 32 migrations, three Chromium workflows,
  29/29 Manager checks at 100% safety, the complete static/build gate,
  relationship diagnostics, and a cold healthy container bundle.
- 2026-07-12: Added novice-safe Manager coaching so the no-provider path can
  explain the business instead of falling back to unrelated priorities. The
  code-owned catalog covers booking/deal structures, show production,
  settlement, and original-release rights; answers explain the term, why it
  matters, the matching StoryBoard workflow, and important uncertainty. Known
  concepts bypass model generation, create no recommendation, and cite only
  current-artist records. The UI turns saved education topics into quick
  questions. The design clean-rooms Andrea_NanoBot's conservative
  classify-directly-or-clarify principle without copying its code, runtime, or
  data. The release contract is `manager_os_v14` / `manager_evals_v15`.
  Validation passed 90 API tests, two shared tests, three database workflows
  across all 31 migrations, three production Chromium workflows, production
  builds, the relationship diagnostic with zero mismatches, the 27/27 Manager
  gate at 100% safety, and a rebuilt healthy container bundle. CI hardening now
  waits for API and web cold-start readiness independently, verifies the actual
  session cookie without following a redirect, and treats the browser cases as
  one non-retriable database journey with failure traces retained. The CI-mode
  browser run also exposed and fixed a real form-state race where a background
  server refresh could clear unsaved band-member responsibilities before save.
- 2026-07-12: Added explicit conversational memory capture. “Remember…” now
  creates a visible proposal rather than a silent write; acceptance saves the
  exact normal-sensitivity value with operator-confirmation provenance and an
  audit trail. Profile-owned facts redirect to Band context, sensitive values
  fail closed without being echoed, and grounding requires an exact match to
  the current question. Migration
  `20260713230000_manager_conversational_memory` links the accepted
  recommendation to its memory fact without rewriting existing rows. The
  release contract is `manager_os_v13` / `manager_evals_v14`. Validation
  passed 89 API tests, two shared tests, three database workflows across all 31
  migrations, three production Chromium workflows, production builds, the
  relationship diagnostic with zero mismatches, and the 24/24 Manager gate at
  100% safety. A final schema diff also found and closed a historical missing
  migration for the existing Task status/due-date index; fresh and upgraded
  databases now converge with no pending schema diff.
- 2026-07-12: Added reviewable `manager_goal_measurement_v1` reconciliation so
  Manager goals no longer drift silently from the operating records they are
  meant to measure. The policy counts only explicitly selected sources,
  preserves manual progress for unsupported metrics, and never changes a goal
  until a member confirms the current observed value. Reconciliation is
  tenant-scoped, stale-evidence protected, append-only, audited, and idempotent.
  The design clean-rooms Andrea_NanoBot's general observable-outcome
  reconciliation principle without copying its code, runtime, or data.
  Container validation also pinned API/web images to Node 22.22.0 after the
  floating Node 22 tag moved beyond the repository's declared 22.22.x runtime.
  Validation passed 87 API tests, two shared tests, three database workflows
  across all 29 migrations, three production Chromium workflows, production
  builds, and the 22/22 `manager_os_v12` / `manager_evals_v13` gate at 100%
  safety.
- 2026-07-12: Added the code-owned `manager_knowledge_v1` source and freshness
  policy. Operating-profile writes now synchronize band mode, home market,
  ambition, and constraints to their compatibility memory rows atomically;
  migration `20260713210000_manager_profile_memory_source` repairs existing
  rows, and generic memory writes cannot create a second truth. Conflicted,
  stale, unconfirmed, and low-confidence knowledge is visible to the band and
  carried into brief/chat guardrails, while provider reasoning receives the
  canonical profile value. The design clean-rooms Andrea_NanoBot's bounded
  freshness/conflict assessment without copying its code, runtime, or data,
  and follows [OpenAI's GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model)
  to keep source rules and approval boundaries code-owned and evaluate changes
  on representative workflows. Validation passed 85 API tests, two shared
  tests, three database workflows across all 28 migrations, three production
  Chromium workflows, production builds, and the 21/21 `manager_os_v11` /
  `manager_evals_v12` gate at 100% safety.
- 2026-07-12: Replaced Manager's code-order truncation with the global,
  explainable `manager_priority_v1` focus policy. Every candidate is now
  collected before the five-item Today limit; recorded deadlines, show
  readiness, unavailable members, commitments, fresh replies, approvals,
  overdue money, due reviews, follow-ups, and project health are compared in
  one deterministic pass. Grounded model suggestions are merged without
  displacing must-not-miss deterministic signals, overlapping evidence is
  deduplicated, old cached briefs are regenerated, and rule factors are visible
  in the UI and redacted run trace. The clean-room design uses Andrea_NanoBot's
  main-signal comparison concept without copying its code, runtime, or data,
  and follows [OpenAI trace-grading guidance](https://developers.openai.com/api/docs/guides/trace-grading)
  by recording structured policy decisions rather than hidden reasoning.
  Validation passed the full typecheck/lint/test/build gate (83 API and two
  shared tests), three database workflows across all 27 migrations, three
  Chromium workflows, the clean artist-relationship diagnostic, production
  builds, and the 20/20 `manager_os_v10` / `manager_evals_v11` gate at 100%
  safety.
- 2026-07-12: Extended the Manager release gate from decided recommendations
  to exact, owner-reviewed conversation answers. Helpful examples must remain
  natural and grounded in the linked run's redacted evidence. Negative examples
  include the owner's expected behavior and block the candidate until a later
  code-registered version is explicitly reviewed as resolving them; no version
  promotes or rewrites itself. The tenant-scoped, audited workflow ships in
  migration `20260713200000_manager_response_evals` with API, Manager UI,
  relationship diagnostics, and unit/database/Chromium coverage. Validation
  passed 81 API tests, two shared tests, all three 27-migration database
  workflows, three production Chromium workflows, the relationship diagnostic,
  production builds, and the 19/19 `manager_os_v9` / `manager_evals_v10` gate
  at 100% safety, in addition to each band's local reviewed examples.
- 2026-07-12: Made Manager model context honor memory sensitivity rather than
  relying only on UI access control. Redacted mode now includes normal memory,
  full-context consent may add sensitive memory, and restricted memory never
  leaves StoryBoard. Grounding uses the same projected evidence set, local
  traces retain only redacted facts plus policy counts, and owners can inspect
  the active policy in the Manager cadence card. This applies Andrea_NanoBot's
  clean-room sensitivity-affects-reasoning principle without importing its
  code, runtime, or data. Validation passed 81 API tests, two shared tests, all
  three 26-migration database workflows, three production Chromium workflows,
  and the 19/19 `manager_os_v9` / `manager_evals_v9` gate at 100% safety.
- 2026-07-12: Connected grounded Manager advice to the existing safe Operations
  generators. A missing event advance or dated project milestone plan now
  produces one explicit reviewable action; member acceptance atomically claims
  the recommendation and creates source-keyed Tasks, then records the action as
  completed. Targets and prerequisites are tenant-revalidated, replay is
  idempotent, and all provider/legal/financial boundaries remain unchanged.
  Manual and Manager show advances now share `show_advance_v1`. The design
  clean-rooms Andrea_NanoBot's small action-bundle-over-existing-systems
  principle; no source code, runtime, or database was imported. Validation
  passed 80 API tests, two shared tests, all three 26-migration database
  workflows, three production Chromium workflows, and the 18/18
  `manager_os_v9` gate at 100% safety.
- 2026-07-12: Completed the dormant Manager operating cadence with forward
  migration `20260713190000_manager_operating_cadence`. Owner controls now
  expose the existing AI/data policy and an explicit daily/weekly local-time
  schedule; scheduled model use requires a second opt-in and deterministic
  briefs remain the default. BullMQ claims each local period with stale-claim
  recovery, persists the run and owner/team in-app notifications atomically,
  and deep-links the notification to Manager without sending anything outside
  StoryBoard. The design clean-rooms Andrea_NanoBot's opt-in ritual and
  canonical-source principles; no code or runtime dependency was imported.
  Validation passed 77 API tests, two shared tests, concurrent/idempotent
  scheduling in all three 26-migration database workflows, three production
  Chromium workflows, and the existing 16/16 `manager_os_v8` safety gate. A
  worker-enabled API smoke reported database/Redis/worker ready and BullMQ
  registered `manager.schedule.scan` at the documented 15-minute interval. A
  fresh isolated container bundle also applied all 26 migrations, seeded,
  reached API/worker readiness, served the production web build, and registered
  the same repeatable job before its temporary stack and volumes were removed.
- 2026-07-12: Closed the Manager follow-through gap with an evidence-ranked
  commitment projection and forward migration
  `20260713180000_task_commitment_followthrough`. Blocked tasks now require a
  reason, may name the waiting party, retain deferral count/time, and use
  compare-and-set updates. The Tasks workspace can edit dates and blockers;
  Manager Today, Waiting on, risks, chat, and the new Follow-through card share
  the same derived ranking. Model output must preserve the highest-severity
  commitment and cannot create duplicate work for blocker questions. The
  clean-room design borrows Andrea_NanoBot's explicit follow-through outcome
  principle; no source code or broader authority was imported. Validation
  passed 74 API tests, all three 25-migration database workflows, three
  production Chromium workflows, and the 16/16 `manager_os_v8` gate at 100%
  safety.
- 2026-07-12: Connected Manager conversation to the evidence-to-decision loop.
  A direct two-option question can now become one linked open draft, while
  generic advice keeps its existing intent. The band must replace unknown
  tradeoffs and save framing before choosing; later review automatically
  completes the originating recommendation without enabling any external
  action. Validation passed 71 API tests, all three 24-migration database
  workflows, three production Chromium workflows, and the 15/15
  `manager_os_v7` gate at 100% safety.
- 2026-07-12: Closed the post-intake context blind spot without another schema
  migration. One deterministic context projection now tells the band exactly
  what is known, what is missing, and why the next answer matters across four
  transparent dimensions. Members can edit the full operating profile and
  working-lineup responsibilities in Manager; briefs and conversation consume
  the same result without judging artistic quality or inventing unknown facts.
  The design clean-rooms Andrea_NanoBot's bounded active-perception principle;
  no code, source store, or broader agency was imported. Validation passed 68
  API tests, all three 23-migration database workflows, three production
  Chromium workflows, and the 14/14 `manager_os_v6` gate at 100% safety.
- 2026-07-12: Added the evidence-to-decision learning loop and forward migration
  `20260713160000_manager_decision_reviews`. The Manager workspace now carries a
  real band tradeoff from options through choice, expected result, scheduled
  review, and immutable observed lesson. Compare-and-set transitions prevent
  concurrent overwrites; due reviews enter Today; recent reviewed choices stay
  available to bounded conversation without becoming universal rules. Clean-room
  principles came from Andrea_NanoBot's verified-outcome design, with no source
  code or broader authority imported. Validation passed 66 API tests, all three
  23-migration database workflows, three production Chromium workflows, and the
  13/13 `manager_os_v5` offline gate at 100% safety.
- 2026-07-12: Closed the post-show learning blind spot without a migration.
  Gig editing now captures attendance, gross, lessons, and relationship outcome;
  a deterministic 7–365 day Manager review reports completed activity, explicit
  booking outcomes, premise coverage, currency-separated financials, unknowns,
  and a first evidence-backed action. Briefs, chat, the Manager workspace, and
  model snapshots consume the same projection. Settlement calculations now
  exclude mismatched-currency expenses, attach included costs, and recheck the
  draft at finalization instead of combining unlike or stale minor units.
  Validation passed 63 API tests, all three 22-migration database workflows,
  three production Chromium workflows, and the 12/12 `manager_os_v4` offline
  gate at 100% safety.
- 2026-07-12: Added forward migration
  `20260713010000_manager_response_feedback` and Manager policy
  `manager_os_v4`. Every delivered chat answer now links to its run and accepts
  audited, idempotent, tenant-safe helpful/correction feedback. Only aggregate
  correction reasons influence bounded presentation guidance; free-text notes
  never become prompt instructions. A deterministic response-quality gate
  rejects canned/meta language, excessive presentation, and fabricated claims
  of outside action. Validation passed 59 API tests, all three 22-migration
  database workflows, three production Chromium workflows including helpful
  and correction feedback, and the 11/11 offline Manager gate. The design uses
  Andrea_NanoBot's outcome-led feedback concepts as a clean-room reference; no
  code or broader autonomy was imported. The full typecheck/lint/test/build
  gate, Compose validation, and expanded relationship audit also pass with zero
  cross-artist mismatches.
- 2026-07-12: Added executable project management without a new milestone
  table. `project_plan_v1` generates type-specific, source-keyed Task sequences;
  project readiness explains progress, ownership, blockers, metrics, assets,
  and budget/spend; the focused workspace and Manager consume the same signal.
  Validation passed 56 API tests, all three database workflows, and all three
  production Chromium workflows including release generation, assignment,
  completion, assets/budget/metrics, and grounded Manager reporting. No schema
  migration or provider access was required.
- 2026-07-12: Added the deterministic `EventDayOfView`, tenant-safe
  `GET /events/:id/day-of`, phone-oriented show workspace, and Manager 24-hour
  day-of prioritization. The view identifies the next checkpoint, work and
  lineup pressure, contacts, setlist/production references, and recorded money
  without inventing missing facts. Validation passed 53 API tests, all three
  database workflows, and all three production Chromium workflows including
  day-of rendering and audited advance-task completion. No migration or
  provider access was required.
- 2026-07-12: Completed the actionable gig-readiness loop. Band operations now
  edits lineup responses and the show facts used by the shared readiness
  policy; service-layer validation preserves tenant ownership and the complete
  show-day timeline across partial patches. Validation passed 51 API tests,
  all three database workflows, and three Chromium workflows including event
  editing, score improvement, advance generation, and Manager reporting the
  same evidence-backed score. Repeated local builds may require the documented
  4 GB Node heap fallback; changing test emission to SWC was rejected because
  it breaks Node ESM discovery of compiled CommonJS named exports. No migration
  or provider access was required.
- 2026-07-12: Added shared, deterministic show-readiness intelligence across
  lineup, schedule, contacts, deal/payment, advance, and performance records.
  The new tenant-scoped APIs, Band operations card, Manager brief/chat signal,
  confidence/evidence model, and direct advance-checklist action use one
  code-owned policy. Validation passed 50 API tests, all three 21-migration
  database workflows, three production Chromium workflows including readiness
  and advance generation, the full quality gate, 8/8 offline Manager evals,
  Compose configuration, and the relationship audit with zero mismatches.
- 2026-07-12: Added migration `20260712223000_manager_executable_plan` and
  `manager_plan_v1`. Guided setup now creates an executable, editable 90-day
  plan with two mode-specific goals, two initiatives, and six dated tasks.
  Nullable tenant-unique source keys make fill-missing generation idempotent;
  plan health flags owner and timeline risk, Tasks supports real owner
  assignment, and briefs advance existing linked work instead of duplicating
  it. Production Chromium testing exposed and fixed stale post-intake client
  state and a pre-intake brief cache. The E2E runner now resets only its
  explicit test database and covers clean intake, immediate plan visibility,
  idempotent refill, natural plan explanation, and owner assignment. Validation
  passed 48 API tests, all three 21-migration database workflows, all three
  clean production Chromium workflows, the 8/8 offline Manager gate, the full
  type/lint/build gate, and the relationship audit with zero mismatches. A
  fresh isolated Compose stack also passed migration, seed, API/worker
  readiness, dev login, intake, exact 2/2/6 plan creation, and Manager SSR;
  its temporary volumes were removed.

- 2026-07-12: Added migration `20260712210000_manager_plan_health_evals`.
  Goal progress is now a serializable, append-only, audited event with
  tenant-bound ownership; plan health deterministically explains scores from
  measurements, deadlines, linked initiatives, blocked/overdue work, and task
  state. Added the owner-only persisted evaluation gate plus database-free
  `pnpm manager:eval`; the current eight golden scenarios pass with 100% safety
  checks, while unresolved same-version `needs_revision` examples block a run.
  Validation passed 45 API tests, all three 20-migration database workflows,
  three production Chromium workflows, the full quality gate, and the expanded
  relationship audit with zero mismatches. A fresh isolated Compose stack also
  passed migration, seed, API/worker readiness, web rendering, dev login, and
  `/manager` on alternate ports; its volumes were removed afterward.

- 2026-07-12: Added forward migrations
  `20260712183000_manager_learning_loop` and
  `20260712193000_manager_reviewed_evals`. Manager prompt/policy version
  `manager_os_v3` now records structured outcomes, makes acceptance
  transactionally single-use, attributes completed tasks, suppresses repeated
  stable keys for fixed cooldowns, exposes 90-day learning metrics, and lets
  bands correct/archive confirmed memory. Owners can promote a decided
  recommendation into a bounded local eval set; runtime code never changes the
  active prompt or policy. Validation passed 42 API tests, all three
  19-migration database workflows, and all three production Chromium workflows.
  The isolated container smoke exposed and fixed server-rendered web requests
  incorrectly preferring the browser's localhost API URL; Compose now supplies
  `INTERNAL_API_URL=http://api:4000`. Fresh migrations, seed, API/worker
  readiness, web rendering, dev login, and `/manager` all passed on alternate
  ports before the isolated volumes were removed.

- 2026-07-12: Shipped Manager prompt/policy version `manager_os_v2` with
  persistent bounded conversation, intent-aware deterministic reasoning,
  broader workflow signals, strict whole-output evidence rejection, and
  reviewable chat task proposals. Added eight golden scenarios, deterministic
  behavior tests, Responses continuation regression coverage, database checks
  for multi-turn persistence/tenant isolation, and production-mode Playwright
  coverage for two turns plus reload. Validation passed 37 API tests, all three
  database workflows, and all three Chromium workflows. No schema migration was
  required.

- 2026-07-11: Added migration `20260711203445_manager_os_rounds`, the guided
  cross-functional Manager workspace, code-owned AI action policy, memory
  provenance, evidence-filtered briefs/chat, Manager traces, and versioned
  scenario tests. Added the unified event/show spine, availability, advance
  tasks, songs/setlists, projects, deal history, reviewed templates, immutable
  PDF snapshots, invoices/manual payments, and settlements. All 17 migrations
  and three integration workflows passed against dedicated
  `storyboard_manager_test`; unit coverage passed 32 API tests.
- 2026-07-11: Container smoke initially exposed API TypeScript/Prisma heap
  pressure on a small Docker Desktop VM. The Docker context was reduced from
  192 MB to under 400 KB, full type safety remains in the quality gate, and the
  API image now uses Nest's SWC emitter for the already-checked source. An
  isolated production bundle passed migrations, seed, API/worker readiness,
  web health, and dev login on alternate ports before its volumes were removed.

- 2026-07-11: Added the tracked campaign-reply and negotiation loop with migration `20260711193709_booking_reply_loop`. The implementation retains only bounded reply metadata and derived AI facts, preserves general-inbox isolation, requires owner opt-in and Google reconnection, and keeps drafted responses approval-gated. Added unit coverage for scope gating, reply deduplication, raw-body non-persistence, provider failure isolation, and disabled-by-default configuration.

- 2026-07-10: Created after verifying that the older Cursor master plan is
  historical and that no root modernization plan existed. The local worktree
  was cloned cleanly from `main`; no remote history has been changed.
- 2026-07-10: Added strict booking, task, and contact request schemas; added
  service-level tenant ownership checks for Contact → Venue,
  BookingOpportunity → Venue, and Task → BookingOpportunity. Added compiled
  API regression tests and the read-only `pnpm db:audit-relationships` release
  diagnostic. API typecheck, lint, and tests pass.
- 2026-07-10: Added signed, single-use operator OAuth state cookies and callback
  regression tests. Added an explicit, test-only database integration suite for
  tenant links, role enforcement, Telegram registration binding, and audit rows;
  added Node 22/pnpm 10 GitHub Actions quality checks.
- 2026-07-10: Ran the integration suite against an isolated, fresh
  `storyboard_test` Postgres database and verified the relationship diagnostic
  reports zero mismatches. Unit tests intentionally exclude the opt-in
  integration directory so `pnpm test` never requires a database.
- 2026-07-10: Final validation passed: `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, and `pnpm build`; the CI workflow YAML and Git diff whitespace
  checks also passed. The temporary test database container was removed.
- 2026-07-10: Independently researched GitHub references for the requested
  next rounds. SongDrive and Setlyst validate later setlist demand but do not
  fit this stack; ChordSheetJS is GPL and was excluded. No external code was
  copied. Ticketmaster Discovery was selected for city-first venue/event
  signals; Bandsintown is kept only for the artist's own events.
- 2026-07-10: Added migrations `20260710174910_booking_acquisition` and
  `20260710180946_booking_campaign_approval_relation`; implemented booking
  profiles, prospects, conversion, campaigns, approval execution follow-ups,
  dashboard actions, strict shared schemas, and responsive web workspaces.
  Unit coverage now includes profile/template validation, manual mode,
  Ticketmaster normalization, source dedupe, and tenant rejection. The opt-in
  database suite covers private/venue conversion, campaign approval execution,
  recipient outcomes, generated follow-up tasks, and audit rows.
- 2026-07-10: Validation passed against a fresh dedicated `storyboard_test`
  database: migrations, `pnpm test:integration`, full `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, and `pnpm build`. The read-only relationship audit
  was extended to all new relationships and reported zero mismatches on the
  local validation database.
- 2026-07-10: Added and executed Chromium browser coverage for the complete
  manual booking-acquisition path. The flow found and fixed Fastify's implicit
  200 redirect behavior and missing non-POST CORS preflight methods. The
  opt-in runner now builds production artifacts before testing and test/report
  artifacts are ignored. Added `/ready` with focused unit coverage; it is safe
  for infrastructure probes and does not disclose secrets.
- 2026-07-10: Final release-confidence validation passed: `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, `pnpm build`, `git diff --check`, the opt-in
  Postgres integration suite, the Chromium production-mode workflow, and the
  read-only relationship audit (zero mismatches). The CI browser job uses the
  same explicit Postgres/Redis/mock-provider setup; it has not been dispatched
  from this uncommitted worktree.
- 2026-07-11: Added the self-managed-band market-sprint workflow and a
  forward-only migration for sprint links and per-recipient campaign delivery
  records. Campaigns can preserve draft-only execution or use immediate send on
  a separate approved Execute action. Successful sends create follow-up work;
  failed or unknown deliveries are retained and never auto-retried. Validation
  passed for unit, database integration, Chromium browser, build, and expanded
  relationship-audit coverage.
- 2026-07-11: Added a bounded Booking advisor with a forward-only migration.
  It persists aggregate booking facts, structured advice, prompt version, and
  per-operator helpful/not-helpful feedback. The default path is deterministic;
  the optional OpenAI path is aggregate-only, structured, non-persistent at the
  provider, and falls back safely on error. It has no mutation, inbox-reading,
  or outbound-action capability. Validation passed for unit, explicit-database
  integration, Chromium advisor UI, the full quality gate, and relationship
  diagnostic (zero mismatches).
- 2026-07-11: Added a separate production-built local container bundle with
  API/web Dockerfiles, Compose migrations and seed, persisted Postgres/Redis,
  local dev login, and a production override template. Repository quality gates
  pass. End-to-end Compose startup still requires a Docker Compose v2 host with
  at least 2 GB allocated to Docker; the current machine lacks Compose v2 and
  its daemon kills the compiler below that threshold.
- 2026-07-11: Release hardening corrected Prisma 7 seeding, the documented
  local `dev@localhost` seed identity, and the isolated browser test cookie
  domain. Added advisor full-context and environment validation regressions,
  plus a required Compose startup smoke job on every pull request. Full unit,
  integration, Chromium, production-build, relationship-audit, and Compose
  configuration checks pass locally.
