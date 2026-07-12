# StoryBoard workflow automation (phases 4A and 4B)

## Summary

Phase 4A adds **policy-aware** background jobs on the existing BullMQ queue
(`storyboard-enrichment`), **Gmail draft** (or **mock**) delivery for membership
invites, **in-app** `WorkflowNotification` records, optional **workflow email
drafts** to operators (respecting per-operator **`workflowEmailEnabled`**), and
stronger **audit** coverage for automation. It does **not** send Gmail messages
directly (draft-only, same as phase 2A approvals).

**Phase 4B** adds **per-membership notification preferences** (`ArtistMembership.workflowNotifyPrefs`, validated with `@storyboard/shared` Zod schemas), **owner-configured escalation thresholds** on `Artist`, **daily/weekly digest** jobs, preference-aware routing for in-app rows and email drafts, and **Notifications** settings in the web app (`/notifications`). Digests remain **draft-based** (or mock) and never auto-send mail.

## Channels

| Channel | Behavior |
| ------- | -------- |
| **In-app** | Rows in `WorkflowNotification` for the signed-in recipient; `GET` / `PATCH read` under `/workflow/notifications`. |
| **Email** | `GmailAdapter.draftMessage` to each relevant operator’s email (from the **artist’s** resolved registry), skipped if `Operator.workflowEmailEnabled` is false. |
| **Mock** | When Google is not configured for the artist, mock Gmail creates synthetic draft ids; behavior stays safe locally. |
| **Audit** | Actions such as `invite.delivery.completed`, `workflow.approval_notified`, `workflow.email.*`, `automation.task_overdue.scan`, `automation.followup_stale.scan`, `workflow.notify_prefs.updated`, `workflow.escalation.updated`, `automation.digest.daily`, `automation.digest.weekly`. |

## Notification preferences (phase 4B)

Each **operator + artist** membership may store `workflowNotifyPrefs` (JSON). Null or invalid JSON falls back to defaults (all categories **on** for in-app and email draft, digests **off**).

| Category | Maps to `WorkflowNotificationKind` (examples) |
| -------- | ---------------------------------------------- |
| **invites** | `invite_delivered`, `membership_invite_accepted` |
| **approvals** | `approval_*` |
| **overdueTasks** | `task_overdue_digest` |
| **staleFollowUps** | `followup_stale_digest` |
| **integrationChanges** | `integration_connection_changed` |

**Digest toggles:** `digest.daily` / `digest.weekly`. When enabled, scheduled jobs create one `digest_daily` / `digest_weekly` in-app row per recipient **per UTC day** or **per ISO week (Monday UTC)** if none exists yet in that window. Digest **body sections** only include categories where the operator has **in-app or email** enabled for that category. Email drafts for digests use the same Gmail path; **`Operator.workflowEmailEnabled`** still applies.

**API (session + artist context):** `GET` / `PATCH /workflow/preferences` — any member. `GET` / `PATCH /workflow/escalation` — any member can read; **only owners** may patch thresholds.

## Escalation thresholds (phase 4B, owner-only)

On **`Artist`**:

| Field | Effect |
| ----- | ------ |
| `workflowOverdueGraceDays` | When set to **N &gt; 0**, only tasks with `dueAt` **before** “now minus N UTC calendar days” count as overdue (reduces noise); **null/0** keeps the original “any past-due” rule (`dueAt` &lt; now). |
| `workflowStaleFollowupDays` | Overrides env **`WORKFLOW_STALE_FOLLOWUP_DAYS`** for stale detection when set. |
| `workflowPendingApprovalDays` | Pending/proposed approvals must be at least this many days old to appear in digest summary (0 = all pending). |

## Jobs (single queue: `storyboard-enrichment`)

| Job name | Payload | Trigger |
| -------- | ------- | ------- |
| `invite.send` | `inviteId`, `artistId`, `acceptUrl`, `inviteeEmail`, `artistName`, `role` | After **owner** creates an invite (HTTP path already owner-only). Job id `invite:<inviteId>`. |
| `approval.notify` | `artistId`, `approvalId`, `event` (`created` \| `approved` \| `rejected` \| `executed` \| `failed`) | After approval create / approve / reject / execution success or failure. |
| `membership.invite_accepted` | `artistId`, `inviteeEmail`, `role` | After successful invite accept. |
| `integration.connection_changed` | `artistId`, `provider` | After Google integration OAuth callback persists connection. |
| `task.check-overdue` | `{}` | **Repeatable** (default every 6h when worker enabled). Scans artists with overdue tasks; honors **per-artist** `workflowOverdueGraceDays`. |
| `followup.check-stale` | `{}` | **Repeatable** (same cadence). Uses **`workflowStaleFollowupDays`** or `WORKFLOW_STALE_FOLLOWUP_DAYS`. |
| `digest.generate.daily` | `{}` | **Repeatable** — default interval **24h** (`WORKFLOW_DIGEST_DAILY_MS`). |
| `digest.generate.weekly` | `{}` | **Repeatable** — default interval **7d** (`WORKFLOW_DIGEST_WEEKLY_MS`). |
| `manager.schedule.scan` | `{}` | **Repeatable** — default interval **15m** (`MANAGER_SCHEDULE_SCAN_MS`, minimum 1m). Reads only owner-enabled Manager schedules, creates one local-period brief and in-app notification, and performs no provider write. |
| `urgent.telegram.scan` | `{}` | **Repeatable** — same interval as overdue/stale (`WORKFLOW_AUTOMATION_REPEAT_MS`, default 6h). Sends **Telegram** urgent messages for artists with owner-configured routing; see phase 5A below. |
| `venue.enrich`, `research.refresh` | (existing) | Unchanged stubs. |

## Phase 5A — Telegram urgent channel (outbound only)

- **Separate from 4B prefs:** Membership **`workflowNotifyPrefs`** still controls **in-app** and **Gmail draft** only. **Telegram** uses **`Artist.telegramUrgentEnabled`**, **`telegramChatId`**, and **`telegramNotifyCategories`** (JSON: approvals, overdueTasks, staleFollowUps). **Owners** set these via `GET` / `PATCH /workflow/telegram`.
- **Server env:** **`TELEGRAM_BOT_TOKEN`** (optional). If unset, **`WorkflowTelegramService`** uses a **mock** adapter: no HTTP to Telegram, but **`telegram.urgent.sent`** is still audited with `mode: mock` when delivery would have occurred — safe for local dev.
- **Triggers:** (1) **`urgent.telegram.scan`** evaluates aged pending approvals, overdue clusters, and stale clusters (deterministic thresholds in `urgent-channel.constants.ts`, aligned with `GET /dashboard/insights`). (2) **`approval.notify`** with `event: failed` calls **`trySendApprovalFailed`** (dedupe per approval id).
- **Dedupe:** **`TelegramUrgentDedupe`** unique on **`(artistId, dedupeKey)`** — e.g. `approval_aging:<UTC-date>`, `overdue_cluster:<UTC-date>`, `stale_cluster:<UTC-date>`, `approval_failed:<approvalId>`. Prevents repeated Telegram spam; failed API sends do **not** insert a row (retries allowed on next scan).
- **Docs:** `docs/telegram-alerts.md` (bot setup, chat id, owner opt-in).

## Phase 5B — Telegram inbound registration

- **Owner-only:** `POST /workflow/telegram/registration-token` creates a **single-use**, **time-bounded** registration token (stored hashed as **`TelegramRegistrationToken`**). Prior unconsumed tokens for the artist are cleared.
- **Webhook:** `POST /integrations/telegram/webhook` (no session cookie; optional **`TELEGRAM_WEBHOOK_SECRET`**) processes Telegram **`Update`** JSON and only binds chat id when **`/start <payload>`** matches a valid token. Audits: **`telegram.registration.token_created`**, **`telegram.registration.bound`**, **`telegram.registration.failed`**.
- **UI:** Notifications page — **Generate Telegram link**, copy, open; manual **Target chat id** remains as fallback.
- **Details:** `docs/telegram-alerts.md`.

## Policy

- **Invite creation and revoke** remain **owner-only**; the worker only delivers
  for **pending** invites and never bypasses membership checks on HTTP routes.
- **Approval notifications** target **owners + members** (viewers excluded from
  workflow-action alerts in this phase).
- **Invite accepted** notifies **owners** so they see new roster changes.
- **Overdue / stale** digests: at most **one in-app + email draft per recipient
  per UTC day** per digest kind (dedupe via `WorkflowNotification` timestamps),
  subject to **category** prefs (either channel may be off).
- **Scheduled digests**: dedupe by **`digest_daily` / `digest_weekly`** kind and **UTC day** or **ISO week** start.
- Automation does **not** approve, execute, or mutate memberships beyond creating
  notifications and audit rows (threshold PATCH updates `Artist` fields only).
- **Telegram** does not read membership notification JSON; it only uses **owner** artist fields + category flags. Phase **5A** had no inbound handling. **Phase 5B** adds **only** `/start` registration via **`TelegramRegistrationToken`** + **`POST /integrations/telegram/webhook`** (see `docs/telegram-alerts.md`).

## Schema (Prisma)

- `Operator.workflowEmailEnabled` — default `true`.
- `ArtistMembershipInvite.deliveredAt`, `deliveryChannel`, `deliveryLastError`.
- `ArtistMembership.workflowNotifyPrefs` — optional JSON (phase 4B).
- `Artist.workflowOverdueGraceDays`, `workflowStaleFollowupDays`, `workflowPendingApprovalDays` — optional ints (phase 4B).
- `Artist.telegramUrgentEnabled`, `telegramChatId`, `telegramNotifyCategories` — phase 5A (owner-configured Telegram routing).
- `TelegramUrgentDedupe` — `artistId`, `dedupeKey`, `sentAt`, `lastError` (phase 5A).
- `TelegramRegistrationToken` — short-lived hashed tokens for inbound **`/start`** binding (phase 5B).
- `WorkflowNotification` — `recipientOperatorId`, `artistId`, `kind`, `title`,
  `body`, `readAt`, `metadata`.
- `WorkflowNotificationKind` includes `digest_daily`, `digest_weekly`.

## Local development

1. **Redis + Postgres** up (`pnpm infra:up`), **`ENABLE_QUEUE_WORKER=true`** (default)
   so the API process runs the worker and repeatable jobs.
2. Apply migrations (`pnpm db:migrate` or `pnpm exec prisma migrate deploy`).
3. Create an invite as **owner**; watch Team page **delivery status** and Gmail
   mock/real drafts.
4. Optional: tune **`WORKFLOW_AUTOMATION_REPEAT_MS`**,
   **`WORKFLOW_STALE_FOLLOWUP_DAYS`**, **`WORKFLOW_DIGEST_DAILY_MS`**,
   **`WORKFLOW_DIGEST_WEEKLY_MS`** in `.env`.
5. Open **Notifications** (`/notifications`) to set preferences, (as owner) escalation thresholds and **Telegram** urgent settings. Use **Generate Telegram link** (phase 5B) or manual chat id; confirm **`TELEGRAM_BOT_TOKEN`** and **`setWebhook`** for real delivery.

## UI

- **Team** page shows per-invite delivery status.
- **Notifications** page: per-category in-app / email toggles, digest cadence, **Telegram urgent** card (owner), owner escalation fields, hint for latest digest.
- Shell **Workflow** strip (when unread count &gt; 0) lists recent unread items;
  click marks read.
