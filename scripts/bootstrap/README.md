# Bootstrap Scripts

StoryBoard does not currently keep executable bootstrap scripts in this
subdirectory. Supported setup is composed from versioned root workspace
commands so local development, CI, and the container bundle use the same
building blocks.

From the repository root, use:

```bash
pnpm install
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm preflight
```

For the complete production-built local demo, use `pnpm container:up` instead.
See [`../../docs/developer-runbook.md`](../../docs/developer-runbook.md) for the
required environment and authentication choices. The executable validation and
database helpers live directly under `scripts/` and are catalogued in
[`../../docs/package-map.md`](../../docs/package-map.md).
