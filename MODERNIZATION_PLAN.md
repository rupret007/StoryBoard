# StoryBoard Modernization Plan

Last reviewed: 2026-07-12
Baseline for this round: `main` at `582699f`

## Product and current architecture

StoryBoard is an operator-facing management system for bands and artists. It
combines venue and contact CRM, booking opportunities, tasks, approvals,
workflow notifications, and constrained external integrations. The pnpm
monorepo contains a Next.js web app, NestJS/Fastify API, Prisma/PostgreSQL data
model, Redis/BullMQ automation, shared Zod contracts, and reusable UI
components.

Preserve the API-only write boundary, per-artist membership roles, audit trail,
approval-gated provider side effects, encrypted integration credentials, and
mock-safe provider adapters.

## Priorities

### P0 — security and tenant integrity

- [x] Prevent cross-artist references when contacts link to venues, booking
  opportunities link to venues, and tasks link to opportunities. Validate input
  at the HTTP boundary and re-check the related record in the domain service on
  create and update. Return a generic not-found result for inaccessible IDs.
- [x] Bind the operator Google OAuth callback to the browser that initiated the
  flow with a short-lived, single-use, HttpOnly `SameSite=Lax` state cookie.
- [x] Replace the API placeholder test with regression coverage for tenant
  isolation and request schemas. OAuth coverage remains with the OAuth task.

### P1 — reliable delivery verification

- [x] Add an opt-in integration suite that only accepts
  `STORYBOARD_TEST_DATABASE_URL`; it must never use `DATABASE_URL`.
- [x] Add CI for Prisma generation, type checking, linting, tests, and builds
  on Node 22 and pnpm 10.
- [x] Verify registration binding, role enforcement, and audit writes against
  the explicit test database.

### P0 — booking acquisition (completed 2026-07-10)

- [x] Add a forward-only booking profile/prospect model. Profiles support
  incomplete drafts but must contain a home market, genre, capacity range, and
  pitch before conversion or campaigns.
- [x] Add artist-scoped venue, festival, private-event, and corporate-event
  prospects with audited, tenant-safe relationship links and Ticketmaster
  provider-reference deduplication.
- [x] Implement one-city-at-a-time Find shows. Ticketmaster returns bounded,
  normalized venue/event signals when configured; absent or failed provider
  calls return explicit manual mode with no generated leads.
- [x] Convert qualified prospects atomically and idempotently. Only physical
  venue prospects create `Venue` rows; private/corporate/festival prospects
  create venue-less target opportunities and optional buyer contacts.
- [x] Add approval-gated pitch campaigns with a strict template-variable
  allowlist, recipient state machine, recipient previews, and Gmail draft-only
  execution. Successful execution creates one linked, editable follow-up task
  per recipient (seven days by default), without automatic stage changes.
- [x] Remove Bandsintown market/competitor venue derivation. It is now limited
  to artist-owned event context; stored venue ranking remains CRM-only.
- [x] Add Find shows and Pitch campaigns responsive workspaces and surface due
  campaign follow-ups in dashboard priority actions.

### P1 — release confidence (completed 2026-07-10)

- [x] Add a Chromium Playwright booking workflow test and make `pnpm test:e2e`
  self-contained: it requires the explicit test database URL, applies only
  forward migrations, builds current production artifacts, and starts isolated
  API/web servers with dev authentication and mock-safe providers.
- [x] Correct browser-facing API integration defects exposed by that test:
  explicit 302 redirects for login/callback responses and a CORS preflight
  policy that permits the API's PUT/PATCH/DELETE mutations.
- [x] Add a safe unauthenticated `GET /ready` dependency probe. It reports
  boolean database/Redis/worker state without configuration or credentials and
  returns 503 while database or Redis is unavailable.

### P0 — booking market sprints and approved delivery (completed 2026-07-11)

- [x] Add tenant-safe market sprints that connect city-focused prospects and campaigns, with funnel counts and overdue follow-ups.
- [x] Add explicit campaign delivery modes. Existing campaigns retain draft-only behavior; a send-on-execution campaign remains approval-gated and sends only after a separate Execute action.
- [x] Persist per-recipient delivery state and create follow-up work only after a successful send. Unknown delivery results are not retried automatically.
- [x] Complete browser coverage, documentation, and final release validation.

### P1 — bounded adaptive booking advisor (completed 2026-07-11)

- [x] Add an opt-in, structured booking advisor that is useful without external
  credentials and never mutates data or sends messages.
- [x] Persist aggregate facts, prompt version, advice, and explicit
  helpful/not-helpful feedback so subsequent advice can improve from outcomes.
- [x] Complete UI/browser validation and final release checks.

### P1 — tracked booking replies and negotiation assistance (completed 2026-07-11)

- [x] Persist Gmail thread identity for approved campaign drafts and sends, then poll only those known threads through an owner-enabled, deployment-gated integration.
- [x] Add the Booking inbox with bounded reply metadata, manual synchronization, periodic BullMQ checks, reconnect status, outcome review, and tenant-safe audit events.
- [x] Add explicit per-artist AI email-analysis consent. Full message bodies are fetched transiently for a selected reply; only structured analysis, confidence, and proposed deal facts are retained.
- [x] Require members to apply extracted terms explicitly and route threaded reply drafts through the existing approval center. No reply is automatically sent and no opportunity stage changes automatically.
- [ ] Enable in production only after Google restricted-scope verification, security/privacy review, and real Gmail acceptance testing. `GMAIL_REPLY_SYNC_ENABLED` remains false by default.

### P0 — Manager brain and guided operating system (completed 2026-07-11)

- [x] Add a guided, novice-safe Manager intake for original, cover/event, and
  hybrid bands, with operating profile, separate band-member roster, durable
  goals/initiatives/decisions, confirmed memory with provenance, and settings.
- [x] Add deterministic daily/weekly briefs and optional structured Responses
  API reasoning through one explicit read-only snapshot function, with a
  balanced manager model, known-record evidence filtering, redacted local
  traces, token/latency metadata, prompt/model versions, and safe fallback.
- [x] Add conversational explanation and typed recommendation outcomes. The
  code-owned action policy permits only low-risk internal work directly;
  provider, legal, financial, unknown, and irreversible actions cannot bypass
  roles or Approvals.
- [x] Add versioned original/cover/hybrid golden scenarios and regressions for
  strict intake, unsupported facts, adversarial text, action authorization,
  tenant isolation, and acceptance behavior.
- [x] Ship the Manager workspace and preserve the booking-advisor API for
  compatibility.
- [ ] Production scheduling of briefs remains deployment-dependent; the API
  stores owner settings but no new scheduler is enabled in this round.

### P0 — Coherent, grounded Manager conversation (completed 2026-07-12)

- [x] Replace the generic deterministic chat reply with intent-aware answers for
  priorities, live readiness, booking, lineup/availability, and money. Keep the
  result useful when OpenAI is disabled or unavailable.
- [x] Expand the bounded manager snapshot to pending approvals, unread tracked
  booking replies, campaign follow-ups, qualified prospects, and draft
  settlements without expanding Gmail access beyond StoryBoard-owned threads.
- [x] Persist and resume a tenant-scoped conversation, supply the current
  question plus at most 12 recent messages to the reasoning path, and expose
  bounded read endpoints for the workspace.
- [x] Fix Responses API continuation so the final response retains the actual
  operator request as well as the function result. Reject the entire generated
  brief/chat result when any evidence ID is unknown or an action is outside the
  code allowlist; use deterministic fallback instead.
- [x] Let chat prepare at most one reviewable internal-task recommendation via
  the existing recommendation acceptance path. Keep email, calendar, Drive,
  legal, financial, publishing, and irreversible actions in Approvals.
- [x] Replace the single-answer chat card with a persistent thread, quick
  starting questions, natural message flow, reload recovery, and inline task
  acceptance. Correct the fast-follow-up input race found by Playwright.
- [x] Collect structured usefulness/dismissal reasons, suppress stale/repeated
  recommendations with bounded cooldowns, and attribute completed tasks back to
  their accepted recommendation.
- [x] Add a confirm/correct/archive memory UI with normal memory available to
  members and sensitive/restricted memory remaining owner-controlled.
- [x] Add owner-reviewed, tenant-scoped eval promotion. Stored examples contain
  the recommendation and outcome snapshot, not raw provider data, conversation
  history, or the full manager input. Promotion never activates a prompt or
  policy version automatically.
- [x] Add deterministic goal/initiative plan health with an explainable score,
  per-goal evidence, measurement/deadline gaps, blockers, and linked task state.
- [x] Add append-only, tenant-safe, audited goal progress events. Numeric
  progress stays explicit; completed recommendation tasks contribute through
  their linked initiative without inventing a numeric goal increment.
- [x] Add an owner-triggered offline evaluation runner over versioned golden
  scenarios (currently eleven) plus owner-reviewed examples. Candidate versions are code-allowlisted,
  unresolved same-version revision labels fail the run, results are persisted,
  and there is no automatic activation endpoint.
- [x] Make guided intake deliver the promised executable 90-day plan: two
  editable band-mode goals, linked initiatives, and six dated first actions.
  Stable nullable source keys make fill-missing generation idempotent without
  replacing user edits or intentional status changes.
- [x] Prefer the next existing linked plan task in briefs instead of proposing
  duplicate generic work. Flag unassigned owners and progress behind elapsed
  timeline in plan health, and support task-owner editing in the Tasks UI.
- [x] Invalidate briefs created before completed intake and synchronize Manager
  client state after server refresh. Reset only the explicit E2E database so
  first-use intake remains a real regression path.

### P0 — Reviewed response quality and bounded learning (completed 2026-07-12)

- [x] Link each delivered Manager answer to the exact `ManagerRun` that
  produced it and persist one tenant-scoped, per-operator helpful/correction
  verdict without duplicating conversation content.
- [x] Accept a strict correction taxonomy plus an optional human note. Feed only
  aggregate reasons—not raw notes—into a small code-owned presentation mapping;
  feedback cannot add tools, change risk, or expand authority.
- [x] Add a deterministic natural-response gate for configured length,
  excessive formatting, canned assistant openings, implementation/meta
  language, and unverified claims of completed external actions. Failed model
  output falls back to the grounded deterministic answer.
- [x] Promote the reviewed policy to `manager_os_v4` / `manager_evals_v3` with
  explicit natural-voice, meta/action-claim rejection, and feedback-guidance
  checks. No version activates itself.
- [x] Expose response feedback in the Manager conversation and 90-day learning
  summary; preserve viewer read-only rules, member mutation permissions, audit
  history, and tenant isolation.
- [x] Clean-room the design from Andrea_NanoBot's exact-response feedback and
  outcome-led learning concepts; no source code, runtime, database, or broad
  assistant authority is imported.

### P0 — Shared show-readiness intelligence (completed 2026-07-12)

- [x] Replace disconnected show-status heuristics with one deterministic,
  tenant-scoped policy over active lineup, schedule, contacts, deal/payment,
  advance, setlist, and production records.
- [x] Make every result explainable with category scores, premise-coverage
  confidence, source record IDs, date-aware severity, and a concrete first
  action. A missing date or unavailable performer blocks readiness.
- [x] Expose bounded read APIs for one show or the next 1–365 days and render
  the same signal in Band operations, including direct generation of a missing
  advance checklist.
- [x] Make the readiness diagnosis actionable in the event card: record every
  active member's availability and edit artist-owned venue/contact/setlist,
  location, ordered show-day timing, money, production notes, and technical
  links without leaving the workflow.
- [x] Validate partial event schedule edits against the merged saved record so
  impossible load-in/soundcheck/doors/set/curfew ordering cannot be introduced
  by changing a single field.
- [x] Feed the shared signal into Manager briefs and conversation so the model
  and deterministic fallback cannot create competing readiness opinions.
- [x] Add a derived day-of operating view with current/next timing, open and
  overdue work, lineup state, contacts, setlist/production facts, and recorded
  fee/deposit/payment/balance state. Keep it evidence-backed and non-persistent.
- [x] Ship the phone-oriented `/operations/events/:id` workspace with explicit
  availability and task completion actions, and let Manager prioritize the
  same day-of signal only inside the 24-hour show window.
- [x] Add deterministic regressions for incomplete records, urgency,
  unavailable-performer blocking, confidence, evidence, and a fully recorded
  ready show. No migration or provider access is required.

### P0 — Events, projects, music, and internal deal operations (completed 2026-07-11)

- [x] Add the artist-scoped `BandEvent` spine, participants/availability,
  logistics, idempotent booking-confirmation conversion, show advance offsets,
  and approval preparation for Calendar and Drive folders.
- [x] Add songs, setlists, release/content/tour/business projects, versioned
  offers/memos, owner-reviewed document templates, agreement PDF snapshots,
  invoices, idempotent manual payments, expenses, settlements, and member
  splits using integer minor units.
- [x] Add a responsive Band operations workspace and feed upcoming event
  readiness, overdue invoice, and overdue project risks into dashboard actions.
  The workspace covers owner-reviewed templates, agreement generation,
  invoices/manual payments, expenses, and settlement finalization as well as
  offers.
- [x] Extend the disposable-database suite for intake memory, event
  idempotency, availability, advance generation, payment replay, settlement
  calculations, immutable PDF snapshots, audit rows, and cross-artist rejection.
- [x] Extend production-mode Chromium coverage through Manager intake/chat,
  event/song/release-project/offer creation, reviewed agreement generation,
  invoice/deposit recording, event expense, and settlement PDF finalization.
- [ ] Direct PDF upload/attachment to Drive/Gmail remains an adapter package:
  current delivery creates a reviewed Gmail draft referencing the immutable
  snapshot, and requires the human to attach it. Do not claim automatic
  attachment until binary Drive upload and Gmail attachment adapters pass real
  provider acceptance tests.
- [ ] Rich schedule-item editing, project budget line-item UI,
  technician public setlist pages, and evidence-file upload are follow-on UX
  packages; their underlying event/project/document boundaries are in place.

### P0 — Executable release and project management (completed 2026-07-12)

- [x] Reuse artist-scoped Tasks as project milestones and permit tenant-checked
  nullable `projectId` links through the task API; do not create a competing
  milestone authority.
- [x] Add `project_plan_v1` release, content campaign, tour, and business
  templates dated backward from the project's real target date. Stable source
  keys make generation idempotent without overwriting user work.
- [x] Derive explainable readiness from date, milestone completion/ownership,
  overdue/blocked work, metrics, assets, budget/spend, expenses, and events.
- [x] Ship a focused project workspace for milestone owners/status, project
  facts, success metrics, budget, and working asset links.
- [x] Feed the same project readiness and next milestone into Manager briefs
  and release/project conversation; unsupported project outcomes remain unknown.
- [x] Cover tailored templates, risk classification, foreign project-link
  rejection, generation replay, audits, browser execution, and Manager grounding.

### P2 — requires deployment or product decisions

- [x] Add a one-command, production-built local container bundle with
  Postgres, Redis, migrations, seed, API, and web. It intentionally preserves
  the current single API/worker topology.
- [ ] Define a separate queue-worker deployment and runtime metrics before
  horizontally scaling the API.
- [ ] Add cursor pagination and query limits to high-volume list endpoints once
  expected data volumes and API compatibility requirements are agreed. The
  existing list responses are arrays; changing them to envelopes is a public
  interface decision and should be coordinated with API consumers.
- [ ] Assess routing optimization, provider-backed payments/signatures,
  merchandise, royalties, and deeper private/corporate intake only with
  validated operator demand. Do not add scraping, lead brokers, or auto-send.

### P1 — responsive manager workspace (completed 2026-07-11)

- [x] Replace the phone-width persistent sidebar with an accessible navigation drawer and touch-sized controls.
- [x] Add a guided empty-workspace dashboard path that takes a new manager from booking profile to lead to reviewed pitch.

## Release checks

Run `pnpm db:generate`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and
`pnpm build`. Run database integration tests only with a disposable database
identified by `STORYBOARD_TEST_DATABASE_URL`.

Before release, run a read-only diagnostic for historical relationships whose
artist IDs disagree. Do not repair or delete such data automatically.

## Progress log

- 2026-07-12: Added forward migration
  `20260713010000_manager_response_feedback` and Manager policy
  `manager_os_v4`. Every delivered chat answer now links to its run and accepts
  audited, idempotent, tenant-safe helpful/correction feedback. Only aggregate
  correction reasons influence bounded presentation guidance; free-text notes
  never become prompt instructions. A deterministic response-quality gate
  rejects canned/meta language, excessive presentation, and fabricated claims
  of outside action. Validation passed 59 API tests, all three 22-migration
  database workflows, three production Chromium workflows including helpful
  and correction feedback, and the 11/11 offline Manager gate. The design uses
  Andrea_NanoBot's outcome-led feedback concepts as a clean-room reference; no
  code or broader autonomy was imported. The full typecheck/lint/test/build
  gate, Compose validation, and expanded relationship audit also pass with zero
  cross-artist mismatches.
- 2026-07-12: Added executable project management without a new milestone
  table. `project_plan_v1` generates type-specific, source-keyed Task sequences;
  project readiness explains progress, ownership, blockers, metrics, assets,
  and budget/spend; the focused workspace and Manager consume the same signal.
  Validation passed 56 API tests, all three database workflows, and all three
  production Chromium workflows including release generation, assignment,
  completion, assets/budget/metrics, and grounded Manager reporting. No schema
  migration or provider access was required.
- 2026-07-12: Added the deterministic `EventDayOfView`, tenant-safe
  `GET /events/:id/day-of`, phone-oriented show workspace, and Manager 24-hour
  day-of prioritization. The view identifies the next checkpoint, work and
  lineup pressure, contacts, setlist/production references, and recorded money
  without inventing missing facts. Validation passed 53 API tests, all three
  database workflows, and all three production Chromium workflows including
  day-of rendering and audited advance-task completion. No migration or
  provider access was required.
- 2026-07-12: Completed the actionable gig-readiness loop. Band operations now
  edits lineup responses and the show facts used by the shared readiness
  policy; service-layer validation preserves tenant ownership and the complete
  show-day timeline across partial patches. Validation passed 51 API tests,
  all three database workflows, and three Chromium workflows including event
  editing, score improvement, advance generation, and Manager reporting the
  same evidence-backed score. Repeated local builds may require the documented
  4 GB Node heap fallback; changing test emission to SWC was rejected because
  it breaks Node ESM discovery of compiled CommonJS named exports. No migration
  or provider access was required.
- 2026-07-12: Added shared, deterministic show-readiness intelligence across
  lineup, schedule, contacts, deal/payment, advance, and performance records.
  The new tenant-scoped APIs, Band operations card, Manager brief/chat signal,
  confidence/evidence model, and direct advance-checklist action use one
  code-owned policy. Validation passed 50 API tests, all three 21-migration
  database workflows, three production Chromium workflows including readiness
  and advance generation, the full quality gate, 8/8 offline Manager evals,
  Compose configuration, and the relationship audit with zero mismatches.
- 2026-07-12: Added migration `20260712223000_manager_executable_plan` and
  `manager_plan_v1`. Guided setup now creates an executable, editable 90-day
  plan with two mode-specific goals, two initiatives, and six dated tasks.
  Nullable tenant-unique source keys make fill-missing generation idempotent;
  plan health flags owner and timeline risk, Tasks supports real owner
  assignment, and briefs advance existing linked work instead of duplicating
  it. Production Chromium testing exposed and fixed stale post-intake client
  state and a pre-intake brief cache. The E2E runner now resets only its
  explicit test database and covers clean intake, immediate plan visibility,
  idempotent refill, natural plan explanation, and owner assignment. Validation
  passed 48 API tests, all three 21-migration database workflows, all three
  clean production Chromium workflows, the 8/8 offline Manager gate, the full
  type/lint/build gate, and the relationship audit with zero mismatches. A
  fresh isolated Compose stack also passed migration, seed, API/worker
  readiness, dev login, intake, exact 2/2/6 plan creation, and Manager SSR;
  its temporary volumes were removed.

- 2026-07-12: Added migration `20260712210000_manager_plan_health_evals`.
  Goal progress is now a serializable, append-only, audited event with
  tenant-bound ownership; plan health deterministically explains scores from
  measurements, deadlines, linked initiatives, blocked/overdue work, and task
  state. Added the owner-only persisted evaluation gate plus database-free
  `pnpm manager:eval`; the current eight golden scenarios pass with 100% safety
  checks, while unresolved same-version `needs_revision` examples block a run.
  Validation passed 45 API tests, all three 20-migration database workflows,
  three production Chromium workflows, the full quality gate, and the expanded
  relationship audit with zero mismatches. A fresh isolated Compose stack also
  passed migration, seed, API/worker readiness, web rendering, dev login, and
  `/manager` on alternate ports; its volumes were removed afterward.

- 2026-07-12: Added forward migrations
  `20260712183000_manager_learning_loop` and
  `20260712193000_manager_reviewed_evals`. Manager prompt/policy version
  `manager_os_v3` now records structured outcomes, makes acceptance
  transactionally single-use, attributes completed tasks, suppresses repeated
  stable keys for fixed cooldowns, exposes 90-day learning metrics, and lets
  bands correct/archive confirmed memory. Owners can promote a decided
  recommendation into a bounded local eval set; runtime code never changes the
  active prompt or policy. Validation passed 42 API tests, all three
  19-migration database workflows, and all three production Chromium workflows.
  The isolated container smoke exposed and fixed server-rendered web requests
  incorrectly preferring the browser's localhost API URL; Compose now supplies
  `INTERNAL_API_URL=http://api:4000`. Fresh migrations, seed, API/worker
  readiness, web rendering, dev login, and `/manager` all passed on alternate
  ports before the isolated volumes were removed.

- 2026-07-12: Shipped Manager prompt/policy version `manager_os_v2` with
  persistent bounded conversation, intent-aware deterministic reasoning,
  broader workflow signals, strict whole-output evidence rejection, and
  reviewable chat task proposals. Added eight golden scenarios, deterministic
  behavior tests, Responses continuation regression coverage, database checks
  for multi-turn persistence/tenant isolation, and production-mode Playwright
  coverage for two turns plus reload. Validation passed 37 API tests, all three
  database workflows, and all three Chromium workflows. No schema migration was
  required.

- 2026-07-11: Added migration `20260711203445_manager_os_rounds`, the guided
  cross-functional Manager workspace, code-owned AI action policy, memory
  provenance, evidence-filtered briefs/chat, Manager traces, and versioned
  scenario tests. Added the unified event/show spine, availability, advance
  tasks, songs/setlists, projects, deal history, reviewed templates, immutable
  PDF snapshots, invoices/manual payments, and settlements. All 17 migrations
  and three integration workflows passed against dedicated
  `storyboard_manager_test`; unit coverage passed 32 API tests.
- 2026-07-11: Container smoke initially exposed API TypeScript/Prisma heap
  pressure on a small Docker Desktop VM. The Docker context was reduced from
  192 MB to under 400 KB, full type safety remains in the quality gate, and the
  API image now uses Nest's SWC emitter for the already-checked source. An
  isolated production bundle passed migrations, seed, API/worker readiness,
  web health, and dev login on alternate ports before its volumes were removed.

- 2026-07-11: Added the tracked campaign-reply and negotiation loop with migration `20260711193709_booking_reply_loop`. The implementation retains only bounded reply metadata and derived AI facts, preserves general-inbox isolation, requires owner opt-in and Google reconnection, and keeps drafted responses approval-gated. Added unit coverage for scope gating, reply deduplication, raw-body non-persistence, provider failure isolation, and disabled-by-default configuration.

- 2026-07-10: Created after verifying that the older Cursor master plan is
  historical and that no root modernization plan existed. The local worktree
  was cloned cleanly from `main`; no remote history has been changed.
- 2026-07-10: Added strict booking, task, and contact request schemas; added
  service-level tenant ownership checks for Contact → Venue,
  BookingOpportunity → Venue, and Task → BookingOpportunity. Added compiled
  API regression tests and the read-only `pnpm db:audit-relationships` release
  diagnostic. API typecheck, lint, and tests pass.
- 2026-07-10: Added signed, single-use operator OAuth state cookies and callback
  regression tests. Added an explicit, test-only database integration suite for
  tenant links, role enforcement, Telegram registration binding, and audit rows;
  added Node 22/pnpm 10 GitHub Actions quality checks.
- 2026-07-10: Ran the integration suite against an isolated, fresh
  `storyboard_test` Postgres database and verified the relationship diagnostic
  reports zero mismatches. Unit tests intentionally exclude the opt-in
  integration directory so `pnpm test` never requires a database.
- 2026-07-10: Final validation passed: `pnpm typecheck`, `pnpm lint`,
  `pnpm test`, and `pnpm build`; the CI workflow YAML and Git diff whitespace
  checks also passed. The temporary test database container was removed.
- 2026-07-10: Independently researched GitHub references for the requested
  next rounds. SongDrive and Setlyst validate later setlist demand but do not
  fit this stack; ChordSheetJS is GPL and was excluded. No external code was
  copied. Ticketmaster Discovery was selected for city-first venue/event
  signals; Bandsintown is kept only for the artist's own events.
- 2026-07-10: Added migrations `20260710174910_booking_acquisition` and
  `20260710180946_booking_campaign_approval_relation`; implemented booking
  profiles, prospects, conversion, campaigns, approval execution follow-ups,
  dashboard actions, strict shared schemas, and responsive web workspaces.
  Unit coverage now includes profile/template validation, manual mode,
  Ticketmaster normalization, source dedupe, and tenant rejection. The opt-in
  database suite covers private/venue conversion, campaign approval execution,
  recipient outcomes, generated follow-up tasks, and audit rows.
- 2026-07-10: Validation passed against a fresh dedicated `storyboard_test`
  database: migrations, `pnpm test:integration`, full `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, and `pnpm build`. The read-only relationship audit
  was extended to all new relationships and reported zero mismatches on the
  local validation database.
- 2026-07-10: Added and executed Chromium browser coverage for the complete
  manual booking-acquisition path. The flow found and fixed Fastify's implicit
  200 redirect behavior and missing non-POST CORS preflight methods. The
  opt-in runner now builds production artifacts before testing and test/report
  artifacts are ignored. Added `/ready` with focused unit coverage; it is safe
  for infrastructure probes and does not disclose secrets.
- 2026-07-10: Final release-confidence validation passed: `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, `pnpm build`, `git diff --check`, the opt-in
  Postgres integration suite, the Chromium production-mode workflow, and the
  read-only relationship audit (zero mismatches). The CI browser job uses the
  same explicit Postgres/Redis/mock-provider setup; it has not been dispatched
  from this uncommitted worktree.
- 2026-07-11: Added the self-managed-band market-sprint workflow and a
  forward-only migration for sprint links and per-recipient campaign delivery
  records. Campaigns can preserve draft-only execution or use immediate send on
  a separate approved Execute action. Successful sends create follow-up work;
  failed or unknown deliveries are retained and never auto-retried. Validation
  passed for unit, database integration, Chromium browser, build, and expanded
  relationship-audit coverage.
- 2026-07-11: Added a bounded Booking advisor with a forward-only migration.
  It persists aggregate booking facts, structured advice, prompt version, and
  per-operator helpful/not-helpful feedback. The default path is deterministic;
  the optional OpenAI path is aggregate-only, structured, non-persistent at the
  provider, and falls back safely on error. It has no mutation, inbox-reading,
  or outbound-action capability. Validation passed for unit, explicit-database
  integration, Chromium advisor UI, the full quality gate, and relationship
  diagnostic (zero mismatches).
- 2026-07-11: Added a separate production-built local container bundle with
  API/web Dockerfiles, Compose migrations and seed, persisted Postgres/Redis,
  local dev login, and a production override template. Repository quality gates
  pass. End-to-end Compose startup still requires a Docker Compose v2 host with
  at least 2 GB allocated to Docker; the current machine lacks Compose v2 and
  its daemon kills the compiler below that threshold.
- 2026-07-11: Release hardening corrected Prisma 7 seeding, the documented
  local `dev@localhost` seed identity, and the isolated browser test cookie
  domain. Added advisor full-context and environment validation regressions,
  plus a required Compose startup smoke job on every pull request. Full unit,
  integration, Chromium, production-build, relationship-audit, and Compose
  configuration checks pass locally.
