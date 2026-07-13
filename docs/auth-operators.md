# StoryBoard operator authentication and membership

## Two different Google OAuth flows

1. **Operator sign-in** — who is using StoryBoard. Scopes: `openid email profile`. Callback: `GET /auth/operator/google/callback`. Stores an **`sb_session` cookie** (signed payload with `operatorId` and optional `currentArtistId`).
2. **Integration connect** — per-artist Calendar / Gmail / Drive. Scopes from `GOOGLE_OAUTH_SCOPES`. Callback: `GET /auth/google/callback`. Stores tokens in **`IntegrationConnection`**.

Use separate redirect URIs. Register **both** in your Google Cloud OAuth client.

## Session cookie

- Name: `sb_session`
- HttpOnly, `SameSite=Lax`, path `/`
- Optional **`COOKIE_DOMAIN`** (e.g. `localhost`) so the cookie can be reused when the Next app and API run on different ports locally.

## Operator OAuth state

`GET /auth/operator/google/start` creates a cryptographically random, signed
state nonce, stores it in a short-lived (10 minute) HttpOnly, `SameSite=Lax`
cookie scoped to `/auth/operator/google/callback`, and includes it in the Google
authorization request. The callback only exchanges a code when the returned
state matches that signed cookie with a timing-safe comparison. A matching state
cookie is cleared before token exchange, making it single-use; missing,
invalid, or replayed callbacks redirect with `authError=invalid_state`.

## Membership and roles (phase 3B)

- Tables: **`Operator`**, **`ArtistMembership`** (`owner` | `member` | **`viewer`**), linked to **`Artist`**.
- Optional **`ArtistMembershipInvite`** for email-bound, token-based invitations (see `docs/invitations.md`).
- Every protected API call resolves an **artist context** that the operator is allowed to access (via `x-artist-id`, query `artistId`, session `currentArtistId`, or the first membership).
- **`pnpm db:seed`** is a **local shortcut**: it creates a default artist, a seed operator (`SEED_OPERATOR_EMAIL`), and an **owner** membership. **Production onboarding** uses **`POST /onboarding/artist`** (first artist, no prior memberships) and **invite accept**.

### Capability map (small, explicit)

Enforced in the API via **`RolePolicyService`** (not a generic permissions engine).

| Capability | owner | member | viewer |
| ---------- | :---: | :----: | :----: |
| Read dashboards, lists, activity, weekly summary | yes | yes | yes |
| Create/update venues, contacts, booking, tasks, command execute | yes | yes | no |
| Approvals: approve / reject / execute | yes | yes | no |
| Manage memberships + invites; change roles; revoke | yes | no | no |
| Connect per-artist Google integration (`GET /integrations/google/authorize`) | yes | no | no |

**Artist switching** (`POST /auth/session/artist`): any role with membership may set **`currentArtistId`** (including **viewer**, read context only).

## Onboarding (web)

- **`/auth/me` first** in the app shell: operators with **no** memberships see **create artist / accept token** (no dependency on seed in production).
- Deep link for invites: **`/onboarding?invite=<token>`** (standalone layout; must be signed in).

## Local development without Google

1. Set `AUTH_DEV_BYPASS=true` and run the API with `NODE_ENV=development`
   (enforced: the API rejects bypass in production).
2. Visit **`GET /auth/dev/login`** on the API. The web sign-in screen shows the
   local-only link when `AUTH_DEV_BYPASS=true`, including in the
   production-built local container demo.
3. Works if the operator **exists**. With **no** memberships, use onboarding or seed for convenience.

## Protected routes

All artist-scoped HTTP routes require a valid session and membership **except**:

- `GET /health`, `GET /ready`, `GET /meta`
- `GET /auth/operator/google/start`, `GET /auth/operator/google/callback` (state-bound), `GET /auth/dev/login`
- `GET /auth/google/callback` (integration OAuth return)
- `POST /integrations/telegram/webhook` (optionally authenticated by
  `X-Telegram-Bot-Api-Secret-Token`; accepts `/start` registration only)

## CSRF posture (minimal)

- Global **`CsrfOriginGuard`**: for **`POST` / `PUT` / `PATCH` / `DELETE`**, **`Origin` or `Referer`** must match **`WEB_URL`** in production (plus **`http://localhost:3000`** in development). OAuth callbacks and the Telegram webhook listed above are excluded; the webhook uses its optional provider secret instead.
- **Deferred**: double-submit CSRF tokens, rotating sessions on every mutation, `__Host-` cookie prefixes for single-host deploys, per-route exclusions for machine clients.

## Audit actor identity

`AuditEvent` includes optional **`actorOperatorId`** (FK to `Operator`) and **`actorLabel`** (human-readable, usually the operator email for web actions). Background jobs may keep `actorLabel: "bullmq"` with a null operator id.

Membership and invite mutations always set **`actorOperatorId`** when the action comes from the session.
