# StoryBoard — agent handoff (Codex / Cursor / others)

This document orients an autonomous coding agent so work continues without losing context. **Authoritative run instructions** remain in [`developer-runbook.md`](developer-runbook.md) and the root [`README.md`](../README.md); use the [`documentation index`](README.md) to find narrower references.

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
| Cross-functional Manager intake, goals, memory, briefs, chat, recommendations | Core shipped; executable idempotent 90-day starter plans, recoverable bounded conversation history with thread-safe switching, structured currentness-checked follow-ups and tenant-grounded named-record resolution, intent-aware fallback, strict evidence rejection, editable structured band/lineup context with transparent coverage questions, six-area operating-evidence calibration that prevents missing/stale records from sounding complete, dependency-aware ready-now versus waiting work sequencing, code-owned goal→initiative→task→prerequisite paths that prevent orphan work, explicit minimum/cap/exact target semantics without invented linear forecasts, linked member task ownership, voluntary append-only capacity check-ins, and bounded team-load/assignment review, global explainable pressure ranking before response limits, code-owned profile-over-memory source precedence and freshness/conflict assessment, evidence-reconciled goal measurements with explicit member sync, explicit review-before-save conversational memory, novice-safe code-owned business coaching with personalized learning prompts, evidence-ranked blocked/deferred/waiting follow-through, owner-opted timezone-aware daily/weekly briefs with deterministic-default delivery, exact-response helpful/correction feedback plus conservative immediate-turn natural verdicts, reviewed conversational profile capture, source-bound shared-task creation, existing-task follow-through, direct assignment, atomic project-plus-plan creation, timezone-safe event/initial-lineup creation, reviewed one-member event availability, and code-owned confirmed-gig Calendar/Drive approval preparation with no provider call on acceptance; refresh-safe thread summaries, side-effect-free per-operator answer review, owner response-eval triage, owner finished-recommendation outcome review, natural-response guardrails, evidence-backed 90-day post-show/outcome review, scheduled option→choice→expected-result→immutable-review decisions, reviewed recommendation and exact-answer learning/cooldowns, sensitivity-enforced provider context, correctable non-profile memory, append-only goal progress, evidence-calibrated plan health, and owner-run offline eval gate. `manager_follow_through_v1` now reconciles accepted work to authoritative Tasks, Decisions, Projects, Events, current role-visible memory, and Approvals; returns durable destinations when applicable; repairs stale conversation outcomes after reload; gives actionless advice a reviewed handled path; and quarantines failed, simulated, or uncertain provider execution. Note-backed reconciliation can close a failed, simulated, or orphaned receipt without claiming provider success; uncertain attempted execution remains read-only. Explicit memory capture is classified and redacted before provider routing or storage, role-sensitive conversation reads re-apply the current memory boundary, and Manager/Task/Decision lifecycle audits commit atomically with their state changes. Current API, database, browser, relationship, eval, build, and rebuilt-container validation passes. |
| Manager brief presentation | Done; preferred-cadence SSR plus deliberate daily/weekly switching; Today, This week, Decisions, Waiting, and Risks all render from the same structured run |
| Manager response adaptation | Done; `manager_response_adaptation_v1` applies reviewed correction categories to deterministic and provider-backed presentation without consuming raw notes or expanding facts, actions, tools, or authority |
| Events, availability, show advance, songs/setlists, projects | Done; structured operations workspace, actionable gig editor, phone day-of view with editable custom run-of-show checkpoints, practical ordered setlist/song editing, shared `setlist_summary_v1` timing truth, evidence-backed show-readiness scoring, and event-bound Calendar/Drive state with explicit approval preparation shipped |
| Release/content/tour/business execution | Done; idempotent dated milestone templates, owners/status, metrics/assets/budget, derived readiness, focused workspace, and Manager integration shipped |
| Offers, reviewed templates, PDF snapshots, invoices/manual payments, settlements | Internal workflow done; binary Drive/Gmail attachment and provider payment/signature adapters deferred |
| One-command local container bundle | Done (Docker Compose v2; internal server fetches and host-visible auth links are separated and verified; allocate 2 GB) |
| Approvals + execution (Gmail drafts, calendar holds, drive folder) | Done; event logistics uses source-keyed preparation, one-shot execution claims, stale event checks, persisted provider references, and Manager outcome reconciliation |
| Command bar + `POST /commands/execute` (NL + structured intents) | Done |
| Operator auth (Google OIDC), session cookie, memberships (`owner` / `member` / `viewer`) | Done |
| Invites, onboarding, Team UI, CSRF `Origin`/`Referer` guard | Done |
| Per-artist Google integration (encrypted), adapter registry | Done |
| Workflow jobs: invites, approval notify, digests, overdue/stale scans | Done |
| Notifications page, prefs, escalation thresholds | Done |
| Telegram **outbound** urgent alerts + operational intelligence (`GET /dashboard/insights`) | Done (5A) |
| Telegram **inbound** `/start` registration webhook + `TelegramRegistrationToken` | Done (5B) |
| Tests | Compiled `node:test` passes 199/199 API tests across 194 top-level cases plus 10/10 shared cases, including relational Manager receipts and capability controls, hard-reload reconciliation, owner/member provider-context gating, durable/exact/legacy full-context turn projection including provider fallback, owner-only recommendation mutation/history/learning isolation, feedback authorization rechecks, exact-source memory visibility, rejection of archived/private memory re-acceptance with active-normal-only refresh, full-input credential rejection, historical audit-key projection, mixed provider-state quarantine, rejected/expired receipt behavior, transaction-bound recommendation audits, note-backed receipt closure, `event_logistics_v1` currentness, one-shot approval execution, active-artist-only Bandsintown context, IANA-zone conversion, and daylight-saving coverage. All 4 opt-in Postgres workflows pass across 39 forward migrations and cover tenant links, role/audit boundaries, Manager follow-through, durable message visibility, event/project/deal operations, and provider-safe approval execution. All 13 production-build Chromium journeys pass. The offline `manager_os_v33` / `manager_evals_v37` gate passes all 81 checks at 100% safety. The relationship diagnostic reports zero issues, and the rebuilt Compose bundle passes API/web health, API readiness, host-visible auth-link, and session-cookie smoke checks. |

Current memory safety policy is `manager_memory_capture_v3`: it scans complete
inputs and known credential-token shapes before truncation, binds every new
proposal to the exact persisted source turn, uses opaque SHA-256 fact identifiers, and
fails closed for legacy unbound proposals. Conversation and answer-review reads
re-apply current role/sensitivity visibility. New memory audit metadata omits
the key; Activity and weekly-summary read projections remove historical
memory-key fields without changing immutable audit rows. For mixed approval
batches, an attempted provider write without a final result remains uncertain
and read-only even if a sibling request has a known failure state. Existing
archived, sensitive, or restricted memory rejects conversational re-acceptance
for every role; only active normal memory can be refreshed outside the explicit
owner memory editor. Full sensitive provider context is owner-interactive-only;
shared/scheduled briefs stay redacted, and non-owners cannot read the exact
bound owner-only turn or mutate its recommendation by known ID. The initiating
and assistant `ManagerMessage` rows are durably marked `owner_only` before and
after provider work, including failure/rejected-output fallback. The forward
migration backfills historical trace-bound pairs, quarantines conversations
with unmatched legacy requests, and neutralizes empty legacy titles. Shared
deterministic reasoning, member learning summaries, and provider-redacted projections omit
private recommendation history and prose; an accepted shared target is
represented only by sanitized authoritative-record data. Feedback mutation
rechecks that visibility and the current memory boundary, while sanitized
receipts expose `canMutate=false` and `canReconcile=false`. Rejected
or expired approval receipts are terminal and offer no invalid reconciliation
action.

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

1. **Approval lifecycle visibility:** Count approved-ready work separately from pending decisions in the dashboard and shell, link approval notifications to `/approvals`, and expose failed or one-shot-claimed rows in a global **Needs reconciliation** section. Never add blind retry for an unknown provider outcome. Manager now distinguishes these states and permits note-backed receipt closure for failed, simulated, or orphaned work; an uncertain attempted provider result remains read-only, and the global dashboard and shell do not yet expose the distinction.
2. **Product validation:** Run scheduled/on-demand Manager briefs, plan health, conversation, show advance, reviewed event-logistics approvals, and manual deal/settlement workflows with real original and cover bands. Confirm the chosen local cadence is useful rather than noisy; verify Calendar/Drive results against a real connected Google account before production use, capture reviewed examples when recommendations are useful, wrong, or missing context, and do not tune from synthetic scores alone.
3. **Learning validation:** Review real band context, responsibilities, workload and task-sequence questions, operating-evidence questions, novice coaching questions, knowledge-refresh questions, explicit conversational memory proposals, natural answer verdicts, reviewed context answers, reviewed shared-task creation, update, assignment, and durable follow-through with working bands; compare expected results with observed show/project/business facts. Add or adjust code-owned policies only from reviewed operator evidence, never from a synthetic score alone; do not infer causality from one result or auto-activate a version. `manager_os_v33` / `manager_evals_v37` is the current code-registered contract.
4. **Connected delivery:** Add binary Drive/Gmail document delivery only after real provider acceptance testing. Keep external work approval-gated; do not add scraping, general inbox access, or autonomous sends.
5. **Runtime/tests:** Define queue-worker deployment, cursor pagination/query limits, and metrics before horizontal scale. Add mobile/offline resilience only after real day-of field testing.
6. **Hosted CI health:** Before product work, confirm the current `main`
   [Quality workflow](https://github.com/rupret007/StoryBoard/actions/workflows/quality.yml)
   is green. The current browser fixtures use the recorded IANA timezone and
   pass with `CI=true` and `TZ=UTC`; keep those invariants when adding event
   journeys. Treat runner-action upgrades as dedicated CI maintenance rather
   than mixing them into product behavior.

## Cursor-only artifacts

`.cursor/rules/`, `.cursor/commands/`, `.cursor/plans/` are editor helpers; Codex may ignore them. **Docs under `docs/` and this file** are tool-agnostic.
