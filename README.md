# StoryBoard

StoryBoard is an AI-assisted operating system for bands and artists. It is
designed to reflect how real band management works: venue relationships, booking
workflow, scheduling, release coordination, approvals, show operations, and
business follow-through.

## Locked Stack

- `pnpm` workspace monorepo (Node `22.22.x`, pnpm `10.x`)
- `apps/web`: Next.js `16.2.x`, React `19`, TypeScript, Tailwind CSS `4.2.x`
- `apps/api`: NestJS `11.1.18`, TypeScript, Fastify
- `packages/shared`: shared types, contracts, and Zod schemas (CommonJS `dist` for the API)
- `packages/ui`: reusable React UI primitives
- PostgreSQL `16` as the source of truth
- Redis `7` for queues and coordination
- Prisma ORM `7.6.0` (`prisma.config.ts` + driver adapter in API when you wire Prisma)
- BullMQ `5.73.0` for background jobs
- Zod `4.3.6` for validation
- Docker Compose for local infrastructure
- OpenAI SDK for orchestration (optional locally via `OPENAI_ENABLED`)

## Run locally (from zero)

Prerequisites: **Node 22.22.x**, **pnpm 10.x** (via Corepack), **Docker Desktop** (or compatible engine).

```bash
cd /path/to/StoryBoard
corepack enable && corepack prepare pnpm@10.32.0 --activate
cp .env.example .env
pnpm install   # runs prepare → builds @storyboard/shared into dist/
pnpm infra:up
pnpm db:generate
pnpm db:migrate
# optional: pre-link a dev operator to the default artist
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000 — sign in with Google (or dev login when enabled). New operators without memberships go through **onboarding** (create an artist or accept an invite). Owners manage team invites from **Team** in the sidebar. Then: **Manager** intake/brief/chat, dashboard, **Band operations** (events, songs/setlists, projects, offers), CRM, **Find shows**, booking, **Pitch campaigns**, the optional **Booking inbox**, tasks, approvals, weekly summary, notifications, and activity.
- API: http://localhost:4000/health  

The web app loads the repo-root `.env` via `apps/web/next.config.ts` so `API_URL` / `NEXT_PUBLIC_API_URL` stay in sync (see `.env.example`). API requests use `credentials: "include"`; optional **`COOKIE_DOMAIN=localhost`** helps the session cookie work across Next (3000) and the API (4000) in local development.

Stop infra: `pnpm infra:down`

## Run the local container bundle

For a production-built, self-contained local demo (web, API, Postgres, Redis,
migrations, and a seeded owner), install Docker Compose v2 and run:

```bash
pnpm container:up
```

Open `http://localhost:3000`, then use **Dev login**. The bundle persists data
in Docker volumes; stop it with `pnpm container:down`. Copy
`.env.compose.example` to a separate Compose env file to override local
passwords, session secret, ports, or browser-facing URLs. `NEXT_PUBLIC_API_URL`
is embedded at web-image build time, so rebuild after changing it. This is a
local demo profile: a public deployment must disable dev bypass and configure
Google OAuth, real secrets, and public `WEB_URL`/API URLs.

**Phase 3A:** Operator auth (Google OIDC + optional dev bypass), `Operator` / `ArtistMembership`, session-guarded routes, integration OAuth state bound to the signed-in operator, and audit rows with `actorOperatorId`. See `docs/auth-operators.md`.

**Phase 3B:** Membership **invitations** (hashed tokens, audit), **`viewer`** role with a small capability map, **Team** admin UI (owners), **first-artist onboarding** without requiring seed, and minimal **Origin / Referer** checks on mutating requests (`docs/invitations.md`, `docs/auth-operators.md`).

**Phase 2B:** Per-artist Google connections (encrypted in Postgres), real Calendar/Drive adapters when scoped, minimal OAuth routes (`docs/integrations-google-oauth.md`), a two-job BullMQ worker in the API process, and shared Zod payloads in `@storyboard/shared` for key approval types.

**Phase 4A:** Workflow automation and notifications on the existing queue: invite email drafts (Gmail real or mock), approval and integration connection notifications, overdue task and stale follow-up digests (repeatable jobs), minimal in-app `WorkflowNotification` rows + optional operator **`workflowEmailEnabled`**, and auditable automation actions. See `docs/workflow-automation.md`.

**Phase 4B:** Per-membership **notification preferences** (Zod-validated JSON on `ArtistMembership`), **owner escalation thresholds** on `Artist`, **daily/weekly digest** jobs (`digest.generate.daily` / `digest.generate.weekly`) on the same queue, and a **Notifications** page in the web app. Preferences gate in-app rows and Gmail drafts; digests stay draft-based. See `docs/workflow-automation.md`.

**Phase 5A:** **Telegram** urgent outbound channel (`sendMessage` only, narrow adapter; **mock** when `TELEGRAM_BOT_TOKEN` is unset), **owner-only** per-artist routing (`GET`/`PATCH /workflow/telegram`), repeatable **`urgent.telegram.scan`** job plus **approval execution failed** hook, **`TelegramUrgentDedupe`** for idempotency, and deterministic **operational intelligence** (`GET /dashboard/insights`: booking health, pipeline risk, priority actions). UI: Notifications (Telegram card), dashboard health + actions, pipeline risk badges, weekly briefing snapshot. See `docs/telegram-alerts.md`, `docs/workflow-automation.md`, and `docs/architecture.md`.

**Phase 5B:** **Telegram inbound registration** — owners issue short-lived **`POST /workflow/telegram/registration-token`** links; **`POST /integrations/telegram/webhook`** handles **`/start`** payloads only, binds **`telegramChatId`** with one-time **`TelegramRegistrationToken`** rows, full audit trail, optional **`TELEGRAM_WEBHOOK_SECRET`**, and minimal Notifications UI (deep link / copy / manual chat id fallback). Expanded **`pnpm test`** coverage (shared + API). See `docs/telegram-alerts.md`.

**Booking acquisition:** A quick, artist-scoped booking profile unlocks market prospecting and pitch campaigns. **Find shows** searches one city at a time through Ticketmaster Discovery when configured, otherwise states that manual mode is active rather than inventing leads. It stores venue, festival, private-event, and corporate-event prospects; only physical-room prospects create a `Venue` on conversion. **Pitch campaigns** render only a small allowlist of variables, show every personalized email before approval, and create Gmail drafts only after approval execution — never an auto-send. Each executed draft creates one follow-up task seven days later by default. See `docs/domain-model.md` and `docs/developer-runbook.md`.

**Booking advisor:** The Booking advisor turns sprint, campaign, delivery, outcome, and feedback into reviewable next steps. It remains deterministic when `OPENAI_ENABLED=false`. When enabled, `OPENAI_ADVISOR_CONTEXT=aggregate` (default) sends counts only; the explicit global `full` mode sends artist CRM context to the configured provider. It never sends messages or mutates booking records.

**Manager OS:** The Manager workspace is the cross-functional successor to the
booking-only advisor (the old advisor API remains compatible). A guided intake
records band mode, market, lineup, constraints, and ambition; creates an
editable 90-day plan with two measurable goals, linked initiatives, and six
dated first actions tailored to original, cover/event, or hybrid work; and
produces a daily/weekly brief grounded in
artist-owned records. Manager conversations retain a bounded recent thread,
resume after reload, and answer common questions about priorities, shows,
booking, availability, approvals, and money from the corresponding records.
The deterministic path is question-aware rather than a generic canned reply,
so local/mock operation remains useful. Optional OpenAI reasoning uses `OPENAI_MANAGER_MODEL`
(`gpt-5.6-terra` by default); disabled or failed requests use a deterministic
fallback. Manager traces retain facts/record IDs, policy results, prompt/model
version, latency, and structured recommendations—not hidden reasoning or raw
provider inbox data. The OpenAI path must first call the single explicit,
read-only `read_manager_snapshot` function; code supplies the tenant snapshot
and records token usage. Any unknown evidence ID rejects the whole model result
and uses deterministic fallback. Model output cannot invent tools: code permits direct
acceptance only for low-risk internal task creation and open decision drafts.
Decision drafts must be corrected and saved by the band before a separate
choice can be recorded. Email, calendar, Drive, legal, and financial work
remains human-reviewed and approval-gated. Accepted recommendations are
single-use and linked to their task or decision; completing a task or reviewing
a decision records the outcome automatically. Dismissal reasons and bounded
cooldowns keep the Manager from repeating recently rejected or finished work.
Every delivered conversational answer is linked to its exact Manager run and
can be rated helpful or corrected with a bounded reason. Recent explicit
feedback changes only code-owned presentation guidance (for example, lead with
the answer, be more specific, or be shorter); it cannot add tools or expand
authority. A deterministic response gate rejects canned assistant phrasing,
implementation/meta language, excessive length, and claims that StoryBoard
already performed an outside action. Prompt/policy version `manager_os_v16`
and its offline eval suite cover response quality, conversation-created
decision framing/review, commitment follow-through, and respectful
missing-context guidance. Before applying the five-item Today limit, the
code-owned `manager_priority_v1` policy compares every candidate across event
timing/readiness, member conflicts, commitment state, reply freshness,
approvals, overdue money, due reviews, follow-ups, and project health. The
Manager shows why the first item won, and the redacted run trace records only
the bounded rule factors—not hidden reasoning. Grounded model suggestions are
merged with these deterministic must-not-miss signals and reranked, so model
wording cannot hide a same-day show or other authoritative pressure. When the
same readiness evidence shows that an event has no advance or a dated project
has no milestone plan, Manager may offer one additional explicit internal
action: build the existing source-keyed show advance or project plan. It may
also propose one internal task assignment when an open unowned task has a
unique match to an active member's recorded responsibilities. Append-only
`available`, `limited`, or `unavailable` check-ins add a voluntary current
capacity signal without requesting private explanations. Responsibility fit
remains primary, current availability is only a tie-break, unavailable members
are excluded, and missing or expired check-ins stay explicitly unknown. Equal
matches remain a human decision; members with blocked or overdue recorded work
are not suggested. Acceptance revalidates the artist, open task, active member,
current ownership, exact check-in premise, and stale-write premise, then
completes atomically with audit history. Capacity notes remain in the tenant UI
and never enter model context. The policy does not estimate hours, wellbeing,
or personal circumstances and does not grant arbitrary tool or provider access.
The same conversation teaches common band-business concepts without requiring
a model. Explicit questions about holds, guarantees, door deals, advancing,
production documents, deposits, agreements, invoices, settlements, member
splits, publishing, masters, distribution, and related terms receive a plain
definition, why it matters, the matching StoryBoard workflow, and a specific
caution. Relevant artist records are cited when they exist. These code-owned
answers are read-only and cannot send, pay, sign, publish, or create work.
“Learn as you go” prompts use the band's saved **Topics to explain**.
Brief cache reuse is also evidence-aware: a newer audited change to relevant
band operations, booking, money, approvals, decisions, or Manager work forces a
fresh brief instead of waiting for the daily/weekly age limit.
The Manager also has one shared, deterministic 90-day outcome review. Completed
shows, projects, tasks, campaign results, attendance, post-show notes,
relationship outcomes, invoices, expenses, and finalized settlements are
combined by tenant and currency. It reports premise coverage as confidence,
keeps unknown net income unknown until settlement, and asks for the missing
fact instead of turning free-text notes into a success claim. The same review
drives the Manager card, retrospective chat answers, and weekly attention item.
The **Band decisions** workspace makes important tradeoffs testable instead of
ephemeral: members record two to six real options, choose one with a rationale
and observable expected result, set a review date, and later save one immutable
`worked`, `mixed`, `did_not_work`, or `inconclusive` lesson. Stale concurrent
writes fail closed instead of replacing another member's choice. Due reviews
enter the daily brief, and recent reviewed decisions remain available to
conversation as one bounded observation—not an automatically generalized rule.
An explicit two-option Manager question can prepare this open decision as a
draft. The draft labels its tradeoffs unknown and remains unchoosable until a
member reviews and saves the real framing; generic advice questions do not
create decisions.
The **Follow-through** board makes existing work credible before the Manager
suggests more. Blocked tasks require a reason and may name who the band is
waiting on; later due dates increment a deferral counter instead of erasing the
slip. Stale concurrent edits fail closed. One deterministic projection ranks
blocked, overdue, repeatedly deferred, waiting, ownerless, and due-soon work
for Manager Today, Waiting on, risks, and conversation. When OpenAI is enabled,
code still requires the highest-severity commitment to remain first and rejects
a duplicate task proposal for a blocker question.
The **Team workload** view resolves current Tasks to active working members via
`bandMemberId`; old exact-name labels remain readable, while `Show advance` and
`Manager recommendation` are correctly treated as placeholders. It shows only
recorded open/due/overdue/blocked pressure. A unique responsibility match may
produce a reviewable assignment, but StoryBoard explicitly does not infer
hours, effort, health, employment, family commitments, or anyone's actual
capacity. Historical labels are not automatically rewritten.
The **Manager cadence** completes the proactive loop without creating another
planner. It is off by default and owner-controlled. A BullMQ scan uses the
band's daily or weekly preference plus an IANA timezone, local hour, and weekly
day to prepare at most one brief per local period. Runs and in-app
`manager_brief_ready` notifications are persisted atomically and open the
Manager workspace directly. Scheduled briefs are deterministic unless the
owner separately opts into model use; enabling normal Manager AI does not
silently create recurring provider cost. Owners also choose whether only owners
or owners and members receive the in-app update. Turning the schedule off also
clears its model-use consent. Scheduling never sends email,
posts to Telegram, writes a calendar, accepts recommendations, or performs an
outside action.
The **Band context** panel makes the Manager's information quality inspectable.
It derives four 25-point dimensions—identity, people, business, and current
execution—from artist-owned structured records, then asks the highest-value
missing question. The score measures recorded coverage, never artistic quality
or potential. Members can edit the full operating profile and working-lineup
responsibilities after intake; updates immediately change the shared brief,
conversation, and model snapshot without turning unknowns into guesses.
The **What your manager remembers** panel now distinguishes canonical
operating-profile facts from other saved memory. Profile-backed band mode,
home market, ambition, and constraints synchronize atomically on every profile
save and cannot be edited through the generic memory route. The
`manager_knowledge_v1` policy marks memory current, stale, unconfirmed,
low-confidence, or conflicted; the profile wins any duplicate conflict, and
the Manager asks for confirmation instead of asserting an unreliable value.
Members can confirm, correct, or archive non-profile memory, while sensitive
memory remains owner-controlled. Provider context follows the same boundary:
normal memory may enter the standard redacted snapshot, sensitive memory
requires the owner's separate full-context consent, and restricted memory
never enters a model snapshot. An explicit conversational request such as
“Remember that Morgan handles production advances” creates a review card with
the exact proposed value; it is saved only after a member chooses **Remember
this**. Ordinary conversation never writes memory, canonical profile facts are
redirected to Band context, and credentials, financial identifiers, and health
information are refused without echoing the submitted value. Owners can see the current mode and
included/withheld counts without exposing the withheld values. Reviewed
feedback influences future ranking and evaluation only—it never lets
the model rewrite prompts, policy, schemas, or application code. Owners can
explicitly promote decided recommendations into a bounded local eval set for
offline candidate-version testing. They can also promote an exact rated answer:
helpful examples must stay natural and grounded, while answers needing work
must include the expected behavior and block the current candidate until a
later code-registered version is explicitly reviewed as fixed. The examples
stay local and do not activate or rewrite any version. Goal progress updates
create append-only, audited events instead of silently replacing history. Each
goal also declares its progress source. `manager_goal_measurement_v1` can count
current qualified/converted prospects, confirmed or completed gigs in the
goal window, or completed projects explicitly linked to the goal; every other
metric stays manual. StoryBoard shows when the selected records and saved
number disagree, but a member must explicitly reconcile the exact freshly
recomputed value. Stale requests fail closed and replay creates no duplicate
event. A code-owned plan-health score explains which goals are on track, at
risk, overdue, or missing measurement, linked work, or real task owners.
Starter-plan source keys make
“Fill missing steps” idempotent without overwriting renamed, completed, paused,
or abandoned work. Owners can run the current offline release gate over golden
safety/usefulness scenarios plus their reviewed examples without calling a
model; a failed run blocks confidence but never changes the active version
automatically. Upcoming gigs
also receive deterministic show-readiness signals across lineup, schedule,
contacts, terms/payment, advance work, and performance preparation. Every
score includes confidence, evidence IDs, and concrete gaps; the Operations
workspace can generate a missing advance checklist, and Manager briefs/chat
use the same signal instead of inventing a second readiness opinion.

**Band operations:** Confirming a booking opportunity idempotently creates a
gig event. Events hold availability, logistics, show advance tasks, setlists,
deal/invoice links, expenses, and settlement state. The same workspace includes
a readiness editor for every active performer, venue/location, day-of contact,
setlist, ordered show-day timing, guarantee/deposit, production notes, and
technical-document links. Partial edits are checked against the complete saved
schedule, so an impossible load-in/soundcheck/doors/set/curfew order is rejected
before write or audit. Each gig also has a phone-friendly **day-of view** with
the next checkpoint, an editable custom run of show for travel calls, meals,
support slots, changeovers, and other checkpoints, contact/map actions, lineup assignments,
advance-task completion, setlist, production links, and recorded payment state.
When the show is over, the same event editor records attendance, gross revenue,
what worked or failed, and the buyer/venue relationship outcome. Settlement
math includes only expenses in the settlement currency; other-currency costs
remain separately visible rather than being silently mixed into net income.
Draft finalization rechecks current matching expenses, attaches them to the
settlement, and freezes the recalculated split and PDF together.
Manager uses that same day-of signal inside 24 hours of a show instead of
falling back to generic advice. It also includes a shared song library and
release/content/tour/business projects. Project workspaces generate idempotent,
type-specific milestones backward from the target date; track real owners,
progress, blockers, metrics, assets, budget, spend, and linked events; and feed
the same explainable readiness signal into Manager conversation and briefs. The
operations layer also includes versioned deal memos, owner-activated agreement
templates, immutable
PDF snapshots, idempotent manual payments, and finalized settlements. Financial
values are integer minor units with US/USD defaults. Agreement templates are
starting points only and explicitly not legal advice. Gmail/calendar/Drive
side effects still require Approvals; generated PDFs remain in StoryBoard until
the reviewed provider-delivery step is executed.

**Booking reply loop:** When `GMAIL_REPLY_SYNC_ENABLED=true` and an owner reconnects Google with `gmail.readonly`, the Booking inbox checks only Gmail threads created by StoryBoard campaigns. It stores bounded message metadata/snippets, not full bodies or attachments. AI analysis is a separate per-artist opt-in; selected bodies are fetched transiently and discarded after structured terms are derived. Applying terms and creating a threaded Gmail reply draft both require explicit actions, and drafts still pass through Approvals. Keep reply sync disabled until Google restricted-scope requirements are satisfied.

Details, troubleshooting, and checks: `docs/developer-runbook.md` and `docs/environment-setup-plan.md`.

**Agents (Codex, Cursor, etc.):** read [`AGENTS.md`](AGENTS.md) and [`docs/codex-handoff.md`](docs/codex-handoff.md) for the current delivery snapshot, file map, and quality gate.

## Core Product Principles

- One coherent app, not a collection of disconnected assistants
- One source of truth in PostgreSQL
- All external systems behind adapters
- Risky actions require approval before execution
- Important actions must be auditable
- Write actions should support dry run mode where practical
- Natural language commands resolve to structured actions

## Repository Map

- `apps/web`: operator-facing web application
- `apps/api`: orchestration API, domain logic, adapters, queue producers
- `packages/shared`: shared schemas, types, and contracts
- `packages/ui`: reusable UI components
- `prisma/`: schema and migrations; `prisma.config.ts` at repo root (Prisma 7)
- `docs`: architecture, domain, integration, env, and runbook docs
- `.cursor/rules`, `.cursor/commands`, `.cursor/plans`: Cursor artifacts
- `scripts/`: e.g. `preflight.mjs`

## Workspace commands

| Command | Purpose |
| ------- | ------- |
| `pnpm dev` | Run web + API in parallel |
| `pnpm dev:web` | Run Next dev only |
| `pnpm dev:api` | Run Nest dev only |
| `pnpm build` | Build packages and apps |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint (API + web) |
| `pnpm test` | Unit tests (`@storyboard/shared` + compiled API tests); does not require a database |
| `pnpm test:integration` | Migrates and tests a dedicated DB named by `STORYBOARD_TEST_DATABASE_URL` (must contain `test`) |
| `pnpm infra:up` / `infra:down` | Docker Postgres + Redis |
| `pnpm db:generate` | `prisma generate` (root config) |
| `pnpm db:migrate` | `prisma migrate dev` (needs Postgres) |
| `pnpm db:seed` | Seed default artist + operator membership (needs migrate) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:audit-relationships` | Read-only check for historical cross-artist record links |
| `pnpm preflight` | Docker + Postgres + Redis smoke (needs infra + `.env`) |

## Phase 2A providers

Gmail (OAuth draft-only), Bandsintown (the artist's own event context only), and Ticketmaster Discovery (city-first venue/event signals) can run as **real** adapters when env vars are set. Ticketmaster absence or failure puts Find shows in explicit manual mode; it never creates synthetic leads. Approval **execute** creates Gmail drafts only after explicit approval. See `docs/developer-runbook.md`; `GET /integrations/status` (authenticated) reports provider modes.

## MVP Scope

- Venue CRM, contact/promoter CRM, booking profiles, market prospects, booking pipeline, approval-gated pitch campaigns, task engine, approval center with post-approval **execution**, command bar, weekly summary, and adapter layer (real Gmail/Bandsintown/Ticketmaster when configured; Calendar, Drive, YouTube, Spotify still mock-first).

## Commands API

`POST /commands/execute` accepts **`text`** (natural language) and/or **`intent`**
(structured). See `docs/developer-runbook.md` for intent names and examples.

## Read Next

- `AGENTS.md` — concise rules for coding agents
- `docs/codex-handoff.md` — handoff: what is shipped, where code lives, next-work ideas
- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/integration-plan.md`
- `docs/environment-setup-plan.md`
- `docs/developer-runbook.md`
- `docs/workflow-automation.md`
- `docs/telegram-alerts.md`
- `docs/package-map.md`
- `.cursor/plans/storyboard-master-plan.md` (historical roadmap; cross-check README phases)
