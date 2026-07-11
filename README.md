# StoryBoard

StoryBoard is an AI-assisted operating system for bands and artists. It is
designed to reflect how real band management works: venue relationships, booking
workflow, scheduling, release coordination, approvals, show operations, and
business follow-through.

## Locked Stack

- `pnpm` workspace monorepo (Node `22.22.x`, pnpm `10.x`)
- `apps/web`: Next.js `16.2.x`, React `19`, TypeScript, Tailwind CSS `4.2.x`
- `apps/api`: NestJS `11.1.18`, TypeScript, Fastify
- `packages/shared`: shared types, contracts, and Zod schemas (CommonJS `dist` for the API)
- `packages/ui`: reusable React UI primitives
- PostgreSQL `16` as the source of truth
- Redis `7` for queues and coordination
- Prisma ORM `7.6.0` (`prisma.config.ts` + driver adapter in API when you wire Prisma)
- BullMQ `5.73.0` for background jobs
- Zod `4.3.6` for validation
- Docker Compose for local infrastructure
- OpenAI SDK for orchestration (optional locally via `OPENAI_ENABLED`)

## Run locally (from zero)

Prerequisites: **Node 22.22.x**, **pnpm 10.x** (via Corepack), **Docker Desktop** (or compatible engine).

```bash
cd /path/to/StoryBoard
corepack enable && corepack prepare pnpm@10.32.0 --activate
cp .env.example .env
pnpm install   # runs prepare → builds @storyboard/shared into dist/
pnpm infra:up
pnpm db:generate
pnpm db:migrate
# optional: pre-link a dev operator to the default artist
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000 — sign in with Google (or dev login when enabled). New operators without memberships go through **onboarding** (create an artist or accept an invite). Owners manage team invites from **Team** in the sidebar. Then: **Manager** intake/brief/chat, dashboard, **Band operations** (events, songs/setlists, projects, offers), CRM, **Find shows**, booking, **Pitch campaigns**, the optional **Booking inbox**, tasks, approvals, weekly summary, notifications, and activity.
- API: http://localhost:4000/health  

The web app loads the repo-root `.env` via `apps/web/next.config.ts` so `API_URL` / `NEXT_PUBLIC_API_URL` stay in sync (see `.env.example`). API requests use `credentials: "include"`; optional **`COOKIE_DOMAIN=localhost`** helps the session cookie work across Next (3000) and the API (4000) in local development.

Stop infra: `pnpm infra:down`

## Run the local container bundle

For a production-built, self-contained local demo (web, API, Postgres, Redis,
migrations, and a seeded owner), install Docker Compose v2 and run:

```bash
pnpm container:up
```

Open `http://localhost:3000`, then use **Dev login**. The bundle persists data
in Docker volumes; stop it with `pnpm container:down`. Copy
`.env.compose.example` to a separate Compose env file to override local
passwords, session secret, ports, or browser-facing URLs. `NEXT_PUBLIC_API_URL`
is embedded at web-image build time, so rebuild after changing it. This is a
local demo profile: a public deployment must disable dev bypass and configure
Google OAuth, real secrets, and public `WEB_URL`/API URLs.

**Phase 3A:** Operator auth (Google OIDC + optional dev bypass), `Operator` / `ArtistMembership`, session-guarded routes, integration OAuth state bound to the signed-in operator, and audit rows with `actorOperatorId`. See `docs/auth-operators.md`.

**Phase 3B:** Membership **invitations** (hashed tokens, audit), **`viewer`** role with a small capability map, **Team** admin UI (owners), **first-artist onboarding** without requiring seed, and minimal **Origin / Referer** checks on mutating requests (`docs/invitations.md`, `docs/auth-operators.md`).

**Phase 2B:** Per-artist Google connections (encrypted in Postgres), real Calendar/Drive adapters when scoped, minimal OAuth routes (`docs/integrations-google-oauth.md`), a two-job BullMQ worker in the API process, and shared Zod payloads in `@storyboard/shared` for key approval types.

**Phase 4A:** Workflow automation and notifications on the existing queue: invite email drafts (Gmail real or mock), approval and integration connection notifications, overdue task and stale follow-up digests (repeatable jobs), minimal in-app `WorkflowNotification` rows + optional operator **`workflowEmailEnabled`**, and auditable automation actions. See `docs/workflow-automation.md`.

**Phase 4B:** Per-membership **notification preferences** (Zod-validated JSON on `ArtistMembership`), **owner escalation thresholds** on `Artist`, **daily/weekly digest** jobs (`digest.generate.daily` / `digest.generate.weekly`) on the same queue, and a **Notifications** page in the web app. Preferences gate in-app rows and Gmail drafts; digests stay draft-based. See `docs/workflow-automation.md`.

**Phase 5A:** **Telegram** urgent outbound channel (`sendMessage` only, narrow adapter; **mock** when `TELEGRAM_BOT_TOKEN` is unset), **owner-only** per-artist routing (`GET`/`PATCH /workflow/telegram`), repeatable **`urgent.telegram.scan`** job plus **approval execution failed** hook, **`TelegramUrgentDedupe`** for idempotency, and deterministic **operational intelligence** (`GET /dashboard/insights`: booking health, pipeline risk, priority actions). UI: Notifications (Telegram card), dashboard health + actions, pipeline risk badges, weekly briefing snapshot. See `docs/telegram-alerts.md`, `docs/workflow-automation.md`, and `docs/architecture.md`.

**Phase 5B:** **Telegram inbound registration** — owners issue short-lived **`POST /workflow/telegram/registration-token`** links; **`POST /integrations/telegram/webhook`** handles **`/start`** payloads only, binds **`telegramChatId`** with one-time **`TelegramRegistrationToken`** rows, full audit trail, optional **`TELEGRAM_WEBHOOK_SECRET`**, and minimal Notifications UI (deep link / copy / manual chat id fallback). Expanded **`pnpm test`** coverage (shared + API). See `docs/telegram-alerts.md`.

**Booking acquisition:** A quick, artist-scoped booking profile unlocks market prospecting and pitch campaigns. **Find shows** searches one city at a time through Ticketmaster Discovery when configured, otherwise states that manual mode is active rather than inventing leads. It stores venue, festival, private-event, and corporate-event prospects; only physical-room prospects create a `Venue` on conversion. **Pitch campaigns** render only a small allowlist of variables, show every personalized email before approval, and create Gmail drafts only after approval execution — never an auto-send. Each executed draft creates one follow-up task seven days later by default. See `docs/domain-model.md` and `docs/developer-runbook.md`.

**Booking advisor:** The Booking advisor turns sprint, campaign, delivery, outcome, and feedback into reviewable next steps. It remains deterministic when `OPENAI_ENABLED=false`. When enabled, `OPENAI_ADVISOR_CONTEXT=aggregate` (default) sends counts only; the explicit global `full` mode sends artist CRM context to the configured provider. It never sends messages or mutates booking records.

**Manager OS:** The Manager workspace is the cross-functional successor to the
booking-only advisor (the old advisor API remains compatible). A guided intake
records band mode, market, lineup, constraints, and ambition; creates an
editable initial goal set; and produces a daily/weekly brief grounded in
artist-owned records. Optional OpenAI reasoning uses `OPENAI_MANAGER_MODEL`
(`gpt-5.6-terra` by default); disabled or failed requests use a deterministic
fallback. Manager traces retain facts/record IDs, policy results, prompt/model
version, latency, and structured recommendations—not hidden reasoning or raw
provider inbox data. The OpenAI path must first call the single explicit,
read-only `read_manager_snapshot` function; code supplies the tenant snapshot
and records token usage. Model output cannot invent tools: code permits direct
acceptance only for low-risk internal task creation; email, calendar, Drive,
legal, and financial work remains human-reviewed and approval-gated.

**Band operations:** Confirming a booking opportunity idempotently creates a
gig event. Events hold availability, logistics, show advance tasks, setlists,
deal/invoice links, expenses, and settlement state. The same workspace includes
a shared song library, practical setlists, release/content/tour/business
projects, versioned deal memos, owner-activated agreement templates, immutable
PDF snapshots, idempotent manual payments, and finalized settlements. Financial
values are integer minor units with US/USD defaults. Agreement templates are
starting points only and explicitly not legal advice. Gmail/calendar/Drive
side effects still require Approvals; generated PDFs remain in StoryBoard until
the reviewed provider-delivery step is executed.

**Booking reply loop:** When `GMAIL_REPLY_SYNC_ENABLED=true` and an owner reconnects Google with `gmail.readonly`, the Booking inbox checks only Gmail threads created by StoryBoard campaigns. It stores bounded message metadata/snippets, not full bodies or attachments. AI analysis is a separate per-artist opt-in; selected bodies are fetched transiently and discarded after structured terms are derived. Applying terms and creating a threaded Gmail reply draft both require explicit actions, and drafts still pass through Approvals. Keep reply sync disabled until Google restricted-scope requirements are satisfied.

Details, troubleshooting, and checks: `docs/developer-runbook.md` and `docs/environment-setup-plan.md`.

**Agents (Codex, Cursor, etc.):** read [`AGENTS.md`](AGENTS.md) and [`docs/codex-handoff.md`](docs/codex-handoff.md) for the current delivery snapshot, file map, and quality gate.

## Core Product Principles

- One coherent app, not a collection of disconnected assistants
- One source of truth in PostgreSQL
- All external systems behind adapters
- Risky actions require approval before execution
- Important actions must be auditable
- Write actions should support dry run mode where practical
- Natural language commands resolve to structured actions

## Repository Map

- `apps/web`: operator-facing web application
- `apps/api`: orchestration API, domain logic, adapters, queue producers
- `packages/shared`: shared schemas, types, and contracts
- `packages/ui`: reusable UI components
- `prisma/`: schema and migrations; `prisma.config.ts` at repo root (Prisma 7)
- `docs`: architecture, domain, integration, env, and runbook docs
- `.cursor/rules`, `.cursor/commands`, `.cursor/plans`: Cursor artifacts
- `scripts/`: e.g. `preflight.mjs`

## Workspace commands

| Command | Purpose |
| ------- | ------- |
| `pnpm dev` | Run web + API in parallel |
| `pnpm dev:web` | Run Next dev only |
| `pnpm dev:api` | Run Nest dev only |
| `pnpm build` | Build packages and apps |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint (API + web) |
| `pnpm test` | Unit tests (`@storyboard/shared` + compiled API tests); does not require a database |
| `pnpm test:integration` | Migrates and tests a dedicated DB named by `STORYBOARD_TEST_DATABASE_URL` (must contain `test`) |
| `pnpm infra:up` / `infra:down` | Docker Postgres + Redis |
| `pnpm db:generate` | `prisma generate` (root config) |
| `pnpm db:migrate` | `prisma migrate dev` (needs Postgres) |
| `pnpm db:seed` | Seed default artist + operator membership (needs migrate) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:audit-relationships` | Read-only check for historical cross-artist record links |
| `pnpm preflight` | Docker + Postgres + Redis smoke (needs infra + `.env`) |

## Phase 2A providers

Gmail (OAuth draft-only), Bandsintown (the artist's own event context only), and Ticketmaster Discovery (city-first venue/event signals) can run as **real** adapters when env vars are set. Ticketmaster absence or failure puts Find shows in explicit manual mode; it never creates synthetic leads. Approval **execute** creates Gmail drafts only after explicit approval. See `docs/developer-runbook.md`; `GET /integrations/status` (authenticated) reports provider modes.

## MVP Scope

- Venue CRM, contact/promoter CRM, booking profiles, market prospects, booking pipeline, approval-gated pitch campaigns, task engine, approval center with post-approval **execution**, command bar, weekly summary, and adapter layer (real Gmail/Bandsintown/Ticketmaster when configured; Calendar, Drive, YouTube, Spotify still mock-first).

## Commands API

`POST /commands/execute` accepts **`text`** (natural language) and/or **`intent`**
(structured). See `docs/developer-runbook.md` for intent names and examples.

## Read Next

- `AGENTS.md` — concise rules for coding agents
- `docs/codex-handoff.md` — handoff: what is shipped, where code lives, next-work ideas
- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/integration-plan.md`
- `docs/environment-setup-plan.md`
- `docs/developer-runbook.md`
- `docs/workflow-automation.md`
- `docs/telegram-alerts.md`
- `docs/package-map.md`
- `.cursor/plans/storyboard-master-plan.md` (historical roadmap; cross-check README phases)
