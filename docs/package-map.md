# Package Map

## Root

- `package.json`: workspace scripts and baseline metadata
- `pnpm-workspace.yaml`: workspace package globs
- `.env.example`: env inventory template
- `docker-compose.yml`: local PostgreSQL and Redis services
- `tsconfig.base.json`: shared TypeScript defaults
- `AGENTS.md`: short instructions for AI coding agents (Codex, etc.)
- `prisma.config.ts`: Prisma 7 config (loads `.env`)

## Apps

### `apps/web`

The Next.js operator interface. Current responsibilities:

- Dashboard shell with StoryBoard navigation and pending-approval indicator
- Command bar (`POST /commands/execute`) with structured JSON output
- Venue and contact CRM, booking pipeline, tasks, approval center
- Weekly summary, **Notifications** (prefs, escalation, **Telegram** link + manual chat id)
- Team / invites (owners), onboarding, activity feed
- Shared API client in `src/lib/api.ts` (uses repo-root `.env` via `next.config.ts`)

### `apps/api`

The NestJS orchestration backend. Current responsibilities:

- REST modules for venues, contacts, booking opportunities, tasks, approvals,
  audit events, commands, weekly summary, dashboard stats, **insights**
- **Tasks:** artist-scoped prerequisite graph, cycle/date/state preflight,
  serializable completion guards, audit history, and relationship diagnostics
- **Memberships** / invites / onboarding; **auth** (Google OIDC + dev bypass)
- Prisma via **`PrismaService`** (`apps/api/src/prisma/`)
- **`AuditService`** on important actions; approval execution paths
- **Integrations:** adapter registry, Google OAuth, **Telegram** real/mock adapters
- **Workflow automation:** BullMQ jobs (`workflow-automation/`, `queue/`), in-app notifications, email drafts, digests, opt-in **Manager cadence**, **Telegram urgent scan**
- **Manager OS:** tenant snapshots, deterministic briefs/chat, post-show outcome
  review, structured context health, six-area `manager_evidence_v1` operating
  confidence calibration, scheduled decision/outcome learning,
  evidence-ranked commitment follow-through, dependency-aware
  `manager_work_sequence_v1`, goal-to-action `manager_goal_path_v1`, explicit
  minimum/cap/exact `manager_goal_target_v1` assessment, linked task ownership, append-only
  member capacity check-ins, and bounded `manager_team_load_v2` assignment
  proposals, structured `manager_conversation_continuity_v1` follow-ups,
  tenant-bounded `manager_subject_reference_v1` named-record resolution,
  bounded tenant-scoped conversation summaries and recoverable thread history,
  explicit `manager_natural_feedback_v1` immediate-answer verdicts,
  reviewed `manager_context_capture_v1` profile-answer proposals,
  reviewed `manager_task_capture_v1` shared-task proposals,
  reviewed `manager_task_update_v1` existing-task follow-through,
  reviewed `manager_task_assignment_v1` direct ownership changes,
  owner-only `manager_recommendation_eval_review_v1` finished-advice triage,
  per-operator `manager_response_review_v1` answer-review queues,
  owner-only `manager_response_eval_review_v1` release-example triage,
  conversation-to-decision drafts,
  timezone-safe/idempotent brief scheduling, response-quality policy,
  readiness-bound event/project action proposals, provider-context sensitivity
  projection, profile-over-memory source precedence, knowledge freshness and
  conflict projection, explicit review-before-save conversational memory,
  novice-safe code-owned business coaching, evidence-reconciled goal measurement, global
  explainable pressure ranking, exact-message feedback, and owner-reviewed
  response release gates in `src/manager/`
- **Band operations:** tenant-safe events, editable custom run-of-show
  checkpoints, availability, readiness/day-of projections, songs/setlists,
  projects, deal documents, invoices, expenses, and settlements in
  `src/operations/`
- **Telegram registration:** `telegram-registration.service.ts`, `telegram-webhook.controller.ts` (`POST /integrations/telegram/webhook`), token issuance on `POST /workflow/telegram/registration-token`
- Global **`CsrfOriginGuard`** (OAuth + Telegram webhook paths excluded for POST)

Further responsibilities remain product-driven (more adapters, richer tests, etc.).

**Validation:** venue and contact PATCH bodies use strict Zod schemas
(`venue-patch.schema.ts`, `contact-patch.schema.ts`). Commands use
`execute-command.schema.ts` for `POST /commands/execute`.

## Packages

### `packages/shared`

Cross-app domain contracts, validation schemas, and shared types (including **workflow notify prefs** and **Telegram notify** Zod schemas). **`pnpm test`** runs `build` + `node:test` on `test/*.mjs`.

### `packages/ui`

Reusable React UI components intended for the web app.

## Prisma

`prisma/schema.prisma` defines the PostgreSQL model. Notable models include
**`Operator`**, **`Artist`**, **`ArtistMembership`**, manager runs/messages and
**`ManagerMessageFeedback`**, reviewable **`ManagerDecision`** outcomes,
**`WorkflowNotification`**,
**`TelegramUrgentDedupe`**, and **`TelegramRegistrationToken`**.

Generated client is under `apps/api/src/generated/prisma/` (**gitignored**); run **`pnpm db:generate`** after clone or schema change.

## Scripts

- `scripts/preflight.mjs` — infra smoke
- `scripts/audit-artist-references.mjs` — read-only tenant relationship diagnostic

## Tests

- **`packages/shared/test/`** — Node test runner (e.g. Telegram Zod helpers)
- **`apps/api/test/`** — compiled API regressions (the API package **`test`** script runs **`nest build`** first, then `node --test`)

## Tooling docs

- `.cursor/rules/storyboard.md`: project principles (Cursor)
- `.cursor/plans/storyboard-master-plan.md`: historical roadmap (prefer README + **docs/codex-handoff.md** for “what exists now”)
- **`docs/codex-handoff.md`**: handoff for Codex or any agent

## Import Boundaries

- `apps/web` may import from `packages/shared` and `packages/ui`
- `apps/api` may import from `packages/shared`
- `packages/shared` must not depend on app packages
- `packages/ui` should remain presentation-focused and not depend on API code
