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
into measurable, reviewable work. A decision stores two to six options and
their tradeoffs; a recorded choice also requires rationale, expected outcome,
and review date. A later immutable review records `worked`, `mixed`,
`did_not_work`, or `inconclusive` plus the band's observed result. Due reviews
are operating work, while reviewed results are bounded evidence rather than a
rule the system may generalize automatically. `ManagerMemoryFact` stores only explicit
facts with source, confidence, sensitivity, and confirmation time.
An explicit `remember_fact` recommendation is the only conversational memory
write: its exact value is shown before acceptance, the current operator request
must match it byte-for-byte after normalization, and acceptance upserts a
normal-sensitivity `operator_confirmation` fact. `ManagerRecommendation.memoryFactId`
retains that provenance. Profile-owned facts remain in
`ArtistOperatingProfile`, while sensitive conversational capture is refused.
`ManagerRun` and `ManagerRecommendation` preserve the prompt/model version,
facts read, structured output, safe proposed actions, outcome, and runtime
metadata. `ManagerConversation` and `ManagerMessage` retain a shared,
artist-scoped conversation; reasoning uses only the latest 12 messages and API
reads return at most 50. Every delivered assistant message may link its exact
`ManagerRun`. `ManagerMessageFeedback` stores one audited, tenant-scoped
helpful/correction verdict per response and operator. Free-text corrections are
retained for human review but are not sent back through model instructions;
only bounded reason aggregates affect code-owned response presentation.
The non-persistent `manager_conversation_continuity_v1` projection reads only
the immediately preceding assistant message's structured recommendation. It
classifies bounded explain, recheck, blocking, details, and action follow-ups,
then rechecks the stable key or exact typed-action identity against current
deterministic projections. It never treats prior assistant prose as a referent
and never creates a second recommendation from the follow-up.
The non-persistent `manager_subject_reference_v1` projection builds candidates
only from the active artist's bounded Manager facts for goals, tasks, events,
projects, decisions, opportunities, prospects, offers, invoices, and
settlements. A conservative match binds a direct answer to one current record;
ambiguous and missing quoted references clarify instead of selecting a list's
first record. Only policy, match type, confidence, kind hints, and record IDs
are retained in the run trace.
`ManagerSettings` holds owner-controlled AI/data choices and an optional
operating cadence. The schedule uses the profile's daily/weekly cadence plus a
validated timezone, local hour, weekly day, and owner/team audience. Claim and
completion timestamps make worker state inspectable. Scheduled model use is a
separate opt-in from normal Manager AI. A nullable unique
`ManagerRun.scheduleKey` identifies one artist/local period; the corresponding
brief and `manager_brief_ready` notification are persisted atomically.
Assistant messages can reference a reviewable
`ManagerRecommendation`, but cannot directly perform provider, legal, or
financial actions. Recommendation outcome reason/note/time support reviewed
learning; accepted recommendations link to a task or one open decision draft.
Three immediate internal recommendation types reuse existing authorities:
`generate_event_advance` creates `show_advance_v1` Tasks for a cited event and
`generate_project_plan` creates `project_plan_v1` Tasks for a cited project.
`remember_fact` writes only the exact reviewed normal-sensitivity operator note.
Their target ownership and date are revalidated, task source keys make replay
idempotent, and a successful acceptance records `action_executed` and completes
the recommendation in the same transaction.
`ManagerMemoryFact.sensitivity` also controls provider eligibility: `normal`
may enter redacted context, `sensitive` requires full-context owner consent,
and `restricted` remains local. `ManagerRun.inputFacts` always stores the
redacted projection; its trace stores policy counts and provider-attempt/output
status rather than withheld values.
`ManagerResponseEvalExample` is an owner-promoted, artist-scoped reference to
one assistant message and its exact rated response snapshot. It does not copy
run input facts. Useful examples replay quality and evidence rules; negative
examples retain expected behavior and resolution metadata for a later
code-registered Manager version. The unique message link makes promotion
idempotent, and audit history records promotion and resolution.
`manager_priority_v1` is derived rather than stored as another authority. It
collects every brief candidate, suppresses handled work, ranks candidates from
authoritative record timing/state, and only then applies Today/This week limits.
Model and deterministic candidates with the same stable key or overlapping
workstream evidence are merged before ranking. `ManagerRun.trace` stores the
bounded factor codes, impacts, and omitted candidate summaries that explain the
result; the recommendation rows remain the executable review boundary.
Conversation-created decisions have `needsFraming=true`, cannot be chosen until
a member saves real options/tradeoffs, and complete the linked recommendation
only after an outcome review. Task completion is attributed automatically.
`ManagerGoal.measurementKind` declares whether progress is manual or derived
from one bounded StoryBoard source: current qualified/converted prospects,
confirmed gigs in the goal window, completed gigs in the goal window, or
completed projects explicitly linked to the goal. The non-persistent
`manager_goal_measurement_v1` projection reports the observed value, drift,
source label, and evidence IDs. `ManagerGoalProgressEvent` is the append-only
source for both manual numeric updates and member-approved reconciliation; it
retains prior/current values, actor, policy source, and source kind. The sync
route recomputes evidence in a serializable transaction and creates no event
when already aligned. Plan health is derived—not stored—from goal measurement,
deadlines, linked initiatives, blockers, and task ownership/state.
`ManagerGoal.targetDirection` declares whether the numeric target is a minimum
(`at_least`), a cap (`at_most`), or an exact final result (`exact`); existing
goals retain `at_least` through the migration default. The non-persistent
`manager_goal_target_v1` projection reports recorded target state, finality,
gap, display language, and a bounded next step. Caps and exact values are
provisional until their deadline. It deliberately makes no linear-pace,
probability, effort, or duration forecast.
`ManagerGoalPath` is the non-persistent `manager_goal_path_v1` view that joins
that goal state to active initiatives, linked tasks, and
`manager_work_sequence_v1`. It names one ready linked task or transitive
prerequisite when one exists, exposes missing links and contradictory dates,
and never estimates task duration, conversion, effort, or member capacity. A
goal-path task proposal is valid only while its cited initiative remains active
and has no open task; acceptance revalidates those facts before the audited
write.

Nullable, artist-unique `sourceKey` values on goals, initiatives, and tasks identify
`manager_plan_v1` starter records without constraining normal user-created
work. They make fill-missing generation idempotent while leaving user edits
authoritative. `ArtistOperatingProfile` is also authoritative for the
profile-backed Manager memory keys `band_mode`, `home_market`,
`twelve_month_ambition`, and `constraints`. Profile writes upsert those rows in
the same transaction; `manager_knowledge_v1` derives current, stale,
unconfirmed, low-confidence, or conflicted state from source, confirmation,
confidence, and bounded review age. Runtime reasoning projects the profile
value over a duplicate conflict. `ManagerMemoryFact.archivedAt` removes
incorrect or obsolete non-profile memory from reasoning without destructive
deletion. These records
never store hidden reasoning. `ManagerEvalExample` is an owner-reviewed,
tenant-scoped recommendation/outcome snapshot used for offline evaluation; its
existence never changes the active runtime version. Owner-triggered
`ManagerEvaluationRun` rows retain candidate, dataset, pass metrics, and
scenario results; they cannot activate a version.
`ManagerOutcomeReview` is a derived, non-persistent view over bounded recent
events, projects, tasks, campaign outcomes, invoices, expenses, and settlements.
It carries premise-coverage confidence and evidence IDs, groups money by
currency, and never derives net income for a show without a settlement.
`ManagerContextHealth` is another derived, non-persistent view. It measures
recorded identity/strategy, people/responsibilities, business facts, and active
execution on four transparent 25-point dimensions. It orders unanswered
questions by operational importance and carries evidence IDs; it never scores
talent, artistic quality, likelihood of success, or facts that were not saved.
`ManagerEvidenceHealth` (`manager_evidence_v1`) is the operational confidence
companion to context health. It composes current events/readiness, booking
updates, projects/readiness, open deal/invoice/settlement rows, goal measurement,
and the active lineup into six bounded areas. Its states—current,
needs-confirmation, stale, missing, and conflicted—describe only StoryBoard's
evidence. Missing records never prove that no real-world obligation or activity
exists. The projection is tenant-scoped, non-persistent, provider-safe, and
cannot authorize or execute work.
`manager_coaching_v1` is also derived and non-persistent. It maps an explicit
learning question to a reviewed music-business concept, optionally projects
same-artist evidence such as a draft settlement or open invoice, and returns no
action. The catalog is intentionally separate from `ManagerMemoryFact`: a
generic definition is not a claim about the band, while workspace context must
still come from authoritative records. Saved `educationTopics` personalize UI
prompts but cannot add new catalog entries or instructions at runtime.

### Events, music, projects, and deals

`BandEvent` is the shared spine for gigs, rehearsals, studio, releases,
promotion, travel, and meetings. It links participants/availability, schedule,
venue/contact, opportunity, project, setlist, advance tasks, offers, invoices,
expenses, and one settlement. Confirmed opportunities have at most one event.
`ShowReadiness` is a derived, non-persistent view over those artist-owned
records. It exposes category scores, confidence, evidence IDs, and prioritized
gaps so the event workspace and Manager use one explainable readiness policy.
Show-advance tasks use artist-unique `show_advance_v1:<event>:<step>` source
keys whether generated from Operations or an accepted Manager recommendation.
Event timeline writes preserve `startsAt <= endsAt` and the recorded show-day
order load-in → soundcheck → doors → set → curfew. Patch validation merges the
new values with existing values before checking this invariant.
`EventScheduleItem` stores additional real-world checkpoints such as travel
calls, meals, support slots, and changeovers. It inherits artist ownership from
its required `BandEvent`; service writes require the exact artist/event/item
chain, validate `endsAt > startsAt` on the merged row, and are audited. These
rows join the canonical event timestamps in one ordered day-of projection.
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
same-currency expenses, net, and basis-point `MemberSplit` amounts, then becomes
immutable on finalization. Other-currency costs remain separate rather than
being combined as equal minor units. At finalization, included expenses receive
the settlement link transactionally and the draft is recalculated before freezing
its splits and PDF snapshot. All money uses integer minor units and an explicit
currency.

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
may link to one active working `BandMember` through nullable `bandMemberId`;
`ownerLabel` remains a display snapshot and legacy-import field. Relationship
writes are artist-scoped, unlinking clears both fields, and historical labels
are not automatically backfilled. Tasks also carry due dates and checklist
metadata. Blocked tasks require
`blockedReason`; `waitingOn` records the external or internal party holding the
next step. `deferralCount` and `lastDeferredAt` preserve repeated later-date
changes. `ManagerCommitmentHealth` is a non-persistent ranked view over these
facts; it does not create a second task state machine.

`TaskDependency` is the artist-scoped directed edge from a dependent `Task` to
one prerequisite `Task`. The pair is unique. Both endpoints must belong to the
same artist, self-links and cycles are invalid, and a prerequisite may not be
dated after its dependent. A task cannot complete while a prerequisite is open;
an open prerequisite cannot be restored beneath completed downstream work.
`ManagerWorkSequence` is the non-persistent `manager_work_sequence_v1` view over
this graph. It reports `ready_now`, `in_progress`,
`waiting_on_prerequisites`, `manually_blocked`, or `conflicted`, plus the
downstream work each ready task unlocks. It does not estimate effort, duration,
or unrecorded member capacity.

`BandMemberCheckIn` is append-only artist-scoped history for a voluntary
`available`, `limited`, or `unavailable` planning signal with optional expiry
and bounded note. The latest unexpired row is current; missing and expired rows
project as unknown. Notes are visible in the tenant UI but excluded from model
context.

`ManagerTeamLoad` is a separate non-persistent `manager_team_load_v2` view over
tasks, active members, and their current check-ins. It measures recorded task
coverage/pressure and may identify one unique responsibility match; it does not
claim to know hours, effort, wellbeing, or outside commitments.

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
