# Band tools — no new app

This is the consolidation map for Jeff's music software. StoryBoard does **not**
become a second song catalog, a promo publisher, or a rehearsal room.

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
   pnpm catalog:import -- --source /path/to/app_api.json
   pnpm catalog:import -- --source /path/to/master_catalog.json
   pnpm catalog:import -- --source /path/to/app_api.json --show-night /path/to/show.json --apply --artist default
   ```

   HTTP equivalent: `POST /songs/import` (`dryRun` defaults true).
3. StoryBoard then has songs/setlists for Band operations and Manager chat.
   It still will not invent titles, auto-pitch Travis, or create another artist.

Default import is **Rad Dad / live band only**. Stalemate, Trailer Swift, and
Something Dirty stay parked unless `--include-parked`. Guest sets stay off
unless `--include-guest-sets`, and they still land on the current artist.

Details: [`docs/catalog-import.md`](docs/catalog-import.md).

## Deprecated language

Do not describe StoryBoard as a parallel catalog, a place to re-enter the 150
songs by hand, or a replacement for Vault scores/rights. An empty song table
after seed is intentional until Vault is imported.

Do not fold StoryLiner or WebJam into this repo.
