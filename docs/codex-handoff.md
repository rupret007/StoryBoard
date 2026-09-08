# StoryBoard — agent handoff (Codex / Cursor / others)

This document orients an autonomous coding agent so work continues without losing context. **Authoritative run instructions** remain in [`developer-runbook.md`](developer-runbook.md) and the root [`README.md`](../README.md); use the [`documentation index`](README.md) to find narrower references.

## Product and remote

- **Product name:** StoryBoard (use everywhere; not a codename).
- **Public repo:** [https://github.com/rupret007/StoryBoard](https://github.com/rupret007/StoryBoard)
- **Stack:** pnpm monorepo — `apps/web` (Next.js 16), `apps/api` (NestJS 11 + Fastify), `packages/shared`, `packages/ui`; PostgreSQL 16 + Redis 7; Prisma 7; BullMQ.

## Delivery state (what already exists)

### Phone booking-stage navigation

Below 640px, Booking shows one stage at a time with a **View booking stage**
picker and recorded per-stage/total counts. First open selects the first
populated stage in pipeline order; an empty selected stage says where the
remaining deals can be found. The full board stays available on wider screens.
Switching stages hides columns without unmounting their editors, preserving
open stage reviews and unsaved choices. A successful Create or reviewed stage
save selects the destination stage so its card remains reachable on a phone.
An unavailable pipeline does not display made-up zero counts; an empty viewer
board directs the user to an owner/member instead of a hidden Create form.
Long unbroken booking titles and review labels wrap within the available
width, retaining their full text. The phone regression includes such a title
while retaining an open stage review, with no write from navigation.

This is navigation and presentation on the existing booking board. No API,
schema, provider, auth, or send change; Travis books / NEVER_AUTO_POST. The
fixture browser journey covers empty and populated boards, stage counts,
no-write review retention, 320/390px fit, and the desktop board; existing
confirmation/viewer journeys cover saved-card visibility and read-only access.
Parked #21 remains untouched. Marker:
`OVERNIGHT_FREELANE_STORYBOARD_20260908_0056`.

### Booking pipeline card target date

Every opportunity card on the Booking pipeline board now shows its recorded
target/show date in an explicitly UTC calendar label, and flags a passed target
date (`"Target date passed"`) when the deal is still open (stages `target`,
`outreach`, `conversation`, `offer`, `hold`) so a slipping window is visible
while scanning momentum. A `confirmed` or `closed` deal shows the date without
the flag — the show already happened or the pipeline history is done. Comparison
is by UTC calendar day, matching the target date shown in the stage-change
review, so a show later the same day is never called "passed". Pure helper
`describeBookingTarget` in `packages/shared/src/booking-target.ts`
(`booking_target_v1`); rendered in
`apps/web/src/app/(app)/booking/booking-client.tsx`
(`data-testid="booking-target-<id>"`). Presentational plus one pure helper — no
change to the opportunity risk engine, Manager evals, schema, API, provider, or
send path. Parked #21 untouched; Travis still books. Marker:
`OVERNIGHT_CLAUDE_STORYBOARD_20260907_1906`.

### Running-order version-review difference line

The setlist compare-and-set review ("Compare before continuing") now names, in
plain language, how the open draft differs from the latest saved version: which
fields changed (name, status, set notes), the net item count change, and how
many overlapping running-order positions differ. It is a factual,
position-based description — no semantic reorder detection, no merge, no write.
Choosing keep/discard is unchanged; the line only makes that choice better
informed so a reviewer is less likely to discard a bandmate's save by mistake.
Pure helper `describeSetlistDraftDifference` in
`packages/shared/src/setlist-draft.ts`; rendered in
`apps/web/src/app/(app)/operations/setlist-builder.tsx`
(`data-testid="setlist-version-difference"`). Parked #21 untouched; no provider,
send, schema, or dependency change. Marker:
`OVERNIGHT_CLAUDE_STORYBOARD_20260907_0944`.

### Unsaved running-order reload guard

Dirty setlist editors attach a native reload/close warning; save, revert, or
unmount removes that editor's listener. Cancelling reload retains the in-page
draft. This is a best-effort browser prompt, not autosave: mobile process kills
and client-side navigation are not covered. Existing tab retention and version
review remain unchanged. Parked #21 stays held; no provider or send changes.

### 2026-09-06: reviewed booking stage changes

The existing Booking pipeline offers only legal next stages and separates
selection, review, and **Save reviewed stage**. The review shows the recorded
opportunity title, venue, target date in explicitly labelled UTC, fee, and
conditions. Missing facts stay missing. Confirmation creates an internal gig
only when none is linked; independently advanced gig details are preserved.
Closing an opportunity does not cancel its gig. Travis books; no provider call,
contract, payment, pitch, or message is prepared or sent by this workflow.

The stage endpoint requires the reviewed opportunity's `expectedUpdatedAt`.
Version/transition checks, conditional update, any new gig, and audit records
commit in one serializable transaction. Stale changes and serialization races
return conflict; an uncertain response requires a read and another explicit
review before retrying. The open card keeps the selected stage through that
process, including repeated conflicts. These are in-page drafts, not persisted
autosave. Pipeline reads and writes are pinned to one verified band; viewer and
unverified access have no mutation controls.

Files: `packages/shared/src/booking-stage-review.ts`, the booking stage API,
`apps/web/src/app/(app)/booking/booking-stage-editor.tsx`, and focused unit,
disposable-database, and Chromium coverage. Parked #21 and existing send fences
are unchanged. Marker: `BOB_NEW_SESSION_FREELANE_20260906_2216`.

Local validation: typecheck/lint; 84 shared and 299 API unit tests; seven
PostgreSQL 15.18 integration workflows, including competing stage writes and
rollback on audit failure; both production builds; 28 Chromium journeys with
`CI=true` / `TZ=UTC`; and 99/99 Manager checks at 100% safety. Tests used
synthetic data, a disposable localhost database/Redis, and disabled live
providers. Exact-tip hosted Quality remains the PostgreSQL 16/container-smoke
receipt; consult the draft PR for that result.

### 2026-09-04: recoverable running-order drafts

This product slice preserves unfinished setlists across Operations tab switches,
background refreshes, and save failures. A newly saved version appears alongside
the local draft for explicit whole-version review; keeping or discarding the
draft never writes until a separate **Save running order**. A later competing
save is still refused. Status, order, song timing, transition cues, provenance,
and show links remain on the existing screen; no new customer page or store.

Implementation: `packages/shared/src/setlist-draft.ts` and its focused tests;
`apps/web/src/app/(app)/operations/setlist-builder.tsx`; the parent retains the
same band's last complete music snapshot on failed refresh and keys editors by
setlist ID, not version. Operations resolves one band before its data reads and
pins review/save and catalog preview/apply to that band. The in-page **Retry
workspace** keeps drafts through a failed loader result; 15-second read/save
deadlines release a stalled editor without pretending the write did not arrive.
The music grid fits a phone, and command/integration tools remain below the
content on smaller screens so they cannot cover the comparison. The #30 action-first show-control layer is
unchanged. Parked #21 stays untouched; Travis still books; no provider call,
auto-pitch, merge, deploy, tag, release, schema, or dependency change.

Local proof: typecheck/lint, 83 shared + 295 API unit tests, 5 integration
workflows, 24 Chromium journeys, both production builds (21 web routes), and
99/99 Manager checks at 100% safety. This session created disposable localhost
PostgreSQL 15.18 and Redis 7.4.11 solely for synthetic test data; the older notes
below about unavailable local PostgreSQL describe earlier sessions. Hosted
Quality at the draft tip is the PostgreSQL 16 and container-smoke authority;
consult the PR for its exact tip/run receipt, not an earlier main run.

Remaining boundary: drafts exist only in the open Operations page, not after a
full reload, closing the page, leaving Operations, or changing bands. Nothing
claims autosave or cross-device recovery. Do not replace this version-bound
review with a prop-based version update or an automatic retry; backend item IDs
are replaced on save, so index/ID-based automatic merging would be misleading.

Phases referenced in **README** / **docs** reflect what was built (the file [`.cursor/plans/storyboard-master-plan.md`](../.cursor/plans/storyboard-master-plan.md) is an **older roadmap**; trust the README phase bullets and this list for “current” scope).

| Area | Status |
|------|--------|
| Scaffold, infra, Prisma, migrations | Done |
| Venues, contacts, booking opportunities, tasks | Done |
| Booking profile, one-market prospecting, prospect conversion | Done |
| Approval-gated pitch campaigns + linked follow-up tasks | Done |
| Market sprints + approval-gated immediate campaign delivery | Done |
| Bounded adaptive booking advisor (optional OpenAI; review-only) | Done |
| Tracked Gmail campaign replies + approval-gated negotiation drafts | Done; deployment-gated pending restricted-scope compliance. Apply-terms (`booking_terms_apply_v1`) keeps recorded opportunity fees/conditions when analysis fields are null. Inbox and pipeline cards name the next recorded Travis action and never auto-pitch. |
| Cross-functional Manager intake, goals, memory, briefs, chat, recommendations | Core shipped; executable idempotent 90-day starter plans, recoverable bounded conversation history with thread-safe switching, structured currentness-checked follow-ups and tenant-grounded named-record resolution, intent-aware fallback, strict evidence rejection, editable structured band/lineup context with transparent coverage questions, six-area operating-evidence calibration that prevents missing/stale records from sounding complete, dependency-aware ready-now versus waiting work sequencing, code-owned goal→initiative→task→prerequisite paths that prevent orphan work, explicit minimum/cap/exact target semantics without invented linear forecasts, linked member task ownership, voluntary append-only capacity check-ins, and bounded team-load/assignment review, global explainable pressure ranking before response limits, code-owned profile-over-memory source precedence and freshness/conflict assessment, evidence-reconciled goal measurements with explicit member sync, explicit review-before-save conversational memory, novice-safe code-owned business coaching with personalized learning prompts, evidence-ranked blocked/deferred/waiting follow-through, owner-opted timezone-aware daily/weekly briefs with deterministic-default delivery, exact-response helpful/correction feedback plus conservative immediate-turn natural verdicts, reviewed conversational profile capture, source-bound shared-task creation, existing-task follow-through, direct assignment, atomic project-plus-plan creation, timezone-safe event/initial-lineup creation, reviewed one-member event availability, and code-owned confirmed-gig Calendar/Drive approval preparation with no provider call on acceptance; refresh-safe thread summaries, side-effect-free per-operator answer review, owner response-eval triage, owner finished-recommendation outcome review, natural-response guardrails, evidence-backed 90-day post-show/outcome review, scheduled option→choice→expected-result→immutable-review decisions, reviewed recommendation and exact-answer learning/cooldowns, sensitivity-enforced provider context, correctable non-profile memory, append-only goal progress, evidence-calibrated plan health, and owner-run offline eval gate. `manager_follow_through_v1` now reconciles accepted work to authoritative Tasks, Decisions, Projects, Events, current role-visible memory, and Approvals; returns durable destinations when applicable; repairs stale conversation outcomes after reload; gives actionless advice a reviewed handled path; and quarantines failed, simulated, or uncertain provider execution. Note-backed Manager reconciliation can close only simulated or typed-but-orphaned receipts. A linked failed or uncertain Approval routes to append-only evidence in the Approval Center; no-effect evidence permits a separate newly reviewed request, while external-effect evidence keeps linked Manager work blocked for manual repair. Explicit memory capture is classified and redacted before provider routing or storage, role-sensitive conversation reads re-apply the current memory boundary, and Manager/Task/Decision lifecycle audits commit atomically with their state changes. |
| Manager brief presentation | Done; cache-only preferred-cadence SSR plus deliberate daily/weekly switching; explicit member/owner Refresh generates; Today, This week, Decisions, Waiting, and Risks all render from the same structured run |
| Manager response adaptation | Done; `manager_response_adaptation_v1` applies reviewed correction categories to deterministic and provider-backed presentation without consuming raw notes or expanding facts, actions, tools, or authority |
| Events, availability, show advance, songs/setlists, projects | Done; structured operations workspace, actionable gig editor, phone day-of view with `ops_live_run_v1` (recorded live-set cursor, assigned running order, after-show wrap-up after the recorded start, IANA checkpoint times, https-only operator links) plus editable custom run-of-show checkpoints, practical ordered setlist/song editing, shared `setlist_summary_v1` timing truth, version-bound setlist saves that refuse a stale editor before replacing the running order, `ops_after_show_v1` dedicated version-bound wrap-up writes (`POST /events/:id/after-show` + `expectedUpdatedAt`; event PATCH cannot overwrite attendance/revenue/notes/outcome), navigate-only recorded-wrap-up → draft-settlement handoff that never auto-completes the gig or invents net, `ops_next_action_v1` next-step links on existing event/setlist/money cards, and the action-first `ops_show_control_v1` layer on Band operations. Its one prominent navigate-only action appears before compact, non-interactive show/set/booking evidence and names the code-owned source of the priority; direct overdue-show routing still wins before stale pre-show or future-show readiness gaps. The setlist compare-and-set, item replacement, and audit commit in one serializable transaction; the web editor surfaces the conflict and preserves the newer server copy. Evidence-backed show-readiness scoring, event-bound Calendar/Drive state with explicit approval preparation, and dry-run-default Vault/Show Night catalog import (`pnpm catalog:import` / `POST /songs/import`) remain intact. Default seed dry-runs the checked-in `app_api.json` shape and still leaves the song table empty unless `VAULT_CATALOG_APPLY=true`; `SEED_DEMO_OPS` is optional generic practice data, not a live catalog. Parked PR #21 (dashboard show/set/booking feel) stays untouched. |
| Release/content/tour/business execution | Done; idempotent dated milestone templates, owners/status, metrics/assets/budget, derived readiness, focused workspace, and Manager integration shipped |
| Offers, reviewed templates, PDF snapshots, invoices/manual payments, settlements | Internal workflow done; Travis still books the gig. Invoice PATCH and payments fail-closed (payment-derived status, voided invoices immutable). Invoice create can link a show so deposit readiness sees the payment. Voided invoice rows refuse Record. Manual payment retries reuse one idempotency key. One settlement per event; the Deals form creates a draft and will not reselect an event that already has a settlement. Concurrent finalize is serialized and freezes event expenses. Manager chat does not pay invoices, void them, settle shows, or apply booking terms. |
| One-command local container bundle | Done (Docker Compose v2; internal server fetches and host-visible auth links are separated and verified; allocate 2 GB) |
| Approvals + execution (Gmail drafts, calendar holds, drive folder) | Done; event logistics uses source-keyed preparation, one-shot execution claims, stale event checks, persisted provider references, and Manager outcome reconciliation. `approval_lifecycle_v2` groups its lifecycle stages into six work-queue buckets: pending decisions, approved-ready execution, fresh `execution_in_progress` claims, stale unknown/failed outcomes, conclusive reconciliation history, and approved non-executable records across the work queue, shell, dashboard, Manager, summaries, and digests. A fresh claim has a one-hour lease, is not attention or reconcilable, and becomes `execution_unknown` only if still unfinished when the lease expires. Real Google calls use a 30-second request timeout; Gmail draft/send batches are capped at 25. `approval_reconciliation_v1` stores immutable provider checks without mutating or rerunning the original Approval. Viewers read history; members/owners may append it; no retry path is exposed. Approval event notifications deep-link to this current state but remain historical until read. |
| Command bar + `POST /commands/execute` (NL + structured intents) | Done |
| Operator auth (Google OIDC), session cookie, memberships (`owner` / `member` / `viewer`) | Done |
| Invites, onboarding, Team UI, CSRF `Origin`/`Referer` guard | Done |
| Per-artist Google integration (encrypted), adapter registry | Done |
| Workflow jobs: invites, approval notify, digests, overdue/stale scans | Done |
| Notifications page, prefs, escalation thresholds | Done |
| Telegram **outbound** urgent alerts + operational intelligence (`GET /dashboard/insights`) | Done (5A) |
| Telegram **inbound** `/start` registration webhook + `TelegramRegistrationToken` | Done (5B) |
| Current product gate | 2026-09-04 recoverable running-order drafts: root typecheck/lint; 83/83 shared tests; 295/295 API unit tests; 5/5 disposable database integration workflows; 24/24 Chromium journeys; both production builds (21 web routes); 99/99 `manager_evals_v44` at 100% safety. Browser coverage includes repeated competing saves, no-write review choices, tab/background-refresh retention, interrupted/stalled requests, loader-failure retry, phone layout, and band-pinned catalog import. The #30 one-primary-action browser assertion still passes. Hosted Quality on the exact draft tip remains the PostgreSQL 16 and container-smoke authority. |
| Tests | 2026-09-04 after-show wrap-up handoff: Prisma generate; root typecheck/lint; 61/61 shared tests; 295/295 API unit tests; both production builds; 99/99 `manager_evals_v44` at 100% safety. Local Docker/Postgres unavailable; hosted Quality #29 is the real integration, Chromium, and container-smoke suite. The unchanged lockfile's `pnpm audit --prod` currently reports 4 low, 46 moderate, and 32 high advisories (0 critical), including direct Fastify and transitive Nest/Prisma paths; remediation needs a dedicated pinned-dependency update, not an unreviewed product-PR version change. 2026-09-03 day-of live run leftover+security: Prisma generate; root typecheck/lint; 54/54 shared tests; 293/293 API unit tests; both production builds; 99/99 `manager_evals_v44` at 100% safety. Local Chromium/e2e/integration not run in this environment (no Docker). Hosted Quality is the real suite. 2026-09-03 operations show-control: Prisma generate; root typecheck/lint; 47/47 shared tests; 291/291 API unit tests; both production builds; 99/99 `manager_evals_v44` at 100% safety. Local Chromium/e2e/integration not run in this environment (no Docker). 2026-09-03 leftover ops next-action: Prisma generate; root typecheck/lint; 34/34 shared tests; 291/291 API unit tests; both production builds; 99/99 `manager_evals_v44` at 100% safety. Local Chromium/e2e/integration not run in this environment (no Docker). 2026-08-23 Show Night/Vault bind honesty: Prisma generation; root typecheck/lint; 25/25 shared tests; 269/269 API unit tests; both production builds; 98/98 `manager_evals_v44` checks at 100% safety. Last full hosted package (2026-07-13) also recorded 5/5 Postgres workflows across all 40 migrations; catalog import added song/setlist `sourceKey` (41 migrations after apply). 15/15 Chromium journeys; no Prisma schema drift; no relationship-integrity violations (plus one expected non-fatal skip on older DB snapshots without `ApprovalReconciliation`); and rebuilt Compose health, readiness, Dev-login session, and authenticated-Dashboard smoke. The suites emit one tracked, non-fatal `pg@8.14.1` concurrent-query deprecation warning. |

The final web role audit fails mutation affordances closed as well as relying on
the API boundary: viewers can read Manager and Band operations records without
seeing active edit controls, unverified access cannot mutate, and only owners
see agreement-template administration. Campaign load failure and the
25-recipient boundary are explicit; campaign-row locking enforces that cap
across concurrent additions and approval preparation. Fresh provider execution is presented as
in progress rather than success, and the mobile navigation drawer supports
current-page announcements, initial focus, trapped Tab navigation, Escape,
focus return, background scroll locking, and automatic cleanup when the
viewport crosses into the desktop layout.

Current memory safety policy is `manager_memory_capture_v3`: it scans complete
inputs and known credential-token shapes before truncation, binds every new
proposal to the exact persisted source turn, uses opaque SHA-256 fact identifiers, and
fails closed for legacy unbound proposals. Conversation and answer-review reads
re-apply current role/sensitivity visibility. New memory audit metadata omits
the key; Activity and weekly-summary read projections remove historical
memory-key fields without changing immutable audit rows. For mixed approval
batches, a fresh attempted provider write remains in progress and read-only;
after its one-hour lease, a write without a final result remains uncertain and
read-only even if a sibling request has a known failure state. Existing
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
action. Failed approvals and stale one-shot claims instead use append-only
`ApprovalReconciliation` evidence. A fresh claim cannot be reconciled;
`still_unknown` keeps live attention open after reconciliation becomes valid;
either conclusive outcome closes that attention without changing the Approval.
No-effect permits only a separate newly reviewed request. External-effect
evidence blocks duplicate work and keeps linked Manager follow-through blocked
for manual repair; it is not a recovered provider success response.

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
| Band operations | `apps/api/src/operations/` (including `event-logistics.ts`), `apps/web/src/app/(app)/operations/`, `packages/shared/src/catalog-import.ts`, `scripts/import-catalog.mjs`, [`catalog-import.md`](catalog-import.md), [`APPS.md`](../APPS.md) |
| Approval lifecycle | `apps/api/src/approvals/approval-lifecycle.ts`, `apps/api/src/approvals/approval-reconciliation.ts`, `apps/api/src/approvals/approvals.service.ts`, `apps/web/src/app/(app)/approvals/`, `prisma/migrations/20260714030000_approval_reconciliation_receipts/` |
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

1. **Apply a real local Vault catalog (operator machine):** Vault import is the
   documented default song path (`pnpm catalog:import`, dry-run then `--apply`).
   Default planning consumes Vault's published
   `setlist_ready_default_import` / `default_live` slice (20 ids on live
   schema 3). An empty published slice stays empty.
   Jeff can apply a private `data/app_api.json` StoryBoard feed (and optionally
   Show Night `content/show.json`) on his machine. `data/master_catalog.json`
   is the Vault spine and is rejected as an import file. Do not
   commit those files, do not fetch them over the network, do not invent a
   fourth live band, and do not auto-pitch Travis (he books). StoryLiner and
   WebJam stay out of this repo.
2. **Database client warning:** Trace the concurrent-`client.query()`
   deprecation emitted by `pg@8.14.1` during integration/browser execution and
   remove it before considering `pg@9`; do not change transaction semantics to
   silence the warning.
3. **Product validation:** Run scheduled/on-demand Manager briefs, plan health,
   conversation, show advance, reviewed event-logistics approvals, and manual
   deal/settlement workflows with real original and cover bands. Confirm the
   chosen local cadence is useful rather than noisy; verify Calendar/Drive results
   against a real connected Google account before production use, capture reviewed
   examples when recommendations are useful, wrong, or missing context, and do
   not tune from synthetic scores alone.
4. **Learning validation:** Review real band context, responsibilities, workload
   and task-sequence questions, operating-evidence questions, novice coaching
   questions, knowledge-refresh questions, explicit conversational memory
   proposals, natural answer verdicts, reviewed context answers, reviewed
   shared-task creation, update, assignment, and durable follow-through with
   working bands; compare expected results with observed show/project/business
   facts. Add or adjust code-owned policies only from reviewed operator
   evidence, never from a synthetic score alone; do not infer causality from one
   result or auto-activate a version. `manager_os_v33` / `manager_evals_v44` is
   the current code-registered contract.
5. **Connected delivery:** Add binary Drive/Gmail document delivery only after
   real provider acceptance testing. Keep external work approval-gated; do not add
   scraping, general inbox access, or autonomous sends.
6. **Runtime/tests:** Define queue-worker deployment, broader cursor
   pagination/query limits, and metrics before horizontal scale. Add mobile/offline
   resilience only after real day-of field testing.
7. **Hosted CI health:** Before product work, confirm the current `main`
   [Quality workflow](https://github.com/rupret007/StoryBoard/actions/workflows/quality.yml)
   is green. The current browser fixtures use the recorded IANA timezone and
   pass with `CI=true` and `TZ=UTC`; keep those invariants when adding event
   journeys. Treat runner-action upgrades as dedicated CI maintenance rather
   than mixing them into product behavior.

## Cursor-only artifacts

`.cursor/rules/`, `.cursor/commands/`, `.cursor/plans/` are editor helpers; Codex may ignore them. **Docs under `docs/` and this file** are tool-agnostic.
