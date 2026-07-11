# StoryBoard Environment Setup Plan

## Objective

Reliable local bootstrap: Docker Compose for Postgres and Redis, `pnpm` for the monorepo, Prisma 7 for schema and migrations, and validated API configuration.

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
7. `pnpm dev` (or `dev:web` / `dev:api` separately)

## Env variable inventory

### Required for API boot

- `DATABASE_URL` — PostgreSQL connection string (matches Compose defaults in `.env.example`)
- `REDIS_URL` — e.g. `redis://localhost:6379`
- `WEB_URL` — browser origin for CORS allowlist, e.g. `http://localhost:3000`
- `API_PORT` — e.g. `4000`
- `SESSION_SECRET` — minimum **8 characters**

### Core app (optional defaults)

- `NODE_ENV` — typically `development`
- `WEB_PORT`, `API_URL` — documented for future use; Next dev uses port from script

### OpenAI (optional locally)

- `OPENAI_ENABLED` — set `false` to skip requiring a real key
- `OPENAI_API_KEY` — required only when `OPENAI_ENABLED=true`
- `OPENAI_MODEL`, `OPENAI_COMMAND_MODEL`, `OPENAI_SUMMARY_MODEL` — optional
- `OPENAI_ADVISOR_CONTEXT` — `aggregate` by default; `full` sends artist CRM
  context to the configured OpenAI provider for the Booking advisor. This is a
  deployment-wide choice, not an artist-level setting.

### Integrations (not required for boot)

Placeholders in `.env.example` until adapters are implemented: Google OAuth, Bandsintown, Ticketmaster, YouTube, Spotify, and deferred services.

## Migration strategy

- **Development**: `pnpm db:migrate` (`prisma migrate dev`)
- **CI/production**: `prisma migrate deploy` with the same `DATABASE_URL`
- Keep a single migration history under `prisma/migrations/`

## Health verification

- **Docker**: `docker compose ps` (and healthchecks in Compose)
- **Postgres / Redis**: `pnpm preflight` (after infra is up and `.env` is loaded)
- **API**: `GET /health`
- **Web**: open `/` on the dev or production server
