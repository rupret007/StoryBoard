# StoryBoard — agent handoff (Codex / Cursor / others)

This document orients an autonomous coding agent so work continues without losing context. **Authoritative run instructions** remain in [`developer-runbook.md`](developer-runbook.md) and the root [`README.md`](../README.md).

## Product and remote

- **Product name:** StoryBoard (use everywhere; not a codename).
- **Public repo:** [https://github.com/rupret007/StoryBoard](https://github.com/rupret007/StoryBoard)
- **Stack:** pnpm monorepo — `apps/web` (Next.js 16), `apps/api` (NestJS 11 + Fastify), `packages/shared`, `packages/ui`; PostgreSQL 16 + Redis 7; Prisma 7; BullMQ.

## Delivery state (what already exists)

Phases referenced in **README** / **docs** reflect what was built (the file [`.cursor/plans/storyboard-master-plan.md`](../.cursor/plans/storyboard-master-plan.md) is an **older roadmap**; trust the README phase bullets and this list for “current” scope).

| Area | Status |
|------|--------|
| Scaffold, infra, Prisma, migrations | Done |
| Venues, contacts, booking opportunities, tasks | Done |
| Approvals + execution (Gmail drafts, calendar holds, drive folder) | Done |
| Command bar + `POST /commands/execute` (NL + structured intents) | Done |
| Operator auth (Google OIDC), session cookie, memberships (`owner` / `member` / `viewer`) | Done |
| Invites, onboarding, Team UI, CSRF `Origin`/`Referer` guard | Done |
| Per-artist Google integration (encrypted), adapter registry | Done |
| Workflow jobs: invites, approval notify, digests, overdue/stale scans | Done |
| Notifications page, prefs, escalation thresholds | Done |
| Telegram **outbound** urgent alerts + operational intelligence (`GET /dashboard/insights`) | Done (5A) |
| Telegram **inbound** `/start` registration webhook + `TelegramRegistrationToken` | Done (5B) |
| Tests | **Targeted** only: `node:test` on `packages/shared/test/*.mjs`, `apps/api/test/*.mjs` (API tests run `nest build` first). Not full e2e. |

## Non-goals to preserve (unless product changes)

- Do not replace the stack.
- Do not build a general Telegram command bot or approvals-from-Telegram.
- Keep **mock fallbacks** when integrations are unset.
- Keep **owner-only** rules for escalation, Telegram settings, and registration-token issuance.
- Keep mutations **auditable** (`AuditService`).

## High-value entry points

| Task | Start here |
|------|------------|
| Auth / roles | `apps/api/src/auth/`, `role-policy.service.ts`, `session-auth.guard.ts` |
| Workflow + queue | `apps/api/src/workflow-automation/`, `apps/api/src/queue/storyboard-queue.service.ts` |
| Telegram outbound | `workflow-telegram.service.ts`, `urgent-channel.constants.ts` |
| Telegram inbound | `telegram-registration.service.ts`, `telegram-webhook.controller.ts`, `telegram-start-parse.ts` |
| Notifications API | `workflow-settings.controller.ts`, `workflow-notifications.controller.ts` |
| Prisma schema | `prisma/schema.prisma` (client output: `apps/api/src/generated/prisma/` — **gitignored**; run `pnpm db:generate`) |
| Web app API client | `apps/web/src/lib/api.ts` (cookies + `x-artist-id`) |

## Environment (short list)

Copy [`.env.example`](../.env.example) to `.env`. Required for API boot include `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `WEB_URL`. **Telegram (optional):** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_REGISTRATION_TTL_MINUTES`, `TELEGRAM_WEBHOOK_SECRET`. Full table: [`telegram-alerts.md`](telegram-alerts.md), validation: `apps/api/src/config/env.validation.ts`.

## Quality gate (before merge)

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

With Postgres up: `pnpm db:migrate` after schema changes; always `pnpm db:generate` when `schema.prisma` changes.

## Suggested next work (not committed; pick with the user)

1. **Tests:** Integration tests with DB for registration binding, role-guarded routes, or approval execution + audit (where feasible without a giant harness).
2. **Telegram:** Optional `getUpdates` long-polling is **not** required; webhook + secret is the prod path. Document tunneling (ngrok) for local webhook if needed.
3. **Master plan file:** Optionally reconcile `.cursor/plans/storyboard-master-plan.md` with README phase labels so future agents are not confused.

## Cursor-only artifacts

`.cursor/rules/`, `.cursor/commands/`, `.cursor/plans/` are editor helpers; Codex may ignore them. **Docs under `docs/` and this file** are tool-agnostic.
