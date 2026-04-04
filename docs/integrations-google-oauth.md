# StoryBoard — Google OAuth (phase 2B)

This document describes the **integration** Google OAuth flow (Calendar / Gmail / Drive tokens per artist). **Operator sign-in** uses a separate callback and scopes — see `docs/auth-operators.md`.

## Prerequisites in Google Cloud Console

1. Create an OAuth 2.0 Client (Web application).
2. Add **Authorized redirect URIs**:
   - **`GOOGLE_REDIRECT_URI`** — integration connect (e.g. `http://localhost:4000/auth/google/callback`).
   - **`GOOGLE_OPERATOR_REDIRECT_URI`** — operator login (e.g. `http://localhost:4000/auth/operator/google/callback`).
3. Scopes used by StoryBoard are fixed in code (`GOOGLE_OAUTH_SCOPES` in `apps/api/src/integrations/google-oauth.constants.ts`): Gmail compose, Calendar events, Drive file.

## Environment

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client; required for **real** Google adapters and for exchanging the authorization code. |
| `GOOGLE_REDIRECT_URI` | Must match the callback URL registered in Google Cloud. |
| `INTEGRATION_SECRETS_ENCRYPTION_KEY` | Encrypts refresh (and optional access) token material stored in `IntegrationConnection.encryptedSecrets`. Without this, `/integrations/google/authorize` returns 503. |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | **Optional env fallback** when no DB connection exists; assumes scopes equivalent to the connect flow. |
| `GOOGLE_CALENDAR_DEFAULT_ID` | Calendar id for real adapter (default `primary`). |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Optional parent folder for Drive operations. |

## Flow

1. Signed-in operator opens **`GET {API_URL}/integrations/google/authorize?artistId={id}`** (StoryBoard UI exposes a link; route requires session + **membership** for `artistId`).
2. User signs in and consents; Google redirects to **`GET {API_URL}/auth/google/callback?code=…&state=…`**.
3. API validates `state` (HMAC with `SESSION_SECRET`, includes `operatorId` — must match session), exchanges `code`, **upserts** `IntegrationConnection` with `provider = "google"`, `status = "active"`, and encrypted secrets `{ blob: … }`.
4. User is redirected to **`WEB_URL/?googleConnected=1`** (or `googleError=…` on failure).

## Connection vs env gating

- **Per-artist:** If an active `IntegrationConnection` exists for `google`, refresh token and **recorded `scopes`** determine whether Gmail, Calendar, and Drive use **real** or **mock** adapters (see `build-registry.ts` + `scopeAllows`).
- **Env fallback:** If no usable connection row, StoryBoard falls back to `GOOGLE_OAUTH_REFRESH_TOKEN` + client id/secret when set; scopes are treated as sufficient for all three surfaces (`scopes: null` path).

## Key generation

For `INTEGRATION_SECRETS_ENCRYPTION_KEY`, prefer **32 bytes of random data, base64-encoded**, for example:

```bash
openssl rand -base64 32
```

A long passphrase is also accepted (derived with scrypt internally); base64 key is recommended.
