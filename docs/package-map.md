# Package Map

## Root

- `package.json`: workspace scripts and baseline metadata
- `pnpm-workspace.yaml`: workspace package globs
- `.env.example`: env inventory template
- `docker-compose.yml`: local PostgreSQL and Redis services
- `tsconfig.base.json`: shared TypeScript defaults

## Apps

### `apps/web`

The Next.js operator interface. Current responsibilities:

- Dashboard shell with StoryBoard navigation and pending-approval indicator
- Command bar (`POST /commands/execute`) with structured JSON output
- Venue and contact CRM, booking pipeline, tasks, approval center
- Weekly summary and audit activity pages
- Shared API client in `src/lib/api.ts` (uses repo-root `.env` via `next.config.ts`)

### `apps/api`

The NestJS orchestration backend. Current responsibilities:

- REST modules for venues, contacts, booking opportunities, tasks, approvals,
  audit events, commands, weekly summary, and dashboard stats
- Prisma-backed services with `createPrismaClient` / `PrismaService`
- `AuditService` for important actions; risky command paths create approval rows
- Typed integration adapters with **mock** providers under
  `src/integrations/adapters/mock/`

Further responsibilities (workers, live adapters, richer AI) remain phased work.

**Validation:** venue and contact PATCH bodies use strict Zod schemas
(`venue-patch.schema.ts`, `contact-patch.schema.ts`). Commands use
`execute-command.schema.ts` for `POST /commands/execute`.

## Packages

### `packages/shared`

Cross-app domain contracts, validation schemas, and shared types.

### `packages/ui`

Reusable React UI components intended for the web app.

## Prisma

`prisma/schema.prisma` defines the shared PostgreSQL model and future migration
source.

## Scripts

`scripts/bootstrap` is reserved for local setup automation once the bootstrap
phase begins.

## Cursor Artifacts

- `.cursor/rules/storyboard.md`: project principles
- `.cursor/commands/run-storyboard.md`: reusable workflow command
- `.cursor/plans/storyboard-master-plan.md`: long-lived implementation roadmap

## Import Boundaries

- `apps/web` may import from `packages/shared` and `packages/ui`
- `apps/api` may import from `packages/shared`
- `packages/shared` must not depend on app packages
- `packages/ui` should remain presentation-focused and not depend on API code
