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
- Placeholders like `replace-me` are acceptable only for disabled integrations;
  configure real credentials before enabling Google, Ticketmaster, or
  Bandsintown behavior

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
use the separate application bundle. Container-only users can skip
`pnpm install`; run this from the cloned repository root:

```bash
docker compose -f docker-compose.app.yml up --build
```

It runs Postgres, Redis, forward-only Prisma migrations, the idempotent seed,
the Nest API (including the current in-process BullMQ worker), and Next.js.
The command stays attached and shows service logs; keep that terminal open, or
use `docker compose -f docker-compose.app.yml up --build -d --wait` for
background startup. Open `http://localhost:3000` and use the development login.
Stop containers without deleting data with
`docker compose -f docker-compose.app.yml down`. With Node and pnpm installed,
`pnpm container:up` / `pnpm container:down` are equivalent convenience
wrappers. Only use
`docker compose -f docker-compose.app.yml down -v` when intentionally removing
local Postgres and Redis data.

Allocate at least 2 GB of memory to Docker Desktop; image compilation includes
TypeScript, Prisma client generation, and Next.js production builds.

The API and web images pin Node 22.22.0 to match the repository's declared
22.22.x engine instead of drifting with the floating Node 22 tag. The API image
uses Nest's SWC emitter after Prisma generation to keep image
assembly within small Docker Desktop memory limits. This does not replace the
strict `pnpm typecheck`/`pnpm test` release gate; CI runs those before the
container smoke. `.dockerignore` excludes workspace builds, generated Prisma
output, and browser artifacts so local state is never copied into the image.

Defaults make this runnable without a checked-in secret. To override them,
copy `.env.compose.example` and pass it explicitly:

```bash
docker compose --env-file .env.compose -f docker-compose.app.yml up --build
```

The example also lists optional host-port overrides. For production operator
sign-in, configure the operator redirect. To let artists connect Gmail,
Calendar, or Drive, additionally set `GOOGLE_REDIRECT_URI` and a 32-byte
base64-encoded `INTEGRATION_SECRETS_ENCRYPTION_KEY`; sign-in alone does not
enable per-artist integrations.

`NEXT_PUBLIC_API_URL` is browser code and is compiled into the web image. Set
it, `WEB_URL`, and `API_URL` to public HTTPS URLs and rebuild the web image for
any public deployment. Production must set `NODE_ENV=production`, disable
`AUTH_DEV_BYPASS`, supply a strong `SESSION_SECRET`, and configure Google OAuth;
the local demo profile is not appropriate for an internet-facing deployment.
Server-rendered requests prefer `INTERNAL_API_URL`; the local container bundle
sets it to `http://api:4000` so web-to-API traffic stays on the Compose network
while browsers continue using `NEXT_PUBLIC_API_URL`. The production override
also requires a non-default `POSTGRES_PASSWORD` and removes the host-published
Postgres and Redis ports; those services remain reachable by the application on
the private Compose network.
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
  `opportunityId`, `projectId`, and active `bandMemberId` links. Each relation
  is checked before write; a foreign ID returns generic not-found with no audit
  event. `bandMemberId: null` unlinks the owner. Do not send `bandMemberId` and
  legacy `ownerLabel` together.
- Linked `bandMemberId` is canonical and `ownerLabel` is its display snapshot.
  Setting a legacy label clears the link for import compatibility; no migration
  automatically guesses or rewrites historical labels.
- A task with `status: "blocked"` requires `blockedReason`; `waitingOn` may name
  the person or organization holding the next step. Moving an incomplete task
  to a later date (or clearing an existing date) increments `deferralCount` and
  records `lastDeferredAt`.
- Task patches use tenant-scoped compare-and-set updates. A stale screen returns
  an error without overwriting newer status, ownership, blocker, or date data.
- `POST /tasks/:id/prerequisites` with `{ "prerequisiteTaskId": "..." }`
  adds one idempotent artist-owned prerequisite;
  `DELETE /tasks/:id/prerequisites/:prerequisiteTaskId` removes it. The service rejects
  self-links, cycles, cross-artist IDs, and a prerequisite due after the task it
  unlocks. A dependent task cannot be completed until every prerequisite is
  done, and a completed prerequisite cannot be reopened while completed
  downstream work still depends on it. The Tasks page manages these links.

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
| `research_booking_intel` | `{ "city"?: string }` optional | Read-only active-artist event context from Bandsintown plus Ticketmaster intel (`providerModes` in result) |
| `enqueue_research_refresh` | `{ "city"?: string }` optional | Enqueues BullMQ job `research.refresh` on `storyboard-enrichment` when Redis is up |

Optional body field **`dryRun`** (boolean, default **`true`**): stored on `CommandRun`; keeps commands non-destructive unless you pass `dryRun: false`.

The strict `research_booking_intel` payload derives the artist name from the
active tenant and accepts only an optional non-empty city. It rejects unknown
fields rather than allowing callers to select another artist or imply an
unsupported search radius.

**Natural language (examples, not exhaustive):** pending approvals; “overdue” / “follow up” (due-based), or “7” / “seven” with follow-up (stale 7d); booking pipeline / health; draft + outreach/email/venue; venue + rank/fit/driving; release + checklist; enqueue + research/refresh; research / bandsintown / ticketmaster / show calendar.

## Phase 2B providers (real vs mock, artist-aware Google)

Integration env vars are **optional**. **Google surfaces** (Gmail, Calendar, Drive) resolve per **`artistId`**: if an active `IntegrationConnection` (`provider = google`) exists with encrypted refresh token and recorded scopes, real adapters are used when scopes match; otherwise StoryBoard falls back to env `GOOGLE_OAUTH_REFRESH_TOKEN` when set with client id/secret. Missing scope or credentials → **mock** adapters (StoryBoard always boots).

| Provider | Credentials | Behavior |
| -------- | ----------- | -------- |
| Gmail / Calendar / Drive | Per-artist DB connection **or** env `GOOGLE_*` trio (refresh optional if DB only) | Gmail: draft-only by default, or an explicitly selected approval-gated immediate-send batch of at most 25 recipients. Calendar: hold events via approval `calendar_hold_batch`. Drive: `drive_ensure_folder` approval. Connect flow: `docs/integrations-google-oauth.md` (`INTEGRATION_SECRETS_ENCRYPTION_KEY` required to persist). |
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
- `GET` / `POST /manager/members`, `/manager/goals`, and
  `/manager/initiatives`; `PATCH /manager/members/:id`,
  `/manager/goals/:id`, and `/manager/initiatives/:id`
- `GET /manager/plan-health`; `GET` / `POST /manager/goals/:id/progress`
- `GET /manager/goal-measurements` — current `manager_goal_measurement_v1`
  projection for every goal, including source, observed/recorded values, drift,
  and bounded evidence IDs
- `POST /manager/goals/:id/sync-progress` with the last displayed
  `{ "observedValue": 2 }`; the API recomputes inside the transaction, rejects
  stale evidence with `409`, and creates an audited progress event only when
  the value changes
- `GET /manager/goal-paths` — read-only `manager_goal_path_v1` joins each active
  goal to its measurement, initiative, linked work, and ready prerequisite. It
  exposes missing/blocked/conflicting paths and never predicts effort,
  conversion, duration, or private capacity.
- `GET /manager/commitment-health` — ranked blocked, overdue, deferred,
  waiting, ownerless, due-soon, and unscheduled task commitments
- `GET /manager/context-health` — a deterministic, tenant-scoped projection of
  recorded identity, people, business, and current-execution context
- `GET /manager/knowledge-health` — consistency, confirmation, confidence, and
  review age for the caller-visible Manager memory. Owners include sensitive
  rows; restricted values remain excluded from provider context.
- `GET /manager/evidence-health` — read-only `manager_evidence_v1` coverage for
  live work, booking, projects, money, goals, and the working team. Each area is
  current, needs confirmation, stale, missing, or conflicted and carries a
  bounded next question plus tenant evidence IDs.
- `GET /manager/work-sequence` — read-only `manager_work_sequence_v1` task
  ordering. It separates ready-now work, in-progress work, manual blockers,
  unfinished prerequisites, and invalid historical order; and identifies which
  actionable task unlocks downstream commitments.
- `GET /manager/plan`; `POST /manager/plan/ensure` fills only missing
  `manager_plan_v1` records and never replaces user edits
- `GET` / `POST /manager/decisions`; `PATCH /manager/decisions/:id` records a
  choice, rationale, expected result, and review date; and
  `POST /manager/decisions/:id/review` records one immutable outcome lesson
- `GET /manager/brief?cadence=daily|weekly` and
  `POST /manager/brief/generate`
  The Manager page requests the operating profile's saved cadence on first
  render and exposes both views. It renders every bounded output section:
  Today (maximum five), This week, Decisions needed, Waiting on, and Risks and
  opportunities. Manual cadence selection stays active until the operator
  changes it or switches artists; Refresh regenerates the cadence currently on
  screen. Risk percentages are record-confidence labels, not forecasts.
- `POST /manager/chat`; standalone, unambiguous feedback about the directly
  preceding answer is classified by `manager_natural_feedback_v1`, stored
  through the same audited per-operator feedback record, and acknowledged
  without a provider call. Mixed/action/completion language is not a verdict.
  The response includes `feedbackApplied` only when an exact answer was rated,
  so clients can update that message immediately.
  The same route uses `manager_context_capture_v1` after a code-owned context
  answer asks one exact question. Supported profile answers produce a previewed
  `update_profile_context` recommendation; the reply itself does not write.
  Accepting revalidates the original user answer and optimistic profile version
  before an audited atomic update. Sensitive, ambiguous, lineup, goal, and
  commitment answers are never coerced into profile fields.
  Explicit “add a task to …” and shared “remind us to …” requests route through
  `manager_task_capture_v1` without a provider call. The reply previews one
  title, optional date-only deadline, and an unassigned owner; it does not
  write. Relative dates require the saved Manager timezone. Ambiguous dates,
  personal reminders, multiple tasks, credential values, questions, and
  implicit plans fail closed. Acceptance re-parses the exact tenant source
  message, rejects equivalent open work, and creates one source-keyed Task in
  the recommendation transaction. The provider output schema cannot emit this
  action.
  Explicit existing-task requests route separately through
  `manager_task_update_v1`: complete/finish, start/in-progress, resume/unblock,
  block with a reason, reschedule/clear due date, and set/clear a waiting party.
  StoryBoard resolves one current artist Task and returns a preview; the chat
  turn does not write. Acceptance re-parses the exact source message, requires
  the same Task version, and compare-and-sets the mutation in the recommendation
  transaction. Pronouns, collisions, no-ops, credential values, unsupported or
  timezone-less relative dates, completed-task reopening, unfinished
  prerequisites, and impossible dependency dates fail closed. Provider output
  cannot emit this action.
  Explicit direct ownership requests route through
  `manager_task_assignment_v1`. For example, `assign "Confirm load-in" to
  Morgan` previews one current Task, one active band member, the owner
  transition, and the latest voluntary availability status. The chat turn does
  not write. Acceptance re-parses the source and compare-and-sets the same Task
  version, previous owner, active member, and current check-in inside the
  recommendation transaction. Ambiguous first names, task collisions,
  pronouns, implicit ownership, unavailable members, completed tasks, and
  no-ops fail closed. Limited or unknown capacity remains visible for the human
  decision. The provider cannot emit this action, and neither model context nor
  audit metadata receives check-in notes.
  Explicit project requests route through `manager_project_capture_v1`. Use an
  exact project kind, name, and date, for example `Create a release project
  called "Autumn EP" due 2027-10-15`. The response previews the active project
  and every dated `project_plan_v1` milestone. Acceptance reloads and re-parses
  the source message and atomically creates the artist-scoped project plus all
  source-keyed tasks. Equivalent type/name/date projects, vague or missing
  dates, multiple projects, implicit plans, questions, and credential values
  are refused. This action is code-owned and is absent from the provider output
  schema.
  Explicit event requests route through `manager_event_capture_v1`. For
  example, `Schedule a rehearsal called "Album run-through" on 2026-10-15 at
  7:00 PM`. The saved Manager timezone is required; the preview shows the exact
  status, local start, location, and active-lineup count. Acceptance reloads
  and re-parses the source, rechecks duplicate events and the exact active
  lineup, then atomically creates the artist event and one `unknown`
  availability row per active member. Events default to `draft`; `hold` or
  `confirmed` must be explicit. Missing/invalid timezones, DST gaps or repeated
  local times, multiple/implicit events, questions, secrets, stale lineups, and
  duplicate type/title/start combinations are refused. Provider output cannot
  emit this action, and acceptance never contacts anyone or writes Calendar.
  One-person event responses route separately through
  `manager_event_availability_v1`. Supported examples include `Mark Morgan
  available for "Album run-through"`, `Morgan can't make "Bluebird show"`,
  and explicit tentative/unknown changes. The preview shows the exact event,
  active member, and previous → next response. Acceptance reloads and re-parses
  the source, rechecks event/member resolution plus the current participant
  response/timestamp, and compare-and-sets or creates one `EventParticipant`
  inside the recommendation transaction. No-op, ambiguous, multi-member,
  sensitive, stale, and provider-generated changes are refused. It does not
  notify the member and does not copy a personal explanation into notes.
- `POST /manager/messages/:id/feedback` with `{ "helpful": true }` or
  `{ "helpful": false, "reason": "too_vague", "note": "..." }`
- `GET /manager/conversations?limit=1..20` — newest-first summaries with the
  latest message and total message count — and `GET /manager/conversations/:id`
  (bounded to 50 messages and the requesting operator's feedback). The web
  client merges late server summaries by ID/timestamp so a refresh cannot erase
  a new thread, and clears conversation state when the active artist changes.
- `GET /manager/memory`, `PATCH /manager/memory/:id`, and
  `GET /manager/learning`
- `GET /manager/recommendation-eval-review?limit=3` — owner-only, read-only
  queue of completed, dismissed, or blocked recommendations from the last 90
  days that have no reviewed example for that observed stable-key result.
  `limit` accepts 1–5. Suggested and accepted work is excluded; fetching never
  infers usefulness, audits, promotes, or activates anything.
- `GET /manager/response-review?limit=3` — member/owner-only, read-only queue
  of the current operator's unrated answers from the last 90 days. `limit`
  accepts 1–5. Candidates are tenant-scoped, require a persisted Manager run
  and exact preceding question, and return at most one answer per conversation.
  Deterministic feedback acknowledgements are excluded so review cannot recurse.
  Reading never records a verdict; submit the existing
  `POST /manager/messages/:id/feedback` action explicitly.
- `GET /manager/response-eval-review?limit=3` — owner-only, read-only queue of
  the current owner's rated answers that do not yet have a response-eval row.
  It uses the same 1–5 limit, 90-day window, exact question/run requirement,
  tenant boundary, and one-answer-per-conversation selection. Reading never
  promotes or activates anything.
- `GET /manager/outcome-review?days=90` — read-only, tenant-scoped derived
  outcomes; `days` accepts 7–365 and defaults to 90
- `GET /manager/team-load` — read-only `manager_team_load_v2` projection over
  active members, open tasks, and current voluntary capacity check-ins. It
  distinguishes linked owners, exact-name legacy matches, system placeholders,
  and unknown labels; it reports recorded pressure and check-in freshness,
  never an estimate of hours or personal circumstances.
- `GET /manager/member-check-ins` and
  `POST /manager/members/:id/check-ins` — read append-only check-in history or
  record `available`, `limited`, or `unavailable` with optional `note` and
  offset-datetime `effectiveUntil`. Viewers read; members/owners write. Expiry
  must be future, cross-artist/inactive member IDs return not found, and note
  content is never copied to provider context or audit metadata.
- `GET /manager/eval-examples` and
  `POST /manager/recommendations/:id/promote-eval` (owner-only;
  `needs_revision` requires a 10–2000 character `notes` explanation)
- `GET /manager/response-eval-examples`,
  `POST /manager/messages/:id/promote-eval`, and
  `POST /manager/response-eval-examples/:id/resolve` (owner-only). Promote only
  after the same owner rates the answer; negative examples require
  `expectedBehavior` and a later code-registered `candidateVersion` to resolve.
- `GET /manager/evaluations/latest` and `POST /manager/evaluations/run`
  (owner-only; currently accepts only the code-registered `manager_os_v32`)
- `POST /manager/recommendations/:id/accept|dismiss|complete`; the optional
  body is `{ "reason": "wrong_priority", "note": "Release comes first" }`
- `GET` / `PUT /manager/settings` (PUT owner-only)
- `GET /manager/provider-context-policy` (owner-only; counts and active policy,
  never memory values)

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

The provider projection enforces source precedence, freshness, and sensitivity
before the read tool is called. `ArtistOperatingProfile` is authoritative for
`band_mode`, `home_market`, `twelve_month_ambition`, and `constraints`; every
profile write synchronizes those compatibility memory rows in one transaction,
and generic memory PATCH rejects them. `manager_knowledge_v1` labels conflicting,
unconfirmed, low-confidence, and stale facts so neither fallback nor model prose
treats them as settled. Standard redacted context may include `normal` memory
only. Full-context owner consent may add `sensitive` memory and CRM/operating
notes. `restricted` memory is never supplied to the model. Model citations are
validated against the same projected ID set, and `ManagerRun.inputFacts`
remains redacted in all modes. Run traces record only policy summaries plus
whether provider context was attempted and accepted;
`GET /manager/provider-context-policy` exposes the same value-free summary to
owners.

`manager_evidence_v1` is a separate, non-persistent operating-coverage check.
It composes the existing show/project readiness, goal measurement, booking
timestamps, open financial records, and working lineup without replacing any
of them. Missing means StoryBoard lacks a source; it never means the real-world
fact is false. Booking signals become needs-confirmation after 21 days and stale
after 45 days; old draft deals and settlements are called out explicitly. The
same result is shown in Manager, included in the redacted provider snapshot and
trace, and applied after either deterministic or model response generation. At
most one relevant record check is appended to a normal answer. A direct
confidence question returns the highest-risk areas and proposes no action.

`manager_work_sequence_v1` is also derived rather than editable. The source of
truth remains Tasks plus their explicit prerequisite links. It ranks ready work
by overdue state, downstream unlocks, and due date; waiting work stays distinct
from manual blockers. Direct sequence questions use this code-owned result and
bypass provider improvisation. Optional-model briefs and other chat responses
are rejected when they present a downstream task without its ready prerequisite.
The policy never estimates effort, duration, or actual member capacity.

Owner-reviewed response evals store a bounded question/answer/feedback snapshot
and refer back to the assistant message's linked, already-redacted
`ManagerRun.inputFacts` during offline replay. Useful examples must pass the
natural-response and grounding rules. Unresolved negative examples block the
candidate that produced them; only a later code-registered version can be
marked as resolving the expected behavior. Promotion, resolution, and eval runs
are artist-scoped and audited, and none of them changes the active version.

`OPENAI_ENABLED=false` is fully supported. With OpenAI enabled, set
`OPENAI_MANAGER_MODEL` (default `gpt-5.6-terra`). Manager inputs are
tenant-scoped snapshots covering operating goals/tasks plus current events,
booking replies and follow-ups, prospects, approvals, deals, invoices,
settlements, and the shared evidence-backed outcome review. CRM/provider text
is treated as untrusted data. Prompt/policy
version `manager_os_v32` retains the current operator question and at most 12
recent messages; it rejects the entire model result when any cited or
recommendation evidence ID is unknown. Stored traces contain facts read, policy checks,
structured output, prompt/model version, and latency—not hidden reasoning.
Brief generation first collects all deterministic candidates rather than
stopping at the response limit. After repeat suppression,
`manager_priority_v1` ranks the full set using bounded record-derived factors
for event timing/readiness, unavailable members, commitment state, reply age,
approval state, overdue invoices, due reviews/follow-ups, and project health.
Grounded model candidates are merged into that set, evidence-overlap duplicates
retain the deterministic stable key, and the same ranking is applied before the
five-item Today limit. `ManagerRun.trace.priorityRanking` records factor codes,
plain-language labels, integer impacts, and omitted candidates; it contains no
hidden reasoning. The Manager UI surfaces the first item's non-baseline factors.
Cached briefs with an older prompt/policy version or a newer audited change to
the relevant operating aggregate set regenerate on read. Manager-run and eval
bookkeeping is not in that aggregate set, preventing a brief from invalidating
itself immediately after persistence.
Conversation may propose one `create_decision` draft only for an explicit
two-option choice. Acceptance creates an open, linked, tenant-owned decision;
the band must save real framing in a separate write before it can choose.
Conversation may also propose `remember_fact` only when the current operator
explicitly asks to remember the exact normal-sensitivity statement. The value
is displayed before acceptance and saved with operator-confirmation provenance
only after **Remember this**. Ordinary conversation and scheduled briefs cannot
write memory; operating-profile facts redirect to Band context, and credentials,
financial identifiers, and health information are refused.
Explicit education questions use `manager_coaching_v1` before provider
reasoning. The reviewed catalog covers common booking/deal structures, show
production, settlement, and release-rights concepts. Each response explains
the concept, why it matters, where it belongs in StoryBoard, and a bounded
caution; it may cite only current-artist records. Coaching is read-only,
records its topic IDs/provider bypass in the redacted run trace, and never
creates a recommendation. The external-action refusal runs first. The Manager
UI builds its **Learn as you go** prompts from `educationTopics`, with safe
defaults when no topics are saved.
Generated briefs remain limited to code-owned, typed proposals: low-risk
internal task/assignment, show-advance, and project-plan work plus
`event_logistics_v1` approval preparation. Event logistics acceptance creates
review rows only; provider execution still requires a separate human action in
Approvals. Briefs cannot invent tool names, create arbitrary records, or
execute an outside action.
Each assistant message links to the exact `ManagerRun` that produced it.
Members can record one idempotent feedback row per response/operator; feedback
is tenant-scoped and audited. Only aggregate helpful/correction signals enter
future response guidance—free-text notes are not injected into prompts.
Code maps common corrections (`incorrect`, `missed_question`, `too_vague`,
`too_long`, `wrong_tone`, and `missing_context`) to bounded presentation rules.
`manager_response_adaptation_v1` applies the relevant rules to future
deterministic and provider-backed answers for the artist using the existing
90-day feedback window. It can reduce deterministic list depth, remove a small
allowlist of canned phrases, repeat the exact current recommendation next step,
or ask one question already present in evidence health. It never consumes the
free-text note and cannot create evidence, change a recommendation, invoke a
tool, or expand authority. `ManagerRun.trace.responseAdaptation` retains only
the policy version, flags, list limit, and bounded correction reason codes.
A deterministic post-output gate rejects canned openings, assistant/meta
language, excessive length/formatting, and claims of completed outside actions;
the deterministic manager answer is used when model output fails the gate.
Chat may return one reviewable recommendation through the same recommendation
API. Acceptance permits `create_task`, an open `create_decision` draft, a
role-grounded `assign_task`, or one of two readiness-bound internal operations:
`generate_event_advance` and `generate_project_plan`. A deterministic brief may
also offer `prepare_event_logistics_approvals`; accepting it creates reviewable
Calendar/Drive approvals only, never a provider write. Assignment requires the
exact current-artist open task to still be unowned or system-labeled plus the
exact active member selected by the deterministic team-load view; equal role
matches remain unchosen and urgent recorded workloads are excluded. The
generators only create source-keyed internal Tasks, require the cited current
target to belong to the artist, recheck the event/project date, and commit with
the recommendation claim. Those internal actions cannot call a provider or
prepare/execute an Approval. Event-logistics acceptance instead creates or
reuses source-keyed pending approvals after rechecking the current event
fingerprint; it still cannot approve, execute, or call the provider.
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
acceptance/completion metrics are visible in the Manager workspace. Members
edit profile-owned facts through Band context. Other normal memory can be
confirmed, corrected, or archived by members; sensitive/restricted memory and
sensitivity changes remain owner-controlled. Archiving memory removes it from
reasoning without deleting audit history.
An owner may promote a decided recommendation to the local eval set with
`{ "label": "useful|not_useful|needs_revision", "notes": "..." }`.
The snapshot contains the bounded recommendation/outcome shape, not full input
facts, conversation history, or provider data. Promotion is idempotent per
recommendation and never activates a prompt/policy version.

Goal progress accepts exactly one of `value` or `delta`; a delta requires an
existing current value. Each update transactionally changes the goal and adds
an immutable `ManagerGoalProgressEvent` with the prior value, actor, and note.
Numeric goals use `targetDirection=at_least|at_most|exact`; omitted create
values default to `at_least`, while PATCH requests apply only fields explicitly
sent. The shared `manager_goal_target_v1` projection is the source of target
state and language in goal paths, plan health, chat, and acceptance checks.
Goals default to `measurementKind=manual`. A member may instead select
`qualified_prospects`, `confirmed_gigs`, `completed_gigs`, or
`completed_projects`. Qualified prospects count the current qualified/converted
pool. Gig counts use the goal creation/deadline performance window. Completed
projects count only projects explicitly linked by `goalId`. The Manager exposes
drift but never synchronizes it automatically; unsupported metrics remain
manual. Repeated synchronization at the same observed value is a no-op.
`GET /manager/plan-health` is deterministic: it scores active goals from
deadlines, recorded measurements, linked initiatives, blocked work, and linked
task state, and returns the reasons/evidence for every classification.
Plan health also flags unassigned open tasks, but does not infer linear pace or
the probability of hitting a target. An “on track” result means only that the
recorded work contains no contradiction or blocker. Intake creates two band-mode-specific
goals, one initiative per goal, and three dated starter tasks per initiative.
Tasks start unassigned intentionally; use the Tasks workspace to choose a
linked active band member. Legacy text labels remain visible for existing
imports, but new UI assignments use member IDs. Blocked tasks need a reason;
the workspace can also record a waiting party and reschedule a date.
`ManagerCommitmentHealth` is
derived from current task facts and deferral history, never edited as a score.
Re-running plan ensure is idempotent.

Manager chat supports a bounded set of natural follow-ups—“why that?”, “is
that still right?”, “what is blocking it?”, “tell me more”, and “do that”.
`manager_conversation_continuity_v1` uses only the immediately preceding
structured recommendation in the same conversation. It rechecks that exact
stable key or typed action against current deterministic projections. If the
reference is absent or ambiguous, the response asks the operator to name the
task, show, goal, or project. A pronoun never accepts or duplicates work; the
original reviewed action remains the only acceptance surface.

Direct named-record questions use `manager_subject_reference_v1`. Candidate
goals, tasks, shows, projects, decisions, opportunities, prospects, offers,
invoices, and settlements come only from the active artist's bounded Manager
snapshot. The resolver accepts full labels, quoted fragments, or a unique
distinctive token paired with a compatible record-kind word. It asks which
record was meant when names collide and returns an explicit missing-record
question for an unmatched quoted name. Resolved and ambiguous routes bypass
the optional model so OpenAI-on and deterministic operation enforce the same
tenant and evidence boundary.

The Learning from your choices panel uses `manager_response_review_v1` to
recover recent answers that the current operator has not rated. It displays one
at a time with the original question, answer, and a plain selection reason.
Opening or refreshing the inbox is side-effect free. Helpful or Needs work uses
the existing tenant-scoped audited feedback write, immediately refills the
queue, and still requires a separate owner action to enter the evaluation set.
No feedback automatically edits or activates prompts, policy, schema, or code.

Owners also see `manager_response_eval_review_v1` beside the ordinary review
inbox. A helpful answer can be added explicitly as `useful`; a Needs work
answer requires a 10–3000 character expected behavior before it can be added as
`needs_revision`. Both reuse the audited promotion route and disappear from
the triage queue only after that write succeeds. Promotion merely adds a local
regression example: it does not resolve a failure, pass the offline gate, or
activate a Manager version.

Owners see `manager_recommendation_eval_review_v1` in the same Learning panel.
It retains the finished recommendation, outcome reason/note, prompt version,
evidence IDs, and current linked task or decision state. One latest item per
stable recommendation key is presented; an existing review suppresses older
duplicates through that observed outcome, but not a genuinely later result.
The owner explicitly keeps the pattern as `useful`, marks it `not_useful`, or
adds a written `needs_revision` case. A successful promotion refills the queue
and updates the 90-day advice-review metrics. It does not edit or activate a
Manager version.

The Manager page loads ten recent conversation summaries and opens the newest
thread initially. New conversation preserves that history; choosing another
thread replaces the visible message set through the tenant-scoped detail route
and clears any unsent draft. New replies update the local title, latest-message
preview, count, and ordering. Follow-up continuity and named-record resolution
therefore stay within the selected conversation rather than merging context.

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
The runner forces its production build environment internally, so an unrelated
shell-level `NODE_ENV` cannot invalidate Next.js prerendering.
The 13 focused browser cases establish their own domain prerequisites and cover
booking (including approved immediate-send execution and follow-up creation),
Manager, operations, finance, tasks, and approval-gated event logistics without
depending on a previous case's records. They still share the
same reset database, and per-test retries remain intentionally disabled so a
retry cannot hide state leakage or an idempotency regression. Failed runs
retain a Playwright trace and should restart from the database reset. If port
3000 or 4000 is occupied locally, set `E2E_WEB_URL` and/or `E2E_API_URL` to an
available loopback URL; the runner uses those values consistently for its
build, servers, redirects, and browser requests.
The CI container smoke waits for API and web readiness independently, verifies
that the landing page renders a host-resolvable Dev login URL rather than the
internal Compose hostname, and then verifies that dev login writes an
`sb_session` cookie. Playwright follows that same visible link in every focused
browser journey.

Operations routes:

- `GET` / `POST /events`, `GET` / `PATCH /events/:id`,
  `POST /events/from-opportunity/:opportunityId`, participant upsert, and
  advance generation
- `POST /events/:id/prepare-logistics-approvals` — for a confirmed gig with an
  exact start, end, and IANA timezone, create or reuse one pending approval for
  each missing Calendar and/or Drive channel. The route never calls Google.
  A rejected channel can use this explicit route to create a new reviewed
  attempt. A failed provider attempt cannot: because the outside write may have
  succeeded before its response was lost, check Google and reconcile manually.
- `GET /events/readiness?days=90` and `GET /events/:id/readiness` — bounded,
  tenant-scoped, read-only readiness signals with category scores, confidence,
  evidence IDs, and prioritized gaps; `days` accepts 1–365
- `GET /events/:id/day-of` — the tenant-scoped event, active lineup, shared
  readiness result, and deterministic current/next show-day view
- `POST /events/:id/schedule`, `PATCH /events/:id/schedule/:itemId`, and
  `DELETE /events/:id/schedule/:itemId` — strict, tenant-scoped custom
  run-of-show checkpoints; owner/member writes only
- `GET` / `POST /songs`, `/setlists`, and `/projects`; item updates use
  `PATCH /songs/:id`, `/setlists/:id`, and `/projects/:id`. Setlist reads
  include the derived `setlist_summary_v1` timing summary; writes replace the
  submitted ordered item list atomically after validating every song belongs
  to the active artist.
- `GET /projects/readiness`, `GET /projects/:id/readiness`, and
  `POST /projects/:id/generate-plan` — explainable active-project health plus
  idempotent type-specific milestone generation
- `GET` / `POST /deals`, `PATCH /deals/:id`, document generation, and
  approval-gated delivery preparation
- `GET` / `POST /document-templates`, `PUT /document-templates/:id/activate`
  (owner-only writes)
- `GET` / `POST /invoices`, `PATCH /invoices/:id`,
  `POST /invoices/:id/record-payment`
- `GET` / `POST /expenses`, `PATCH /expenses/:id` for event/project costs
- `GET` / `POST /settlements`, `PATCH /settlements/:id`,
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

Open **Music & setlists** in Band operations to maintain the canonical song
library and running orders. Song duration uses `m:ss` in the UI and remains
nullable. A setlist may contain up to 100 ordered songs, breaks, and notes;
every break/note requires a label, and only song rows may reference a saved
song. Reorder controls, transition cues, set notes, and draft/active/archive
status are persisted through `PATCH /setlists/:id`. The displayed duration is
song time only. Breaks are excluded because their duration is not modeled, and
missing song durations remain explicit. Show readiness awards full setlist
timing credit only when at least one song is present and every song duration is
known.

In Band operations, expand **Manage readiness details** on an event to record
each active member's availability, attach an artist-owned venue/contact/setlist,
and edit the location, show-day schedule, guarantee/deposit, production notes,
and technical URLs. For gigs, **After the show** also records attendance,
gross revenue, lessons, and the buyer/venue relationship outcome. Blank values
remain unknown. Relationship IDs are revalidated by the API. Schedule
patches are validated against both the submitted fields and the event's saved
timestamps; load-in, soundcheck, doors, set, and curfew cannot be reordered by
a partial update. Every successful event or availability write is audited.

The same editor shows the `event_logistics_v1` Calendar and Drive state. A gig
must be `confirmed` and have `startsAt`, `endsAt`, and `timezone`; the end must
follow the start. **Prepare approvals** creates or reuses only the one or two
review records needed for the currently missing/retryable channels.
After a member approves and executes them from Approvals, the provider Calendar
event ID and Drive folder URL appear on the event. Preparation is idempotent by
artist/event/fingerprint/channel/attempt. Confirmed gigs create normal opaque
Calendar events; legacy `calendar_hold_batch` inputs without the confirmed kind
remain transparent `HOLD:` events. Mock execution is labeled `simulated` and
does not claim Google changed; connect Google before preparing a replacement.
If the event type/status, title,
start, end, or timezone changes before execution, the approval fails closed and
current gig data must be reviewed again. A rejected channel may be deliberately
re-prepared. A failed provider attempt is quarantined because its remote outcome
may be unknown; inspect Google and repair/link the result manually instead of
creating a duplicate. If already-linked event details later change, update the
existing Google record manually; StoryBoard does not create a replacement.

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
custom schedule items. Members and owners can add, correct, and remove custom
travel calls, meals, support slots, changeovers, meet-and-greets, and similar
checkpoints inline; the canonical load-in through curfew fields remain in the
main event editor. Custom checkpoint end time must follow its start, rows
inherit tenant ownership through their event, and cross-artist event/item pairs
fail before write or audit. The view also shows overdue/open advance work, availability,
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
- `GET /booking-prospects` / `GET /booking-prospects/:id` /
  `POST /booking-prospects` / `PATCH /booking-prospects/:id` — artist-scoped
  venue, festival, private-event, and corporate-event leads.
- `PUT /booking-prospects/:id/contact` — link an existing artist contact or
  create the prospect's buyer/promoter contact inline; the operation is
  tenant-checked, atomic, and audited.
- `GET /booking-prospects/discover?city=&region=&country=&keyword=` — bounded
  Ticketmaster venue/event signals when configured. Otherwise returns
  `{ mode: "manual" }` and no generated leads.
- `POST /booking-prospects/:id/convert` — qualified prospect → idempotent target
  opportunity. Only a `venue` prospect creates a physical `Venue`; private and
  corporate leads remain venue-less and can create/link a buyer contact.
- `GET` / `POST /market-sprints` and `GET` / `PATCH /market-sprints/:id` — a
  city-focused booking workspace. Sprints link prospects and campaigns and
  return funnel counts plus overdue campaign follow-ups.
- `GET` / `POST /booking-campaigns`, `PATCH /booking-campaigns/:id`, and
  `POST /booking-campaigns/:id/recipients` /
  `PATCH /booking-campaigns/:id/recipients/:recipientId` — draft campaign and
  recipient management. Only qualified prospects can be recipients.
- `POST /booking-campaigns/:id/prepare-approval` — renders and returns every
  recipient-specific preview, then creates `outbound_email_batch` for the
  default draft mode or `outbound_email_send_batch` for explicitly selected
  immediate delivery; preparation itself makes no Gmail API call.

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
- `GET /approvals/ready-to-execute` — **approved** rows with executable action types: `outbound_email_batch`, `outbound_email_send_batch`, `calendar_hold_batch`, `drive_ensure_folder`
- `POST /approvals/:id/approve` — moves pending/proposed → approved (audited)  
- `POST /approvals/:id/reject` — moves pending/proposed → rejected with an optional reviewed reason (audited)
- `POST /approvals/:id/execute` — body `{ "dryRun": true }` for preview only (no provider calls; stays **approved**), or omit/`false` to run provider work and set status **executed**/**failed**  

`draft_venue_outreach` and prepared campaign batches store full per-recipient **Gmail** fields in the approval payload; **no** Gmail API call happens until **execute** (avoids pre-approval drafts when using real Gmail). Campaign execution additionally creates its linked follow-up tasks atomically with the executed approval record.

Approve, reject, and execute use compare-and-set transitions. Non-dry execution
claims `executionAttemptedAt` once before any provider call; a second request
cannot execute the same approval again. Event-logistics approvals additionally
carry artist-scoped `sourceKey`, `eventId`, and optional
`managerRecommendationId`. Execution verifies the current confirmed event and
reviewed title/time/timezone fingerprint before resolving the side effect.
Calendar success stores `BandEvent.calendarEventId`; Drive success stores
`BandEvent.driveFolderUrl`. Linked Manager advice remains accepted while a
request waits, completes after every channel executes, and becomes dismissed
or blocked when a request is rejected or fails.

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
pnpm manager:eval
```

**Unit tests:** `pnpm test` runs **`@storyboard/shared`** (`pnpm run build` then `node --test` on `packages/shared/test/**/*.test.mjs`) and **`@storyboard/api`** (strict `tsc --noEmit`, lower-memory Nest SWC emission, then `node --test` on `apps/api/test/*.test.mjs`). The API suite covers tenant links, task prerequisite cycles/order/completion, Manager work sequencing, booking profile/template validation, Ticketmaster normalization/manual mode, provider dedupe, operator OAuth state, Telegram **start-payload**, and registration-token **hash** checks; it never needs a database. The same typecheck-plus-SWC path is used by normal API production builds so the full parallel monorepo gate does not depend on Node's default heap peak.

**Database integration tests:** Set `STORYBOARD_TEST_DATABASE_URL` to a disposable PostgreSQL database whose name contains `test`, then run:

```bash
STORYBOARD_TEST_DATABASE_URL='postgresql://storyboard:storyboard@localhost:5432/storyboard_test?schema=public' \
  pnpm test:integration
```

The command refuses to fall back to `DATABASE_URL`, runs `prisma generate` and
`prisma migrate deploy` against that explicit test database, and then verifies
tenant links (including custom event schedule ownership and event-bound
approval ownership), role enforcement, Telegram registration binding, and
audit rows.
Before a release, run the read-only relationship diagnostic against the target
database; it exits non-zero if it finds a mismatch and never changes data:

```bash
pnpm db:audit-relationships
```

**Browser workflow test:** Install Chromium once, then point the opt-in runner
at the same kind of explicit disposable test database. It applies migrations,
builds the current production artifacts, starts the API/web pair with dev auth
and mock-safe providers, and verifies booking acquisition, Manager and band
operations, practical setlists, and confirmed event → logistics approvals →
approved mock Calendar/Drive execution → persisted event references. It never
falls back to `DATABASE_URL`.

```bash
pnpm --filter @storyboard/web exec playwright install chromium
STORYBOARD_TEST_DATABASE_URL='postgresql://storyboard:storyboard@localhost:5432/storyboard_test?schema=public' \
  pnpm test:e2e
```

On Linux CI images, use `playwright install --with-deps chromium` to install
the operating-system packages as well. macOS needs only the command above.

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
- `20260714010000_event_logistics_approvals` adds nullable event/recommendation/
  source-key links and indexes to `ApprovalRequest`; deploy it before using the
  Manager or Operations event-logistics flow.
