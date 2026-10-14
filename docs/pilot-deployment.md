# Reviewable pilot deployment

This is the Docker/VPS option. For the recommended managed option and reviewed
monthly estimate, see [hosting choice](pilot-hosting-choice.md).

This prepares a single small Docker host for Rad Dad and Stalemate. No host,
domain, Google OAuth client, paid resource, public URL or real user was created
by this work. Jeff approves those inputs and the exact candidate before this
procedure is executed. Keep this separate from the local synthetic test stack.

## Required choices and local secrets

Use two trusted subdomains under a parent domain controlled by Jeff:
`band.example.com` for the app and `band-api.example.com` for the API. Both DNS
records point to the approved host. The public entry point for bandmates is the
app URL. Only ports 80/443 are published in the pilot overlay; app, API,
PostgreSQL and Redis stay on the private Compose network.

The existing Next/Nest/PostgreSQL/Redis stack is retained. The optional Caddy
edge provides TLS using its documented [automatic HTTPS](https://caddyserver.com/docs/quick-starts/https)
and [reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy).
Certificate state lives in a persistent volume. This has been config-validated;
real DNS/certificate issuance needs the approved public host.

1. Check out the reviewed pilot commit on the approved host. Install Docker
   Compose v2 with support for `!reset`. Review [dependency gate](pilot-dependencies.md).
2. Copy `.env.pilot.example` to `.env.production` and `chmod 600 .env.production`.
   Fill actual hostnames, parent `COOKIE_DOMAIN`, strong random database password
   and session secret, and Google operator credentials locally. Never commit,
   paste into chat, or include this file in an evidence archive. Do not use an
   untrusted/shared parent domain: the session cookie must be shared only across
   the controlled web/API hosts. Choose a URL-safe random database password
   because Compose interpolates it into `DATABASE_URL`.
3. Register the exact Google operator callback
   `https://<api-host>/auth/operator/google/callback`. Configure the consent
   screen/test users for every pilot email. Initial sign-in needs only
   `openid email profile`; it does not require Gmail/Calendar/Drive permissions.
   Leave optional provider connections disconnected until explicitly needed.
4. Preview the Compose configuration locally without saving secrets into Git:

   ```bash
   docker compose --env-file .env.production -p storyboard-pilot \
     -f docker-compose.app.yml -f docker-compose.production.yml \
     -f docker-compose.pilot.yml config --quiet
   ```

The production overlay disables Dev login, requires credentials, carries the
shared cookie domain and configures restart policies. The pilot overlay skips
demo seeding. Real users create the two bands through onboarding and Team; no
placeholder bands or synthetic shows are loaded into the pilot database.

## Approved activation

Run only after Jeff approves the host, cost, credentials, and exact commit:

```bash
docker compose --env-file .env.production -p storyboard-pilot \
  -f docker-compose.app.yml -f docker-compose.production.yml \
  -f docker-compose.pilot.yml up --build -d --wait
```

Visit the app URL on two phones on separate networks. Check Google sign-in,
signed-in identity, invitation continuation and correct band access. Confirm
Dev login is absent and its API route refuses access. Verify both secure session
and callback behavior through the deployed HTTPS addresses. Verify a viewer's
write fails and a member of one band cannot read the other band by URL/API ID.
Do not call a simulated session-cookie browser test real Google acceptance.

Read `/ready` on the API and check Compose health. Then demonstrate an actual
in-app background notification/Manager scheduled brief; readiness alone checks
only the dependencies. Use the agreed in-app/manual reminder routine until
another channel has been configured and observed reaching its recipient.

Preview the approved local Vault feed for the selected workspace; review every
planned row and exclusion before applying. Rad Dad and Stalemate need deliberate
separate import selections. Do not opt into all parked songs because Stalemate
now has an active workspace. Feed selection and song provenance stay explicit.

## Persistence, backup and restart acceptance

Before real data entry, use [backup and restore](backup-restore.md) to back up
and restore into a separate disposable database. Repeat after the first real
band setup. Store archives and required encryption/session configuration
privately and separately; set an agreed daily backup schedule on the approved
host. This repository's tool creates/checks a backup; it does not invent an
external backup storage account or silently schedule jobs on Jeff's machine.

Restart the pilot services without removing volumes, sign in again, and confirm
both bands' roster, assigned tasks, events, saved setlists and audit records.
Read the worker evidence separately from `/ready`. An API reconnect must not
create duplicate external requests or notifications. Never use `down -v` on
the pilot project. Restoring PostgreSQL does not prove recovery of external
provider actions; review uncertain approvals before enabling work after a
recovery. Keep provider writes disabled during a recovery drill.

For an upgrade, retain the current image/commit and take a verified private
backup first. Migrations run forward only. Reverting code is safe only while
its schema remains compatible; a database recovery cutover needs a separately
reviewed plan, downtime and an explicit data-loss window. Do not automatically
restore over live data. See the isolated restore drill restrictions.

## Go/no-go evidence

Record commit, approved host/cost, URL, real login/invite results, both-band
access tests, backup location (not credentials), last restore result, worker
receipt, and responsible operator in private operational notes. Track the
non-sensitive result in [pilot-evidence.md](pilot-evidence.md). A successful
build makes this engineering-ready; actual accounts/data/reminders make it
activated. Field validation remains the band's rehearsal/show trial.
