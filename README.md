# StoryBoard

StoryBoard is an AI-assisted operating system for bands and artists. It is
designed to reflect how real band management works: venue relationships, booking
workflow, scheduling, release coordination, approvals, show operations, and
business follow-through.

To try the complete local product, use [Run the local container bundle](#run-the-local-container-bundle).
For source development, follow [Run locally](#run-locally-from-zero) and the
[`developer-runbook`](docs/developer-runbook.md). The
[`documentation index`](docs/README.md) maps product, architecture, operations,
integration, and agent handoff material without requiring readers to scan this
entire file.

> Run every command below from the cloned `StoryBoard` directory—the one that
> contains this README and `package.json`. `ERR_PNPM_NO_PKG_MANIFEST` means the
> terminal is in the wrong directory; run `cd /path/to/StoryBoard` first.

## Locked Stack

- `pnpm` workspace monorepo (Node `22.22.x`, pnpm `10.x`)
- `apps/web`: Next.js `16.2.x`, React `19`, TypeScript, Tailwind CSS `4.2.x`
- `apps/api`: NestJS `11.1.18`, TypeScript, Fastify
- `packages/shared`: shared types, contracts, and Zod schemas (CommonJS `dist` for the API)
- `packages/ui`: reusable React UI primitives
- PostgreSQL `16` as the source of truth
- Redis `7` for queues and coordination
- Prisma ORM `7.6.0` (`prisma.config.ts` + PostgreSQL driver adapter through the API `PrismaService`)
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
# local-only Dev login: set AUTH_DEV_BYPASS=true in .env, then seed its owner
pnpm db:seed
pnpm dev
```

Choose one sign-in path before starting: configure the Google operator OAuth
variables for real sign-in, or set `AUTH_DEV_BYPASS=true` in `.env` and run
`pnpm db:seed` for the local-only **Dev login**. Do not enable dev bypass on an
internet-facing deployment.

- Web: http://localhost:3000 — sign in with Google (or dev login when enabled). New operators without memberships go through **onboarding** (create an artist or accept an invite). Owners manage team invites from **Team** in the sidebar. Then: **Manager** intake/brief/chat, dashboard, **Band operations** (events, songs/setlists, projects, offers), CRM, **Find shows**, booking, **Pitch campaigns**, the optional **Booking inbox**, tasks, approvals, weekly summary, notifications, and activity.
- API: http://localhost:4000/health  

The web app loads the repo-root `.env` via `apps/web/next.config.ts` so `API_URL` / `NEXT_PUBLIC_API_URL` stay in sync (see `.env.example`). API requests use `credentials: "include"`; optional **`COOKIE_DOMAIN=localhost`** helps the session cookie work across Next (3000) and the API (4000) in local development.

Stop infra: `pnpm infra:down`

## Run the local container bundle

For a production-built, self-contained local demo (web, API, Postgres, Redis,
migrations, and a seeded owner), install Git and Docker Compose v2. From a new
machine, no host Node installation or `pnpm install` is required:

```bash
git clone https://github.com/rupret007/StoryBoard.git
cd StoryBoard
docker compose -f docker-compose.app.yml up --build
```

Open `http://localhost:3000`, then use **Dev login**. The bundle persists data
in Docker volumes. The command stays attached so its logs remain visible; keep
that terminal open. For background startup, use:

```bash
docker compose -f docker-compose.app.yml up --build -d --wait
```

Stop the direct form with `docker compose -f docker-compose.app.yml down`. If
Node and pnpm are already available, `pnpm container:up` and
`pnpm container:down` are convenient wrappers around the same Compose file. To
override local passwords, the session secret, ports, or browser-facing URLs,
copy
`.env.compose.example` to the gitignored `.env.compose` and pass it explicitly:

```bash
docker compose --env-file .env.compose -f docker-compose.app.yml up --build
```

`NEXT_PUBLIC_API_URL` is embedded at web-image build time, so rebuild after
changing it. This is a local demo profile: a public deployment must disable dev
bypass and configure Google OAuth, real secrets, a non-default database
password, and public `WEB_URL`/API URLs. The production Compose override removes
host-published Postgres and Redis ports.

**Phase 3A:** Operator auth (Google OIDC + optional dev bypass), `Operator` / `ArtistMembership`, session-guarded routes, integration OAuth state bound to the signed-in operator, and audit rows with `actorOperatorId`. See `docs/auth-operators.md`.

**Phase 3B:** Membership **invitations** (hashed tokens, audit), **`viewer`** role with a small capability map, **Team** admin UI (owners), **first-artist onboarding** without requiring seed, and minimal **Origin / Referer** checks on mutating requests (`docs/invitations.md`, `docs/auth-operators.md`).

The web experience mirrors those server permissions: viewers retain readable
Manager, event, project, campaign, and deal views while mutation controls fail
closed; agreement-template creation and activation remain owner-only. API role
guards and audited writes are still the authoritative security boundary.

**Phase 2B:** Per-artist Google connections (encrypted in Postgres), real Calendar/Drive adapters when scoped, minimal OAuth routes (`docs/integrations-google-oauth.md`), a two-job BullMQ worker in the API process, and shared Zod payloads in `@storyboard/shared` for key approval types.

**Phase 4A:** Workflow automation and notifications on the existing queue: invite email drafts (Gmail real or mock), approval and integration connection notifications, overdue task and stale follow-up digests (repeatable jobs), minimal in-app `WorkflowNotification` rows + optional operator **`workflowEmailEnabled`**, and auditable automation actions. See `docs/workflow-automation.md`.

**Phase 4B:** Per-membership **notification preferences** (Zod-validated JSON on `ArtistMembership`), **owner escalation thresholds** on `Artist`, **daily/weekly digest** jobs (`digest.generate.daily` / `digest.generate.weekly`) on the same queue, and a **Notifications** page in the web app. Preferences gate in-app rows and Gmail drafts; digests stay draft-based. See `docs/workflow-automation.md`.

**Phase 5A:** **Telegram** urgent outbound channel (`sendMessage` only, narrow adapter; **mock** when `TELEGRAM_BOT_TOKEN` is unset), **owner-only** per-artist routing (`GET`/`PATCH /workflow/telegram`), repeatable **`urgent.telegram.scan`** job plus **approval execution failed** hook, **`TelegramUrgentDedupe`** for idempotency, and deterministic **operational intelligence** (`GET /dashboard/insights`: booking health, pipeline risk, priority actions). UI: Notifications (Telegram card), dashboard health + actions, pipeline risk badges, weekly briefing snapshot. See `docs/telegram-alerts.md`, `docs/workflow-automation.md`, and `docs/architecture.md`.

**Phase 5B:** **Telegram inbound registration** — owners issue short-lived **`POST /workflow/telegram/registration-token`** links; **`POST /integrations/telegram/webhook`** handles **`/start`** payloads only, binds **`telegramChatId`** with one-time **`TelegramRegistrationToken`** rows, full audit trail, optional **`TELEGRAM_WEBHOOK_SECRET`**, and minimal Notifications UI (deep link / copy / manual chat id fallback). Expanded **`pnpm test`** coverage (shared + API). See `docs/telegram-alerts.md`.

**Booking acquisition:** A quick, artist-scoped booking profile unlocks market prospecting and pitch campaigns. **Find shows** searches one city at a time through Ticketmaster Discovery when configured, otherwise states that manual mode is active rather than inventing leads. It stores venue, festival, private-event, and corporate-event prospects; only physical-room prospects create a `Venue` on conversion. **Pitch campaigns** render only a small allowlist of variables and show every personalized email before approval. Draft-only delivery is the default; a campaign may explicitly choose an approval-gated immediate-send batch of at most 25 recipients. Every provider action still requires separate human approval and execution, and unknown delivery is never retried automatically. Successful delivery creates a follow-up task seven days later by default. See `docs/domain-model.md` and `docs/developer-runbook.md`.

**Approval lifecycle:** `approval_lifecycle_v2` is the shared source for the
operator work queue. `GET /approvals/work-queue` and the Approval Center
separate pending human decisions, approved requests ready for their explicit
execution step, fresh executions still inside their one-hour lease, stale
unknown or failed provider outcomes needing reconciliation, conclusively
reviewed provider checks, and approved records that have no executable
StoryBoard action. A fresh `executionAttemptedAt` claim is
`execution_in_progress`: it is neither live attention nor reconcilable while
the original provider call may still be running. At one hour without a final
result it becomes `execution_unknown` and enters reconciliation attention.
Dashboard, desktop/mobile navigation, Manager, weekly summary, and digests use
the same distinction; approval event notifications deep-link to the Approval
Center and remain historical until read. Only Gmail batch, Calendar hold, and
Drive-folder actions in the code-owned allowlist are executable. Real Google
requests have a 30-second per-request timeout, and Gmail draft/send approval
batches are capped at 25 recipients, keeping provider work bounded inside the
lease. Viewers can inspect the artist-scoped queue and append-only
reconciliation history but cannot approve, reject, execute, or record a
provider check. Members and owners may record a checked result through
`approval_reconciliation_v1`; every item reports `canRetry=false`, and
StoryBoard never presents the original one-shot provider attempt as safe to
repeat.

**Booking advisor:** The Booking advisor turns sprint, campaign, delivery, outcome, and feedback into reviewable next steps. It remains deterministic when `OPENAI_ENABLED=false`. When enabled, `OPENAI_ADVISOR_CONTEXT=aggregate` (default) sends counts only; the explicit global `full` mode sends artist CRM context to the configured provider. It never sends messages or mutates booking records.

**Manager OS:** The Manager workspace is the cross-functional successor to the
booking-only advisor (the old advisor API remains compatible). A guided intake
records band mode, market, lineup, constraints, and ambition; creates an
editable 90-day plan with two measurable goals, linked initiatives, and six
dated first actions tailored to original, cover/event, or hybrid work; and
produces a daily/weekly brief grounded in
artist-owned records. The workspace preserves the full structured brief:
Today, This week, Decisions needed, Waiting on, and Risks and opportunities.
It opens the band's saved daily/weekly preference, lets the operator switch
views deliberately, and refreshes the cadence currently on screen. A confidence
label describes StoryBoard record coverage, not the probability of success.
Reading a brief is cache-only and never invokes a model or writes records;
member/owner Refresh uses the separately guarded generation endpoint.
Manager conversations retain bounded recent threads,
resume after reload, and can be revisited from the conversation-history picker
without mixing context between threads. They answer common questions about
priorities, shows, booking, availability, approvals, and money from the
corresponding records.
Short follow-ups such as “why that?”, “is that still right?”, and “do that”
resolve only to the immediately preceding structured recommendation. The
Manager rechecks current source projections, asks which item was meant when the
reference is missing, and never accepts or duplicates work from a pronoun.
Named questions such as “Is the Bluebird show ready?” or “What is the balance
on Invoice 1042?” resolve against bounded records owned by the active artist.
The code-owned resolver uses exact labels, quoted fragments, or a unique typed
token, asks when two records collide, and never silently answers from the first
record in a list.
The deterministic path is question-aware rather than a generic canned reply,
so local/mock operation remains useful. Optional OpenAI reasoning uses `OPENAI_MANAGER_MODEL`
(`gpt-5.6-terra` by default); disabled or failed requests use a deterministic
fallback. Manager traces retain facts/record IDs, policy results, prompt/model
version, latency, and structured recommendations—not hidden reasoning or raw
provider inbox data. The OpenAI path must first call the single explicit,
read-only `read_manager_snapshot` function; code supplies the tenant snapshot
and records token usage. Any unknown evidence ID rejects the whole model result
and uses deterministic fallback. Model output cannot invent tools: code permits direct
acceptance only for allowlisted, premise-checked internal work; deterministic
code may prepare an approval but never execute its outside action.
Decision drafts must be corrected and saved by the band before a separate
choice can be recorded. Email, calendar, Drive, legal, and financial work
remains human-reviewed and approval-gated. Accepted recommendations with a
typed action are single-use and linked to their internal result or prepared approvals;
task/decision completion and linked approval status record the outcome
automatically. Dismissal reasons and bounded
cooldowns keep the Manager from repeating recently rejected or finished work.
The code-owned `manager_follow_through_v1` view then follows accepted work from
the recommendation into its authoritative Task, Decision, Project, Event,
reviewed Manager memory fact, or Approval. The Manager page shows work that
needs confirmation, is in motion, is blocked, or completed recently, with a
direct link to the owning workspace when one applies.
Conversation actions are rehydrated from relational state after every reload,
so accepted work cannot reappear as a stale suggestion. Advice without a typed
action offers **Mark handled** or dismissal instead of pretending that
acceptance created work. Approved provider actions remain a separate execution
step; a recorded-but-unresolved attempt is quarantined for reconciliation, and
mock execution is never described as a real Calendar or Drive result. In a
mixed approval batch, an uncertain attempted write takes precedence over a
failed, rejected, or expired sibling so the batch cannot become retryable.
Resolved memory receipts inherit the current memory record's access boundary:
archived or missing facts disappear, non-owners see only normal facts, and a
saved value is never replayed from stale conversation preview JSON. A member
may close a simulated or typed-but-orphaned Manager receipt only with a written
reconciliation note. A Manager receipt linked to a failed or uncertain
Approval cannot be closed there; it routes to the Approval Center for
append-only provider evidence. A `still_unknown` check keeps the work blocked.
A conclusive external-effect check also keeps linked Manager work blocked for
manual repair, while a no-effect check permits only a separate newly reviewed
request. None of these paths retries or mutates the original Approval.
Every receipt also carries code-owned `canMutate` and `canReconcile` flags.
Owner-private work projected as a sanitized shared-record receipt sets both to
false, and the web client renders no mutation or reconciliation control for it.
Recommendation acceptance and linked Task/Decision completion write their
Manager lifecycle audits inside the same database transaction as the state
change; acceptance and Task completion retain their serializable guards. If the
audit cannot be persisted, the transition rolls back instead of leaving
unaudited accepted or completed work.
Owners also get a read-only queue of finished recommendations that have not yet
been reviewed for the regression set. Completion is shown as execution—not
proof of usefulness—and the owner explicitly chooses useful, not useful, or
needs revision. Repeated runs with the same stable advice key do not crowd out
other patterns; a genuinely newer observed result can be reviewed later.
Every delivered conversational answer is linked to its exact Manager run and
can be rated helpful or corrected with a bounded reason. Recent explicit
feedback changes only code-owned presentation guidance (for example, lead with
the answer, be more specific, or be shorter); it cannot add tools or expand
authority. A standalone reply such as “that answer was helpful,” “that missed
my question,” or “that was too vague because…” now applies the same audited
feedback to the immediately preceding answer and updates it inline. This
`manager_natural_feedback_v1` route is deliberately narrower than sentiment:
questions, mixed verdicts, action/approval language, and claims that work was
completed stay ordinary conversation. Explanations remain review notes and
never become band memory or provider context. The Learning panel also offers a read-only queue of recent unrated
answers, one per conversation, so real feedback does not depend on keeping the
original thread open. Merely viewing the queue records nothing; only an
explicit rating becomes evidence. Owners receive a second read-only queue for
rated answers that are not yet in the regression set: helpful answers can be
added explicitly, while corrected answers require the expected behavior.
Feedback, promotion, resolution, and version activation remain separate; no
rating or queue read activates a new version. A
deterministic response gate rejects canned assistant phrasing,
implementation/meta language, excessive length, and claims that StoryBoard
already performed an outside action. Reviewed band-level corrections also apply
to deterministic and provider-backed answers through
`manager_response_adaptation_v1`: they can shorten lists, make an existing next
action explicit, simplify tone, or ask one evidence-backed missing-premise
question. Raw correction notes never become instructions, and adaptation cannot
change facts, citations, recommendations, tools, permissions, or writes.
Prompt/policy version `manager_os_v33` and its `manager_evals_v38` offline eval
suite cover response quality, conversation-created
decision framing/review, commitment follow-through, respectful missing-context
guidance, and operating-evidence calibration. The read-only
`manager_evidence_v1` projection checks live work, booking, projects, money,
goals, and the working team as current, needs confirmation, stale, missing, or
conflicted. Both deterministic and optional-model answers receive the same
post-generation calibration, so an empty area means “not recorded,” never proof
that nothing exists outside StoryBoard. The Manager workspace shows the same
bounded confidence and at most three targeted questions; it measures record
coverage, not artistic quality or business success.
When the band asks what context is missing, Manager now asks one highest-value
question at a time. A direct answer to a supported profile question becomes an
exact `manager_context_capture_v1` proposal with a visible preview; nothing is
saved until a member accepts it. Acceptance rechecks the original answer,
artist, profile version, current gap, and typed field/value before updating the
authoritative profile and its compatibility memory atomically. Lineup, goals,
active commitments, sensitive details, and ambiguous replies stay in their
structured workflows rather than being guessed from chat.
Explicit shared-work requests follow the same reviewed pattern. “Add a task to
…” and “remind us to …” are handled by the code-owned
`manager_task_capture_v1` route even when OpenAI is disabled. StoryBoard shows
the exact title, due date, and unassigned owner before acceptance; relative
dates require the saved Manager timezone, while ambiguous dates, personal
reminders, multi-task requests, credential values, and implicit plans are not
captured. Acceptance re-parses the originating tenant message, rechecks open
tasks, and creates one source-keyed Task without sending or executing anything
outside StoryBoard.
Existing commitments can be maintained in the same reviewed conversation.
Explicit requests such as `mark "Confirm rehearsal" done`, `block "Send the
stage plot" because the buyer has not confirmed dimensions`, or `move "Call
the buyer" to Friday` route through code-owned `manager_task_update_v1`.
StoryBoard resolves one current artist Task, previews the exact change, and
writes only after acceptance. It refuses ambiguous names, pronouns, no-ops,
secret values, stale Task versions, unsupported dates, completed-task
reopening, and changes that violate prerequisite completion or date order. The
provider cannot emit this action.
Direct ownership choices use the same reviewed boundary. A request such as
`assign "Confirm load-in" to Morgan` routes through
`manager_task_assignment_v1`, resolves one current Task and one active band
member, and previews the ownership change with the member's current voluntary
availability signal. Acceptance rechecks the source message, Task version,
current owner, active lineup, and latest check-in inside one serializable
transaction. Ambiguous names, implicit ownership, unavailable members,
completed work, and no-op assignments fail closed. Capacity notes never enter
model context or audit metadata, and the provider cannot emit this action.
The same conversation can start a complete execution project without forcing a
novice through several forms. An explicit request such as `Create a release
project called "Autumn EP" due 2027-10-15` routes through
`manager_project_capture_v1`. StoryBoard shows the exact active project and all
dated starter milestones before acceptance. Acceptance reloads and re-parses
the originating tenant message, rejects an equivalent project, and creates the
project plus its source-keyed `project_plan_v1` tasks atomically. Release,
content-campaign, tour, and business projects are supported; vague dates,
multiple projects, implicit planning, secrets, and provider-generated project
actions fail closed.
Events now use the same reviewed path. An explicit request such as `Schedule a
rehearsal called "Album run-through" on 2026-10-15 at 7:00 PM` routes through
`manager_event_capture_v1`. StoryBoard requires the saved Manager timezone,
shows the exact event/status/local start/location and active-lineup count, then
creates the internal event plus `unknown` availability rows only after
acceptance. `draft` is the default; `hold` or `confirmed` must be stated. DST
gaps/overlaps, missing timezones, ambiguous or duplicate events, secrets, stale
lineups, and provider-generated event actions fail closed. This flow never
contacts anyone, generates an advance, or writes to an external calendar.
Availability can then be maintained without leaving the conversation. `Mark
Morgan available for "Album run-through"`, `Morgan can't make "Bluebird
show"`, and the explicit tentative/unknown variants route through
`manager_event_availability_v1`. StoryBoard resolves one active member and one
current event, previews the old and new response, and writes only after review.
Acceptance re-parses the exact tenant message and rechecks the event version,
member identity, participant row, previous response, and response timestamp in
the recommendation transaction. Questions stay read-only; ambiguous people or
events, no-ops, multiple responses, secrets, stale state, and provider-emitted
actions fail closed. The update never notifies a member or stores a private
reason from chat.
`manager_work_sequence_v1` projection makes task order explicit. Members can
record one Task as another Task's prerequisite; the API rejects cross-artist
links, self-links, cycles, impossible date order, and completion that skips
unfinished prerequisites. Manager separates ready-now work from downstream
work and recorded blockers, and advances a ready prerequisite instead of
presenting a waiting task as actionable. It never infers effort, duration, or
private member capacity from the graph.
A code-owned `manager_goal_path_v1` projection then joins every active goal to
its initiative, measurement, linked tasks, and prerequisite chain. Goal advice
reuses the first real task or ready prerequisite, identifies missing or
contradictory links, and prepares a new task only when a real initiative has no
open work. Acceptance rechecks that premise in a serializable transaction, so
an intervening task cannot create duplicate or orphan goal work. The path does
not predict effort, duration, conversion, or private capacity. The shared
`manager_goal_target_v1` policy gives every numeric target an explicit meaning:
reach at least, stay at or below, or match exactly. Caps and exact targets remain
provisional until their deadline, while lumpy outcomes such as releases are no
longer judged against an invented linear pace. “On track” means only that the
recorded work has no contradiction or blocker; it is not a forecast. Before applying
the five-item Today limit, the
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
For a confirmed upcoming gig with a saved start, end, and IANA timezone, the
same code-owned Manager brief may propose `event_logistics_v1`. Accepting that
recommendation prepares separate, artist-scoped Google Calendar and Drive
approval requests; it does not call Google. A member must still review,
approve, and execute each request in Approvals. Successful execution writes the
provider Calendar event ID or Drive folder URL back to the authoritative
`BandEvent`, and the linked Manager recommendation follows the approvals from
prepared through completed, rejected, or failed. Event type/status and
title/time/timezone changes invalidate the old payload before provider
execution, while source keys keep repeat preparation idempotent. Rejection can
be explicitly prepared again because no provider call occurred. A provider
failure is treated as an unknown outside outcome: check Google and reconcile it
manually rather than risking a duplicate retry.
The same conversation teaches common band-business concepts without requiring
a model. Explicit questions about holds, guarantees, door deals, advancing,
production documents, deposits, agreements, invoices, settlements, member
splits, publishing, masters, distribution, and related terms receive a plain
definition, why it matters, the matching StoryBoard workflow, and a specific
caution. Relevant artist records are cited when they exist. These code-owned
answers are read-only and cannot send, pay, sign, publish, or create work.
“Learn as you go” prompts use the band's saved **Topics to explain**.
Brief cache reuse is also evidence-aware: a newer audited change to relevant
band operations, booking, money, approvals, decisions, or Manager work
invalidates cache reuse instead of waiting for the daily/weekly age limit. A
cache-only read then returns no brief until a member or owner refreshes it, or a
scheduled generation creates the next brief.
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
responsibilities after intake; updates immediately affect conversation and
model snapshots, and invalidate the cached brief so the next explicit or
scheduled generation reflects them without turning unknowns into guesses.
The **What your manager remembers** panel now distinguishes canonical
operating-profile facts from other saved memory. Profile-backed band mode,
home market, ambition, and constraints synchronize atomically on every profile
save and cannot be edited through the generic memory route. The
`manager_knowledge_v1` policy marks memory current, stale, unconfirmed,
low-confidence, or conflicted; the profile wins any duplicate conflict, and
the Manager asks for confirmation instead of asserting an unreliable value.
Members can confirm, correct, or archive non-profile memory, while sensitive
memory remains owner-controlled. Provider context follows the same boundary:
normal memory may enter the standard redacted snapshot, sensitive memory may
enter only an owner's interactive chat after that owner separately enables
full context, and restricted memory never enters a model snapshot. Shared and
scheduled briefs always use redacted context. An owner-only full-context turn
marks both `ManagerMessage` rows durably as `owner_only`, beginning with the
user write before any provider exchange. The assistant row keeps that marker
even when OpenAI fails, rejects output, or deterministic fallback is used, so a
partial request cannot become team history. Historical full-context
source/response pairs are backfilled by the forward migration; ambiguous
interrupted conversations are quarantined and empty legacy conversation titles
are neutralized. Exact source bindings remain enforced, and legacy unbound
turns fail closed across the bounded conversation. Recommendations created
from that private turn remain
owner-only: a non-owner receives a generic not-found result even with the
recommendation ID, and shared deterministic briefs/chat suppression,
member-visible learning summaries, and redacted provider history omit its
private recommendation metadata and outcomes. If the owner accepts work into a
shared Task, Event, Project, or Approval, teammates see only a sanitized receipt
derived from that authoritative record. An explicit conversational request such as
“Remember that Morgan handles production advances” creates a review card with
the exact proposed value; it is saved only after a member chooses **Remember
this**. Ordinary conversation never writes memory, canonical profile facts are
redirected to Band context, and credentials, financial identifiers, and health
information are refused without echoing the submitted value. Explicit remember
requests are classified locally against the complete submitted value before
truncation or model routing, including known credential-token shapes; a refused
sensitive value is replaced with a fixed redaction before the message is stored
and is never sent to OpenAI. Each proposal is bound to the exact persisted
source-message ID and timestamp, and acceptance rechecks that source so
concurrent turns cannot authorize the wrong memory. Legacy proposals without
that binding fail closed. If the key already belongs to archived, sensitive, or
restricted memory, conversational acceptance fails closed for every role and
does not modify the fact; only the owner-controlled memory editor can change
those records. Existing active normal memory may be refreshed. New
memory uses an opaque SHA-256 identifier, new
memory audit metadata omits it, and Activity/weekly-summary reads remove legacy
memory-key fields without rewriting audit history. Conversation titles,
content, action previews, continuity, response-review queues, and provider
history all re-check the memory fact's current sensitivity and archive state.
The feedback write performs that same authorization check again by message ID;
hidden owner-only or currently private-memory responses return a generic
not-found response without a feedback or audit write. Conversation responses
publish `canSubmitFeedback`, and hidden placeholders never expose rating
controls.
Owners can see the current mode and
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
Confirmed gigs with an exact start/end and timezone also show their Calendar
and Drive connection state. **Prepare approvals** creates or reuses the
reviewable requests; it never performs the external write. Approve and execute
those requests in **Approvals**, then return to the gig to see the persisted
provider reference. If the event's title or schedule changes first, execution
fails closed and the current details must be prepared again. Mock execution is
clearly labeled **simulated** because no Google account changed; it can be
replaced after Google is connected. A failed real-provider attempt is never
blindly retried because the outside write may have succeeded—check Google and
record the result in the Approval Center. `still_unknown` remains quarantined.
If no external effect was found, StoryBoard may prepare a separate newly
reviewed approval; it never reruns the original request. If an external effect
was observed, StoryBoard blocks a duplicate and leaves linked Manager work
blocked for manual repair rather than auto-linking a provider reference or
claiming recovered provider success.
When the show is over, the same event editor records attendance, gross revenue,
what worked or failed, and the buyer/venue relationship outcome. Settlement
math includes only expenses in the settlement currency; other-currency costs
remain separately visible rather than being silently mixed into net income.
Draft finalization rechecks current matching expenses, attaches them to the
settlement, and freezes the recalculated split and PDF together.
Manager uses that same day-of signal inside 24 hours of a show instead of
falling back to generic advice. It also includes a shared song library and a
practical setlist builder for ordered songs, breaks, notes, transition cues,
status, and reusable set notes. `setlist_summary_v1` derives song count and
known performance time from the canonical library; break time is never guessed,
and any song without a duration remains a visible readiness gap rather than
turning the known subtotal into a false set length. Song title, duration, key,
BPM, lead vocalist, and active-library status can be corrected inline.
Band operations also includes release/content/tour/business projects. Project
workspaces generate idempotent,
type-specific milestones backward from the target date; track real owners,
progress, blockers, metrics, assets, budget, spend, and linked events; and feed
the same explainable readiness signal into Manager conversation and briefs. The
operations layer also includes versioned deal memos, owner-activated agreement
templates, immutable
PDF snapshots, idempotent manual payments, and finalized settlements. Financial
values are integer minor units with US/USD defaults. Agreement templates are
starting points only and explicitly not legal advice. Gmail/calendar/Drive
side effects still require Approvals. Current deal delivery creates a reviewed
Gmail draft that references the immutable snapshot; the human must attach the
PDF. Binary Drive upload and Gmail attachment remain a later adapter package.

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
| `pnpm test:e2e` | Resets an explicit `STORYBOARD_TEST_DATABASE_URL`, builds production artifacts, and runs 15 focused Chromium workflows |
| `pnpm manager:eval` | Build the API and run the current offline Manager safety/usefulness gate |
| `pnpm infra:up` / `infra:down` | Docker Postgres + Redis |
| `pnpm container:up` / `container:down` | Build/start or stop the complete local container bundle |
| `pnpm db:generate` | `prisma generate` (root config) |
| `pnpm db:migrate` | `prisma migrate dev` (needs Postgres) |
| `pnpm db:seed` | Seed default artist + operator membership (needs migrate) |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:audit-relationships` | Read-only check for historical cross-artist record links |
| `pnpm preflight` | Docker + Postgres + Redis smoke (needs infra + `.env`) |

Release validation snapshot (2026-07-13): root typecheck/lint, 11/11 shared
tests, 235/235 API assertions across 230 top-level tests, both production
builds, 82/82 Manager checks at 100% safety, 5/5 database workflows across all
40 migrations, and 15/15 Chromium workflows pass. Prisma reports no schema
drift, the relationship diagnostic reports zero integrity issues, and the
rebuilt local container bundle passes health, readiness, Dev-login session,
and authenticated-Dashboard smoke. One non-fatal `pg@8.14.1` concurrent-query
deprecation warning remains tracked before any `pg@9` upgrade.

## Phase 2A providers

Gmail (OAuth compose/send), Bandsintown (the artist's own event context only), and Ticketmaster Discovery (city-first venue/event signals) can run as **real** adapters when env vars are set. Ticketmaster absence or failure puts Find shows in explicit manual mode; it never creates synthetic leads. Gmail drafts and explicitly selected immediate-send batches are created only by a separately approved **Execute** action. See `docs/developer-runbook.md`; `GET /integrations/status` (authenticated) reports provider modes.

## Current Product Scope

- **Manager OS:** guided band intake, an editable 90-day plan, goals,
  initiatives, decisions, team context, evidence-grounded daily/weekly briefs,
  bounded conversation, reviewed internal actions, durable recommendation
  follow-through, and an offline evaluation gate.
- **Booking:** venue/contact CRM, booking profile, one-market prospecting,
  pipeline, tracked campaign replies, approval-gated pitch campaigns, and
  follow-up work.
- **Band operations:** events and availability, show readiness/day-of views,
  advance tasks, songs/setlists, release/content/tour/business projects, offers,
  reviewed document snapshots, invoices/manual payments, expenses, and
  settlements.
- **Connected work:** an approval center with explicit post-approval execution,
  separate decision/execute/reconciliation queues, audit history,
  notifications, and mock-safe adapters. Scoped Google accounts can use real
  Gmail, Calendar, and Drive; Ticketmaster supplies optional market signals,
  Bandsintown is limited to the artist's own event context, and YouTube/Spotify
  remain mock-only.

## Commands API

`POST /commands/execute` accepts **`text`** (natural language) and/or **`intent`**
(structured). See `docs/developer-runbook.md` for intent names and examples.

## Read Next

- [`docs/README.md`](docs/README.md) — documentation index by task
- [`AGENTS.md`](AGENTS.md) — concise rules for coding agents
- [`docs/codex-handoff.md`](docs/codex-handoff.md) — current delivery snapshot,
  code entry points, quality gate, and remaining work
- [`docs/developer-runbook.md`](docs/developer-runbook.md) — authoritative setup,
  validation, and release procedures
- [`docs/architecture.md`](docs/architecture.md) and
  [`docs/domain-model.md`](docs/domain-model.md) — system and data boundaries
- [`.cursor/plans/storyboard-master-plan.md`](.cursor/plans/storyboard-master-plan.md)
  — historical roadmap only; do not treat it as current scope
