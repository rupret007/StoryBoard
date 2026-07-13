# `@storyboard/api`

NestJS orchestration and domain API for StoryBoard.

The API is the only write boundary for artist data. It currently owns operator
sessions, artist memberships and roles, CRM and booking workflows, Manager OS,
band operations, approvals, audit events, background jobs, and provider
adapters. External, legal, financial, and other risky work remains explicitly
approval-gated; unset integrations use mock-safe adapters.

Run from the repository root:

```bash
pnpm db:generate
pnpm dev:api
```

Package-only checks:

```bash
pnpm --filter @storyboard/api typecheck
pnpm --filter @storyboard/api lint
pnpm --filter @storyboard/api test
pnpm --filter @storyboard/api build
```

The test command compiles the API before running its database-free `node:test`
suite. Database integration tests must be started through the root
`pnpm test:integration` command with an explicit
`STORYBOARD_TEST_DATABASE_URL`; they never fall back to application data.

Start with [`../../docs/architecture.md`](../../docs/architecture.md),
[`../../docs/developer-runbook.md`](../../docs/developer-runbook.md), and
[`../../docs/package-map.md`](../../docs/package-map.md). Preserve tenant-scoped
relations, role checks, audit logging, source-key idempotency, and adapter
boundaries when adding routes or jobs.
