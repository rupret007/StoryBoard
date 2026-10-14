# StoryBoard

[![Quality](https://github.com/rupret007/StoryBoard/actions/workflows/quality.yml/badge.svg)](https://github.com/rupret007/StoryBoard/actions/workflows/quality.yml)

StoryBoard is an AI-assisted operating system for bands and artists: venue
relationships, booking, scheduling, releases, approvals, show operations, and
follow-through. **Public repo:**
[github.com/rupret007/StoryBoard](https://github.com/rupret007/StoryBoard).

**Bob is the front door. StoryBoard is the band-business engine.**
[AI-Music-Vault](https://github.com/rupret007/AI-Music-Vault) is the sole song
catalog. StoryBoard imports that catalog; it is not a second place to maintain
songs. Promo stays in StoryLiner. WebJam stays the making room. See
[`APPS.md`](APPS.md) and [`docs/catalog-import.md`](docs/catalog-import.md).

Try a production-built local demo with
[the container bundle](#run-the-local-container-bundle). For source
development, use [Run locally](#run-locally-from-zero) and the
[`developer-runbook`](docs/developer-runbook.md). The
[`documentation index`](docs/README.md) maps everything else.

> Run every command from the cloned `StoryBoard` directory (this README and
> `package.json`). `ERR_PNPM_NO_PKG_MANIFEST` means the terminal is in the
> wrong directory.

## Features

- **Manager OS:** guided intake, 90-day plan, goals, decisions, evidence-grounded
  daily/weekly briefs, bounded chat, reviewed internal actions, follow-through,
  and an offline eval gate (`manager_os_v33` / `manager_evals_v45`).
- **Booking:** CRM, one-market prospecting, pipeline, pitch campaigns, tracked
  replies, and follow-up work. Travis still books; StoryBoard does not auto-pitch.
- **Band operations:** events/availability, show readiness and phone day-of,
  Vault-imported songs/setlists, projects, offers, invoices, expenses, and
  settlements.
- **Approvals:** human decide → explicit execute → append-only reconciliation.
  Gmail, Calendar, and Drive stay behind adapters (mock when unset).
- **Team and auth:** Google operator sign-in (optional local Dev login),
  owner/member/viewer roles, invites, and first-artist onboarding.
- **Two-band pilot (engineering candidate, not activated):** owners can create
  a second empty workspace from Team; the header names the current band and
  writes stay pinned to the open workspace; owners link performers to accepted
  accounts; members get **My tasks** and their own availability; intake rejects
  linking one account to two performers; load failures and empty searches stay
  distinct. Field login, catalog import, and hosting are still missing. See
  [`docs/band-pilot.md`](docs/band-pilot.md).

## Locked stack

- `pnpm` workspace monorepo (Node `22.22.x`, pnpm `10.x`)
- `apps/web`: Next.js `16.3.x`, React `19`, TypeScript, Tailwind CSS `4.2.x`
- `apps/api`: NestJS `11.2.x`, TypeScript, Fastify
- `packages/shared`: shared types, contracts, and Zod schemas (CommonJS `dist` for the API)
- `packages/ui`: reusable React UI primitives
- PostgreSQL `16`, Redis `7`, Prisma ORM `7.6.0`, BullMQ `5.73.0`, Zod `4.3.6`
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
# local-only Dev login: set AUTH_DEV_BYPASS=true in .env, then seed its owner
pnpm db:seed
pnpm dev
```

Choose one sign-in path before starting: configure the Google operator OAuth
variables for real sign-in, or set `AUTH_DEV_BYPASS=true` in `.env` and run
`pnpm db:seed` for the local-only **Dev login**. Do not enable dev bypass on an
internet-facing deployment.

- Web: http://localhost:3000 — Google (or Dev login). New operators without
  memberships go through **onboarding**. Owners manage invites and additional
  bands from **Team**. Then: Manager, dashboard, Band operations, CRM, Find
  shows, booking, Pitch campaigns, optional Booking inbox, tasks, approvals,
  weekly summary, notifications, and activity.
- API: http://localhost:4000/health

The web app loads the repo-root `.env` via `apps/web/next.config.ts` so
`API_URL` / `NEXT_PUBLIC_API_URL` stay in sync. API requests use
`credentials: "include"`; optional **`COOKIE_DOMAIN=localhost`** helps the
session cookie work across Next (3000) and the API (4000) locally.

Stop infra: `pnpm infra:down`

## Run the local container bundle

For a production-built, self-contained local demo (web, API, Postgres, Redis,
migrations, and a seeded owner), install Git and Docker Compose v2. From a new
machine, no host Node installation or `pnpm install` is required:

```bash
git clone https://github.com/rupret007/StoryBoard.git
cd StoryBoard
docker compose -f docker-compose.app.yml up --build
```

Open `http://localhost:3000`, then use **Dev login**. The bundle persists data
in Docker volumes. Keep that terminal open for logs, or use
`docker compose -f docker-compose.app.yml up --build -d --wait`.
Stop with `docker compose -f docker-compose.app.yml down`. Wrappers:
`pnpm container:up` / `pnpm container:down`. To override local passwords, the
session secret, ports, or URLs, copy `.env.compose.example` to gitignored
`.env.compose` and pass `--env-file .env.compose`.

`NEXT_PUBLIC_API_URL` is embedded at web-image build time, so rebuild after
changing it. A public deployment must disable dev bypass and configure Google
OAuth, real secrets, a non-default database password, and public
`WEB_URL`/API URLs. The production Compose override removes host-published
Postgres and Redis ports.

## Workspace commands

| Command | Purpose |
| ------- | ------- |
| `pnpm dev` | Run web + API in parallel |
| `pnpm dev:web` / `dev:api` | Run Next or Nest only |
| `pnpm build` | Production build of packages and apps |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint (API + web) |
| `pnpm test` | Recovery tests plus shared + compiled API unit tests (no database) |
| `pnpm test:integration` | Migrates and tests a dedicated DB named by `STORYBOARD_TEST_DATABASE_URL` (must contain `test`) |
| `pnpm test:e2e` | Resets that test DB, builds production artifacts, and runs Playwright Chromium journeys in `apps/web/e2e` |
| `pnpm manager:eval` | Build the API and run the offline Manager safety/usefulness gate |
| `pnpm infra:up` / `infra:down` | Docker Postgres + Redis |
| `pnpm container:up` / `container:down` | Local container bundle |
| `pnpm db:generate` / `db:migrate` / `db:seed` / `db:studio` | Prisma client, migrations, seed, Studio |
| `pnpm catalog:import` | Default song path. Dry-run unless `--apply`. Never a remote URL. |
| `pnpm db:audit-relationships` | Read-only check for historical cross-artist record links |
| `pnpm db:backup` / `db:restore:drill` | Private backup and empty-target restore drill |
| `pnpm preflight` | Docker + Postgres + Redis smoke (needs infra + `.env`) |

Quality gate (no live providers):

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm manager:eval
```

Local 2026-10-07 snapshot on this branch: typecheck, lint, 11/11 recovery,
106/106 shared, 347/347 API unit, 8/8 integration (42 migrations), both
production builds (21 web routes), 119/119 `manager_evals_v45` at 100% safety.
The [Quality workflow](https://github.com/rupret007/StoryBoard/actions/workflows/quality.yml)
also runs Playwright and a Compose container smoke on pull requests and `main`.

## Status and limits

- **Not a second catalog.** Songs come from a local Vault import (dry-run
  default). Empty after seed is expected unless you apply a feed.
- **Risky work is approval-gated.** Gmail drafts/sends, Calendar holds, and
  Drive folders need a separate Execute step. Unknown provider outcomes are
  never auto-retried.
- **Gmail reply sync** stays off until restricted-scope Google requirements
  are met. YouTube and Spotify remain mock-only.
- **Telegram** is outbound `sendMessage` plus inbound `/start` registration
  only (no command bot). Owner-only settings and tokens.
- **Two-band pilot** is an engineering candidate. It is not a live URL, real
  Google login, delivered reminder, or field-validated show. See
  [`docs/pilot-evidence.md`](docs/pilot-evidence.md).
- **42** forward Prisma migrations. One tracked non-fatal `pg@8.14.1`
  concurrent-query deprecation remains before any `pg@9` upgrade.

## Core product principles

- One coherent app, not a collection of disconnected assistants
- One source of truth in PostgreSQL
- All external systems behind adapters
- Risky actions require approval before execution
- Important actions must be auditable
- Write actions should support dry run mode where practical
- Natural language commands resolve to structured actions

## Repository map

- `apps/web`: operator-facing web application
- `apps/api`: orchestration API, domain logic, adapters, queue producers
- `packages/shared`: shared schemas, types, and contracts
- `packages/ui`: reusable UI components
- `prisma/`: schema and migrations; `prisma.config.ts` at repo root (Prisma 7)
- `docs`: architecture, domain, integration, env, and runbook docs
- `.cursor/rules`, `.cursor/commands`, `.cursor/plans`: Cursor artifacts
- `scripts/`: preflight, catalog import, evals, backup/restore, e2e runner

## Commands API

`POST /commands/execute` accepts **`text`** (natural language) and/or
**`intent`** (structured). See `docs/developer-runbook.md` for intent names
and examples.

## Read next

- [`docs/README.md`](docs/README.md) — documentation index by task
- [`AGENTS.md`](AGENTS.md) — concise rules for coding agents
- [`docs/codex-handoff.md`](docs/codex-handoff.md) — current delivery snapshot
- [`docs/developer-runbook.md`](docs/developer-runbook.md) — setup, validation, release
- [`docs/architecture.md`](docs/architecture.md) and
  [`docs/domain-model.md`](docs/domain-model.md) — system and data boundaries
- [`docs/band-pilot.md`](docs/band-pilot.md) — two-band pilot preparation
- [`.cursor/plans/storyboard-master-plan.md`](.cursor/plans/storyboard-master-plan.md)
  — historical roadmap only; do not treat it as current scope
