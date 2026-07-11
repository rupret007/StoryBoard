# StoryBoard Integration Plan

## Integration Philosophy

Every external system must sit behind an adapter boundary in `apps/api`. Domain
modules should interact with provider-neutral interfaces rather than raw SDKs or
HTTP payloads.

## MVP Adapters

### Gmail

- Draft outbound emails
- Read message threads for relationship context
- Require approval before send
- Support dry-run previews for proposed messages

### Google Calendar

- Read availability and event context
- Propose holds or coordination events
- Require approval for committed calendar writes

### Google Drive

- Store shared documents and assets
- Reference folders or file IDs from internal records
- Prefer metadata sync over full binary handling in the first slice

### Bandsintown

- Read the current artist's own event context
- Do not use it for competitor crawling or general market/venue discovery

### Ticketmaster Discovery

- Read bounded, city-first venue and event signals for Find shows
- Keep provider references for artist-scoped import deduplication
- Treat unavailable credentials or provider failures as explicit manual mode; do
  not create synthetic leads

### YouTube Data API

- Read channel and video metrics
- Provide release and audience context to summaries

### Spotify Web API

- Read artist profile, catalog, and audience-related metadata
- Support release context and opportunity scoring

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
- Model connection metadata in PostgreSQL
- Treat encrypted secret storage as an implementation task for the bootstrap or
  post-bootstrap phase

## Failure Handling

- External API failures should not corrupt domain state
- Provider-specific errors should be normalized before leaving the adapter
- Retries and backoff should be queue-driven where possible
- Partial failures must create audit records when they affect operational work
