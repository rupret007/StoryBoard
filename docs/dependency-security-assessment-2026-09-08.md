# Dependency security assessment — 2026-09-08

Marker: BOB_USEFUL_APPS_READINESS_20260908. Assessed source: `82c2c23091d001b17967c1b203dac209d766f374`, locked dependency graph unchanged.

This assessment helps Jeff distinguish applicable product risk from an audit inventory before choosing a build/deployment change. No confirmed material application input path warranted a dependency or runtime-code change in this bounded pass. That is **not** proof that the application or installed packages are free of vulnerabilities, and it is not permission to deploy.

## Evidence and scope

Fresh `pnpm audit --prod --json` reported **82 vulnerability occurrences**: 4 low, 46 moderate, 32 high, 0 critical. Full `pnpm audit --json` reported **107 vulnerability occurrences**: 4 low, 55 moderate, 48 high, 0 critical. Counts are the registry's severity totals, not distinct advisories or exploited paths. The full response contains102 advisory records; a package/advisory can contribute more than one occurrence. These totals do not assess the deployed app's exposure. Registry results and source observations were captured on September 8; they will age.

Root compared those findings with pinned versions, vendor advisories, the actual resolved module graph, application imports/configuration and the existing production build. A separate read-only Codex security reviewer independently checked exposure. No live service, customer data, external provider, database seed or exploit against a live target was used. No dependency version, application behavior, API/auth rule or schema was changed.

The prior phone-booking behavior/security review remains applicable to its unchanged implementation. This document adds a dependency disposition; it does not replace a future deployment review or formal approval.

## Production graph disposition

| Dependency / locked version | Actual path and evidence | Disposition / reassessment trigger |
|---|---|---|
| Next 16.2.1 — Server Actions | App Router is used, but no application `use server` actions are defined. Existing generated server-reference manifest contains zero node/edge actions; installed action handler exits before action decoding when there are none. | Action-deserialization DoS applicability is not established. Reassess before adding a Server Action. The current same-line fixed-version candidate for the recorded Next advisories is16.2.11; test it as a coherent framework change if needed. |
| Next 16.2.1 — images; sharp0.34.5 | Default local optimizer exists, but this source has no `public/` image directory, image upload path or `next/image` consumer. Existing built static assets total about1.69MB (largest about435KB), not a demonstrated oversized local image. No `images.remotePatterns` is configured. | Do not claim the optimizer is disabled or sharp absent. No malicious/oversized image input was demonstrated. Reassess before adding assets/uploads, remote image patterns or changing the image loader. |
| Next 16.2.1 — cache/headers | Server reads use `fetch(stringURL, init)`, with page data reads marked `no-store`; the fetch-body advisory's differing `Request`/init pattern is absent. No shared-cache deployment was inspected. | RSC variant poisoning depends on intermediary cache behavior. Keep production CDN/reverse-proxy partitioning and Vary handling an explicit deployment gate; local/source checks do not prove it. |
| Other recorded Next16.2.1 conditions | No custom middleware/proxy, rewrites, CSP nonce handling, `beforeInteractive` scripts, Cache Components, i18n route configuration or custom WebSocket server found in current source/config. | Corresponding opt-in preconditions are not demonstrated. Do not generalize that to all Next risks; reassess configuration changes. |
| Fastify5.8.4; @nestjs/platform-fastify11.1.18; find-my-way9.5.0 | `new FastifyAdapter()` uses defaults: HTTP/2 and trustProxy are not enabled. Controllers validate bodies with Zod, not the reported Fastify content-keyed/root-primitive schema paths. Authentication/CSRF uses Nest guards, not route-specific MiddlewareConsumer.forRoutes authentication. | No corresponding validation, proxy-hop, HTTP/2 or middleware bypass is demonstrated. The Nest adapter itself pins Fastify5.8.4: upgrading only the application's direct Fastify would leave that copy. Any future fix must verify both resolved paths and Nest/plugin compatibility. Recorded vendor fixed thresholds include Fastify5.12.1, platform-fastify11.1.24 and find-my-way9.7.0; these are not a tested combined upgrade here. |
| lodash4.17.23 via @nestjs/config4.0.3 | Nest config imports get/has/set. The reported template-import and unset/omit functions are not the identified consumer path; application configuration keys are code-owned. | No attacker-controlled audited function path demonstrated. Reassess template/path-processing additions; this does not clear all lodash risk. |
| postcss8.4.31; nanoid3.3.11 | Next's build tooling processes checked-in CSS/Tailwind and repository TS/TSX. No runtime user-CSS parser/upload or sourceMappingURL directive was found in application source. PostCSS calls nanoid/non-secure with literal size6, not an application-controlled zero/negative/custom size. | Preserve trusted build inputs. PostCSS source-map/file-read and parser risks require reassessment before accepting external CSS/source maps. Do not imply that production-graph placement means the CSS compiler processes web requests. |
| uuid11.1.0 via BullMQ | BullMQ calls uuid.v4() without arguments; no application-supplied output buffer for audited v3/v5/v6 operations was identified. | Keep buffer/size inputs code-owned; reassess new UUID consumers. |
| qs6.15.0 via googleapis-common | Google helpers construct outbound query parameters with qs.stringify(params, {arrayFormat: 'repeat'}), not the reported comma+encodeValuesOnly case. No audited comma/bracket parser or attacker-supplied isBuffer object path was identified. | Optional provider operation was not exercised. Reassess provider input changes; no claim of live Google integration readiness. |
| Hono4.12.10; @hono/node-server1.19.11; valibot1.2.0; fast-uri3.1.0 | Reached through Prisma CLI/dev/streams tooling in the production lock graph. The API imports generated Prisma client with PrismaPg; no application Hono server/static/JWT/CORS/JSX or associated schema/URI service is used. | Tooling findings remain. Do not start Prisma development services with untrusted inputs based on this assessment. |
| deepmerge-ts7.1.5; mysql2 3.15.3 | Prisma config/CLI chains; the application database is PostgreSQL via PrismaPg. No MySQL server connection or untrusted recursive configuration merge was identified. | Reassess before changing database/provider/configuration input paths. No unsupported major override was forced merely to remove audit entries. |

**Container caveat:** both application Dockerfiles inherit their build stage. Thus development/CLI dependencies can remain installed in the runtime images. “Not an application runtime import” does not mean “removed from the container.” A future packaging change must verify the actual runtime bundle; this pass did not prune packages or rebuild deployment images solely to change counts.

## Additional build/development findings

The full audit additionally reports file-type through the SWC download tool, picomatch and brace-expansion through CLI/glob tooling, js-yaml through lint configuration, browserslist through webpack, and @humanfs/node through ESLint. Their relevant inputs here are package downloads or checked-in build/lint/configuration sources, not uploaded application content. No additional attacker-controlled product path was demonstrated.

These tools still consume potentially hostile package/source input in a compromised development or CI environment. Do not treat running untrusted branches, archives, CSS, glob patterns, YAML or symlinked source trees as safe. Any remediation should use a supported parent-package update and exercise the actual builds; no audit-force command or cross-major transitive override was applied.

## Authoritative references

- [Next Server Action DoS conditions](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj)
- [Next local-image limits](https://github.com/vercel/next.js/security/advisories/GHSA-h64f-5h5j-jqjh) and [remote SVG optimization](https://github.com/vercel/next.js/security/advisories/GHSA-q8wf-6r8g-63ch)
- [RSC cache variant handling](https://github.com/vercel/next.js/security/advisories/GHSA-wfc6-r584-vfw7) and [fetch-body cache confusion](https://github.com/vercel/next.js/security/advisories/GHSA-68g3-v927-f742)
- [Fastify content-type validation](https://github.com/fastify/fastify/security/advisories/GHSA-247c-9743-5963), [root-primitive validation](https://github.com/fastify/fastify/security/advisories/GHSA-w2qp-rph6-63g4), and [trustProxy hop-count](https://github.com/fastify/fastify/security/advisories/GHSA-3m5p-2c4r-xxw2)
- [Nest middleware trailing-slash bypass](https://github.com/nestjs/nest/security/advisories/GHSA-6v32-fjc9-9qf6)
- [qs comma-format stringify condition](https://github.com/ljharb/qs/security/advisories/GHSA-q8mj-m7cp-5q26)
- [PostCSS source-map read](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q)

The exact registry JSON, code-path notes and reviewer receipt are retained in the Bob readiness evidence and summarized in PR36/coord12. The production audit is not zero and remains a recorded maintenance risk. There is no blanket vulnerability acceptance or authorization to enable presently unused features.

## Jeff's next decisions

Before a live deployment or expanding the affected input paths, confirm the actual deployment/cache/image/provider configuration, refresh advisory evidence and select supported parent-package upgrades where exposure applies. Any upgrade needs the required repository checks, fixture-safe integration/browser tests and final-tip review. Keep live providers disabled, Travis books/NEVER_AUTO_POST, parked PR21 held and separate exact-tip merge/deployment approval intact.
