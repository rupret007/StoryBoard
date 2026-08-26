# Catalog import (Vault → StoryBoard)

StoryBoard is the band-business OS. [AI-Music-Vault](https://github.com/rupret007/AI-Music-Vault)
is the sole song catalog. The public StoryBoard seed leaves the song table
empty until a local Vault file is applied: this repo must not ship the
private catalog, and Manager chat will not invent one. An empty song table
is **not** a second catalog. Seed now dry-runs the checked-in
`app_api.json` shape sample so that emptiness is never silent.

Use this import when the operator has the **local** Vault StoryBoard feed:

- `data/app_api.json` — slim feed from Vault `scripts/export_app_api.py`
- `data/master_catalog.json` is the Vault spine, not an import feed. StoryBoard
  rejects it; regenerate `data/app_api.json` before importing.

and/or a **local** Show Night [`content/show.json`](https://github.com/rupret007/rad-dad-show-night).
The importer never fetches those files over the network. `--source`,
`--show-night`, `VAULT_CATALOG_PATH`, and `POST /songs/import` reject remote
URLs. See [`APPS.md`](../APPS.md).

This import is the **default documented way** to populate StoryBoard songs.
Band operations edits duration, key, and running order after import. Do not
re-enter the private catalog by hand.

## What it writes

- `Song` rows with optional `sourceKey` (`vault:catalog_import_v1:…`, or
  `shownight:catalog_import_v1:…` only when no Vault catalog is present)
- Draft `Setlist` rows from Vault `setlist_ready_default_import` (the
  published default-live planner slice) or, when opted in, from
  `setlist_ready`, plus an official Show Night running order bound to
  planned Vault titles when a Vault payload is present
- One audited `catalog.imported` event on HTTP apply (`POST /songs/import`
  with `dryRun: false`). The CLI `--apply` path writes songs/setlists only.

Catalog `sourceKey` values belong exclusively to these import paths. Manual
song and setlist creation always records no catalog provenance, and manual
edits preserve an existing import key instead of accepting a replacement from
the request. This is enforced in the shared strict schemas and again in the
operations service so an internal caller cannot impersonate a Vault import.

It does **not** create artists, venues, contacts, booking prospects, pitches,
Travis/booker rows, invoices, or social posts. **Travis books**; StoryBoard
does not auto-pitch him. A Stalemate or hybrid row already in Vault's
published `default_live` slice (for example Everyday) stays on the **current**
artist — that is not a fourth live band. Parked catalogs stay parked unless
you opt in. Guest sets stay off unless you opt in, and even then they land on
the current artist.

## Dry-run first

From the repo root, after `pnpm install` (so `@storyboard/shared` is built):

```bash
# Preview the checked-in app_api.json shape (default song path)
pnpm catalog:import

# Preview a local Vault export — default
pnpm catalog:import -- --source /path/to/app_api.json
pnpm catalog:import -- --source /path/to/app_api.json --show-night /path/to/show.json
pnpm catalog:import -- --source /path/to/master_catalog.json              # must fail; export app_api.json first
pnpm catalog:import -- --source https://example.invalid/app_api.json   # must fail
```

Band operations → **Music & setlists** also previews and applies the same
local JSON through `POST /songs/import` (dry-run first). The form never
fetches a URL. Preview lists planned titles and names parked, cover, Travis,
and guest-set skips before apply can write. Apply uses the reviewed payload,
not a later edit in the textarea.

HTTP equivalent (session + membership required; `dryRun` defaults true):

```http
POST /songs/import
Content-Type: application/json

{
  "vault": { "schema_version": 1, "songs": [] },
  "showNight": { "radDadSet": [] },
  "dryRun": true
}
```

Apply only after reviewing the plan:

```bash
pnpm catalog:import -- --source /path/to/app_api.json --show-night /path/to/show.json --apply --artist default
```

Or `POST /songs/import` with `"dryRun": false`. Existing titles and source keys
are skipped so a second apply does not overwrite Band operations edits.

## Filters

| Flag / body field | Default | Effect |
| --- | --- | --- |
| _(none)_ | live only | Published `setlist_ready_default_import` / `import_scope=default_live` rows when present; otherwise Rad Dad + Jeff Story + recorded Rad Dad plays, gated by `setlist_ready`. Official Show Night running order binds those planned Vault titles only. Parked catalogs and covers stay out. |
| `--include-parked` / `includeParked` | off | Also import exact Stalemate, Trailer Swift, Something Dirty rows onto the same artist |
| `--include-guest-sets` / `includeGuestSets` | off | Import Show Night guest sets as draft setlists on the same artist |
| `--include-all-projects` / `includeAllProjects` | off | Import every vault project except Travis onto the same artist |

Flex/encore pools are skipped. Duration stays unknown unless a later Band
operations edit records it.

## Seed

`pnpm db:seed` still creates only the generic `My Artist` / `default` tenant
plus the owner membership. The song table stays empty unless apply is set.

Unset `VAULT_CATALOG_PATH` dry-runs the checked-in `app_api.json` sample
during seed so the default song path is visible. Point
`VAULT_CATALOG_PATH=/path/to/app_api.json` at a local Vault export to plan
that file. `VAULT_CATALOG_APPLY=true` writes the planned rows. Remote URLs
are rejected.

`SEED_DEMO_OPS=true pnpm db:seed` adds two generic demo songs, one draft
setlist, and invoice `DEMO-001` for local UI practice. Prefer Vault import.
That demo is not a live catalog and is not Rad Dad / Stalemate / Trailer Swift.
Manager chat and `GET /songs/status` label those rows as practice data, not a
Vault import.

## Manager chat

`POST /manager/chat` questions about the setlist, song library, or catalog stay
record-bound. An empty library says so and points at this import (Band
operations → Music & setlists, or `pnpm catalog:import`; dry-run,
`--apply` to write, no remote fetch). After a Vault import it lists only
recorded live-band rows and names the published default-live setlist. A
Stalemate-origin row already in that slice stays current-artist repertoire —
not a fourth live band. `SEED_DEMO_OPS` practice rows, Show Night running-order
imports, and Band operations one-offs keep their own provenance; they are
never described as “usually from a local Vault import.” It will not invent
titles, write captions, auto-post, or auto-pitch Travis. StoryLiner stays
promo-only.

Default Vault planning consumes the published
`setlist_ready_default_import` / `import_scope=default_live` slice when
present. Live repertoire is Rad Dad + Jeff Story + recorded Rad Dad plays,
gated by `setlist_ready`. A hybrid in that slice (or a Stalemate row Vault
already marked `default_live`) stays on the current artist — not a fourth
live band. An empty published `setlist_ready_default_import` stays empty;
that is honesty, not a missing catalog. When a Vault payload is present,
Show Night does not mint covers, parked rows, Travis rows, or unknown
titles into the song table — it only attaches a running-order setlist to
planned Vault songs. Show Night-only imports (no Vault file) still create
`shownight:` songs on the current artist. Parked projects stay parked unless
opted in. Travis rows stay skipped (`travis_books`). Covers stay out
(`active` ← `is_original !== false`). `bpm` prefers `songs[].bpm_int`, then
a clean `bpm` integer, then a leading 2–3 digit tempo; notes come from
`vault_ref`. Duration and lead vocalist stay null. `GET /songs/status`
reports an empty table as a missing Vault import, not as a second catalog. After
rows exist it names Vault, Show Night, `SEED_DEMO_OPS`, Band operations, or a
mix — including a Show Night or demo setlist on Vault-titled songs — and never
calls non-Vault songs or running orders a Vault import. Band operations keeps
the Vault-slice intro only for an empty table or a Vault-only library.
