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
  User corrections update sourced memory. Feedback may shape reviewed evals,
  but runtime models cannot rewrite prompts, policy, schemas, or code.
  Owner-promoted `ManagerEvalExample` rows are bounded local fixtures, not an
  online training or self-deployment mechanism. Code-owned plan health derives
  explainable status from authoritative goals/initiatives/tasks, while numeric
  changes use append-only progress events. Starter-plan records use nullable
  tenant-unique source keys, so regeneration fills gaps instead of overwriting
  work. Tasks are deliberately unassigned until a person chooses an owner.
  Owner-triggered offline evaluation
  runs are version-allowlisted and recorded; there is no self-activation path.
- Show readiness is deterministic derived data, not a model assertion or an
  editable status. It uses the tenant-scoped event graph, active lineup, dated
  urgency, explicit evidence IDs, and premise-coverage confidence. Operations
  and Manager consume the same function to prevent conflicting advice.
- Agreement templates require owner activation. Payment replay keys and
  immutable deal/document/settlement history take precedence over destructive
  replacement.

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
