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
| Cross-functional Manager intake, goals, memory, briefs, chat, recommendations | Done; executable idempotent 90-day starter plans, recoverable bounded conversation history with thread-safe switching, structured currentness-checked follow-ups and tenant-grounded named-record resolution, intent-aware fallback, strict evidence rejection, editable structured band/lineup context with transparent coverage questions, six-area operating-evidence calibration that prevents missing/stale records from sounding complete, dependency-aware ready-now versus waiting work sequencing, code-owned goal→initiative→task→prerequisite paths that prevent orphan work, explicit minimum/cap/exact target semantics without invented linear forecasts, linked member task ownership, voluntary append-only capacity check-ins, and bounded team-load/assignment review, global explainable pressure ranking before response limits, code-owned profile-over-memory source precedence and freshness/conflict assessment, evidence-reconciled goal measurements with explicit member sync, explicit review-before-save conversational memory, novice-safe code-owned business coaching with personalized learning prompts, evidence-ranked blocked/deferred/waiting follow-through, owner-opted timezone-aware daily/weekly briefs with deterministic-default delivery, exact-response helpful/correction feedback plus conservative immediate-turn natural verdicts, reviewed conversational profile capture, source-bound shared-task creation, existing-task follow-through, direct assignment, atomic project-plus-plan creation, timezone-safe event/initial-lineup creation, reviewed one-member event availability, and code-owned confirmed-gig Calendar/Drive approval preparation with no provider call on acceptance; refresh-safe thread summaries, side-effect-free per-operator answer review, owner response-eval triage, owner finished-recommendation outcome review, natural-response guardrails, evidence-backed 90-day post-show/outcome review, scheduled option→choice→expected-result→immutable-review decisions, reviewed recommendation and exact-answer learning/cooldowns, sensitivity-enforced provider context, correctable non-profile memory, append-only goal progress, evidence-calibrated plan health, and owner-run offline eval gate |
| Manager brief presentation | Done; preferred-cadence SSR plus deliberate daily/weekly switching; Today, This week, Decisions, Waiting, and Risks all render from the same structured run |
| Manager response adaptation | Done; `manager_response_adaptation_v1` applies reviewed correction categories to deterministic and provider-backed presentation without consuming raw notes or expanding facts, actions, tools, or authority |
| Events, availability, show advance, songs/setlists, projects | Done; structured operations workspace, actionable gig editor, phone day-of view with editable custom run-of-show checkpoints, practical ordered setlist/song editing, shared `setlist_summary_v1` timing truth, evidence-backed show-readiness scoring, and event-bound Calendar/Drive state with explicit approval preparation shipped |
| Release/content/tour/business execution | Done; idempotent dated milestone templates, owners/status, metrics/assets/budget, derived readiness, focused workspace, and Manager integration shipped |
| Offers, reviewed templates, PDF snapshots, invoices/manual payments, settlements | Internal workflow done; binary Drive/Gmail attachment and provider payment/signature adapters deferred |
| One-command local container bundle | Done (Docker Compose v2; internal web→API service URL verified; allocate 2 GB) |
| Approvals + execution (Gmail drafts, calendar holds, drive folder) | Done; event logistics uses source-keyed preparation, one-shot execution claims, stale event checks, persisted provider references, and Manager outcome reconciliation |
| Command bar + `POST /commands/execute` (NL + structured intents) | Done |
| Operator auth (Google OIDC), session cookie, memberships (`owner` / `member` / `viewer`) | Done |
| Invites, onboarding, Team UI, CSRF `Origin`/`Referer` guard | Done |
| Per-artist Google integration (encrypted), adapter registry | Done |
| Workflow jobs: invites, approval notify, digests, overdue/stale scans | Done |
| Notifications page, prefs, escalation thresholds | Done |
| Telegram **outbound** urgent alerts + operational intelligence (`GET /dashboard/insights`) | Done (5A) |
| Telegram **inbound** `/start` registration webhook + `TelegramRegistrationToken` | Done (5B) |
| Tests | Compiled `node:test` contains 163 API cases plus 10 shared cases, including `event_logistics_v1` fingerprint, source-key, confirmed-gig eligibility, reviewed rejection/simulation replacement, ambiguous-failure quarantine, stale-event policy, parallel Calendar/Drive completion, one-shot approval execution, confirmed-versus-hold Calendar bodies, active-artist-only Bandsintown context, IANA-zone conversion, and daylight-saving gap/overlap coverage. All 3 opt-in Postgres workflows pass across 38 forward migrations and cover tenant links, role/audit boundaries, Manager workflows, event/project/deal operations, and provider-safe approval execution. All 12 focused Chromium journeys pass from a reset explicit test database; the cases establish their own prerequisites and cover booking, Manager, operations, finance, tasks, and confirmed gig → Calendar/Drive approval preparation → human approve/execute with mock adapters → visibly simulated event references. The offline `manager_os_v32` / `manager_evals_v35` gate passes all 70 golden checks at 100% safety. The relationship diagnostic reports no integrity issues, and the production container bundle passes migrations, seed, database/Redis/worker readiness, web HTTP, and local-session smoke. |

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
| Band operations | `apps/api/src/operations/` (including `event-logistics.ts`), `apps/web/src/app/(app)/operations/` |
| Approval lifecycle | `apps/api/src/approvals/approvals.service.ts`, `apps/web/src/app/(app)/approvals/` |
| Web app API client | `apps/web/src/lib/api.ts` (cookies + `x-artist-id`) |

## Environment (short list)

Copy [`.env.example`](../.env.example) to `.env`. Required for API boot are `DATABASE_URL`, `REDIS_URL`, and `SESSION_SECRET`; `WEB_URL` defaults to `http://localhost:3000`. **Telegram (optional):** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_REGISTRATION_TTL_MINUTES`, `TELEGRAM_WEBHOOK_SECRET`. Full table: [`telegram-alerts.md`](telegram-alerts.md), validation: `apps/api/src/config/env.validation.ts`.

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

1. **Product validation:** Run scheduled/on-demand Manager briefs, plan health, conversation, show advance, reviewed event-logistics approvals, and manual deal/settlement workflows with real original and cover bands. Confirm the chosen local cadence is useful rather than noisy; verify Calendar/Drive results against a real connected Google account before production use, capture reviewed examples when recommendations are useful, wrong, or missing context, and do not tune from synthetic scores alone.
2. **Learning validation:** Review real band context, responsibilities, workload and task-sequence questions, operating-evidence questions, novice coaching questions, knowledge-refresh questions, explicit conversational memory proposals, natural answer verdicts, reviewed context answers, reviewed shared-task creation, update, and assignment requests, grounded short follow-ups, named-record questions and collisions, goal-measurement source choices and drift, goal target directions/finality, goal-to-action paths, competing-priority ordering, commitments, decisions, and accepted show/project setup and event-availability actions with working bands; compare expected results with observed show/project/business facts. Add or adjust role vocabulary, coaching concepts, measurement kinds, `manager_priority_v1` weights, `manager_work_sequence_v1` ordering, `manager_goal_path_v1` path rules, `manager_goal_target_v1` semantics, `manager_conversation_continuity_v1` phrases/identity rules, `manager_natural_feedback_v1` phrase families, `manager_context_capture_v1` field parsers, `manager_task_capture_v1` carrier/date rules, `manager_task_update_v1` carrier/operation rules, `manager_task_assignment_v1` carrier/name/availability rules, `manager_project_capture_v1` carrier/type/date rules, `manager_event_capture_v1` carrier/type/timezone rules, `manager_event_availability_v1` carrier/member/event/response rules, `manager_subject_reference_v1` matching rules, `manager_plan_health_v2` states, `manager_evidence_v1` review windows, or `manager_knowledge_v1` review windows only from reviewed operator evidence, never from a synthetic score alone; do not infer causality from one result or auto-activate a version. `manager_os_v32` is the current code-registered version.
3. **Connected delivery:** Add binary Drive/Gmail document delivery only after real provider acceptance testing. Keep external work approval-gated; do not add scraping, general inbox access, or autonomous sends.
4. **Runtime/tests:** Define queue-worker deployment, cursor pagination/query limits, and metrics before horizontal scale. Add mobile/offline resilience only after real day-of field testing.
5. **Hosted CI health:** GitHub run `29226338604` confirmed container smoke and
   every static, unit, evaluation, database, and build gate. Its browser stage
   exposed one test-fixture assumption about the runner's UTC timezone. Event
   inputs now use the recorded IANA timezone, the saved outcome is verified
   before navigation, and all 12 focused cases pass from a reset database with
   `CI=true` and `TZ=UTC` under the unchanged 30-second per-test default.
   GitHub also warns that
   `actions/checkout@v4` targets deprecated Node 20; update that action in a
   dedicated CI-maintenance change rather than mixing it into product work.

## Cursor-only artifacts

`.cursor/rules/`, `.cursor/commands/`, `.cursor/plans/` are editor helpers; Codex may ignore them. **Docs under `docs/` and this file** are tool-agnostic.
