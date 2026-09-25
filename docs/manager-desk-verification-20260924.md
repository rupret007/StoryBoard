# Manager desk verification — 2026-09-24

Goal: `STORYBOARD_AMAZING_BAND_MANAGER_20260924`.
Lane: extend open draft #42, `cursor/manager-schedule-chat-87f1`.
Base: `origin/main` at `51abb4b147d83fdecd2c297b8ae1acb07a8b8fe2`.

## Recorded behavior

Manager chat returns the full recorded day-of timeline, including custom
checkpoints, notes, location, dates, timezone, and passed/next markers. A named
event stays selected; otherwise the nearest current/upcoming dated event is
selected, even if its schedule is missing. Shows already underway remain in
view. “Today”/“tonight” uses the event's recorded timezone and never borrows a
future day's show. A missing/invalid timezone falls back to labeled UTC with
an explicit warning. Missing requested load-in/soundcheck/doors/set/curfew
stays missing. A passed checkpoint never becomes the desk's next checkpoint.

Desk snapshots show booking, setlists, invoices, and run-of-show together.
Invoice balances remain separated by currency and exclude void/paid records.
Overdue means a past UTC calendar day, matching the date editor. Due today is
not overdue. Next due and missing due dates are stated alongside overdue
balances; Manager brief recommendations use the same calendar rule. Booking
follow-ups also compare calendar days.

Schedule, desk, invoice, and catalog questions bypass provider rewriting,
even with AI enabled. Existing membership, sensitivity, reviewed-action, and
audit behavior remains in the Manager service. The service test exercises
chat persistence with an in-memory persistence adapter and checks that no
provider key is read or tool attempted.

## Vault decision

No import plumbing or real data import was needed. Existing local preview/apply
already supports the empty-library path. The new empty desk and empty running
order checks direct the operator to the existing local Vault feed workflow in
[catalog-import.md](catalog-import.md). No Vault or Show Night repository was
accessed. No private catalog is included. Vault remains the sole catalog.

## Reproduce

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm manager:eval
node scripts/manager-desk-transcript.mjs
pnpm catalog:import
```

The transcript script calls the same deterministic chat function used by the
API and fails if any desk golden check fails. Checked-in output:
[Manager desk transcript](manager-desk-transcript-20260924.md). All records in
that transcript are explicitly synthetic offline fixtures, not Jeff's gigs,
songs, invoices, or a deployed database. The catalog command previews the
checked-in shape sample only; it does not apply it.

## Iteration log

| Checkpoint | Attempt and evidence | Next experiment |
| --- | --- | --- |
| 1 | `git fetch origin` exit 0; `gh pr list --state open` exit 0: only draft #42; `git merge-base --is-ancestor origin/main HEAD` exit 0. | Extend #42 without rebase or a second draft. |
| 2 | Initial `pnpm typecheck` passed. New fixture compilation initially failed (exit 2: incomplete readiness fixture); fixed fixture shape. `pnpm manager:eval` then passed 116/116, safety 100%. | Add requested-checkpoint, local-day, nearest-missing-schedule and AI-enabled service regressions. |
| 2 follow-up | `node --test apps/api/test/manager-desk.test.mjs` exit 0: 18/18; initial service harness failures were missing fixture projections, corrected before the full gate. | Full repository gate and transcript replay. |
| 3 | `pnpm catalog:import` exit 0: checked-in shape sample preview only, 3 planned songs / 1 setlist; no apply. | Reuse existing importer; document missing-data guidance. |
| 4 | `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm manager:eval` exit 0: 106 shared + 317 API tests; both builds; 119/119 evals, safety 100%. | Commit and update the existing draft only. |
| Transcript | `node scripts/manager-desk-transcript.mjs` exit 0, 17/17 focused checks; replay under `TZ=Pacific/Honolulu` and `TZ=Asia/Tokyo`, both `cmp` exit 0. | Attach this reproducible offline evidence to #42. |

## Holds and limits

Draft only. No merge, tag, release, deploy, social post, pitch, provider send,
external CRM write, email, or SMS. No catalog apply or live database mutation.
No claim of live deployment or verification against Jeff's private records.

Answers use the existing bounded, artist-scoped Manager facts snapshot, not a
new all-records reporting API. An unqualified schedule request selects one
nearest dated event; ask for a named event to inspect another. “Today” and
“tonight” mean the event's local calendar day, falling back to UTC when its
zone is missing/invalid. Missing data still needs deliberate operator entry.
Hosted integration/browser/container checks are separate from the local gate
above; consult the PR's exact-tip Quality result for their status.
