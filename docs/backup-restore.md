# Private PostgreSQL backup and recovery drill

Use this before trusting StoryBoard with Rad Dad or Stalemate's only copy of
band work. One database backup includes **both bands**, memberships, tasks,
events, catalog/setlists, money records, approvals and audit history. It does
not merge the bands. This procedure proves a PostgreSQL recovery into a new,
disposable database; it never replaces the live database.

The pilot operator owns the backup schedule. Before live use, record who runs
it, where the private archives live, when the last successful backup and restore
drill happened, and who can recover them. Suggested pilot target: a daily
backup, another before migrations, seven daily copies and four weekly copies.
This repo does not install a scheduler or delete old backups automatically.
Keep a second encrypted copy on storage independent of the database machine;
directory permissions alone do not encrypt an archive.

## Create a backup

Install PostgreSQL client tools matching the server's major version (16 for
the existing Compose image), or use the tools already inside its container.
The installed Homebrew client might be older: check `pg_dump --version` first.
Run commands from the repository root. Use a private directory outside **all**
Git working trees, with directory mode 700; scripts create a missing directory
with that mode and archives/manifests with mode 600. Use a new filename every time.

For host clients, `DATABASE_URL` comes from the existing environment or local
gitignored `.env`. Never paste a credential-bearing URL into command arguments,
logs, issues or PRs. Replace the example absolute path with your private path:

```bash
pnpm db:backup --output /absolute/private/storyboard-backups/2026-10-01.dump
```

For the approved pilot, identify Postgres using the exact deployment project
and overlays. This avoids accidentally backing up a separate demo stack.
Run from the pilot checkout with its local `.env.production`:

```bash
pilot_postgres_container=$(docker compose --env-file .env.production -p storyboard-pilot \
  -f docker-compose.app.yml -f docker-compose.production.yml \
  -f docker-compose.pilot.yml ps -q postgres)
test -n "$pilot_postgres_container" && pnpm db:backup \
  --container "$pilot_postgres_container" --database storyboard --user storyboard \
  --output /absolute/private/storyboard-backups/2026-10-01.dump
```

Use the actual database/user if the approved configuration changed them. For a
local demo drill, explicitly select that demo's project/config instead; do not
reuse its container name or receipt as evidence for the live pilot.

The container path runs PostgreSQL tools through `docker exec` against that
container's local socket. It uses the official image's existing
`POSTGRES_PASSWORD` internally; passwords are not printed or placed in tool
arguments. No database port needs publishing. Custom images/authentication may
require the host-client procedure instead.

A successful command creates a PostgreSQL custom-format archive and a sibling
`.dump.json` manifest containing format, time, byte count and SHA-256. It checks
that `pg_restore` can read the archive. The manifest records no connection URL
or credentials. A failed dump removes its partial archive; an existing archive
is never overwritten. Save the archive and manifest together. A successful
backup command **does not prove a successful restore**.

## Restore only into a new disposable database

Use a trusted archive you created. PostgreSQL backups contain executable schema
definitions; a checksum checks corruption, not whether an unknown backup is safe.
The restore script requires all of these:

- An explicitly supplied target, with a name starting `storyboard_restore_test_`.
- `--confirm-disposable` repeating the exact database name.
- An existing **empty** target: no application tables, types, functions or custom
  schemas. It refuses a second restore into the populated target.
- A private archive and matching manifest outside the repo, with matching
  size/checksum. Symlink archive files are refused.

Create that empty database in an isolated Postgres 16 container where possible.
For an existing test Postgres container, this creation step affects only the
explicitly named new database:

```bash
docker exec storyboard-restore-drill-postgres createdb --username=storyboard storyboard_restore_test_pilot
pnpm db:restore:drill --container storyboard-restore-drill-postgres --database storyboard_restore_test_pilot --user storyboard --confirm-disposable storyboard_restore_test_pilot --input /absolute/private/storyboard-backups/2026-10-01.dump
```

With host clients, create the empty target using your database administration
tool and set `STORYBOARD_RESTORE_DATABASE_URL` securely in the current shell to
that database's connection URL. Then run:

```bash
pnpm db:restore:drill --confirm-disposable storyboard_restore_test_pilot --input /absolute/private/storyboard-backups/2026-10-01.dump
```

The restore script deliberately does **not** load `.env` or fall back to
`DATABASE_URL`. It never uses `DROP`, `--clean` or `--create`; `pg_restore` runs
with `--single-transaction --exit-on-error --no-owner --no-privileges`. It is a
drill tool, not a production database replacement command. Keep other apps and
workers disconnected from the disposable target throughout the drill.

## Verify recovery before counting the drill as passed

1. Compare the restored `_prisma_migrations` history with the archived source
   version. Use the matching application revision, not an arbitrary newer build.
2. In the restored database, verify both separate band IDs/names and representative
   membership, owned task, show time/timezone, song/setlist order and audit records
   that were present when the backup was taken. Compare with a recorded source
   snapshot; current live counts can change after the backup.
3. If doing an application smoke, use a separate test runtime and local dev
   identity authorized for the copied band records. Keep queue workers and all
   live provider configuration disabled; do not supply Google credentials or the
   integration encryption key. Confirm each band opens and reads its own records.
4. Retry the restore command against the now-populated target: it must refuse.
   Record the application revision, PostgreSQL/client versions, checksum, checked
   records and result without putting band data or secrets in the repo.
5. Remove only the disposable database/container you created when the drill is
   complete. Never run `docker compose down -v` against the live stack.

The archive includes the database's encrypted provider-token fields, but **not**
the external `INTEGRATION_SECRETS_ENCRYPTION_KEY`, session/OAuth secrets, Redis
queue state, external Google files, or original Vault media/export files. Keep
required recovery secrets in the operator's separate secure store. Do not put
them in the archive manifest. Redis AOF persistence is not a backup. After an
actual outage, reconcile pending/uncertain approvals and one-off queue work from
the database/audit history before any provider execution; never blindly replay
sends. Production restore/cutover and provider reactivation require their own
reviewed operator procedure.

## Automated safety checks and current evidence

`pnpm test:recovery` checks target fencing, no production URL fallback, private
permissions, repository/symlink refusal, existing-file preservation, partial
cleanup, corruption refusal before database access, nonempty-target refusal,
transactional restore flags, SSL configuration and child-error redaction.

The October 1, 2026 synthetic drill used an isolated PostgreSQL 16.15 container,
all 42 checked-in migrations, two separate synthetic bands named Rad Dad and
Stalemate, two memberships, two tasks and one linked song/setlist item. Dump and
restore used that container's PostgreSQL 16 tools. All those records and migration
history matched after restore; repeating restore into the populated target was
refused. No live database, band data, provider or account was used. This receipt
proves the recovery mechanism on synthetic data; it does not establish that an
actual band database has been backed up or field-tested.
