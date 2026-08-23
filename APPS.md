# Band tools — no new app

This is the consolidation map for Jeff's music software. **Jeff talks to Bob.**
StoryBoard is the band-business engine. It does **not** become a second song
catalog, a promo publisher, or a rehearsal room.

| Tool | Role | Do |
| --- | --- | --- |
| **[Bob](https://github.com/rupret007/bob-ops-dashboard)** | Front door / status board | See what is live. Bob does not own catalog or booking records. |
| **[StoryBoard](https://github.com/rupret007/StoryBoard)** | Band-business OS (the engine) | Booking, setlists, invoices, Manager chat, approvals. Consume Vault. |
| **[AI-Music-Vault](https://github.com/rupret007/AI-Music-Vault)** | Sole song catalog | Scores, rights, keys, what's alive. Private. Do not commit it here. |
| **[Show Night](https://github.com/rupret007/rad-dad-show-night)** | Live run sheet | Optional setlist import onto the current artist. Not a fourth band. |
| **[StoryLiner](https://github.com/rupret007/StoryLiner)** | Promo | Stays separate. StoryBoard never auto-posts. |
| **[WebJam](https://github.com/rupret007/webjam)** | Making room | Stays separate. Bounces stay in Vault / local workbench. |

## Consolidated path: Vault → StoryBoard

1. In Vault, keep `data/master_catalog.json` as the spine. Optionally regenerate
   the slim feed with `python3 scripts/export_app_api.py` → `data/app_api.json`.
2. On a machine that already has those **local** files, dry-run then apply:

   ```bash
   pnpm catalog:import
   pnpm catalog:import -- --source /path/to/app_api.json
   pnpm catalog:import -- --source /path/to/master_catalog.json
   pnpm catalog:import -- --source /path/to/app_api.json --show-night /path/to/show.json --apply --artist default
   ```

   `pnpm catalog:import` with no `--source` dry-runs the checked-in
   `app_api.json` shape. Seed does the same when `VAULT_CATALOG_PATH` is
   unset. Point `VAULT_CATALOG_PATH` at a local Vault export and set
   `VAULT_CATALOG_APPLY=true` to write. HTTP equivalent: `POST /songs/import`
   (`dryRun` defaults true). Remote catalog URLs are rejected.
3. StoryBoard then has Vault songs plus Vault `setlist_ready_default_import`
   (the published `default_live` planner slice) for Band operations and
   Manager chat. It maps the live Vault honesty fields: `title` / `key` →
   `musicalKey` / `bpm_int` / `notes` ← `vault_ref` / `active` ←
   `is_original !== false`. Duration and lead vocalist stay null. It will
   not invent titles, write captions, auto-post, auto-pitch Travis, or
   create another artist.

Default import is Vault's published `setlist_ready_default_import` /
`import_scope=default_live` slice. Live repertoire is Rad Dad + Jeff Story
+ recorded Rad Dad plays, gated by `setlist_ready`. Hybrid labels in that
slice stay on the current artist — not a fourth live band. An empty
published slice stays empty. **Travis books** — he is the human booker,
not a pitch target. Stalemate, Trailer Swift, and Something Dirty stay
parked unless `--include-parked`. Guest sets stay off unless
`--include-guest-sets`, and they still land on the current artist.
HTTP `POST /songs/import` and `VAULT_CATALOG_PATH` accept local JSON only;
remote catalog URLs are rejected.

Details: [`docs/catalog-import.md`](docs/catalog-import.md).

## Deprecated language

Do not describe StoryBoard as a parallel catalog, a place to re-enter the 150
songs by hand, or a replacement for Vault scores/rights. An empty song table
after seed is an explicit missing import, not a second catalog.

Do not fold StoryLiner or WebJam into this repo.
