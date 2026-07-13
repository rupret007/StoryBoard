# StoryBoard Architecture Overview

## System Shape

StoryBoard is a single product with one operator-facing web app and one
orchestration API. The web app is responsible for user interaction, command-bar
entry, approvals, and operations views. The API is the sole write gateway and
owns domain behavior, queue orchestration, provider adapters, and audit
recording.

PostgreSQL is the system of record. Redis is used for queue-backed coordination
and async workloads through BullMQ. All integration traffic must pass through an
adapter layer rather than leaking into domain modules.

## High-Level Components

- `apps/web`: Next.js operator UI (dashboard shell, CRM/booking/task views,
  approval center, command bar, weekly summary, audit activity feed; talks to the
  API over HTTP with **`credentials: "include"`** and server-side cookie forward;
  operator identity from session / `GET /auth/me`)
- `apps/api`: NestJS application layer and structured-action execution
- `prisma`: shared PostgreSQL schema
- `packages/shared`: Zod schemas, contracts, domain types
- `packages/ui`: reusable web UI primitives
- `Redis + BullMQ`: background jobs and summaries

## Current API surface

Feature modules live under `apps/api/src/` as Nest modules: `venues`, `contacts`,
`booking` (profiles, prospects, campaigns, replies, and opportunities),
`manager` (intake, operating state, evidence-grounded briefs, persistent
bounded conversation, and reviewable recommendations), `operations`
(events, songs/setlists, projects, deals, documents, invoices, settlements),
`tasks`, `approvals`, `audit-events`, `commands`, `summary` (weekly aggregation),
and `dashboard` (stats/intelligence). Global
`PrismaModule`, `AuditModule`, `IntegrationsModule` support persistence and
audit. External systems are accessed only via adapter interfaces; mocked
implementations live under `apps/api/src/integrations/adapters/mock/`.

Setlist timing is derived once through the shared `setlist_summary_v1`
projection used by the API, web builder, show readiness, and Manager evidence.
The projection sums only known Song durations, keeps missing durations
explicit, and excludes breaks rather than guessing. Setlist item replacement
remains an audited API write after artist ownership validation; the projection
itself is read-only and non-persistent.

**Adapter registry (phase 2B):** `IntegrationsModule` still exposes the
`MOCK_ADAPTERS` token (env-only registry for compatibility). **Request paths**
that need artist context resolve adapters via `AdapterRegistryResolver
.resolveForArtist(artistId)`: **Gmail, Google Calendar, and Google Drive** use a
stored `IntegrationConnection` row (`provider = "google"`) when present and
valid, else fall back to env `GOOGLE_OAUTH_REFRESH_TOKEN` when set. **Bandsintown
and Ticketmaster** remain env-global; **YouTube and Spotify** stay mock-only.
Calendar/Drive real adapters honor OAuth scopes recorded on the connection.
Bandsintown is limited to the artist's own event context. Ticketmaster powers
bounded, city-first Find shows signals only; a missing or unavailable key leaves
that workflow explicitly manual.
`GET /integrations/status?artistId=` returns per-artist provider modes and Google
connection metadata (no secrets).

**Google OAuth (minimal):** `GET /integrations/google/authorize` and
`GET /auth/google/callback` implement the connect flow; tokens are encrypted into
`IntegrationConnection.encryptedSecrets`. See `docs/integrations-google-oauth.md`.

**Operator auth (phase 3A + 3B):** Separate Google OIDC flow for **sign-in** (`openid email profile`): `GET /auth/operator/google/start` → `GET /auth/operator/google/callback`. Session cookie **`sb_session`** holds `operatorId` and optional `currentArtistId`. **`Operator`** and **`ArtistMembership`** (`owner` | `member` | **`viewer`**) gate artist-scoped routes; **mutations** additionally require **member-or-above** where enforced; **integration Google authorize** and **membership admin** require **owner**. **`ArtistMembershipInvite`** supports hashed-token invitations and onboarding (`docs/invitations.md`). Integration authorize signs OAuth `state` with **`operatorId`** and the callback rejects a session mismatch. A global **`CsrfOriginGuard`** checks **`Origin`/`Referer`** against **`WEB_URL`** for unsafe HTTP methods (**OAuth callbacks** and **`POST /integrations/telegram/webhook`** excluded). Unauthenticated access is limited to health/meta/readiness, operator OAuth start/callback, the integration OAuth callback, the development login only when its bypass is enabled, and the Telegram webhook. See `docs/auth-operators.md`.

## Command Bar Execution Model

Natural language is an input format, not the execution contract. The API also
accepts a **structured `intent`** (and optional `payload`) on `POST /commands/execute`
so clients can bypass brittle substring ordering; see `docs/developer-runbook.md`.

1. The operator enters a command in the UI.
2. The API resolves the request into a structured action proposal.
3. The proposal is validated against Zod schemas and domain rules.
4. If the action is risky, StoryBoard creates an approval request before any
   external or destructive write.
5. The action runs in dry-run mode when practical to preview changes (`CommandRun.dryRun`, default true on commands).
6. **Approved** requests with executable action types run via `POST /approvals/:id/execute`, which atomically claims one execution attempt, performs provider work (e.g. Gmail draft creation), records **executed**/**failed** on `ApprovalRequest`, and writes audit events — never executing unapproved rows or replaying a claimed request.
7. Async work is coordinated through BullMQ when off the request path.
8. The system returns a clear result to the operator and stores the run record (including `providerModes` when relevant).

## Architectural Guardrails

- PostgreSQL is the source of truth for operational state.
- Provider payloads are normalized at the adapter boundary.
- Domain logic should not call third-party APIs directly.
- All write paths should consider dry-run support first.
- Risky actions require approval objects and audit events.
- Background work should be coordinated through BullMQ, not ad hoc timers.
- Shared validation should live in `packages/shared`.
- Manager model output is advisory data, never authority. Read context is
  assembled by tenant-scoped code; known evidence IDs are enforced after model
  output; one unknown evidence ID rejects the full model response rather than
  silently weakening its support. Conversation context is tenant-scoped and
  bounded. Action risk is classified by code; only allowlisted internal writes
  can run directly.
- Manager adaptation is outcome-controlled: accepted recommendations are
  transactionally single-use, task completion is attributed, and recent
  accepted/completed/dismissed stable keys are suppressed for fixed cooldowns.
  User corrections update sourced memory. Delivered answers link to the exact
  run, and explicit response feedback changes only a small code-owned mapping
  of presentation rules; correction notes are never treated as instructions.
  `manager_response_adaptation_v1` applies that mapping after both deterministic
  and provider-backed reasoning. It may bound list depth, lead more directly,
  repeat an already-authorized recommendation's exact next action, simplify a
  small allowlist of canned phrases, or ask one current evidence-health
  question. It cannot alter evidence, facts, actions, risk, permissions, or
  provider boundaries. The trace records only policy flags and reason codes.
  `manager_natural_feedback_v1` may bind a narrow, standalone verdict only to
  the directly preceding answer in the same tenant conversation. It reuses the
  audited feedback upsert, bypasses the provider, excludes its acknowledgement
  from review queues, and cannot approve actions, complete outcomes, or create
  memory from the review note.
  `manager_context_capture_v1` separately binds one direct answer to one exact
  current context-health question. It stages a typed profile proposal; only a
  later accepted recommendation may perform an optimistic tenant-scoped write.
  The acceptance path re-parses the originating answer, rechecks the current
  gap/profile version, synchronizes profile-owned memory transactionally, and
  audits no raw value. Provider output cannot emit this action.
  `manager_task_capture_v1` handles only explicit shared-work carrier phrases.
  It stages a source-message-bound `create_conversation_task` action with a
  date-only preview and never writes on the chat turn. Relative dates require
  the saved Manager timezone; ambiguous, personal, multi-task, sensitive, and
  implicit requests fail closed. Acceptance re-parses the exact tenant message,
  checks equivalent open work around a serializable transaction, creates one
  unassigned source-keyed Task, and audits provenance without raw chat text.
  The provider schema cannot emit this action. Conversation summary refreshes
  merge by ID and timestamp so a late server render cannot erase a just-created
  local thread, and reset completely when the active artist changes.
  `manager_task_update_v1` closes that Task loop for explicit changes to one
  current commitment. The code-owned resolver binds the source message to the
  artist Task ID and `updatedAt`, previews the requested status/date/blocker or
  waiting change, and bypasses provider output. Acceptance re-parses the source
  and compare-and-sets the Task within the same serializable transaction that
  claims the recommendation. Existing prerequisite, due-order, deferral, and
  completion-attribution rules remain authoritative; audit metadata omits raw
  chat, blocker, and waiting-party text.
  `manager_task_assignment_v1` handles an operator's explicit ownership choice
  separately from inference-based role suggestions. It binds one source message
  to an exact current Task, active `BandMember`, previous owner, Task version,
  and current voluntary availability check-in. Acceptance re-parses and
  revalidates every premise inside the serializable recommendation transaction,
  then compare-and-sets the owner. Ambiguous or implicit requests, unavailable
  members, completed work, and no-ops fail closed. Check-in notes are excluded
  from model context and audit metadata, and provider output cannot emit the
  action.
  `manager_project_capture_v1` applies the same source-bound review pattern to
  a whole execution project. The code-owned resolver requires one supported
  project type, name, and exact target date, then previews the shared
  `project_plan_v1` schedule. Acceptance reloads and re-parses the source
  message, rechecks equivalent artist projects, claims the recommendation, and
  atomically creates the project plus every source-keyed milestone in one
  serializable transaction. The resulting recommendation links the project;
  provider output cannot emit this action or bypass the duplicate preflight.
  `manager_event_capture_v1` extends that lifecycle to the event spine. The
  code-owned resolver requires one supported event, exact local date/time, and
  the saved IANA timezone; it rejects invalid or repeated DST wall times rather
  than guessing. The preview binds the explicit status and current active
  lineup. Acceptance re-parses the tenant source, rechecks event duplication and
  the lineup, claims the recommendation, and atomically creates the event plus
  unknown availability rows. It links the completed recommendation but creates
  no provider, calendar, message, advance, deal, or payment side effect.
  `manager_event_availability_v1` is the reviewed response companion. It
  resolves one current artist event and one active band member from an explicit
  source statement, snapshots the event version and prior participant
  response/timestamp, and previews one change. Acceptance repeats entity and
  source resolution inside the serializable recommendation transaction, then
  compare-and-sets or creates exactly one `EventParticipant`. The resulting
  recommendation links the event. Provider output cannot emit the action, and
  the flow neither notifies the person nor persists their private explanation.
  A deterministic response-quality gate rejects canned/meta prose, excessive
  presentation, and unverified claims of completed outside actions before a
  model answer can replace the safe fallback. Feedback may shape reviewed evals,
  but runtime models cannot rewrite prompts, policy, schemas, or code.
  Goal numbers also remain reviewable rather than inferred from prose.
  `manager_goal_measurement_v1` reads only the goal's explicit source and
  produces an evidence-backed observed value. A member must submit that exact
  value to reconcile; the API recomputes under serializable isolation, rejects
  stale evidence, and appends one audited progress event. Manual and external
  metrics are never reverse-engineered from titles or notes.
  Conversational memory uses the same explicit-confirmation boundary. Only a
  current operator message beginning with a supported remember directive may
  produce `remember_fact`; the proposal exposes the exact value, grounding
  rechecks the key/label/value, and a separate accepted recommendation performs
  the tenant-scoped audited write. Briefs and ordinary model prose cannot save
  memory. Profile-owned facts redirect to their canonical form, and sensitive
  values fail closed without being echoed.
  Conversational continuity is also structured rather than inferred from
  prose. `manager_conversation_continuity_v1` recognizes a small allowlist of
  reference-bound follow-ups and binds them only to the immediately preceding
  `ManagerRun` recommendation in the same conversation. Currentness is checked
  against the latest deterministic brief or exact typed-action source
  projection. A missing or multiple reference asks for clarification; “do
  that” never accepts or duplicates a recommendation. Traces retain only the
  policy, classification, confidence, reason code, and referenced IDs.
  Direct named-record questions use the separate code-owned
  `manager_subject_reference_v1` resolver. Its candidates come only from the
  active artist's bounded facts; it accepts conservative full-label, quoted,
  or unique typed-token matches and asks when candidates collide. A resolved
  subject bypasses provider prose and binds the answer, citations, and any
  eligible recommendation to that exact current projection. Traces store only
  resolution metadata and record IDs.
  `manager_response_review_v1` makes real answer review recoverable without
  changing that authority. It derives a bounded, per-operator queue from recent
  assistant messages that have a persisted run, an exact preceding question,
  and no verdict from that operator. Selection stays inside the active artist
  and keeps one answer per conversation. Reading the queue does not audit,
  write feedback, promote an eval, or change a prompt; the existing explicit
  feedback POST remains the only mutation.
  The owner-only `manager_response_eval_review_v1` projection then selects
  rated answers from that owner that do not yet have a response-eval row. It
  uses the same active-artist, persisted-run, exact-question, 90-day, and
  one-per-conversation bounds. Queue reads remain side-effect free; helpful and
  corrected cases reuse the existing explicit promotion write, and corrected
  cases still require reviewed expected behavior. Promotion does not resolve a
  failure or activate a candidate version.
  The owner-only `manager_recommendation_eval_review_v1` projection performs
  the same recovery for finished advice. It selects only completed, dismissed,
  or blocked recommendations with an observed outcome, excludes suggested and
  accepted work, preserves linked task/decision state, and never equates
  completion with usefulness. One recent result per stable key prevents repeat
  runs from dominating; a prior review covers that key through its outcome
  time, while a later real outcome may re-enter. Fetches remain read-only and
  explicit promotion still uses the audited evaluation boundary.
  Conversation recovery uses the existing tenant-scoped records rather than a
  second memory store. The list projection returns at most 20 newest-first
  summaries with the latest message and total message count; detail returns at
  most 50 messages and only the requesting operator's feedback. The client
  replaces its visible message set on a switch and clears unsent input, so
  continuity, recommendations, and named-record resolution never cross thread
  boundaries.
  Owner-promoted `ManagerEvalExample` rows are bounded local fixtures, not an
  online training or self-deployment mechanism. Code-owned plan health derives
  explainable status from authoritative goals/initiatives/tasks, while numeric
  changes use append-only progress events. Starter-plan records use nullable
  tenant-unique source keys, so regeneration fills gaps instead of overwriting
  work. Tasks are deliberately unassigned until a person chooses an active
  `BandMember`; historical text labels remain compatibility data.
  Owner-triggered offline evaluation
  runs are version-allowlisted and recorded; there is no self-activation path.
- Manager education is a bounded read path, not free-form authority. Explicit
  learning questions are matched only to a reviewed band-management concept;
  the deterministic answer supplies a definition, practical significance,
  StoryBoard next step, and uncertainty boundary. Matching current-artist
  records may be cited, but coaching never creates a recommendation or provider
  call. Existing external-action refusal is evaluated first, so “explain and
  pay/send/sign it” cannot turn education into execution.
- Manager commitment health is deterministic derived data over tenant-owned
  tasks. Blocked work requires an explicit reason, later dates accumulate
  deferral evidence, and stale writes use compare-and-set protection. The same
  ranking drives Manager Today, Waiting on, risks, chat, and UI. Model briefs
  cannot displace a high-severity commitment, and blocker questions cannot
  propose duplicate work.
- `ManagerRun.output` is the presentation contract for the Manager workspace.
  The client renders all five bounded sections—Today, This week, Decisions
  needed, Waiting on, and Risks and opportunities—instead of reducing a run to
  its first priority. Initial server rendering follows the operating profile's
  daily/weekly preference; an operator can switch or refresh the visible
  cadence without an unrelated route refresh replacing that choice. Risk
  confidence is explicitly record confidence, never outcome probability.
- Task sequencing is an explicit artist-scoped graph rather than a prompt
  inference. `TaskDependency` records a dependent task and one prerequisite;
  task service preflight rejects foreign IDs, self-links, cycles, conflicting
  dates, and state changes that would leave completed downstream work depending
  on unfinished work. Dependency creation and task completion use serializable
  transactions so concurrent requests cannot bypass those checks. The derived
  `manager_work_sequence_v1` projection distinguishes ready, in-progress,
  manually blocked, waiting, and conflicted work and identifies ready tasks
  that unlock downstream commitments. Manager briefs, chat grounding, traces,
  and UI consume that same projection; a model cannot promote waiting work to
  actionable work or infer effort, duration, or private human capacity.
- Goal execution is another code-owned projection, not a free-form planning
  claim. `manager_goal_path_v1` joins each active goal to current measurement,
  active initiatives, linked tasks, and the complete prerequisite graph. It
  distinguishes ready, in-progress, waiting, blocked, missing-plan,
  measurement-drift, target-reached, and contradictory-date states. Briefs and
  direct goal questions reuse the first recorded task or prerequisite. A new
  task may be proposed only for an existing initiative with no open task;
  acceptance recomputes the path and rechecks the no-task premise, current goal
  state, and date bounds inside the serializable transaction. Provider output
  that omits the canonical next task or proposes orphan work is rejected.
- Numeric goal meaning is also code-owned. `manager_goal_target_v1` evaluates
  `at_least`, `at_most`, and `exact` targets without treating every larger
  number as better. At-most and exact targets remain provisional before their
  deadline, and no target direction is converted into an elapsed-time pace or
  success probability. `manager_plan_health_v2`, goal paths, deterministic
  answers, provider grounding, and recommendation acceptance consume the same
  assessment. Direct plan-health questions stay on this deterministic path so
  provider prose cannot replace the target policy. Goal PATCH validation has
  no create-time defaults, preventing a one-field edit from silently resetting
  lifecycle or measurement fields.
- Manager team load is another deterministic projection, not a human-capacity
  model. `Task.bandMemberId` is the canonical working-lineup relationship;
  exact-name legacy labels can resolve for display, while system placeholders
  and unknown labels remain unassigned. `manager_team_load_v2` reports only
  open, due-soon, overdue, blocked, and unscheduled records plus current
  append-only member capacity check-ins. Responsibility fit remains primary;
  availability is a tie-break, current `unavailable` members are excluded, and
  missing or expired signals remain unknown. A unique responsibility match can
  prepare one `assign_task` proposal, but ambiguous matches remain a question
  and members with urgent recorded pressure are excluded. Acceptance rechecks
  tenant, active member, exact check-in, open task, owner premise, and
  optimistic write before an audited update. Check-in notes remain UI-only.
- Manager scheduling completes the existing brief boundary rather than adding
  another planner. It is owner-opted, uses the profile cadence plus a validated
  IANA timezone/hour/weekday, and runs through BullMQ. Local-period claims use
  compare-and-set state with stale-claim recovery; `ManagerRun.scheduleKey` is
  a second uniqueness boundary. The run, claim completion, and tenant-member
  notification rows commit atomically. Scheduled reasoning is deterministic by
  default and requires separate owner consent before it may spend model tokens.
  A scheduled run can suggest reviewable internal work but cannot accept it or
  perform any provider, legal, financial, or irreversible action.
- Manager recommendations bridge two readiness gaps and one ownership gap into
  direct internal work: `generate_event_advance`, `generate_project_plan`, and
  bounded `assign_task`. Code
  requires the cited same-artist event/project and missing-plan premise,
  revalidates the target at acceptance, and atomically claims the recommendation
  with source-keyed Task creation. The action is immediately complete and
  replay-safe; this does not expose arbitrary operations or provider tools.
- `event_logistics_v1` is a separate approval-preparation capability, not a
  direct Manager tool. For a confirmed gig with an exact start, end, and IANA
  timezone, deterministic code may propose a confirmed Calendar event and
  Drive folder.
  Recommendation acceptance rechecks the tenant event, authoritative
  title/time/timezone fingerprint, channel state, and recommendation state,
  then creates or reuses source-keyed pending `ApprovalRequest` rows. It never
  resolves an adapter or calls a provider. A member must approve and execute
  each channel separately. The approval states reconcile the linked
  recommendation, and successful execution persists the Calendar event ID or
  Drive folder URL on `BandEvent`.
- Manager provider context is a code-owned projection, not a prompt request.
  `ArtistOperatingProfile` is the canonical source for band mode, home market,
  ambition, and constraints; profile writes synchronize compatibility memory
  in the same transaction. `manager_knowledge_v1` records consistency,
  confirmation, confidence, and review age, and runtime projection replaces a
  contradictory duplicate with the profile value before reasoning.
  Redacted mode includes only normal memory; full-context owner consent may add
  sensitive memory; restricted memory is always excluded. Model citations are
  checked against the same projected evidence IDs, while persisted run inputs
  remain redacted even when full context was used transiently.
- `manager_evidence_v1` is one non-persistent confidence layer over the
  specialist operating projections and tenant records. It classifies six
  answer areas as current, needs-confirmation, stale, missing, or conflicted,
  carries only bounded reasons/questions/evidence IDs, and is applied after
  deterministic or model generation. It cannot turn missing records into a
  claim of real-world absence, create work, or become a second planner.
- The Manager release gate accepts owner-promoted recommendation outcomes and
  exact response examples. Response snapshots remain bounded and reuse the
  linked run's redacted input facts for offline grounding checks. A negative
  answer blocks its producing candidate and can be resolved only for a later
  code-registered version; evaluation never rewrites or activates a version.
- Manager focus is chosen by `manager_priority_v1` after all candidate pressure
  has been gathered and repeated work suppressed. The deterministic comparison
  weighs record-backed timing, readiness, people conflicts, commitments,
  replies, approvals, receivables, reviews, follow-ups, and project health.
  Grounded model candidates are merged and deduplicated before the same pass,
  so a model cannot remove an authoritative signal by omission. Bounded factor
  codes keep operational deadlines ahead of routine knowledge refresh, while a
  true source conflict remains visible until repaired. Those factors and
  omitted candidates live in the redacted trace; hidden reasoning is
  never stored. Cache reuse additionally requires the current policy version
  and no newer audit across the operating aggregates that feed the brief.
- Show readiness is deterministic derived data, not a model assertion or an
  editable status. It uses the tenant-scoped event graph, active lineup, dated
  urgency, explicit evidence IDs, and premise-coverage confidence. Operations
  and Manager consume the same function to prevent conflicting advice.
- Event edits reuse strict shared schemas and service-layer artist ownership.
  Timeline validation operates on the merged stored record, preventing a
  partial PATCH from introducing an impossible show-day sequence.
- Event logistics uses one non-persistent assessment over `BandEvent` plus its
  source-keyed approvals. Persisted provider references are authoritative
  completion; pending/approved rows suppress duplicates; a rejected or
  mock-simulated row can be explicitly prepared again; and event type/status or
  title/start/end/timezone drift invalidates an earlier request. The execute
  path checks the current confirmed-gig boundary and fingerprint again after its
  one-shot claim and before the provider call. Failed or executed-but-unlinked
  provider attempts are quarantined for manual reconciliation because their
  remote outcome may be unknown. StoryBoard never silently rewrites a reviewed
  payload or automatically retries outside work.
- Custom `EventScheduleItem` writes resolve ownership through the parent event,
  require an exact event/item pair, validate the merged start/end range, and
  audit only bounded operational metadata. The rows feed the existing timeline
  directly; there is no second itinerary or Manager-authored schedule.
- The day-of view is recomputed from authoritative event data and the shared
  readiness policy. It carries evidence IDs and has no separate editable score.
  Manager consumes it only inside the 24-hour show window, keeping longer-range
  planning distinct from live operational guidance.
- Manager outcome review is another deterministic, non-persistent projection.
  It reads only bounded tenant records, derives confidence from premise
  coverage, separates currencies, and preserves unknown net until a settlement
  exists. Operations UI, Manager briefs/chat, and model snapshots consume this
  one projection so post-show learning cannot diverge across surfaces.
- Manager decisions preserve the distinction between option, choice, expected
  result, and observed result. Choosing and reviewing use tenant-scoped
  compare-and-set writes; stale concurrent screens fail without audit or
  replacement. Reviewed choices are immutable and feed bounded brief/chat
  evidence, but never expand action authority or become automatic policy.
  Conversation may propose a `create_decision` only when it can parse two
  explicit options. Acceptance creates one linked open draft with unknown
  tradeoffs; a separate member write must establish framing before choice.
  Brief generation may prepare only the allowlisted internal actions plus the
  deterministic event-logistics approval proposal described above; it still
  cannot create a decision or execute an outside action.
- Manager context health is one deterministic projection over the operating
  profile, working lineup, goals, events, projects, and opportunities. Briefs,
  conversation, and the workspace consume the same four-dimension score and
  ordered questions, preventing separate model-authored opinions about what is
  known. The score measures record coverage only, not artist quality or odds.
- Project templates reuse tenant-scoped Tasks and nullable unique source keys;
  they do not create a competing milestone authority. Readiness is derived
  from project/task/expense/event records, and Manager consumes that same view.
  Foreign `projectId` task links fail before write or audit.
- Agreement templates require owner activation. Payment replay keys and
  immutable deal/document/settlement history take precedence over destructive
  replacement. Settlement math filters expenses by exact settlement currency;
  unlike currencies are never added as though their minor units were equal.

## Auditability Design

Important actions should write auditable records with:

- actor label and optional **`actorOperatorId`** (FK to `Operator` for web/session actions)
- action name
- aggregate type and ID
- structured metadata
- timestamp
- severity classification when appropriate

At minimum, command runs, approvals, external writes, booking stage changes, and
task generation should all be auditable.

## Approval Model

Approvals are required for actions like:

- sending email externally
- modifying calendars in a way that commits dates
- issuing release coordination tasks with outbound side effects
- pushing updates to external systems

Approval records capture the proposed **structured payload** (sufficient to
execute later, e.g. full Gmail draft fields), who proposed it, who approved or
rejected it, and when the decision was made. Status values include **executed**
and **failed** after a post-approval execution attempt (`executionAttemptedAt`
optional). Dry-run execution previews attach to payload without leaving the
**approved** state.

`ApprovalRequest.sourceKey` provides artist-scoped idempotency for prepared
work. Optional `eventId` and `managerRecommendationId` links preserve the
proposal → human decision → provider result chain without moving ownership out
of the event or Manager domains. Approve, reject, and execute transitions use
compare-and-set guards. For event logistics, the provider result and
`BandEvent.calendarEventId` / `BandEvent.driveFolderUrl` update commit through
the same application lifecycle. Rejected and mock-simulated requests may be
explicitly prepared again. Failed or executed-but-unlinked provider attempts
remain quarantined for manual reconciliation because the outside result may be
unknown.

## Queue and Background Work

**Single queue:** `storyboard-enrichment` on `REDIS_URL`, one ioredis connection
for Queue + optional in-process Worker (`ENABLE_QUEUE_WORKER=false` skips the
worker; enqueue producers still run).

**Job processor:** `WorkflowJobProcessorService` handles all job types. Legacy
stubs: `venue.enrich`, `research.refresh` (audit-only). **Phase 4A** adds
`invite.send`, `approval.notify`, `membership.invite_accepted`,
`integration.connection_changed`, `task.check-overdue`, `followup.check-stale`
(repeatable schedules when the worker is enabled). **Phase 4B** adds
`digest.generate.daily` and `digest.generate.weekly` (repeatable) and reads
**per-membership** notification JSON plus **per-artist** escalation ints on
`Artist`. **Phase 5A** adds **`urgent.telegram.scan`** (repeatable, same cadence
as overdue/stale) and routes deterministic urgent messages through
**`WorkflowTelegramService`** (Telegram Bot API **`sendMessage`** via a narrow
adapter; **mock** when **`TELEGRAM_BOT_TOKEN`** is unset). Per-artist settings
(`telegramUrgentEnabled`, `telegramChatId`, `telegramNotifyCategories`) are
**owner-only** via HTTP; delivery attempts use **`TelegramUrgentDedupe`**
(`artistId` + `dedupeKey`) for idempotency. **Approval `failed`** events also
attempt a one-shot Telegram alert (category **approvals**, dedupe
`approval_failed:<id>`). Audit actions include `telegram.urgent.skipped`,
`telegram.urgent.sent`, `telegram.urgent.failed`, `automation.telegram.scan`,
`workflow.telegram.settings.updated`.

**Manager cadence:** `manager.schedule.scan` runs every 15 minutes by default
and reads only explicitly enabled `ManagerSettings` rows. It evaluates the
artist's local daily/weekly period, claims one period, generates the existing
grounded brief, and creates `manager_brief_ready` in-app notifications for the
owner-selected owner/team audience. No scheduled email or Telegram delivery is
performed. `MANAGER_SCHEDULE_SCAN_MS` may tune the scan interval but cannot be
set below one minute.

**Phase 5B — inbound registration (narrow):** Owners create **short-lived** **`TelegramRegistrationToken`** rows (hashed at rest) via authenticated **`POST /workflow/telegram/registration-token`**. Telegram posts **`Update`** JSON to **`/integrations/telegram/webhook`**; StoryBoard parses **`/start <payload>`** only, consumes the token **once** in a transaction with **`Artist.telegramChatId`**, and writes **`telegram.registration.bound`** / **`telegram.registration.failed`** audits. Optional **`TELEGRAM_WEBHOOK_SECRET`** validates **`X-Telegram-Bot-Api-Secret-Token`**. This path does **not** alter memberships, invites, or approvals.

**Operational intelligence:** **`GET /dashboard/insights`** (read: any member)
returns deterministic **booking health** (score 0–100), **opportunity risk**
levels, **priority actions**, and **signal** counts aligned with Telegram
thresholds (`apps/api/src/operational-intelligence/operational-intelligence.service.ts`,
constants in `urgent-channel.constants.ts`). Scoring starts at 100 and subtracts
capped impact for: overdue tasks (after grace), stale follow-ups, pending
approvals, and large early-stage (target/outreach) backlog — see this file and
`docs/telegram-alerts.md` for rule references.

Commands intent `enqueue_research_refresh` still enqueues
`research.refresh`.

**Policy:** Automation never performs owner-only actions. Workflow emails and
in-app notifications to **owners + members** use the same adapter resolution as
interactive code (real Gmail draft vs mock). Invite delivery emails go **to the
invitee** via the artist’s Gmail capability. Operators can narrow channels via
**Notifications** settings; digests respect those prefs. **Telegram** urgent routing is owner-controlled on **Artist** and does not use per-membership prefs. See
`docs/workflow-automation.md`.

Longer term, BullMQ can own weekly summary refresh, inbox sync, and broader
enrichment — staged outside the request path.

## Local Infrastructure Plan

- PostgreSQL `16` via Docker Compose
- Redis `7` via Docker Compose
- app processes started locally via `pnpm`

This split keeps infrastructure reproducible while preserving fast local app
iteration.
