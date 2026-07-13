# `@storyboard/web`

Next.js operator UI for StoryBoard.

The app currently provides guided onboarding, the Manager workspace, dashboard,
CRM and booking acquisition, campaign replies, tasks, approvals, notifications,
team administration, and band operations for events, setlists, projects, and
deal records.

Run from the repository root after the API and infrastructure are ready:

```bash
pnpm dev:web
```

Package-only checks:

```bash
pnpm --filter @storyboard/web typecheck
pnpm --filter @storyboard/web lint
pnpm --filter @storyboard/web build
```

`apps/web/next.config.ts` loads the repository-root `.env`. Server rendering
uses `API_URL` (or `INTERNAL_API_URL` in the container bundle), while browser
requests use `NEXT_PUBLIC_API_URL` and include the session cookie. Keep writes
behind the API; the web app must not connect directly to PostgreSQL or provider
SDKs.

See [`../../docs/developer-runbook.md`](../../docs/developer-runbook.md) for
authentication and browser-test setup and
[`../../docs/package-map.md`](../../docs/package-map.md) for route entry points.
