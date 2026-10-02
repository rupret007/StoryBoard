# Pilot runtime dependency review — October 2, 2026

The pilot branch updates the existing Next 16 / React 19 / Nest 11 / Fastify 5
stack to remove newly reported web/API runtime advisories. This is a dependency
remediation, not a deployment approval or a claim that the whole dependency
graph is vulnerability-free. The September 8 assessment is historical; these
new pins and the audit below supersede its runtime-version observations.

## Selected versions and evidence

| Component | Before | Pilot pin / resolved dependency | Reason |
| --- | --- | --- | --- |
| Next | 16.2.1 | 16.3.8 | Above the 16.3.6 fix for Node `next/og` ImageResponse, and the 16.3.3 AVIF/Windows fixes. |
| React / React DOM / shared UI React | 19.2.4 | 19.2.8 | Keep all React copies on one current patch of the existing 19.2 line. |
| Next's sharp | 0.34.5 | 0.35.5 | Next 16.3.8 declares `sharp ^0.35.4`; fixes arrive through the supported parent dependency. |
| Next's PostCSS | 8.4.31 | 8.5.23 | Patched dependency declared by Next; no forced PostCSS override. |
| Nest common/core/platform-fastify/testing | 11.1.18 / testing 11.1.17 | 11.2.7 | Aligned Nest 11 packages, above the middleware-bypass fixes. |
| Nest config | 4.0.3 | 4.0.4 | Compatible Nest 11 release; its lodash dependency becomes 4.18.1. |
| Fastify | 5.8.4 | 5.12.5 | Covers request validation/authentication fixes and the HTTP/2 trailer exception fix. |
| Fastify CORS | 11.2.0 | 11.3.0 | Align the app registration with the new Nest adapter's dependency. |

Versions were checked against the npm registry, and fix floors against the
maintainers' advisories:

- [Next ImageResponse fix: 16.3.6](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).
- [Next AVIF fix: 16.3.3](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4),
  [Windows fix: 16.3.3](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36),
  [sharp/libheif fix](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c).
- [Nest absolute-form middleware bypass](https://github.com/nestjs/nest/security/advisories/GHSA-9c5c-9qcx-q35q):
  11.2.4 is listed as patched, with 11.2.5 recommended; the pilot uses 11.2.7.
- [Fastify malformed-URL authentication fix](https://github.com/fastify/fastify/security/advisories/GHSA-p68q-wchp-6fh7),
  [async validation collision fix](https://github.com/fastify/fastify/security/advisories/GHSA-667r-xxjv-c9mm),
  [HTTP/2 trailer fix](https://github.com/fastify/fastify/security/advisories/GHSA-4mh8-r7rc-xpvc).

**One scoped override is intentional:** the latest Nest 11 adapter, 11.2.7,
still declares an exact Fastify 5.11.3 dependency. Updating only the app's direct
Fastify would leave that vulnerable internal copy. Root `pnpm.overrides` sets
`@nestjs/platform-fastify@11.2.7>fastify` to `5.12.5`. Both the direct import and
the adapter's own resolution were verified as 5.12.5. This keeps the existing
Fastify major and Nest 11; no blanket override or `audit --fix --force` was used.
Reassess/remove the override when a future Nest 11 release ships the patched
Fastify itself. The application's API, browser and container gates must pass
with this actual combined graph before it is released.

## Audit result and remaining findings

`pnpm audit --prod --json` changed from **3 critical, 39 high, 53 moderate,
4 low** to **0 critical, 11 high, 38 moderate, 2 low**. These are the registry's
reported occurrences, not a count of exploitable application paths. The command
still exits nonzero because findings remain. The post-change report contains
no Next, sharp, Fastify, Nest adapter, PostCSS or lodash advisory. Audit reports
were kept in local temporary evidence files, not committed as a permanent claim
about the latest registry state.

| Remaining packages | Path and observed use | Pilot disposition |
| --- | --- | --- |
| Hono, `@hono/node-server`, valibot, fast-uri | Prisma client peer/CLI → `prisma` → `@prisma/dev` and local streams tooling. The application imports the generated PostgreSQL Prisma client/runtime and `PrismaPg`, not a Hono server, its middleware, or local streams server. | No vulnerable HTTP application path was demonstrated. Do not expose Prisma dev/Studio/local-stream services or feed them untrusted schemas/configuration. Upgrade the compatible Prisma package set in dedicated maintenance; do not independently force their internal dependencies. |
| deepmerge-ts | Prisma CLI/config package; checked-in `prisma.config.ts`. | The reported recursive-object path is not a web request boundary here. Do not add untrusted configuration merges. The audit fix crosses the deepmerge major, so no forced internal upgrade was made. |
| mysql2 | Prisma CLI dependency; this app uses PostgreSQL. | No MySQL connection is configured by application code. Reassess before enabling another database/provider. |
| uuid | BullMQ 5.73.0 imports `uuid.v4()` without caller buffers. | The [advisory concerns buffered v3/v5/v6 operations](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq); that path was not found in the queue worker use. Remains a tracked moderate dependency finding. |
| qs | `googleapis` → `googleapis-common`; outbound `qs.stringify(params, { arrayFormat: 'repeat' })`. | No app qs parser or attacker-controlled `constructor.isBuffer` input was identified. [The isBuffer advisory](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g) and comma-parser findings remain tracked. Review again with any provider/input-path change; live Google acceptance remains separate. |
| baseline-browser-mapping | Next build/browser-target tooling. | No application endpoint exposes its input APIs. Keep build inputs trusted and update through compatible parent/tool maintenance. |

All 11 remaining high findings in this production dependency report belong to
the Prisma CLI/dev chains above: Hono (1), fast-uri (8), deepmerge-ts (1),
mysql2 (1). For example, the [Hono CORS issue](https://github.com/honojs/hono/security/advisories/GHSA-88fw-hqm2-52qc)
requires Hono's credentialed wildcard CORS middleware; this app serves Nest on
Fastify with an explicit origin list. The [fast-uri port issue](https://github.com/fastify/fast-uri/security/advisories/GHSA-qw65-cvwx-89v3)
requires untrusted URI components at that consumer; no such app path was found.
These are bounded source observations, not blanket acceptance of vulnerable
packages or authorization to enable those features.

**Container caveat:** both Dockerfiles currently inherit the build stage, so
CLI/dev dependencies can remain installed in runtime images. They are not
automatically absent because the app does not import them. Production-image
pruning, image/OS scanning and compatible Prisma/tool updates remain maintenance
work. Keep that distinction in the deployment decision.

## Verification and public-pilot gate

The changed graph installs with `pnpm install --frozen-lockfile --ignore-scripts`.
A local resolution probe checked Next 16.3.8, React/DOM 19.2.8, sharp 0.35.5,
PostCSS 8.5.23 and both Fastify resolutions at 5.12.5. A Fastify injection probe
returned 401 for an ordinary protected not-found route and 400 for a malformed
public URL, without returning the private handler's response.

The separate scoped API typecheck was deliberately stopped to avoid competing
with the root full validation run; it is not a completed check. Record the
actual final-change root gate, PostgreSQL integration, Chromium and container
smoke results in the pilot verification receipt. Do not reuse pre-upgrade build
or test results as evidence for these pins.

Before public use, refresh the production and full audits, rebuild the actual
images from the frozen lockfile, inspect the remaining package/OS findings
against that deployment, and verify secure Google login, origin/cookie behavior
and member isolation on the chosen HTTPS host. New applicable critical/high
runtime findings block public exposure until fixed or concretely mitigated.
The reverse proxy must not share authenticated HTML/RSC responses between
operators/bands. Keep dev bypass off, database/Redis ports private, and CLI/dev
services unexposed. No public host or provider account was inspected or enabled
by this dependency work.
