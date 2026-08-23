# Catalog import (Vault → StoryBoard)

StoryBoard is the band-business OS. [AI-Music-Vault](https://github.com/rupret007/AI-Music-Vault)
is the sole song catalog. The public StoryBoard seed leaves the song table
empty on purpose: this repo must not ship the private catalog, and Manager
chat will not invent one.

Use this import when the operator has a **local** Vault file:

- `data/app_api.json` — slim feed from Vault `scripts/export_app_api.py`
- `data/master_catalog.json` — the Vault spine (`song_id`, `canonical_title`,
  `artist_project`, `classification`)

and/or a **local** Show Night [`content/show.json`](https://github.com/rupret007/rad-dad-show-night).
The importer never fetches those files over the network. See [`APPS.md`](../APPS.md).

## What it writes

- `Song` rows with optional `sourceKey` (`vault:catalog_import_v1:…` or
  `shownight:catalog_import_v1:…`)
- Draft `Setlist` rows only from an official Show Night running order
- One audited `catalog.imported` event on HTTP apply (`POST /songs/import`
  with `dryRun: false`). The CLI `--apply` path writes songs/setlists only.

It does **not** create artists, venues, contacts, booking prospects, pitches,
Travis/booker rows, invoices, or social posts. Stalemate / Trailer Swift stay
parked unless you opt in. Guest sets stay off unless you opt in, and even then
they land on the **current** artist (no fourth live band).

## Dry-run first

From the repo root, after `pnpm install` (so `@storyboard/shared` is built):

```bash
# Preview only — default
pnpm catalog:import -- --source /path/to/app_api.json
pnpm catalog:import -- --source /path/to/master_catalog.json
pnpm catalog:import -- --source /path/to/app_api.json --show-night /path/to/show.json
```

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
| _(none)_ | live only | Rad Dad vault songs + official Show Night Rad Dad set |
| `--include-parked` / `includeParked` | off | Also import Stalemate, Trailer Swift, Something Dirty onto the same artist |
| `--include-guest-sets` / `includeGuestSets` | off | Import Show Night guest sets as draft setlists on the same artist |
| `--include-all-projects` / `includeAllProjects` | off | Import every vault project onto the same artist |

Flex/encore pools are skipped. Duration stays unknown unless a later Band
operations edit records it.

## Seed

`pnpm db:seed` still creates only the generic `My Artist` / `default` tenant
plus the owner membership. The song table stays empty.

`SEED_DEMO_OPS=true pnpm db:seed` adds two generic demo songs, one draft
setlist, and invoice `DEMO-001` for local UI practice. That is not a live
catalog and is not Rad Dad / Stalemate / Trailer Swift.

## Manager chat

`POST /manager/chat` questions about the setlist, song library, or catalog stay
record-bound. An empty library says so and points at this import. It will not
invent titles or auto-pitch a buyer.
