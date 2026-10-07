# Pilot background-worker and restart check

StoryBoard runs its existing BullMQ worker inside the API process when
`ENABLE_QUEUE_WORKER=true`. `/ready` checks that the database and Redis are
reachable and a worker exists; it does not establish that a job actually ran.

Run this check after building the API from the checkout being reviewed:

```bash
pnpm --filter @storyboard/api build
node scripts/check-pilot-worker.mjs
```

Prerequisites: Docker running, the repository dependencies installed, and local
`postgres:16` and `redis:7` images. The check refuses to pull images automatically.
It typically takes one to two minutes because it waits for the real recurring
Manager scan, whose minimum interval is one minute.

The check creates two uniquely named disposable containers bound to localhost,
a database named `storyboard_worker_test`, and a temporary API runtime directory.
It accepts no target URLs, database names or existing container names. Existing
app instances, containers and databases are not stopped, emptied or restarted.
The ordinary API build is used; no alternate worker implementation is introduced.

The synthetic fixture has one band, one owner, completed intake and an explicitly
enabled weekly Manager schedule. Its timezone is UTC, Monday at midnight, so its
weekly slot is due on any day. AI, Gmail reply sync, development login and provider
credentials are disabled. Only an in-app notification is expected; there are no
real accounts, catalog data, provider connections, recipients or sends.

A successful run establishes all of the following:

- The existing BullMQ worker consumes `manager.schedule.scan` and produces one
  deterministic scheduled brief plus one `manager_brief_ready` notification.
- Another queued scan and the registered recurring scan complete successfully
  without creating a second brief or notification for the same period.
- With the API stopped, a newly queued scan waits. The check restarts its own
  PostgreSQL container, starts the API again, and verifies that the waiting scan
  completes without duplication.
- The brief and notification retain their exact database IDs after restart. The
  notification is still readable through the authenticated API by its synthetic
  owner, and no `manager.schedule_failed` audit entry exists.

The final JSON receipt reports `PASS`, a hash of the compiled API JavaScript,
PostgreSQL version, preserved row IDs and the checks performed. Do not report
success merely because a startup or `/ready` message appeared. The script exits
nonzero on failure and removes its own containers and temporary directory in
`finally`. If interrupted forcibly, any leftover containers carry the label
`storyboard.synthetic-worker-check=true`; review those specific containers before
removing them. A machine-wide Docker cleanup is unnecessary.

This is a local synthetic processing and persistence check. It does not prove
Google sign-in, delivery to a bandmate, a useful real-band briefing cadence,
Redis disaster recovery, a database restore, or hosted availability. The separate
[backup/restore drill](backup-restore.md) covers database recovery. After an
approved host is available, verify the deployed API has its existing worker
enabled and record one owner-opted scheduled brief and its visible in-app
notification using real band accounts. Recheck after a planned deployment
restart without changing the band's schedule or generating duplicate messages.

## Local receipt — 2026-10-02 05:14 UTC

The check exited successfully against PostgreSQL **16.15** and compiled API hash
`12f5c1ef1b86e02b3ce441507e48ff3c875955b987600de1dd09d06437d64b8e`.
The real recurring scan completed; duplicate and post-restart scans retained one
brief and one notification. The queued job resumed after API/PostgreSQL restart,
and the owner notification read returned HTTP 200. Provider context recorded
`attempted: false`; no synthetic test containers remained after cleanup.

Preserved synthetic rows: Manager run `cmuqics430000e4h37es50qhj`, notification
`cmuqics500003e4h3qfhmk8vc`, period `worker-test-band:weekly:2026-W40`.
This is a receipt for those local build artifacts, not a hosted deployment or a
future checkout. Rerun after relevant runtime or worker changes.
