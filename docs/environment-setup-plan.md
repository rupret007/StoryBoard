# StoryBoard Environment Setup

## Objective

This is the implemented local bootstrap contract: Docker Compose for Postgres
and Redis, `pnpm` for the monorepo, Prisma 7 for schema and migrations, and
validated API configuration. For the end-to-end command sequence and
troubleshooting, use [`developer-runbook.md`](developer-runbook.md).

## Prisma 7 layout

- **`prisma/schema.prisma`**: data model only (no `url` on `datasource` — Prisma 7)
- **`prisma.config.ts`** (repo root): `schema` path, `migrations` path, `datasource.url` via `env("DATABASE_URL")`, loads `.env` with `import "dotenv/config"`
- **Generated client**: `provider = "prisma-client"` with `output = "../apps/api/src/generated/prisma"` (run `pnpm db:generate`; output is gitignored)
- **Runtime**: use `@prisma/adapter-pg` + `PrismaClient` when you inject Prisma in the API (`apps/api/src/lib/prisma.ts` factory is ready for that)

CLI commands run from the **repo root** so they pick up `prisma.config.ts` (`pnpm db:*` scripts).

## Local infrastructure

`docker-compose.yml`:

- **postgres**: image `postgres:16`, port `POSTGRES_PORT` (default `5432`)
- **redis**: image `redis:7`, port `REDIS_PORT` (default `6379`)

Compose injects `POSTGRES_*` into the container; your app uses **`DATABASE_URL`** on the host (must match user/password/db from Compose).

## Bootstrap order

1. Install Node `22.22.x` and activate pnpm `10.x` (Corepack)
2. `cp .env.example .env`
3. `pnpm install`
4. `pnpm infra:up`
5. `pnpm db:generate`
6. `pnpm db:migrate` (applies `prisma/migrations/*` to local Postgres)
7. Choose authentication: configure Google operator OAuth, or for local-only
   development set `AUTH_DEV_BYPASS=true` and run `pnpm db:seed`
8. `pnpm dev` (or `dev:web` / `dev:api` separately)

## Env variable inventory

### Required for API boot

- `DATABASE_URL` — PostgreSQL connection string (matches Compose defaults in `.env.example`)
- `REDIS_URL` — e.g. `redis://localhost:6379`
- `SESSION_SECRET` — minimum **8 characters**

### Core app (optional defaults)

- `NODE_ENV` — typically `development`
- `WEB_URL` — browser origin for CORS/CSRF and redirects; defaults to `http://localhost:3000`
- `API_PORT` — API listener/Compose host port; defaults to `4000`
- `WEB_PORT` — Compose host port for the web app; defaults to `3000`
- `API_URL`, `NEXT_PUBLIC_API_URL` — server/browser API origins used by the web
  app and Compose; default to `http://localhost:4000` locally

### OpenAI (optional locally)

- `OPENAI_ENABLED` — set `false` to skip requiring a real key
- `OPENAI_API_KEY` — required only when `OPENAI_ENABLED=true`
- `OPENAI_MODEL` — optional Booking advisor and booking-reply analysis model
- `OPENAI_MANAGER_MODEL` — optional Manager brief/chat model; defaults to the
  code-registered balanced reasoning model
- `OPENAI_ADVISOR_CONTEXT` — `aggregate` by default; `full` sends artist CRM
  context to the configured OpenAI provider for the Booking advisor. This is a
  deployment-wide choice, not an artist-level setting.
- `BOOKING_ADVISOR_AUTOMATION_ENABLED` — deployment gate for owner-configured
  advisor automation
- `MANAGER_SCHEDULE_SCAN_MS` — optional Manager schedule scan interval; minimum
  one minute and 15 minutes by default

### Integrations (not required for boot)

- Google operator OAuth signs users in. Per-artist Google OAuth stores encrypted
  refresh tokens and enables scoped Gmail drafts/sends, Calendar holds, and
  Drive-folder creation; see `integrations-google-oauth.md`.
- Ticketmaster provides bounded city-first venue/event signals. Bandsintown is
  limited to the current artist's own event context. Both fall back safely when
  credentials are absent.
- YouTube and Spotify remain mock-only. TikTok, Mailchimp, Twilio, Printful,
  Shopify, Stripe, and Documenso remain deferred adapters.

## Migration strategy

- **Development**: `pnpm db:migrate` (`prisma migrate dev`)
- **CI/production**: `prisma migrate deploy` with the same `DATABASE_URL`
- Keep a single migration history under `prisma/migrations/`

## Health verification

- **Docker**: `docker compose ps` (and healthchecks in Compose)
- **Postgres / Redis**: `pnpm preflight` (after infra is up and `.env` is loaded)
- **API**: `GET /health`
- **API dependencies/worker**: `GET /ready` (returns non-2xx when PostgreSQL,
  Redis, or the enabled queue worker is unavailable)
- **Web**: open `/` on the dev or production server
