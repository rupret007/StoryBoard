# Offline Manager chat transcript

Synthetic fixtures only; no live band data, provider calls, or database writes.

## desk-in-progress-recorded-timeline

Question: What is today's schedule?

Run-of-show for "Recorded fixture event" (Thu, Sep 24, 2026, 2:00 PM CDT; confirmed):

• Thu, Sep 24, 2026, 1:00 PM CDT — Load-in ✓
• Thu, Sep 24, 2026, 3:30 PM CDT — Soundcheck ←
• Thu, Sep 24, 2026, 4:00 PM CDT — Recorded break — Recorded note
• Thu, Sep 24, 2026, 9:00 PM CDT — Curfew

Next checkpoint: Soundcheck in 30 minutes. Add the performing lineup in Manager before confirming readiness.

Citations: fixture-event, fixture-checkpoint

## desk-invoice-calendar-today

Question: Which invoices are unpaid and next due?

1 unpaid invoice total USD 75.00; 0 overdue by recorded UTC calendar day. Next recorded due: FIXTURE-TODAY, Sep 24, 2026 (UTC calendar date, today). No draft settlement is waiting.

My next move would be: Verify whether payment arrived, then prepare a reviewed reminder if it is still outstanding.

Citations: fixture-invoice

## desk-invoice-mixed-dates-currencies

Question: Give me a manager desk snapshot

Manager desk snapshot (recorded now):

Booking: 0 active opportunities, 0 qualified prospects, 0 unread replies, and 0 overdue follow-ups.
Setlists: No songs or setlists are recorded yet. Preview a local Vault app_api.json in Band operations → Music & setlists, then apply the reviewed import (docs/catalog-import.md). Vault remains the sole catalog.
Invoices: 3 unpaid invoices total USD 150.00 and EUR 75.00; 1 overdue by recorded UTC calendar day. Next recorded due: FIXTURE-TODAY, Sep 24, 2026 (UTC calendar date, today). 1 unpaid invoice has no recorded due date.
Run-of-show: Recorded fixture event (Thu, Sep 24, 2026, 2:00 PM CDT; confirmed) — next checkpoint is Soundcheck at Thu, Sep 24, 2026, 3:30 PM CDT.

First move: Verify whether payment arrived, then prepare a reviewed reminder if it is still outstanding.

Citations: fixture-invoice, past, undated, fixture-event, fixture-checkpoint

## desk-empty-guidance

Question: Give me a manager desk snapshot

Manager desk snapshot (recorded now):

Booking: 0 active opportunities, 0 qualified prospects, 0 unread replies, and 0 overdue follow-ups.
Setlists: No songs or setlists are recorded yet. Preview a local Vault app_api.json in Band operations → Music & setlists, then apply the reviewed import (docs/catalog-import.md). Vault remains the sole catalog.
Invoices: No unpaid invoices are recorded.
Run-of-show: No current or upcoming dated event is recorded, so run-of-show is not available yet. Undated records cannot establish a schedule.

First move: Complete the guided Manager setup.

Citations: none

## desk-empty-running-order

Question: What is our setlist?

0 songs and 1 setlist are recorded.

Setlists:
• Recorded empty draft — draft; 0 items

No songs are recorded. Vault is the catalog; default import is the published setlist_ready_default_import / default_live slice from a local app_api.json (`pnpm catalog:import`, then --apply). Preview the same local JSON in Band operations → Music & setlists. This empty table is not a second catalog. Recorded setlists are empty; add recorded Vault songs in Band operations → Music & setlists before using a running order. StoryBoard will not invent titles, auto-post, or treat a parked catalog as another live band.

Citations: empty-set

## desk-nearest-missing-schedule

Question: What is the run-of-show?

"Nearest recorded event" does not have a recorded schedule. Open Day-of view to add load-in, soundcheck, doors, set, curfew, and any custom checkpoints (meals, support slots, changeovers).

Citations: missing

## desk-today-does-not-borrow-tomorrow

Question: What is today's schedule?

No event for today is recorded in StoryBoard. A schedule is not recorded for this request. Record the real event date, timezone, and day-of checkpoints in Band operations before relying on run-of-show.

Citations: none

## desk-passed-checkpoint-is-not-next

Question: Manager desk snapshot

Manager desk snapshot (recorded now):

Booking: 0 active opportunities, 0 qualified prospects, 0 unread replies, and 0 overdue follow-ups.
Setlists: No songs or setlists are recorded yet. Preview a local Vault app_api.json in Band operations → Music & setlists, then apply the reviewed import (docs/catalog-import.md). Vault remains the sole catalog.
Invoices: No unpaid invoices are recorded.
Run-of-show: Recorded fixture event (Thu, Sep 24, 2026, 2:00 PM CDT; confirmed) — No next checkpoint is recorded; the recorded checkpoints have passed.

First move: Complete the guided Manager setup.

Citations: fixture-event

## desk-invalid-timezone-honesty

Question: When is load-in?

Run-of-show for "Recorded fixture event" (Thu, Sep 24, 2026, 7:00 PM UTC · recorded timezone is invalid; confirmed):

• Thu, Sep 24, 2026, 6:00 PM UTC · recorded timezone is invalid — Load-in ✓
• Thu, Sep 24, 2026, 8:30 PM UTC · recorded timezone is invalid — Soundcheck ←
• Thu, Sep 24, 2026, 9:00 PM UTC · recorded timezone is invalid — Recorded break — Recorded note
• Fri, Sep 25, 2026, 2:00 AM UTC · recorded timezone is invalid — Curfew

Next checkpoint: Soundcheck in 30 minutes. Add the performing lineup in Manager before confirming readiness.

Citations: fixture-event, fixture-checkpoint

## desk-missing-timezone-honesty

Question: When is load-in?

Run-of-show for "Recorded fixture event" (Thu, Sep 24, 2026, 7:00 PM UTC · timezone not recorded; confirmed):

• Thu, Sep 24, 2026, 6:00 PM UTC · timezone not recorded — Load-in ✓
• Thu, Sep 24, 2026, 8:30 PM UTC · timezone not recorded — Soundcheck ←
• Thu, Sep 24, 2026, 9:00 PM UTC · timezone not recorded — Recorded break — Recorded note
• Fri, Sep 25, 2026, 2:00 AM UTC · timezone not recorded — Curfew

Next checkpoint: Soundcheck in 30 minutes. Add the performing lineup in Manager before confirming readiness.

Citations: fixture-event, fixture-checkpoint

## desk-cancelled-event-excluded

Question: What is today's schedule?

No event for today is recorded in StoryBoard. A schedule is not recorded for this request. Record the real event date, timezone, and day-of checkpoints in Band operations before relying on run-of-show.

Citations: none

## desk-missing-requested-checkpoint

Question: When is load-in?

Load-in time is not recorded. Record it in Day-of view; other checkpoints do not establish that time.

Run-of-show for "Recorded fixture event" (Thu, Sep 24, 2026, 2:00 PM CDT; confirmed):

• Thu, Sep 24, 2026, 3:30 PM CDT — Soundcheck ←
• Thu, Sep 24, 2026, 4:00 PM CDT — Recorded break — Recorded note
• Thu, Sep 24, 2026, 9:00 PM CDT — Curfew

Next checkpoint: Soundcheck in 30 minutes. Add the performing lineup in Manager before confirming readiness.

Citations: fixture-event, fixture-checkpoint

## desk-today-uses-recorded-zone

Question: What is today's schedule?

Run-of-show for "Recorded fixture event" (Thu, Sep 24, 2026, 9:00 PM CDT; confirmed):

• Thu, Sep 24, 2026, 1:00 PM CDT — Load-in ✓
• Thu, Sep 24, 2026, 3:30 PM CDT — Soundcheck ←
• Thu, Sep 24, 2026, 4:00 PM CDT — Recorded break — Recorded note
• Thu, Sep 24, 2026, 9:00 PM CDT — Curfew

Next checkpoint: Soundcheck in 30 minutes. Add the performing lineup in Manager before confirming readiness.

Citations: fixture-event, fixture-checkpoint

## desk-snapshot-does-not-skip-missing-timeline

Question: Manager desk snapshot

Manager desk snapshot (recorded now):

Booking: 0 active opportunities, 0 qualified prospects, 0 unread replies, and 0 overdue follow-ups.
Setlists: No songs or setlists are recorded yet. Preview a local Vault app_api.json in Band operations → Music & setlists, then apply the reviewed import (docs/catalog-import.md). Vault remains the sole catalog.
Invoices: No unpaid invoices are recorded.
Run-of-show: Recorded fixture event (Thu, Sep 24, 2026, 2:00 PM CDT; confirmed) has no recorded day-of timeline yet. Add load-in, soundcheck, doors, set, and curfew before relying on run-of-show.

First move: Add the performing lineup in Manager before confirming readiness.

Citations: fixture-event

## desk-cross-domain-plural-routing

Question: Summary of booking and invoices

Manager desk snapshot (recorded now):

Booking: 0 active opportunities, 0 qualified prospects, 0 unread replies, and 0 overdue follow-ups.
Setlists: No songs or setlists are recorded yet. Preview a local Vault app_api.json in Band operations → Music & setlists, then apply the reviewed import (docs/catalog-import.md). Vault remains the sole catalog.
Invoices: 1 unpaid invoice total USD 75.00; 0 overdue by recorded UTC calendar day. Next recorded due: FIXTURE-TODAY, Sep 24, 2026 (UTC calendar date, today).
Run-of-show: Recorded fixture event (Thu, Sep 24, 2026, 2:00 PM CDT; confirmed) — next checkpoint is Soundcheck at Thu, Sep 24, 2026, 3:30 PM CDT.

First move: Complete the guided Manager setup.

Citations: fixture-invoice, fixture-event, fixture-checkpoint

17/17 desk checks passed.
