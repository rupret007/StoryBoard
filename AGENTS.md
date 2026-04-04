# Guidance for coding agents (StoryBoard)

StoryBoard is a pnpm monorepo: **Next.js** (`apps/web`) + **NestJS** (`apps/api`) + **PostgreSQL** + **Redis/BullMQ**. Product name is **StoryBoard**.

## Read first

1. **[docs/codex-handoff.md](docs/codex-handoff.md)** — current delivery state, file map, quality gate, boundaries.
2. **[docs/developer-runbook.md](docs/developer-runbook.md)** — clone, env, Prisma, run, API tables.
3. **[README.md](README.md)** — phase summary (3A–5B), workspace commands.

## Rules of engagement

- Prefer **additive** changes; preserve **adapters** (real vs mock), **session auth**, **membership roles**, and **audit** logging.
- **Owner-only:** Telegram settings, registration tokens, escalation PATCH; do not bypass in HTTP or jobs.
- **Telegram:** Outbound = `sendMessage` + dedupe; inbound = **`/start`** registration only (no command bot).
- After schema edits: **`pnpm db:generate`** and a **migration**; never commit `.env` or secrets.

## Verify before finish

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Repo

[https://github.com/rupret007/StoryBoard](https://github.com/rupret007/StoryBoard)
