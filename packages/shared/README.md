# `@storyboard/shared`

Shared domain contracts, Zod schemas, and TypeScript types used across the
StoryBoard web app and API.

The package builds CommonJS output into `dist/` so the Nest API can consume it.
Keep it independent of both applications and free of provider or database code.

```bash
pnpm --filter @storyboard/shared build
pnpm --filter @storyboard/shared typecheck
pnpm --filter @storyboard/shared test
```

The root `pnpm install` runs the shared build through `prepare`; rebuild it
before API-only development after changing an exported contract.
