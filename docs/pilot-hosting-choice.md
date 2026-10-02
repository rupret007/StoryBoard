# Hosting choice for Rad Dad and Stalemate

Recommend **Render with a $70/month planning target**, plus domain renewal and
any tax or usage overages. The selected resources total **$62.50/month** at
October 2, 2026 list prices. That buys one shared StoryBoard installation with
separate Rad Dad and Stalemate workspaces; it does not charge per bandmate.
The estimate assumes one person administers the hosting account. Band members
sign in to StoryBoard with their own Google accounts, not Render accounts.

Render is the better first choice while there is no designated server operator:
it manages the application hosting, TLS and database infrastructure. Someone
still needs to own account recovery, releases, backup checks, billing and the
band's data. The existing [Docker/VPS option](pilot-deployment.md) stays available
if Jeff chooses a person to maintain that server.

## Budget to approve

| Managed resource | Selected capacity / plan ID | Monthly list cost |
| --- | --- | ---: |
| Hobby workspace | One infrastructure administrator | $0 |
| Next web | 512 MB / `0.5c-512mb` | $7 |
| Nest API and its existing queue worker | 2 GB / `1c-2g` | $25 |
| PostgreSQL 16 | 1 GB RAM / `0.5c-1g` | $19 |
| Database storage | 5 GB at $0.30/GB | $1.50 |
| Paid Key Value queue | 256 MB / `256mb` | $10 |
| **Resource subtotal** | Both bands together | **$62.50** |

Prices and capacities come from [Render pricing](https://render.com/pricing).
Hobby's one infrastructure-user allowance does not limit StoryBoard band users.
If shared hosting administration or Pro support/features are needed, review the
Pro workspace's additional $25/month before approving the budget; it is not
included in the subtotal above.
Treat $70 as a planning target, **not a hard billing cap**: taxes, domain renewal,
bandwidth/build-minute overages, extra storage or service upgrades can add cost.
Review the dashboard estimate before creation and configure available billing
notifications. Keep previews and autoscaling off. The 512 MB web allocation is
a starting estimate, not a measured load guarantee; inspect real memory and
request latency before inviting everyone. If it needs 2 GB, web cost rises from
$7 to $25 and the same bundle becomes $80.50/month before extras.

A lower-cost alternative is a DigitalOcean 4 GB / 2 CPU basic Droplet at $24,
plus daily server backups at 30% ($7.20): **$31.20/month**, before independent
logical-backup storage, domain and tax. This requires an operator to maintain
Linux, Docker, security patches, certificates, PostgreSQL/Redis and restores.
A whole-server snapshot is not a substitute for the verified database backup.
[Droplet pricing](https://www.digitalocean.com/pricing/droplets),
[backup pricing](https://www.digitalocean.com/pricing/backups).

## Domain choice

First use a domain Jeff already controls, with two trusted subdomains:

- `band.<your-domain>` — the link everyone opens, containing both bands.
- `band-api.<your-domain>` — API and Google sign-in callback.

Set `COOKIE_DOMAIN=<your-domain>`. If other subdomains are not trusted, use a
dedicated parent such as `app.bands.<your-domain>` and `api.bands.<your-domain>`
with `COOKIE_DOMAIN=bands.<your-domain>` instead. There is no need to move the
existing band website or buy separate Rad Dad/Stalemate domains. If Jeff owns no
suitable domain, choose one neutral domain and review both first-year and renewal
prices before purchase; no name availability or purchase is claimed here.

**Do not use two default `*.onrender.com` URLs for the pilot login.**
`onrender.com` is a [public suffix](https://publicsuffix.org/list/public_suffix_list.dat),
so the browser cannot share this app's session across those unrelated sites.
The custom domains give the existing secure session cookie the shared trusted
parent required by web-server reads. Render includes two custom domains on
Hobby and manages their TLS; the example disables default Render subdomains.
[Custom domain setup](https://render.com/docs/custom-domains).

## Reviewable managed configuration

[ops/render-pilot.example.yaml](../ops/render-pilot.example.yaml) is a **nonactive
example**, not a root `render.yaml`. It creates nothing by existing in Git.
Uploading/applying it in Render creates paid resources and starts deployment;
`autoDeployTrigger: off` prevents later commit-triggered releases, not the first
deployment. Jeff must approve the provider, estimate, domains, Google setup and
candidate commit before that action.

The example retains both existing Dockerfiles and the application's four parts.
No demo seed, extra worker service, AI service or new video/media stack is added.
All services use the same Ohio region. Database and queue have no external IP
access; application-to-datastore traffic uses their internal connection URLs.
The web receives the API's private host/port and constructs `INTERNAL_API_URL`
in its start command. This matches Render's [private networking](https://render.com/docs/private-network).

| Dashboard setting | API | Web |
| --- | --- | --- |
| Runtime / Dockerfile / context | Docker / `Dockerfile.api` / repo root | Docker / `Dockerfile.web` / repo root |
| Instance count | 1, worker inside API | 1 |
| Listen port | `PORT=4000`, `API_PORT=4000` | `PORT=3000`, existing Next start command |
| Health check | `/ready` | `/` |
| Before deploy | `pnpm exec prisma migrate deploy` | None |
| Start | Existing Docker CMD | Example's shell wrapper, then existing Next start |
| Automatic deploys | Off | Off |
| Dev login | `AUTH_DEV_BYPASS=false` | `AUTH_DEV_BYPASS=false` |

The API uses a generated session secret and Google **operator sign-in only**.
Add the OAuth client ID/secret privately when Render prompts; register exactly
`https://<api-domain>/auth/operator/google/callback` in Google and configure the
pilot accounts in the consent/test-user settings. Gmail, Calendar, Drive,
Telegram and paid AI stay disconnected. The paid queue uses `noeviction` plus
`journal-snapshot` persistence so jobs are not treated as disposable cache data;
monitor memory and failed jobs. Persistence can still lose the last second of
writes on failure, so it does not replace audit reconciliation.
[Key Value queue configuration](https://render.com/docs/key-value).
New Render Key Value instances use Valkey 8, its Redis-compatible service.
The local worker receipt used Redis 7; repeat the worker/queue acceptance on
the chosen managed service before counting that deployment as activated.

Render supplies service environment variables as Docker build arguments, so
`NEXT_PUBLIC_API_URL` reaches the web Dockerfile's existing argument before the
browser bundle is built. API/database/OAuth secrets are not referenced by build
arguments in our Dockerfiles. Changing the public API domain requires rebuilding
the web. [Docker environment behavior](https://render.com/docs/docker).
The paid API's pre-deploy step runs migrations before starting the new API;
its success does not run seed or create band workspaces.
[Pre-deploy commands](https://render.com/docs/deploys#pre-deploy-command).

## Approved activation and acceptance

1. Replace every example hostname and `REPLACE_WITH_APPROVED_BRANCH` in the
   reviewed configuration. Confirm the exact candidate contains the pilot work
   and [runtime dependency fixes](pilot-dependencies.md). Select that approved
   commit for deployment; do not implicitly deploy the current default branch.
2. Review resource plans/cost and credentials in Render before applying. If using
   a Blueprint, select the example's path explicitly. Set **Blueprint Settings →
   Auto Sync → No** as well as the two service deploy settings; these are separate
   controls. Make future changes by reviewed manual deployment/sync only.
   [Blueprint sync controls](https://render.com/docs/infrastructure-as-code#disabling-automatic-sync).
3. Add the two DNS records shown by Render and wait for verified domains/TLS.
   Confirm API migrations succeeded, `/ready` reports healthy dependencies and
   the web serves the correct public API URL. The internal API address must not
   appear in browser links. Schema validation cannot prove DNS, startup or login.
4. Run real Google login, invite continuation, two-band isolation and phone
   acceptance from [band-pilot.md](band-pilot.md). Demonstrate an actual scheduled
   in-app result with [worker evidence](pilot-worker.md), plus restart persistence.
   Do not enable provider sending merely to test hosting.
5. Configure recovery: verify the selected managed database's backup/restore
   policy, then make an independent private logical backup and run our isolated
   [restore drill](backup-restore.md). For local `db:backup`, a reviewed temporary
   allow rule for the operator's exact external IP and the database's external
   TLS URL are needed; remove that rule afterwards. Keep credentials in local
   secure environment settings. Restore into a local disposable PostgreSQL 16
   database, not another billable Render database by default. Render's managed
   [recovery features](https://render.com/docs/postgresql-backups) are additional
   protection; they do not prove our drill or retain an independent copy.

The example has been checked locally against Render's published JSON Schema.
The actual provider-side validation, billing preview, image deployment, DNS/TLS,
Google login, private networking and worker recovery remain **pending**. No Render
account, resource, domain, spend or deployment was created. The schema source and
field reference are [Render's Blueprint documentation](https://render.com/docs/blueprint-spec).
