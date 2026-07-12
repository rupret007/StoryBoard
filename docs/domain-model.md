# StoryBoard Domain Model

## Core Entities

### Artist

The top-level tenant for MVP state. An artist owns venues, contacts, booking
profiles, prospects, booking opportunities, campaigns, tasks, approvals, command
runs, and integrations.

### Manager operating model

`ArtistOperatingProfile` stores how the band works and what it is trying to
achieve. `BandMember` describes real performers/crew independently of app
logins. `ManagerGoal`, `ManagerInitiative`, and `ManagerDecision` turn ambition
into measurable, reviewable work. `ManagerMemoryFact` stores only explicit
facts with source, confidence, sensitivity, and confirmation time.
`ManagerRun` and `ManagerRecommendation` preserve the prompt/model version,
facts read, structured output, safe proposed actions, outcome, and runtime
metadata. `ManagerConversation` and `ManagerMessage` retain a shared,
artist-scoped conversation; reasoning uses only the latest 12 messages and API
reads return at most 50. Assistant messages can reference a reviewable
`ManagerRecommendation`, but cannot directly perform provider, legal, or
financial actions. Recommendation outcome reason/note/time support reviewed
learning; accepted recommendations link to a task and task completion is
attributed automatically. `ManagerGoalProgressEvent` is the append-only source
for manual numeric progress updates and retains prior/current values and actor.
Plan health is derived—not stored—from goal measurement, deadlines, linked
initiatives, blockers, task ownership/state, and elapsed timeline. Nullable,
artist-unique `sourceKey` values on goals, initiatives, and tasks identify
`manager_plan_v1` starter records without constraining normal user-created
work. They make fill-missing generation idempotent while leaving user edits
authoritative. `ManagerMemoryFact.archivedAt` removes incorrect or
obsolete memory from reasoning without destructive deletion. These records
never store hidden reasoning. `ManagerEvalExample` is an owner-reviewed,
tenant-scoped recommendation/outcome snapshot used for offline evaluation; its
existence never changes the active runtime version. Owner-triggered
`ManagerEvaluationRun` rows retain candidate, dataset, pass metrics, and
scenario results; they cannot activate a version.

### Events, music, projects, and deals

`BandEvent` is the shared spine for gigs, rehearsals, studio, releases,
promotion, travel, and meetings. It links participants/availability, schedule,
venue/contact, opportunity, project, setlist, advance tasks, offers, invoices,
expenses, and one settlement. Confirmed opportunities have at most one event.
`ShowReadiness` is a derived, non-persistent view over those artist-owned
records. It exposes category scores, confidence, evidence IDs, and prioritized
gaps so the event workspace and Manager use one explainable readiness policy.
Event timeline writes preserve `startsAt <= endsAt` and the recorded show-day
order load-in → soundcheck → doors → set → curfew. Patch validation merges the
new values with existing values before checking this invariant.
`EventDayOfView` is another non-persistent projection. It combines the shared
readiness result with the ordered timeline, active-member responses, event
tasks, accepted terms, and unique invoices to identify the current/next
checkpoint, work pressure, and recorded payment state. It never infers that an
unrecorded payment, agreement, contact, or schedule fact exists.

`Song` and `Setlist` provide a practical artist-owned library with duration,
key, BPM, lead vocalist, ordered songs/breaks/notes, and event linkage.
`ArtistProject` groups release, content, tour, and business work with goals,
assets, metrics, budget, events, tasks, and expenses.
Project-linked `Task` rows are the executable milestones; template-created
milestones carry nullable `project_plan_v1:<project>:<step>` source keys for
idempotent fill-missing behavior. `ProjectReadiness` is a non-persistent view of
target date, milestone progress/ownership/blockers, metrics, assets, budget,
expenses, and linked events. It exposes its score, confidence, gaps, next
milestone, and evidence rather than asserting an unsupported project outcome.

`DealOffer` and immutable versioned `DealMemo` snapshots lead into an
`Agreement` based on an owner-activated `DocumentTemplate`. Generated
`DocumentSnapshot` PDFs are content-addressed with SHA-256. `Invoice` balances
derive from idempotent `PaymentRecord` rows. `Settlement` derives gross,
expenses, net, and basis-point `MemberSplit` amounts, then becomes immutable on
finalization. All money uses integer minor units and an explicit currency.

### Venue

Represents a physical room or club only. Stores location, capacity, and
relationship notes. A venue may have multiple related contacts and booking
opportunities. Festivals, private buyers, and corporate buyers are prospects,
not venues.

### Contact

Represents a human relationship connected to an artist and optionally a venue.
Contacts include promoters, talent buyers, venue managers, and collaborators.

### BookingOpportunity

Represents a potential or active show opportunity. Tracks stage, target date,
market notes, and source system references.

### ArtistBookingProfile

An artist-scoped, one-to-one quick booking profile: home market, genres, target
capacity range, short pitch, and optional press-kit/live-video links. It can be
saved as an incomplete draft, but must be ready before prospect conversion or
campaign work.

### BookingProspect

An artist-scoped lead discovered manually or from Ticketmaster. Types are
`venue`, `festival`, `private_event`, and `corporate_event`; lifecycle is
`discovered`, `qualified`, `disqualified`, or `converted`. Provider references
dedupe imports per artist. Conversion is idempotent: a physical venue prospect
creates a venue; other types create a venue-less booking opportunity and may
create/link a buyer contact.

### BookingCampaign and BookingCampaignRecipient

An approval-gated pitch batch and its individual prospect/contact recipients.
Campaign templates support only `artistName`, `contactName`, `prospectName`,
`market`, `bookingPitch`, and `pressKitUrl`. Approval execution creates Gmail
drafts, marks recipients drafted, and creates one linked follow-up task per
recipient; it never sends an email or advances the booking stage automatically.

### Task

Represents a piece of operational follow-through. Tasks may exist independently
or attach to a booking opportunity, event, project, or manager initiative. They
carry ownership labels, due dates, and checklist metadata.

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

- An `Artist` has one optional `ArtistBookingProfile` and many `Venue`,
  `Contact`, `BookingProspect`, `BookingOpportunity`, `BookingCampaign`, `Task`,
  `ApprovalRequest`, and `CommandRun` records.
- A `Venue` may have many `Contact` and `BookingOpportunity` records.
- A `BookingOpportunity` may generate many `Task`, `ApprovalRequest`, and
  `CommandRun` records.
- A `BookingCampaign` has many recipients; every recipient links one qualified
  prospect and may link a contact, opportunity, and one generated follow-up task.
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
