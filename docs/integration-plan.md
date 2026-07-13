# StoryBoard Integration Boundaries

This document describes the current adapter contract and the explicitly
deferred provider surface. It is not permission to expand provider reads.

## Integration Philosophy

Every external system must sit behind an adapter boundary in `apps/api`. Domain
modules should interact with provider-neutral interfaces rather than raw SDKs or
HTTP payloads.

## Current Adapters

### Gmail

- Draft outbound emails and send only explicitly approved immediate batches
- Read only threads created by StoryBoard booking campaigns; never a general inbox
- Require approval before every external booking/deal draft or send execution;
  opted-in internal operator workflow drafts remain a separate notification path
- Support dry-run previews for proposed messages

### Google Calendar

- Create reviewed holds or coordination events
- Do not read calendar availability in the current adapter
- Require approval and a separate Execute action for every calendar write

### Google Drive

- Create or reuse reviewed StoryBoard folders and retain provider references
- Keep binary PDF/file upload deferred; current delivery still requires a human
  to attach the immutable StoryBoard PDF to the reviewed Gmail draft

### Bandsintown

- Read the current artist's own event context
- Do not use it for competitor crawling or general market/venue discovery

### Ticketmaster Discovery

- Read bounded, city-first venue and event signals for Find shows
- Keep provider references for artist-scoped import deduplication
- Treat unavailable credentials or provider failures as explicit manual mode; do
  not create synthetic leads

### YouTube and Spotify

- Mock-only in the current application
- Metrics/catalog imports remain deferred until provider access and a validated
  band workflow justify the data, cost, and compliance surface

## Later-Phase Adapters

- TikTok
- Mailchimp
- Twilio
- Printful
- Shopify
- Stripe
- Documenso

These should remain deferred until the operational core is stable.

## Adapter Interface Expectations

Every adapter should define:

- provider ID
- supported capabilities
- required credentials/scopes
- rate-limit considerations
- read/write method surface
- dry-run support expectations
- approval requirements for risky methods

## Secret Handling

- Store secrets outside source control
- Keep `.env.example` limited to placeholders
- Store per-artist Google connection metadata in PostgreSQL and encrypt token
  material with `INTEGRATION_SECRETS_ENCRYPTION_KEY`
- Never commit `.env`, `.env.compose`, refresh tokens, or provider secrets

## Failure Handling

- External API failures should not corrupt domain state
- Provider-specific errors should be normalized before leaving the adapter
- Retries and backoff should be queue-driven where possible
- Partial failures must create audit records when they affect operational work
