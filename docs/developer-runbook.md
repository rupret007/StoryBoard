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

**BullMQ:** Queue `storyboard-enrichment`; worker runs inside the API unless `ENABLE_QUEUE_WORKER=false`. Jobs include `venue.enrich`, `research.refresh` (stubs), phase **4A** workflow jobs, phase **4B** **`digest.generate.daily`** / **`digest.generate.weekly`**, and phase **5A** **`urgent.telegram.scan`** (same repeat interval as overdue/stale) — see `docs/workflow-automation.md`. Optional env: **`WORKFLOW_STALE_FOLLOWUP_DAYS`** (default `7`), **`WORKFLOW_AUTOMATION_REPEAT_MS`** (overdue/stale/telegram repeat, default 6 hours), **`WORKFLOW_DIGEST_DAILY_MS`**, **`WORKFLOW_DIGEST_WEEKLY_MS`** (digest intervals; defaults 1 day and 7 days). **Telegram:** optional **`TELEGRAM_BOT_TOKEN`** — without it, urgent Telegram sends use the **mock** path (audited, no network). **Phase 5B:** **`TELEGRAM_BOT_USERNAME`** (deep links), **`TELEGRAM_REGISTRATION_TTL_MINUTES`**, **`TELEGRAM_WEBHOOK_SECRET`** (optional; Telegram `secret_token` must match **`X-Telegram-Bot-Api-Secret-Token`**). Public webhook: **`POST /integrations/telegram/webhook`** — configure via Bot API **`setWebhook`**. See `docs/telegram-alerts.md`.

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
When `OPENAI_ENABLED=false`, StoryBoard uses deterministic facts; when enabled,
it sends only aggregate booking counts, active-market metadata, and aggregate
advice feedback to OpenAI. It does not send contact details, email bodies, or
perform provider actions.

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
continue to create Gmail drafts. StoryBoard never reads Gmail replies or retries
an unknown delivery automatically.

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

**Unit tests:** `pnpm test` runs **`@storyboard/shared`** (`pnpm run build` then `node --test` on `packages/shared/test/**/*.test.mjs`) and **`@storyboard/api`** (`nest build` then `node --test` on `apps/api/test/*.test.mjs`). The API suite covers tenant links, booking profile/template validation, Ticketmaster normalization/manual mode, provider dedupe, operator OAuth state, Telegram **start-payload**, and registration-token **hash** checks; it never needs a database.

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
