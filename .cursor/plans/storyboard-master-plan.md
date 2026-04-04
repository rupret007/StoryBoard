# StoryBoard Master Plan

> **Note (2026):** Delivery has outpaced this document. Phases **3A–5B** (auth, invites, workflow, Telegram outbound + inbound registration, etc.) are reflected in the root **README** and **`docs/codex-handoff.md`**. Use those for “what exists now”; keep this file for original vision and early phase naming.

## Vision

StoryBoard should behave like a real band manager's operating system: always
stateful, operationally grounded, approval-aware, and able to coordinate across
venues, contacts, schedules, releases, and follow-through.

## Locked Foundation

- pnpm workspace monorepo
- Next.js web app
- NestJS API
- PostgreSQL source of truth
- Redis plus BullMQ for async orchestration
- Prisma for schema and migrations
- Zod for validation
- OpenAI Responses API with tool calling for command resolution

## Implementation Phases

### Phase 1: Scaffold and Documentation

- Create the full repository layout
- Lock the stack and workspace conventions
- Create root infra and env templates
- Author architecture, domain, integration, and runbook docs
- Create Cursor rules and reusable command files

### Phase 2: Environment Bootstrap

- Install workspace dependencies
- Generate the lockfile
- Start PostgreSQL and Redis
- Initialize Next.js and NestJS runtime wiring
- Validate web and API health
- Generate Prisma client and first migration

### Phase 3: Foundational Domain Slice

- Implement venue CRUD
- Implement contact and promoter records
- Implement booking opportunity lifecycle basics
- Expose API endpoints and minimal web workflows

### Phase 4: Operational Controls

- Add task engine foundations
- Add approval center foundations
- Add audit event recording
- Enforce risky action checkpoints

### Phase 5: Command Center

- Model command proposals and action schemas
- Use OpenAI Responses API tool calling to resolve intents
- Add dry-run previews for supported write actions
- Persist command runs and link them to operational records

### Phase 6: Weekly Summary and Adapters

- Add summary job scheduling
- Add provider adapter stubs for MVP integrations
- Start with read-heavy integrations first
- Add approved outbound actions later

## First MVP Slice

The first end-to-end slice should:

1. Create a venue
2. Attach a promoter contact
3. Create a booking opportunity
4. Move the opportunity through a stage change
5. Generate a follow-up task
6. Propose an outbound action that requires approval
7. Write audit events for each important step

## Definition of Ready for the Next Phase

- repository scaffold exists
- docs are present
- workspace scripts are defined
- Docker Compose infra file exists
- Prisma schema exists
- env template exists

## Definition of Done for the Next Phase

- `pnpm install` succeeds
- local infra boots cleanly
- Prisma client generates
- the API exposes a health endpoint
- the web app renders a starter page
