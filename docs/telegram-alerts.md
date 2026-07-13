# Telegram urgent alerts (phase 5A) and inbound registration (phase 5B)

StoryBoard uses the [Telegram Bot API](https://core.telegram.org/bots/api) for a **narrow** integration: **outbound** `sendMessage` for urgent alerts, plus **inbound** handling **only** for `/start` **registration** (deep-link payload). There is **no** general command bot, **no** approvals from Telegram, and **no** mutation of StoryBoard data from Telegram except binding **`Artist.telegramChatId`** (and a short optional acknowledgment message after a successful bind).

## Required environment (server)

| Variable | Required | Description |
| -------- | ---------| ----------- |
| `TELEGRAM_BOT_TOKEN` | No | If unset or empty, outbound urgent sends and registration acks use a **mock** adapter: no network, but successful mock sends are still consistent with phase 5A audit behavior where applicable. |
| `TELEGRAM_BOT_USERNAME` | No | **Without `@`** — used to build `https://t.me/<username>?start=…` links in the API/UI. If unset, owners copy a `/start <payload>` command manually. |
| `TELEGRAM_REGISTRATION_TTL_MINUTES` | No | Lifetime of a registration link token (5–120; default **20**). |
| `TELEGRAM_WEBHOOK_SECRET` | No | If set, Telegram **`setWebhook`** should use the same value as `secret_token`; the API requires header **`X-Telegram-Bot-Api-Secret-Token`** to match on **`POST /integrations/telegram/webhook`**. |

Set secrets in the repo-root `.env` (see `.env.example`).

## Create a bot

1. Open Telegram and talk to **[@BotFather](https://t.me/BotFather)**.
2. Run `/newbot` and follow prompts; copy the **HTTP API token** into **`TELEGRAM_BOT_TOKEN`**.
3. Set **`TELEGRAM_BOT_USERNAME`** to the bot username (no `@`) for one-tap deep links from StoryBoard.

## Preferred: link chat without manual chat id (phase 5B)

1. **Owner** opens **Notifications** → **Telegram urgent alerts** → **Generate Telegram link**.
2. The API creates a **short-lived** row in **`TelegramRegistrationToken`** (hashed token only; raw token returned once), audits **`telegram.registration.token_created`**, and returns a **deep link** (if username is configured) or a **start payload** to paste.
3. Configure **`setWebhook`** so Telegram posts updates to your public API URL, e.g. `https://<host>/integrations/telegram/webhook` (use HTTPS; set **`TELEGRAM_WEBHOOK_SECRET`** in production).
4. The operator opens the link (or sends `/start <payload>` to the bot). The API validates the token (**one-time**, not expired), sets **`Artist.telegramChatId`**, audits **`telegram.registration.bound`**, and may send a **short ack** `sendMessage`. Failures (bad token, expired, replay) are audited as **`telegram.registration.failed`** with a reason code; the webhook still returns **200** for those cases so Telegram does not retry indefinitely—except a **wrong webhook secret** returns **403**.

**Security:** Only **owners** may call **`POST /workflow/telegram/registration-token`**. Binding does **not** create memberships or bypass invites. Anyone who obtains the raw link can attach **their** Telegram chat to that artist’s alert target—mitigated by short TTL and treating links as secrets.

## Fallback: manual chat id

Owners can still **PATCH** `/workflow/telegram` with **`telegramChatId`** (e.g. from `getUpdates` during development). See historical notes in git history if needed.

## Owner opt-in and categories

Only **owners** can **PATCH** `/workflow/telegram`. Settings are on **`Artist`**:

- **Enable** — `telegramUrgentEnabled`
- **Chat id** — `telegramChatId` (set by registration or manual patch)
- **Categories** — `telegramNotifyCategories`: `approvals`, `overdueTasks`, `staleFollowUps` (booleans)

These flags are **independent** of per-operator **`workflowNotifyPrefs`** (in-app / email). Members and viewers do not receive Telegram configuration UI for secrets; **GET** `/workflow/telegram` returns **readiness** for everyone and **redacts** chat id for non-owners.

## What can go to Telegram (outbound)

| Signal | Category key | Dedupe (examples) |
| ------ | -------------| ----------------- |
| Pending approvals older than the **urgent** aging window (derived from **`workflowPendingApprovalDays`**) | `approvals` | `approval_aging:<UTC-date>` |
| Overdue task **cluster** (threshold depends on open-task roster size) | `overdueTasks` | `overdue_cluster:<UTC-date>` |
| Stale follow-up **cluster** | `staleFollowUps` | `stale_cluster:<UTC-date>` |
| Approval execution **failed** | `approvals` | `approval_failed:<approvalId>` |

Exact numeric rules live in **`apps/api/src/workflow-automation/urgent-channel.constants.ts`** and match the **urgent** thresholds described in **`docs/architecture.md`** / **`GET /dashboard/insights`**.

## Intentionally unsupported (Phase 5B)

- Arbitrary bot commands (only `/start` with registration payload is handled)
- Approving or executing StoryBoard actions from Telegram
- Editing venues, tasks, opportunities, or memberships via Telegram
- Broad AI or conversational flows

## Scheduling

Repeatable BullMQ job **`urgent.telegram.scan`** runs on the same interval as **`task.check-overdue`** / **`followup.check-stale`** (default **6h**, overridable with **`WORKFLOW_AUTOMATION_REPEAT_MS`**). The API process must run with **`ENABLE_QUEUE_WORKER`** not set to `false` for repeatable schedules to register.

## Audit

Important actions: `workflow.telegram.settings.updated`, `telegram.registration.token_created`, `telegram.registration.bound`, `telegram.registration.failed`, `telegram.urgent.skipped`, `telegram.urgent.sent`, `telegram.urgent.failed`, `automation.telegram.scan`.

## CSRF

**`POST /integrations/telegram/webhook`** is excluded from **`CsrfOriginGuard`** origin checks (Telegram servers do not send browser **`Origin`**). Prefer **`TELEGRAM_WEBHOOK_SECRET`** in production.

## Local development

1. `pnpm infra:up`, `pnpm db:migrate`, optional `pnpm db:seed`, `pnpm dev`.
2. For inbound registration without a public URL, use **ngrok** (or similar) and `setWebhook` to the tunnel URL, **or** exercise only the **mock** path by calling the webhook handler with a crafted JSON body.
3. Without **`TELEGRAM_BOT_TOKEN`**, enable Telegram in the UI and trigger conditions (or wait for scan): check **Activity** for `telegram.urgent.sent` with mock mode.
4. **Tests:** `pnpm test` runs **`@storyboard/shared`** unit tests and the compiled **`@storyboard/api`** unit files matching `apps/api/test/*.test.mjs`. Database cases under `apps/api/test/integration/` run only through the explicit disposable-database `pnpm test:integration` command.

## Test suite

From repo root:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` includes Telegram registration **parse/hash** checks and shared **Zod** coverage for Telegram notify settings.
