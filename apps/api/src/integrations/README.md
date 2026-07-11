# Integrations Boundary

All third-party systems must sit behind adapter interfaces in this boundary.

Current MVP adapter targets:

- Gmail
- Google Calendar
- Google Drive
- Bandsintown
- Ticketmaster
- YouTube
- Spotify

Later adapters can be added without leaking provider details into domain modules.

## Manager OS boundaries

Manager reasoning never receives these adapters and cannot call a provider
directly. It may prepare a typed proposal, but Gmail, Calendar, and Drive writes
must become an `ApprovalRequest`, be approved by a human, and execute through
the existing adapter registry. Legal and financial records have an additional
owner/template/idempotency boundary in the operations service.

Round 2 deliberately ships manual/mock payment and signature handling. The
generated agreement and settlement PDFs are immutable StoryBoard snapshots.
Automatic binary upload/attachment is not yet implemented: delivery prepares a
Gmail draft that references the snapshot, and a human attaches the reviewed
file. Add Drive binary upload, Gmail attachment, Stripe, or e-signature only as
new adapter methods with credential, webhook, cost, compliance, idempotency,
and real-provider acceptance coverage.
