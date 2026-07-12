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
| Booking profile, one-market prospecting, prospect conversion | Done |
| Approval-gated pitch campaigns + linked follow-up tasks | Done |
| Market sprints + approval-gated immediate campaign delivery | Done |
| Bounded adaptive booking advisor (optional OpenAI; review-only) | Done |
| Tracked Gmail campaign replies + approval-gated negotiation drafts | Done; deployment-gated pending restricted-scope compliance |
| Cross-functional Manager intake, goals, memory, briefs, chat, recommendations | Done; executable idempotent 90-day starter plans, recoverable bounded conversation history with thread-safe switching, structured currentness-checked follow-ups and tenant-grounded named-record resolution, intent-aware fallback, strict evidence rejection, editable structured band/lineup context with transparent coverage questions, six-area operating-evidence calibration that prevents missing/stale records from sounding complete, dependency-aware ready-now versus waiting work sequencing, code-owned goal→initiative→task→prerequisite paths that prevent orphan work, explicit minimum/cap/exact target semantics without invented linear forecasts, linked member task ownership, voluntary append-only capacity check-ins, and bounded team-load/assignment review, global explainable pressure ranking before response limits, code-owned profile-over-memory source precedence and freshness/conflict assessment, evidence-reconciled goal measurements with explicit member sync, explicit review-before-save conversational memory, novice-safe code-owned business coaching with personalized learning prompts, evidence-ranked blocked/deferred/waiting follow-through, owner-opted timezone-aware daily/weekly briefs with deterministic-default delivery, exact-response helpful/correction feedback plus side-effect-free per-operator review and owner eval-triage inboxes, natural-response guardrails, evidence-backed 90-day post-show/outcome review, scheduled option→choice→expected-result→immutable-review decisions, reviewed recommendation and exact-answer learning/cooldowns, sensitivity-enforced provider context, correctable non-profile memory, append-only goal progress, evidence-calibrated plan health, and owner-run offline eval gate |
| Events, availability, show advance, songs/setlists, projects | Done; structured operations workspace, actionable gig editor, phone day-of view with editable custom run-of-show checkpoints, and shared evidence-backed show-readiness scoring shipped |
| Release/content/tour/business execution | Done; idempotent dated milestone templates, owners/status, metrics/assets/budget, derived readiness, focused workspace, and Manager integration shipped |
| Offers, reviewed templates, PDF snapshots, invoices/manual payments, settlements | Internal workflow done; binary Drive/Gmail attachment and provider payment/signature adapters deferred |
| One-command local container bundle | Done (Docker Compose v2; internal web→API service URL verified; allocate 2 GB) |
| Approvals + execution (Gmail drafts, calendar holds, drive folder) | Done |
| Command bar + `POST /commands/execute` (NL + structured intents) | Done |
| Operator auth (Google OIDC), session cookie, memberships (`owner` / `member` / `viewer`) | Done |
| Invites, onboarding, Team UI, CSRF `Origin`/`Referer` guard | Done |
| Per-artist Google integration (encrypted), adapter registry | Done |
| Workflow jobs: invites, approval notify, digests, overdue/stale scans | Done |
| Notifications page, prefs, escalation thresholds | Done |
| Telegram **outbound** urgent alerts + operational intelligence (`GET /dashboard/insights`) | Done (5A) |
| Telegram **inbound** `/start` registration webhook + `TelegramRegistrationToken` | Done (5B) |
| Tests | Compiled `node:test` (113 API cases plus 2 shared cases) plus opt-in Postgres integration coverage for tenant links, task prerequisite idempotency/cycles/date order/completion guards, custom event schedule ownership/lifecycle, tenant-isolated operating evidence and persisted calibration traces, dependency-aware work sequencing, tenant-isolated goal paths, stale goal-path acceptance preflight, linked-task traces, minimum/cap/exact goal semantics and PATCH preservation, structured conversation continuity, bounded conversation summaries and cross-tenant history rejection, exact named-record subject resolution, per-operator answer-review selection/refill, owner-only eval triage/promotion, and provider bypass, linked task owners, capacity-check-in history/premise changes, and Manager assignment acceptance, Manager intake/plans, goal reconciliation, explicit memory, code-owned coaching/provider bypass, cadence, context and knowledge integrity, priorities and commitments, decisions and outcomes, feedback/evals, event/project setup, booking campaigns, payments, settlements, roles, Telegram binding, and audits. Chromium e2e resets the explicit test database and covers booking acquisition plus first-use Manager intake → context and operating-evidence review → new conversation → round-trip thread switching → capacity check-ins → team-load review → role-grounded task assignment and grounded “why?” follow-up → goal reconciliation and cap finality → personalized learning prompt → plain-language coaching → grounded conversation → review-inbox rating/refill → owner eval promotion → memory/decisions → task prerequisite creation → goal-to-next-work review → ready/waiting sequence review → commitment follow-through → gig/run-of-show/project operations → exact invoice balance selection → deal/invoice/settlement → outcome review. The offline `manager_os_v22` / `manager_evals_v24` gate has 48 golden checks plus local owner-reviewed recommendation and response examples, including structured follow-up explanation/currentness/clarification, pronoun-action refusal, exact show/invoice selection, ambiguous-name clarification, lumpy-goal forecast refusal, provisional budget caps, exact-target deadline misses, goal-path reuse/orphan prevention, prerequisite-aware ordering, stale booking calibration, missing-money honesty, direct evidence explanation, saved custom checkpoint grounding, current capacity, unavailable-member exclusion, unique versus ambiguous team assignment, novice settlement coaching, deal-structure comparison, unknown-topic clarification, safe-memory confirmation/refusal, goal and knowledge integrity, pressure ranking, exact internal action selection, decision/outcome grounding, naturalness, false-action rejection, and provider-context sensitivity. |

## Non-goals to preserve (unless product changes)

- Do not replace the stack.
- Do not build a general Telegram command bot or approvals-from-Telegram.
- Keep **mock fallbacks** when integrations are unset.
- Keep **owner-only** rules for escalation, Telegram settings, and registration-token issuance.
- Keep mutations **auditable** (`AuditService`).
- Gmail reads are limited to StoryBoard-created campaign threads; do not expand this into general inbox access.

## High-value entry points

| Task | Start here |
|------|------------|
| Auth / roles | `apps/api/src/auth/`, `role-policy.service.ts`, `session-auth.guard.ts` |
| Workflow + queue | `apps/api/src/workflow-automation/`, `apps/api/src/queue/storyboard-queue.service.ts` |
| Telegram outbound | `workflow-telegram.service.ts`, `urgent-channel.constants.ts` |
| Telegram inbound | `telegram-registration.service.ts`, `telegram-webhook.controller.ts`, `telegram-start-parse.ts` |
| Notifications API | `workflow-settings.controller.ts`, `workflow-notifications.controller.ts` |
| Prisma schema | `prisma/schema.prisma` (client output: `apps/api/src/generated/prisma/` — **gitignored**; run `pnpm db:generate`) |
| Booking acquisition | `apps/api/src/booking/booking-{profiles,prospects,campaigns}.*`, `apps/web/src/app/(app)/{prospects,booking-campaigns}/` |
| Booking advisor | `apps/api/src/advisor/`, `apps/web/src/app/(app)/advisor/` |
| Booking reply loop | `apps/api/src/booking/booking-replies.*`, `apps/web/src/app/(app)/booking-inbox/` |
| Manager OS | `apps/api/src/manager/`, `apps/web/src/app/(app)/manager/`, `apps/api/test/fixtures/manager-evals-v1.json` |
| Band operations | `apps/api/src/operations/`, `apps/web/src/app/(app)/operations/` |
| Web app API client | `apps/web/src/lib/api.ts` (cookies + `x-artist-id`) |

## Environment (short list)

Copy [`.env.example`](../.env.example) to `.env`. Required for API boot include `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `WEB_URL`. **Telegram (optional):** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_REGISTRATION_TTL_MINUTES`, `TELEGRAM_WEBHOOK_SECRET`. Full table: [`telegram-alerts.md`](telegram-alerts.md), validation: `apps/api/src/config/env.validation.ts`.

## Quality gate (before merge)

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm manager:eval
```

With Postgres up: `pnpm db:migrate` after schema changes; always `pnpm db:generate` when `schema.prisma` changes.

## Suggested next work (not committed; pick with the user)

1. **Product validation:** Run scheduled/on-demand Manager briefs, plan health, conversation, show advance, and manual deal/settlement workflows with real original and cover bands. Confirm the chosen local cadence is useful rather than noisy; capture reviewed examples when recommendations are useful, wrong, or missing context, and do not tune from synthetic scores alone.
2. **Learning validation:** Review real band context, responsibilities, workload and task-sequence questions, operating-evidence questions, novice coaching questions, knowledge-refresh questions, explicit conversational memory proposals, grounded short follow-ups, named-record questions and collisions, goal-measurement source choices and drift, goal target directions/finality, goal-to-action paths, competing-priority ordering, commitments, decisions, and accepted show/project setup actions with working bands; compare expected results with observed show/project/business facts. Add or adjust role vocabulary, coaching concepts, measurement kinds, `manager_priority_v1` weights, `manager_work_sequence_v1` ordering, `manager_goal_path_v1` path rules, `manager_goal_target_v1` semantics, `manager_conversation_continuity_v1` phrases/identity rules, `manager_subject_reference_v1` matching rules, `manager_plan_health_v2` states, `manager_evidence_v1` review windows, or `manager_knowledge_v1` review windows only from reviewed operator evidence, never from a synthetic score alone; do not infer causality from one result or auto-activate a version. `manager_os_v22` is the current code-registered version.
3. **Connected delivery:** Add binary Drive/Gmail document delivery only after real provider acceptance testing. Keep external work approval-gated; do not add scraping, general inbox access, or autonomous sends.
4. **Runtime/tests:** Define queue-worker deployment, cursor pagination/query limits, and metrics before horizontal scale. Add mobile/offline resilience only after real day-of field testing.

## Cursor-only artifacts

`.cursor/rules/`, `.cursor/commands/`, `.cursor/plans/` are editor helpers; Codex may ignore them. **Docs under `docs/` and this file** are tool-agnostic.
