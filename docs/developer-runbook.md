# StoryBoard Developer Runbook

## 1. Prerequisites

- **Node.js** `22.22.x` (see root `package.json` `engines`)
- **pnpm** `10.x` — enable via Corepack (matches `packageManager` field):
  ```bash
  corepack enable
  corepack prepare pnpm@10.32.0 --activate
  ```
- **Docker** with Compose v2 (Docker Desktop or Linux engine) for Postgres and Redis

## 2. Clone and install

```bash
git clone <your-fork-or-origin> StoryBoard
cd StoryBoard
pnpm install
```

This creates `pnpm-lock.yaml`, links workspace packages, and runs **`prepare`**, which builds `@storyboard/shared` into `dist/` (required for `@storyboard/shared` imports in the API and web).

## 3. Environment file

```bash
cp .env.example .env
```

Edit `.env` only as needed. For local boot **without** OpenAI or other live APIs:

- Keep `OPENAI_ENABLED=false` (default in `.env.example`)
- Keep `GMAIL_REPLY_SYNC_ENABLED=false` unless the Google project is prepared for restricted Gmail scopes. Enabling it requires owners to reconnect Google before per-artist synchronization can be enabled.
- Placeholders like `replace-me` for unused integrations are OK until you implement those adapters

The API validates required vars at startup (see `apps/api/src/config/env.validation.ts`). If boot fails, the error message points you at `.env.example`.

## 4. Start PostgreSQL and Redis

From the repo root (Compose reads `.env` automatically):

```bash
pnpm infra:up
```

Defaults: Postgres `localhost:5432`, Redis `localhost:6379`, matching `DATABASE_URL` and `REDIS_URL` in `.env.example`.

Check containers:

```bash
docker compose ps
```

Stop:

```bash
pnpm infra:down
```

Stream logs:

```bash
pnpm infra:logs
```

### Containerized local demo

The existing `docker-compose.yml` starts infrastructure for host-based `pnpm`
development. To run the complete application in production-built containers,
use the separate application bundle:

```bash
pnpm container:up
```

It runs Postgres, Redis, forward-only Prisma migrations, the idempotent seed,
the Nest API (including the current in-process BullMQ worker), and Next.js.
Open `http://localhost:3000` and use the development login. Stop containers
without deleting data with `pnpm container:down`; only use
`docker compose -f docker-compose.app.yml down -v` when intentionally removing
local Postgres and Redis data.

Allocate at least 2 GB of memory to Docker Desktop; image compilation includes
TypeScript, Prisma client generation, and Next.js production builds.

The API image uses Nest's SWC emitter after Prisma generation to keep image
assembly within small Docker Desktop memory limits. This does not replace the
strict `pnpm typecheck`/`pnpm test` release gate; CI runs those before the
container smoke. `.dockerignore` excludes workspace builds, generated Prisma
output, and browser artifacts so local state is never copied into the image.

Defaults make this runnable without a checked-in secret. To override them,
copy `.env.compose.example` and pass it explicitly:

```bash
docker compose --env-file .env.compose -f docker-compose.app.yml up --build
```

`NEXT_PUBLIC_API_URL` is browser code and is compiled into the web image. Set
it, `WEB_URL`, and `API_URL` to public HTTPS URLs and rebuild the web image for
any public deployment. Production must set `NODE_ENV=production`, disable
`AUTH_DEV_BYPASS`, supply a strong `SESSION_SECRET`, and configure Google OAuth;
the local demo profile is not appropriate for an internet-facing deployment.
Server-rendered requests prefer `INTERNAL_API_URL`; the local container bundle
sets it to `http://api:4000` so web-to-API traffic stays on the Compose network
while browsers continue using `NEXT_PUBLIC_API_URL`.
Use `docker-compose.production.yml` as the production override template:

```bash
docker compose --env-file .env.production -f docker-compose.app.yml -f docker-compose.production.yml up --build
```

## 5. Prisma (ORM 7)

StoryBoard uses **Prisma 7**: connection URL and migration paths live in root `prisma.config.ts` (loads `.env` via `dotenv`). The schema is `prisma/schema.prisma`. The generated client is output under `apps/api/src/generated/prisma/` (gitignored); run generate after clone or schema changes.

```bash
pnpm db:generate
```

Create/apply migrations against your local database (requires Postgres up):

```bash
pnpm db:migrate
```

The repo ships migrations under `prisma/migrations/` (including the bootstrap
init and follow-on MVP alignment). The first time you run `db:migrate`, Prisma
applies pending SQL and records state in `_prisma_migrations`.

Inspect data:

```bash
pnpm db:studio
```

### Seed operator + default artist (phase 3A)

After migrations, create the default artist, a local `Operator` (`SEED_OPERATOR_EMAIL`, default `dev@localhost`), and an **owner** `ArtistMembership`:

```bash
pnpm db:seed
```

This runs the repository's idempotent `prisma/seed.mjs` directly. It does not
use Prisma's legacy seed configuration, which Prisma 7 no longer reads from
`package.json`.

Configure `SEED_OPERATOR_EMAIL` / `SEED_OPERATOR_NAME` in `.env` if needed. Seed is optional: new operators can **create a first artist** or **accept an invite** (phase 3B) without `db:seed`.

### Phase 3B: invitations and onboarding

- **`INVITE_EXPIRY_DAYS`** — optional (default `14`), see `.env.example`.
- **Owner** creates invites: `POST /memberships/invites` or use the **Team** page in the web app. The API returns a token and **`acceptUrl`** pointing at `/onboarding?invite=…`.
- **Accept:** signed-in operator (matching invite email) calls `POST /memberships/invites/accept` with `{ token }` (web onboarding UI does this).
- **First artist:** operator with **no** memberships calls `POST /onboarding/artist` with `{ name, slug? }` (web onboarding form).
- **Docs:** `docs/invitations.md`, role matrix in `docs/auth-operators.md`.

### Operator authentication

- **Google:** set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and register **`GOOGLE_OPERATOR_REDIRECT_URI`** (`http://localhost:4000/auth/operator/google/callback` by default). Start from the web sign-in screen or `GET /auth/operator/google/start`.
- **Dev bypass:** `AUTH_DEV_BYPASS=true` only with `NODE_ENV=development`. Open `GET /auth/dev/login` (linked from the sign-in screen in dev). Rejected in production by env validation.
- **Cookies:** set **`COOKIE_DOMAIN=localhost`** when the web app and API use different ports so Next.js server fetches can forward the same session cookie. Browsers send `credentials: "include"` on API calls from the web.
- **Mutating API + CSRF guard:** in **production**, POST/PUT/PATCH/DELETE require **`Origin` or `Referer`** aligned with **`WEB_URL`**. Server-side Next fetches set **`Origin`** from `WEB_URL` in `serverApiFetch`. Pure CLI tools must send an allowed Origin or use GET-only endpoints.
- **Details:** `docs/auth-operators.md`.

## 6. Build shared library (API consumers)

`@storyboard/shared` compiles to `dist/` as **CommonJS** so the Nest API can resolve it without pulling TypeScript sources outside `apps/api/src`. The recursive `pnpm build` builds packages in dependency order; for API-only iteration:

```bash
pnpm --filter @storyboard/shared build
pnpm --filter @storyboard/api build
```

## 7. Run the API

Development (watch):

```bash
pnpm dev:api
```

Production-style (after `pnpm --filter @storyboard/api build`):

```bash
pnpm --filter @storyboard/api start
```

Smoke:

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/ready
curl -s http://localhost:4000/meta | head
```

`/health` only confirms that the HTTP process is responding. `/ready` is a
safe, unauthenticated dependency probe: it checks Postgres and Redis and
returns `503` until either is ready. Its response contains only boolean
database/Redis/worker state; it never returns URLs, credentials, or queue data.

**Tasks API semantics:**

- `GET /tasks/overdue` — tasks with `dueAt` before now (not `done`), same rule as the dashboard overdue count.
- `GET /tasks/stale-followups?days=7` — incomplete tasks whose `updatedAt` is older than `days` (stale follow-ups).
- `POST /tasks` and `PATCH /tasks/:id` accept nullable artist-owned
  `opportunityId` and `projectId` links. Each relation is checked before write;
  a foreign ID returns generic not-found with no audit event.
- A task with `status: "blocked"` requires `blockedReason`; `waitingOn` may name
  the person or organization holding the next step. Moving an incomplete task
  to a later date (or clearing an existing date) increments `deferralCount` and
  records `lastDeferredAt`.
- Task patches use tenant-scoped compare-and-set updates. A stale screen returns
  an error without overwriting newer status, ownership, blocker, or date data.

## Commands (`POST /commands/execute`)

The body is JSON validated with Zod. Provide **either** natural language **`text`** or a structured **`intent`** (optional **`payload`**). If **both** are present, **`intent`** takes precedence over substring parsing on **`text`**.

**Structured intents** (stable API; avoid NL ordering surprises):

| `intent` | `payload` | Behavior |
| ---------- | ---------- | ---------- |
| `list_pending_approvals` | — | Pending approval rows |
| `list_overdue_tasks` | — | Tasks past `dueAt`, not `done` |
| `list_stale_followups` | `{ "days": 7 }` optional | Incomplete tasks with `updatedAt` older than `days` (default 7) |
| `booking_pipeline_health` | — | Stage counts for booking opportunities |
| `draft_venue_outreach` | — | Draft email previews + **approval** row (no send) |
| `rank_venues_by_fit` | — | Rank only stored artist-owned venues by `fitScore` |
| `draft_release_checklist` | — | Checklist steps + **approval** row |
| `research_booking_intel` | `{ "city"?, "artistName"? }` | Read-only artist event context from Bandsintown plus Ticketmaster intel (`providerModes` in result) |
| `enqueue_research_refresh` | `{ "city"?: string }` optional | Enqueues BullMQ job `research.refresh` on `storyboard-enrichment` when Redis is up |

Optional body field **`dryRun`** (boolean, default **`true`**): stored on `CommandRun`; keeps commands non-destructive unless you pass `dryRun: false`.

**Natural language (examples, not exhaustive):** pending approvals; “overdue” / “follow up” (due-based), or “7” / “seven” with follow-up (stale 7d); booking pipeline / health; draft + outreach/email/venue; venue + rank/fit/driving; release + checklist; enqueue + research/refresh; research / bandsintown / ticketmaster / show calendar.

## Phase 2B providers (real vs mock, artist-aware Google)

Integration env vars are **optional**. **Google surfaces** (Gmail, Calendar, Drive) resolve per **`artistId`**: if an active `IntegrationConnection` (`provider = google`) exists with encrypted refresh token and recorded scopes, real adapters are used when scopes match; otherwise StoryBoard falls back to env `GOOGLE_OAUTH_REFRESH_TOKEN` when set with client id/secret. Missing scope or credentials → **mock** adapters (StoryBoard always boots).

| Provider | Credentials | Behavior |
| -------- | ----------- | -------- |
| Gmail / Calendar / Drive | Per-artist DB connection **or** env `GOOGLE_*` trio (refresh optional if DB only) | Gmail: draft after execute. Calendar: hold events via approval `calendar_hold_batch`. Drive: `drive_ensure_folder` approval. Connect flow: `docs/integrations-google-oauth.md` (`INTEGRATION_SECRETS_ENCRYPTION_KEY` required to persist). |
| Bandsintown | `BANDSINTOWN_APP_ID` | Artist-owned event context only; never market/competitor venue discovery. |
| Ticketmaster | `TICKETMASTER_API_KEY` | Bounded city-first venue/event signals for Find shows; unavailable mode is manual, with no synthetic rows. |

`GET /integrations/status?artistId=` — requires a signed-in operator and membership; returns `providers` modes plus `googleConnection` summary. Artist context is resolved like other modules (`artistId` query, `x-artist-id`, session current artist, or first membership).

**BullMQ:** Queue `storyboard-enrichment`; worker runs inside the API unless `ENABLE_QUEUE_WORKER=false`. Jobs include `venue.enrich`, `research.refresh` (stubs), phase **4A** workflow jobs, phase **4B** **`digest.generate.daily`** / **`digest.generate.weekly`**, Manager **`manager.schedule.scan`**, and phase **5A** **`urgent.telegram.scan`** (same repeat interval as overdue/stale) — see `docs/workflow-automation.md`. Optional env: **`WORKFLOW_STALE_FOLLOWUP_DAYS`** (default `7`), **`WORKFLOW_AUTOMATION_REPEAT_MS`** (overdue/stale/telegram repeat, default 6 hours), **`WORKFLOW_DIGEST_DAILY_MS`**, **`WORKFLOW_DIGEST_WEEKLY_MS`** (digest intervals; defaults 1 day and 7 days), and **`MANAGER_SCHEDULE_SCAN_MS`** (default 15 minutes, minimum one minute). **Telegram:** optional **`TELEGRAM_BOT_TOKEN`** — without it, urgent Telegram sends use the **mock** path (audited, no network). **Phase 5B:** **`TELEGRAM_BOT_USERNAME`** (deep links), **`TELEGRAM_REGISTRATION_TTL_MINUTES`**, **`TELEGRAM_WEBHOOK_SECRET`** (optional; Telegram `secret_token` must match **`X-Telegram-Bot-Api-Secret-Token`**). Public webhook: **`POST /integrations/telegram/webhook`** — configure via Bot API **`setWebhook`**. See `docs/telegram-alerts.md`.

**Workflow notifications API** (session + artist context via `x-artist-id` / session):

- `GET /workflow/notifications?limit=&unreadOnly=`
- `PATCH /workflow/notifications/:id/read`

**Workflow settings (phase 4B + 5A Telegram):**

- `GET` / `PATCH /workflow/preferences` — notification prefs for the signed-in operator on the active artist.
- `GET` / `PATCH /workflow/escalation` — read for any member; **PATCH owner-only** (artist thresholds).
- `GET` / `PATCH /workflow/telegram` — **GET** any member (readiness + owner-only fields redacted for non-owners); **PATCH owner-only** (per-artist Telegram urgent toggle, chat id, category flags). Does not replace membership email/in-app prefs.

**Operational intelligence (phase 5A):**

- `GET /dashboard/insights` — session + artist context; returns deterministic **booking health**, **opportunity risk** levels, **priority actions**, and **urgent signal** counts (used by the dashboard, booking pipeline badges, and weekly briefing snapshot).

**Booking advisor:** `POST /booking-advisor/generate` creates a reviewable
booking brief and `GET /booking-advisor/latest` returns it. Members can record
`POST /booking-advisor/:id/feedback` with `{ "helpful": true | false }`.
When `OPENAI_ENABLED=false`, StoryBoard uses deterministic facts. The default
`OPENAI_ADVISOR_CONTEXT=aggregate` sends only counts and market metadata; the
explicit `full` setting can include CRM contact context. Advisor runs never
receive raw Gmail bodies and never perform provider actions.

## Manager OS and band operations

The booking advisor remains available for compatibility. New cross-functional
work starts in **Manager** (`/manager`) and **Band operations** (`/operations`).
Viewer access is read-only; members and owners can mutate normal workflow data;
only owners can change Manager AI/schedule settings or create/activate legal
document templates.

Manager routes:

- `GET` / `PUT /manager/profile`; `POST /manager/intake/complete`
- `GET` / `POST` / `PATCH /manager/members`, `/manager/goals`, and
  `/manager/initiatives`
- `GET /manager/plan-health`; `GET` / `POST /manager/goals/:id/progress`
- `GET /manager/commitment-health` — ranked blocked, overdue, deferred,
  waiting, ownerless, due-soon, and unscheduled task commitments
- `GET /manager/context-health` — a deterministic, tenant-scoped projection of
  recorded identity, people, business, and current-execution context
- `GET /manager/plan`; `POST /manager/plan/ensure` fills only missing
  `manager_plan_v1` records and never replaces user edits
- `GET` / `POST /manager/decisions`; `PATCH /manager/decisions/:id` records a
  choice, rationale, expected result, and review date; and
  `POST /manager/decisions/:id/review` records one immutable outcome lesson
- `GET /manager/brief?cadence=daily|weekly` and
  `POST /manager/brief/generate`
- `POST /manager/chat`
- `POST /manager/messages/:id/feedback` with `{ "helpful": true }` or
  `{ "helpful": false, "reason": "too_vague", "note": "..." }`
- `GET /manager/conversations?limit=1..20` and
  `GET /manager/conversations/:id` (bounded to 50 messages)
- `GET /manager/memory`, `PATCH /manager/memory/:id`, and
  `GET /manager/learning`
- `GET /manager/outcome-review?days=90` — read-only, tenant-scoped derived
  outcomes; `days` accepts 7–365 and defaults to 90
- `GET /manager/eval-examples` and
  `POST /manager/recommendations/:id/promote-eval` (owner-only)
- `GET /manager/evaluations/latest` and `POST /manager/evaluations/run`
  (owner-only; currently accepts only the code-registered `manager_os_v9`)
- `POST /manager/recommendations/:id/accept|dismiss|complete`; the optional
  body is `{ "reason": "wrong_priority", "note": "Release comes first" }`
- `GET` / `PUT /manager/settings` (PUT owner-only)

Manager cadence is off by default. The owner-facing Manager card controls
`scheduleEnabled`, IANA `timezone`, local `dailyHour`, ISO-style `weeklyDay`
(Monday `1` through Sunday `7`), and `scheduleAudience` (`owners` or `team`).
The cadence itself comes from `ArtistOperatingProfile.communicationCadence`.
The repeatable `manager.schedule.scan` BullMQ job checks enabled rows every 15
minutes by default (`MANAGER_SCHEDULE_SCAN_MS`) and catches up after the chosen
hour within the same local day/week. A compare-and-set claim plus unique
`ManagerRun.scheduleKey` makes the local period idempotent; a stale claim may be
retried after 30 minutes. The run, completed claim, and in-app
`manager_brief_ready` rows are one database transaction.

Scheduled output remains deterministic unless the owner separately enables
both Manager AI and `scheduledAiEnabled`. This separation prevents normal chat
AI consent from silently creating recurring provider calls. `fullContextEnabled`
is still a separate owner data-policy choice. Disabling the schedule clears
`scheduledAiEnabled`, so recurring model use cannot reactivate silently.
Scheduled briefs create no email,
Telegram, calendar, Drive, legal, financial, or other provider action and never
accept their own recommendations.

`OPENAI_ENABLED=false` is fully supported. With OpenAI enabled, set
`OPENAI_MANAGER_MODEL` (default `gpt-5.6-terra`). Manager inputs are
tenant-scoped snapshots covering operating goals/tasks plus current events,
booking replies and follow-ups, prospects, approvals, deals, invoices,
settlements, and the shared evidence-backed outcome review. CRM/provider text
is treated as untrusted data. Prompt/policy
version `manager_os_v9` retains the current operator question and at most 12
recent messages; it rejects the entire model result when any cited or
recommendation evidence ID is unknown. Stored traces contain facts read, policy checks,
structured output, prompt/model version, and latency—not hidden reasoning.
Conversation may propose one `create_decision` draft only for an explicit
two-option choice. Acceptance creates an open, linked, tenant-owned decision;
the band must save real framing in a separate write before it can choose.
Generated briefs remain limited to `create_task` proposals.
Each assistant message links to the exact `ManagerRun` that produced it.
Members can record one idempotent feedback row per response/operator; feedback
is tenant-scoped and audited. Only aggregate helpful/correction signals enter
future response guidance—free-text notes are not injected into prompts.
Code maps common corrections (`incorrect`, `missed_question`, `too_vague`,
`too_long`, `wrong_tone`, and `missing_context`) to bounded presentation rules.
A deterministic post-output gate rejects canned openings, assistant/meta
language, excessive length/formatting, and claims of completed outside actions;
the deterministic manager answer is used when model output fails the gate.
Chat may return one reviewable recommendation through the same recommendation
API. Acceptance permits `create_task`, an open `create_decision` draft, or one
of two readiness-bound operations: `generate_event_advance` and
`generate_project_plan`. Those generators only create source-keyed internal
Tasks, require the cited current target to belong to the artist, recheck the
event/project date, and commit with the recommendation claim. They cannot call
a provider or prepare/execute an Approval.
For commitment questions, code requires the top recorded pressure item as
evidence and rejects duplicate task proposals. Generated briefs must keep a
high-severity commitment first or fall back to deterministic output. The model does not
receive provider-write, SQL, or arbitrary tool execution. Sending, signing,
publishing, payments, legal conclusions, and provider writes stay in Approvals.
Recommendation acceptance uses a transaction so concurrent clicks cannot
create duplicate tasks. Finishing a linked task attributes completion back to
the recommendation. Accepted work stays suppressed while its task is open;
completed work has a 14-day cooldown and dismissed work a 7-day cooldown.
Manager decisions use compare-and-set writes so concurrent choices cannot
silently overwrite each other. A choice becomes immutable once recorded; its
expected result and review date create a checkpoint, and a reviewed outcome is
append-only from the application's perspective. Open, due, and recently
reviewed decisions are included in the bounded Manager context.
`ManagerContextHealth` is derived rather than editable. Its four 25-point
dimensions and ordered missing questions come from the operating profile,
working lineup/responsibilities, active goals, events, projects, and booking
opportunities. A zero-dollar budget is known context. The score describes
record coverage only; it is never a judgment or forecast about the artist.
Dismissal reasons, response helpfulness, correction reasons, and 90-day
acceptance/completion metrics are visible in the Manager workspace. Normal confirmed memory can be corrected by members;
sensitive/restricted memory and sensitivity changes remain owner-controlled.
Archiving a memory removes it from reasoning without deleting audit history.
An owner may promote a decided recommendation to the local eval set with
`{ "label": "useful|not_useful|needs_revision", "notes": "..." }`.
The snapshot contains the bounded recommendation/outcome shape, not full input
facts, conversation history, or provider data. Promotion is idempotent per
recommendation and never activates a prompt/policy version.

Goal progress accepts exactly one of `value` or `delta`; a delta requires an
existing current value. Each update transactionally changes the goal and adds
an immutable `ManagerGoalProgressEvent` with the prior value, actor, and note.
`GET /manager/plan-health` is deterministic: it scores active goals from
deadlines, recorded measurements, linked initiatives, blocked work, and linked
task state, and returns the reasons/evidence for every classification.
Plan health also flags unassigned open tasks and timeline progress that trails
the elapsed share of a measurable goal. Intake creates two band-mode-specific
goals, one initiative per goal, and three dated starter tasks per initiative.
Tasks start unassigned intentionally; use the Tasks workspace to choose a real
band member or other owner. Blocked tasks need a reason; the workspace can also
record a waiting party and reschedule a date. `ManagerCommitmentHealth` is
derived from current task facts and deferral history, never edited as a score.
Re-running plan ensure is idempotent.

The evaluation runner is offline and makes no provider request. It executes
the code-registered golden scenarios and checks owner-reviewed examples. An
unresolved `needs_revision` example for the candidate version fails the run.
Results are stored in `ManagerEvaluationRun` for review; there is deliberately
no activation endpoint. `pnpm manager:eval` runs the golden gate without a
database; the owner-only UI/API adds the artist's promoted examples and stores
the result.

`pnpm test:e2e` resets only the explicitly named test database after validating
that its name contains `test`, then seeds it. Browser coverage therefore
exercises first-time intake on every run instead of inheriting old test data.

Operations routes:

- `GET` / `POST` / `PATCH /events`, `GET /events/:id`,
  `POST /events/from-opportunity/:opportunityId`, participant upsert,
  advance generation, and logistics approval preparation
- `GET /events/readiness?days=90` and `GET /events/:id/readiness` — bounded,
  tenant-scoped, read-only readiness signals with category scores, confidence,
  evidence IDs, and prioritized gaps; `days` accepts 1–365
- `GET /events/:id/day-of` — the tenant-scoped event, active lineup, shared
  readiness result, and deterministic current/next show-day view
- `GET` / `POST` / `PATCH /songs`, `/setlists`, and `/projects`
- `GET /projects/readiness`, `GET /projects/:id/readiness`, and
  `POST /projects/:id/generate-plan` — explainable active-project health plus
  idempotent type-specific milestone generation
- `GET` / `POST` / `PATCH /deals`, document generation, and approval-gated
  delivery preparation
- `GET` / `POST /document-templates`, `PUT /document-templates/:id/activate`
  (owner-only writes)
- `GET` / `POST` / `PATCH /invoices`,
  `POST /invoices/:id/record-payment`
- `GET` / `POST` / `PATCH /expenses` for event/project costs
- `GET` / `POST` / `PATCH /settlements`,
  `POST /settlements/:id/finalize`

All relationships are re-checked in the service layer. Cross-artist IDs return
a generic not-found result before write/audit. Payments require an artist-wide
idempotency key, exact currency, positive integer minor units, and cannot
overpay. Finalized settlements and document snapshots are immutable. Agreement
templates include a not-legal-advice disclaimer and must be activated by an
owner. Current Gmail delivery prepares a reviewed draft referencing the
StoryBoard PDF snapshot; attach the PDF manually until binary Drive/Gmail
adapters are implemented and provider-tested.

Show readiness is derived from current StoryBoard records and is not stored as
an editable truth. The 100-point score covers people (25), schedule (20),
contacts (10), deal/payment (20), advance (15), and performance preparation
(10). A missing date or unavailable active performer blocks readiness. Missing
premises lower confidence, and proximity raises unresolved gaps to higher
urgency. Manager briefs and chat consume this same result.

In Band operations, expand **Manage readiness details** on an event to record
each active member's availability, attach an artist-owned venue/contact/setlist,
and edit the location, show-day schedule, guarantee/deposit, production notes,
and technical URLs. For gigs, **After the show** also records attendance,
gross revenue, lessons, and the buyer/venue relationship outcome. Blank values
remain unknown. Relationship IDs are revalidated by the API. Schedule
patches are validated against both the submitted fields and the event's saved
timestamps; load-in, soundcheck, doors, set, and curfew cannot be reordered by
a partial update. Every successful event or availability write is audited.

The outcome review is non-persistent derived data. It looks back 7–365 days at
completed/cancelled gigs and projects, completed tasks, explicit campaign
results, event invoices/expenses, and settlements. Confidence is premise
coverage, not a model score. Gross and expenses are grouped by currency;
settled net is shown only for a recorded settlement. Settlement creation and
recalculation deduct only expenses in the settlement currency, leaving other
currencies separate for review. Draft expenses remain editable. Finalization
re-reads matching expenses, attaches them transactionally, recalculates net/member splits, and
freezes those values with the PDF. Later or historical expense drift is reported
by the outcome review rather than silently changing the finalized document.

Open **Day-of view** from a gig card for the phone-oriented live workspace. It
derives the next checkpoint from load-in, soundcheck, doors, set, curfew, and
custom schedule items; shows overdue/open advance work, availability,
contact/map actions, setlist, production links, expected fee/deposit, recorded
payments, and invoice balance; and permits explicit availability and task-state
updates through the existing audited APIs. Refresh recomputes all relative time
against the server clock. Manager uses this same derived signal only when the
show is within 24 hours.

Project readiness is also derived rather than editable. It scores target date,
milestone existence/completion, dated work, real owners, success metrics,
assets, and budget/spend; explicitly reports overdue/blocked/unassigned work
and overruns; and carries record evidence. **Generate missing milestones**
works backward from the target date using `project_plan_v1` templates for
release, content campaign, tour, or business projects. Generated rows are
ordinary project-linked Tasks with nullable artist-unique source keys, so
reruns fill only missing template work and preserve renamed, completed, or
re-dated tasks. The focused project workspace manages owners/status, facts,
metrics, budget, and asset links. Manager uses the same readiness result for
release/project questions and weekly prioritization.

## Booking acquisition

All routes below require a signed-in artist member. `GET` is available to
viewers; `POST`, `PUT`, and `PATCH` require an owner or member. Every write is
audited and rejects cross-artist relationship IDs with a generic not-found
response.

- `GET` / `PUT /booking-profile` — quick profile draft/readiness. A ready profile
  has a home city, genres, capacity min/max, and booking pitch; press kit and
  live video remain optional.
- `GET /booking-prospects` / `POST /booking-prospects` / `PATCH /booking-prospects/:id`
  — artist-scoped venue, festival, private-event, and corporate-event leads.
- `GET /booking-prospects/discover?city=&region=&country=&keyword=` — bounded
  Ticketmaster venue/event signals when configured. Otherwise returns
  `{ mode: "manual" }` and no generated leads.
- `POST /booking-prospects/:id/convert` — qualified prospect → idempotent target
  opportunity. Only a `venue` prospect creates a physical `Venue`; private and
  corporate leads remain venue-less and can create/link a buyer contact.
- `GET` / `POST` / `PATCH /market-sprints` and `GET /market-sprints/:id` — a
  city-focused booking workspace. Sprints link prospects and campaigns and
  return funnel counts plus overdue campaign follow-ups.
- `GET` / `POST` / `PATCH /booking-campaigns` and
  `POST /booking-campaigns/:id/recipients` /
  `PATCH /booking-campaigns/:id/recipients/:recipientId` — draft campaign and
  recipient management. Only qualified prospects can be recipients.
- `POST /booking-campaigns/:id/prepare-approval` — renders and returns every
  recipient-specific preview, then creates an `outbound_email_batch` approval;
  it makes no Gmail API call.

Campaign templates permit only `{{artistName}}`, `{{contactName}}`,
`{{prospectName}}`, `{{market}}`, `{{bookingPitch}}`, and `{{pressKitUrl}}`.
When an approved campaign batch executes, StoryBoard creates Gmail **drafts**,
marks recipients `drafted`, and makes one linked follow-up task (seven days by
default, editable per recipient). Campaigns may instead select **send on
execution**: approval and a separate Execute action remain mandatory, then
StoryBoard sends at most 25 ready recipients immediately and creates follow-up
tasks only for confirmed successful sends. Existing and draft-only campaigns
continue to create Gmail drafts. Unknown delivery is never retried automatically.

When the deployment explicitly enables `GMAIL_REPLY_SYNC_ENABLED`, an owner can
reconnect Google with `gmail.readonly` and opt the artist into tracked replies:

- `GET /booking-replies` and `GET /booking-replies/:id` — known campaign-thread replies.
- `GET` / `PATCH /booking-replies/settings` — readiness plus owner-only sync/AI consent.
- `POST /booking-replies/sync` — bounded manual check of StoryBoard-created threads.
- `POST /booking-replies/:id/analyze` — transient, explicitly enabled AI analysis.
- `POST /booking-replies/:id/apply-terms` — explicitly apply reviewed facts to the linked opportunity.
- `POST /booking-replies/:id/prepare-approval` — prepare a threaded Gmail draft through Approvals; never sends.

The periodic worker uses `GMAIL_REPLY_SYNC_REPEAT_MS` (15 minutes by default),
checks at most 50 threads per artist from the prior 180 days, and stores no raw
message body or attachment. `gmail.readonly` is restricted by Google; production
enablement requires the applicable OAuth verification and security review.

## Approvals execution

- `GET /approvals/pending` — needs review  
- `GET /approvals/ready-to-execute` — **approved** rows with executable action types: `outbound_email_batch`, `calendar_hold_batch`, `drive_ensure_folder`
- `POST /approvals/:id/approve` — moves pending/proposed → approved (audited)  
- `POST /approvals/:id/execute` — body `{ "dryRun": true }` for preview only (no provider calls; stays **approved**), or omit/`false` to run provider work and set status **executed**/**failed**  

`draft_venue_outreach` and prepared campaign batches store full per-recipient **Gmail** fields in the approval payload; **no** Gmail API call happens until **execute** (avoids pre-approval drafts when using real Gmail). Campaign execution additionally creates its linked follow-up tasks atomically with the executed approval record.

Audited actions include `approval.execution.started`, `approval.execution.dry_run`, `approval.execution.succeeded`, `approval.execution.failed`.

```bash
curl -s -X POST http://localhost:4000/commands/execute \
  -H "Content-Type: application/json" \
  -d '{"intent":"list_overdue_tasks"}'
```

## 8. Run the web app

Development:

```bash
pnpm dev:web
```

Production build + serve:

```bash
pnpm --filter @storyboard/web build
pnpm --filter @storyboard/web start
```

Open http://localhost:3000 (home redirects to the dashboard shell).

**Web ↔ API URL:** `apps/web/next.config.ts` loads `../../.env` so `API_URL` and
`NEXT_PUBLIC_API_URL` (see `.env.example`) resolve to the Nest API
(`http://localhost:4000` by default). The shell calls REST routes such as
`/venues`, `/booking-opportunities`, `/booking-prospects`, `/booking-campaigns`,
`/commands/execute`, and `/weekly-summary`.

## 9. Run both apps

```bash
pnpm dev
```

## 10. Quality checks

From repo root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

**Unit tests:** `pnpm test` runs **`@storyboard/shared`** (`pnpm run build` then `node --test` on `packages/shared/test/**/*.test.mjs`) and **`@storyboard/api`** (`nest build` then `node --test` on `apps/api/test/*.test.mjs`). The API suite covers tenant links, booking profile/template validation, Ticketmaster normalization/manual mode, provider dedupe, operator OAuth state, Telegram **start-payload**, and registration-token **hash** checks; it never needs a database. If repeated local builds exhaust Node's default heap, rerun the gate with `NODE_OPTIONS=--max-old-space-size=4096`; the container already uses lower-memory SWC emission after the separate typecheck.

**Database integration tests:** Set `STORYBOARD_TEST_DATABASE_URL` to a disposable PostgreSQL database whose name contains `test`, then run:

```bash
STORYBOARD_TEST_DATABASE_URL='postgresql://storyboard:storyboard@localhost:5432/storyboard_test?schema=public' \
  pnpm test:integration
```

The command refuses to fall back to `DATABASE_URL`, runs `prisma generate` and
`prisma migrate deploy` against that explicit test database, and then verifies
tenant links, role enforcement, Telegram registration binding, and audit rows.
Before a release, run the read-only relationship diagnostic against the target
database; it exits non-zero if it finds a mismatch and never changes data:

```bash
pnpm db:audit-relationships
```

**Browser workflow test:** Install Chromium once, then point the opt-in runner
at the same kind of explicit disposable test database. It applies migrations,
builds the current production artifacts, starts the API/web pair with dev auth
and mock-safe providers, and verifies profile → prospect → buyer → campaign →
approval preview. It never falls back to `DATABASE_URL`.

```bash
pnpm --filter @storyboard/web exec playwright install --with-deps chromium
STORYBOARD_TEST_DATABASE_URL='postgresql://storyboard:storyboard@localhost:5432/storyboard_test?schema=public' \
  pnpm test:e2e
```

Optional after infra and `.env` are up:

```bash
pnpm preflight
```

## 11. Troubleshooting

- **`pnpm install` warns about build scripts** — root `package.json` defines `pnpm.onlyBuiltDependencies` so Prisma, Sharp, and Nest postinstalls run trusted packages only.
- **Prisma P1001** — Postgres not running or wrong `DATABASE_URL`; run `pnpm infra:up` and wait for health.
- **API env validation errors** — compare `.env` with `.env.example`; ensure `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET` (min 8 chars), `WEB_URL` are set.
- **Nest `dist/main` / `dist/main.js` missing right after `Found 0 errors` in watch** — usually stale incremental build info while `deleteOutDir` wipes `dist`. The API tsconfig pins `tsBuildInfoFile` under `dist` so this does not happen; ensure `pnpm db:generate` has been run if you see `@prisma/client` resolution errors.
- **Next.js** — there is no `next lint` in Next 16; `pnpm lint` uses ESLint from the repo root config.

## Migration strategy (reminder)

- Forward-only migrations in `prisma/migrations/`
- Never hand-edit applied migration SQL in shared branches
- Production deploys should use `prisma migrate deploy` (CI/CD), not `migrate dev`
