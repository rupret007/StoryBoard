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

## MVP API surface (current)

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

**Operator auth (phase 3A + 3B):** Separate Google OIDC flow for **sign-in** (`openid email profile`): `GET /auth/operator/google/start` → `GET /auth/operator/google/callback`. Session cookie **`sb_session`** holds `operatorId` and optional `currentArtistId`. **`Operator`** and **`ArtistMembership`** (`owner` | `member` | **`viewer`**) gate artist-scoped routes; **mutations** additionally require **member-or-above** where enforced; **integration Google authorize** and **membership admin** require **owner**. **`ArtistMembershipInvite`** supports hashed-token invitations and onboarding (`docs/invitations.md`). Integration authorize signs OAuth `state` with **`operatorId`** and the callback rejects a session mismatch. A global **`CsrfOriginGuard`** checks **`Origin`/`Referer`** against **`WEB_URL`** for unsafe HTTP methods (**OAuth callbacks** and **`POST /integrations/telegram/webhook`** excluded). Unauthenticated access is limited to health/meta, OAuth callbacks, and the Telegram webhook. See `docs/auth-operators.md`.

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
6. **Approved** requests with executable action types run via `POST /approvals/:id/execute`, which performs provider work (e.g. Gmail draft creation), records **executed**/**failed** on `ApprovalRequest`, and writes audit events — never executing unapproved rows.
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
  Brief generation remains limited to `create_task` plus the two readiness-bound
  event/project generators; it still cannot create a decision or outside action.
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
