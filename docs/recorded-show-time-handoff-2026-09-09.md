# Recorded show time — 2026-09-09

Marker: `BOB_MULTI_APP_FINISH_20260908`.

## Problem and change

Event cards previously called device-local `toLocaleString()`, even when an
event's recorded timezone was America/Chicago. The real browser regression
shows the June 15, 2030 7:30 PM Chicago show as June 16 at 00:30 in UTC and
June 16 at 09:30 in Tokyo. Show Control and the event editor already honored
the recorded timezone.

Both operations display surfaces now use the same pure shared formatter.
Unknown/invalid zones display UTC with a warning, consistently on server and
client. Missing/invalid dates do not acquire a fabricated time. Existing
zone-less editor interpretation remains unchanged; this does not change
write conversion, status, readiness, API roles, or provider behavior.

The 320px browser case also reproduced a 4px page overflow: the implicit
Events grid track expanded to the form's intrinsic width. An explicit single
`minmax(0, 1fr)` track keeps the cards within the phone viewport, while the
large-screen form/detail split remains in place. No text is hidden or clipped.

## Validation

Four helper regressions cover device-zone independence, repeated DST clock
times, deterministic unknown-zone fallback, and absent/invalid dates. Two
browser cases exercise the actual card/editor on UTC/390px and Tokyo/320px,
including no write while viewing and phone width. Both cases fail against
the old app on the mismatched date, after fixing a retained fixture's port.
The initial sign-in failure was fixture setup, not product regression evidence.

Local checks passed: typecheck, lint, 96 shared and 299 API unit tests,
99/99 Manager checks (100% safety), both production builds, seven disposable
PostgreSQL integration workflows, and all 33 Chromium journeys. The final
browser rerun covers the grid follow-up; unchanged API/helper tests from the
same pass remain valid. Exact source receipts are recorded in the PR and
coordination handoff. Installed dependencies and an
existing disposable PostgreSQL/Redis fixture are reused. Direct integration
and browser entrypoints omit database preparation/migrations; fixture data
is reset and seeded only in that already-created disposable test database.

## Backup and hosted gate

The current goal prohibits installation. The existing hosted Quality workflow
installs test dependencies/Chromium and builds a container; installation
clarification remains pending. No workflow weakening or hidden skipped-green
claim is appropriate. Preserve the candidate on a separate backup branch
whose push does not trigger these workflows. Existing OPEN DRAFT #36 keeps
its previously verified head until the test-install gate is explicitly resolved.
The PR/coordination receipt names the exact backup source and distinguishes
its local checks from the older draft's hosted result.

After authorization, verify both remote tips and the lease before advancing
that same draft, rerun hosted Quality on the actual integration, and record
its head/base/tree and Codex-agent reviews. Do not merge or deploy.

Travis books / NEVER_AUTO_POST; parked #21, dependencies, schema, providers,
API authorization and save paths remain untouched. No install or live action
is part of this source change.
