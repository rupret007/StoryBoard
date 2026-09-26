# Recorded booking desk

Manager chat supports **“What needs a Travis decision next?”** and
**“Draft a venue pitch pack from records only.”** Travis owns booking and
follow-ups. These answers prepare text for his review, with no action proposal,
provider request, campaign creation, email/SMS, CRM mutation, or social post.
Normal authenticated conversation/run storage remains in place.

A pitch pack requires one matching recorded booking, a linked venue with name
and city, a target calendar date, and a nonempty setlist linked through that
booking's active event at the same venue. Every song must be active with Vault
provenance. Breaks/notes never become invented songs or durations. Confirmed
bookings may be packaged with their recorded stage; closed bookings are excluded.
A target date is explicitly a UTC calendar day, never a confirmed performance
time. The pack does not assert fees, availability, buyer interest, or show times.

With multiple bookings, ask **“Draft a venue pitch pack for EXACT BOOKING TITLE
from records only”** (an exact booking ID or venue name also works). Ambiguous
and unknown targets block instead of substituting another venue. Missing linked
facts block with the fields to record in Booking / Band operations. There is no
fallback to the first library setlist or to a generated catalog. Use the existing
local Vault import; this feature neither imports nor fetches catalog data.

Travis's decision answer selects the earliest recorded campaign follow-up
(deadlines before undated records; ID breaks ties), excluding recorded completed
follow-up tasks. Missing booking links or dates block preparation. Otherwise it
asks Travis to decide whether to prepare or defer. With no campaign follow-ups,
it surfaces the earliest target among target/outreach/conversation/offer/hold
bookings and does not turn the target date into a follow-up deadline. Missing
venue/setlist facts remain blockers. It does not claim a saved ManagerDecision
or change task ownership. The answer is scoped to the existing bounded Manager
view (30 booking opportunities and 30 campaign recipients), not a global promise
that no other work exists.

`manager-booking-desk.test.mjs` covers missing/invalid records, unrelated catalog
fallback refusal, ambiguous/unknown targets, Vault provenance, tenant isolation,
calendar truth, and read-only output. `manager-desk.test.mjs` exercises both
requests with AI enabled and a provider trap. The offline Manager gate includes
empty booking/pitch and unlinked follow-up regressions. Existing role checks,
reviewed write workflows, and audit paths stay in force.
