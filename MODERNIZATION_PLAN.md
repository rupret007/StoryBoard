# StoryBoard Modernization Plan

Last reviewed: 2026-07-11
Baseline: `main` at `31d2121`

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
- [ ] Assess routing, setlists, contracts, settlement, and deeper
  private/corporate intake only with validated operator demand. Do not add
  scraping, lead brokers, payments, contracts, or auto-send without a product
  decision and deployment requirements.

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
