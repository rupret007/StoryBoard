# StoryBoard Domain Model

## Core Entities

### Artist

The top-level tenant for MVP state. An artist owns venues, contacts, booking
opportunities, tasks, approvals, command runs, and integrations.

### Venue

Represents a room, club, festival, or presenting organization. Stores location,
capacity, and relationship notes. A venue may have multiple related contacts and
booking opportunities.

### Contact

Represents a human relationship connected to an artist and optionally a venue.
Contacts include promoters, talent buyers, venue managers, and collaborators.

### BookingOpportunity

Represents a potential or active show opportunity. Tracks stage, target date,
market notes, and source system references.

### Task

Represents a piece of operational follow-through. Tasks may exist independently
or attach to a booking opportunity. They carry ownership labels, due dates, and
checklist metadata.

### ApprovalRequest

Represents a proposed risky action awaiting review. Stores action type, payload,
status transitions, and approver metadata.

### AuditEvent

Represents immutable operational history. Stores action, severity, aggregate
metadata, and actor context.

### CommandRun

Represents a natural-language command entering the system and being resolved into
a structured action. Stores raw input, resolved action, dry-run state, and
execution status.

### IntegrationConnection

Represents a provider account connected to an artist, including scopes, status,
and encrypted secret references.

## Booking Pipeline Stages

- `target`
- `outreach`
- `conversation`
- `offer`
- `hold`
- `confirmed`
- `closed`

These stages are intentionally operational rather than conversational so the
system can reason about next steps, deadlines, and approvals.

## MVP Relationships

- An `Artist` has many `Venue`, `Contact`, `BookingOpportunity`, `Task`,
  `ApprovalRequest`, and `CommandRun` records.
- A `Venue` may have many `Contact` and `BookingOpportunity` records.
- A `BookingOpportunity` may generate many `Task`, `ApprovalRequest`, and
  `CommandRun` records.
- `AuditEvent` links to aggregate types and IDs generically rather than through
  deep relational coupling.

## First MVP Slice

The first thin slice should prove the architecture end to end:

1. Create a venue
2. Attach a promoter contact
3. Create a booking opportunity
4. Move the opportunity to a new stage
5. Generate a follow-up task
6. Propose an outbound action requiring approval
7. Record the entire flow in audit history

## Data Modeling Notes

- Prefer normalized operational records over provider-specific blobs.
- Preserve source references when data comes from external systems.
- Use JSON columns selectively for payload snapshots and dry-run previews.
- Keep mutable workflow state in first-class tables rather than burying it in
  event payloads.
