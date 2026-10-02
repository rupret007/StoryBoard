# Pilot evidence — Rad Dad and Stalemate

Status: **engineering candidate; not activated or field-validated**.
Goal began 2026-10-01. Jeff selected both bands and confirmed no hosting target
or approved local Vault path. Jeff supplied his owner identity privately; other
member accounts, event dates, commitments and provider credentials are pending.
A lyric-video preparation project is proposed; no release date is invented.
No real invitations/messages sent, public
service deployed, catalog applied, money transferred or branch merged.

## Candidate and scope

Branch `codex/band-pilot` from `main` at
`1f75ca24bf36c84cd529dce284878851188d5efd` (hosted Quality green).
Original `/Users/jeffstory/StoryBoard` worktree and its three modified documents
were preserved. Nine open drafts were inspected. Only the two direct pilot UX
fixes from #52 (`d579051`, `9fcbe72`) were reused with provenance: band-switch
errors and honest loader/empty-search states. Venue-specific pitch-pack drafts
were not pulled into the pilot. No feature is called deployed because its PR
or tests are green.

## Engineering changes

- Email-bound invite links now lead through sign-in and back to acceptance.
  Only a validated opaque invite token is stored with the signed OAuth nonce;
  it is not sent to Google or used as a redirect URL. Wrong-account sign-out
  retains the invite. Unconfirmed sign-out errors remain visible.
  Accepting another invitation preserves an existing membership's role, so
  invitations cannot bypass Team's last-owner and role-change protections.
- Owners can create a separate second workspace from Team. Workspace,
  membership and audit writes commit atomically. No roster/catalog/event is
  copied. Band switch remounts the workspace to discard stale cross-band UI.
  Known aborted serialization conflicts retry the complete transaction at most
  three times; ambiguous failures are not automatically replayed.
- The header names the current band. Manager, project and booking requests
  retain the displayed band's ID when another browser tab switches the shared
  session; the new browser regressions check independent workspaces.
- Owner-only performer/account linking, My tasks and identity-checked personal
  availability support individual follow-through while preserving coordinator
  editing. Availability updates preserve notes/assignments and audit actor.
- Invitations and reminder drafts are never represented as sent email. Team
  supplies a copyable manual invite link and explicit load/retry errors.
- Five deterministic Manager pilot answers use scoped recorded facts with
  evidence destinations, current-account identity and bounded-view honesty.
- Undated projects can record manual owned milestones. Failed event/project
  creation and asset saves keep entered text. Project reads/writes pin the band.
- Private backup and isolated restore tooling; production/HTTPS overlay and
  configuration template; onboarding and 14-day acceptance guide.
- Runtime dependency remediation and remaining applicability are tracked in
  [pilot-dependencies.md](pilot-dependencies.md).
- Managed hosting recommendation is $62.50/month before extras, with a $70
  planning target (not a cap). The inactive Render example passed official
  schema validation; no billable setup or domain action was performed.

## Verification log

| Evidence | Result |
| --- | --- |
| Baseline main hosted Quality | Passed at `1f75ca2`; historical baseline only |
| Isolated PostgreSQL16 restore drill | Passed:42 migrations,2 synthetic bands,2 memberships,2 tasks,1 linked song/setlist; repeated restore into populated DB refused |
| Recovery safety tests | 11 passed (private paths, explicit target, checksum/empty-target guards) |
| Compose app+production+pilot template | `config --quiet` passed with validation-only placeholder configuration; no startup |
| Caddy TLS proxy configuration | Validation command run in disposable container; no listeners or certificate issuance |
| Combined gate | Passed: typecheck, lint, 334 API tests, 106 shared tests, 11 recovery tests, production builds, Manager 119/119 (safety 100%). Later web typecheck/lint and final-source production rebuild passed. Final concurrency/invite hardening awaits the next API and hosted gate. |
| PostgreSQL integration | 8/8 passed, including two-workspace isolation and atomic audit rollback |
| Phone-browser journeys | 40/43 passed in the combined run, including phone invite, member tasks/availability, undated project lifecycle/interrupted saves, and stale-tab Manager scope. Two contact/booking selector corrections subsequently passed. Final extra-scope rerun pending after a concurrent workspace-creation conflict surfaced. |
| Worker execution, dedupe, restart proof | Passed using real existing worker/recurring scan: one brief+notice, queued job resumed after API/PG restart, unchanged row IDs, authenticated notification HTTP200; no provider attempt |
| Real Google login on two phones | Not run: client/domain/accounts absent |
| Approved Vault imports | Not run: local source and each band's selection absent |
| Real reminder receipt | Not run: channel/routine and recipients not confirmed |
| Rehearsal/gig/after-show field use | Not run: actual dates, data and users absent |

All automated fixtures are synthetic and isolated from private band records.
Hosted current-tip CI is separate from local evidence. Record exact failures,
fixes and reruns before promoting this candidate to engineering-ready.

Checkpoint: the first combined gate found two Manager regressions and the DB
suite found the same evaluation failure. A Stalemate workspace question had
fallen through to generic setup advice. A dedicated recorded-data answer now
permits the workspace while retaining imported-song evidence and import
boundaries. Both full test suites and the 119-case evaluation passed afterward.
The worker harness initially lost its dynamically allocated PostgreSQL port on
restart; fixed explicit localhost ports made the full restart proof pass.

Browser checkpoints: the first run exposed new fixture data leaking into the
legacy seed band's expectations and imprecise dropdown selectors. Each new
journey now creates its own synthetic band. The second run passed 37/39 cases;
the invitation case caught an outer layout's sign-in gate dropping the invite
query, fixed by leaving onboarding sign-in with its page. The other failure was
an ambiguous alert locator. Review then found unpinned stale-tab writes across
Manager and booking forms; these are pinned and checked explicitly before
the final candidate is published. A project status option's display text was
also corrected to submit the existing API enum, with lifecycle coverage.
The 43-case run then passed 40 cases; the remaining mobile selector and saved
checkbox timing assumptions were corrected. A focused parallel rerun proved
contact and booking-profile/campaign isolation, and exposed PostgreSQL's
adapter-level serialization conflict during simultaneous workspace creation.
The candidate handles known aborted transactions with bounded retries; unknown
failures must not be retried as though their writes were known to have rolled back.

## Practical limits

Project facts/assets retain the existing last-write-wins PATCH behavior. This
pilot adds band pinning and keeps rejected-save drafts, but does not claim
conflict protection for simultaneous project-fact edits. Agree on one project
facts/assets editor during the pilot and refresh before changing those fields.
Individual milestone creation adds separate tasks; existing booking/setlist
conflict/reconciliation checks are verified separately in their browser journeys.
Unsaved edits still require connectivity and are not durable offline storage.
Real provider sign-in and message receipt remain separate acceptance items.

## Next human decisions

After engineering checks, Jeff approves the candidate and hosting/domain/cost,
configures Google credentials locally, supplies members/roles and the next
rehearsal/gig facts for each band, and identifies approved local Vault feeds.
Use [deployment preparation](pilot-deployment.md) and [band pilot](band-pilot.md)
for the concrete steps. Real account/phone and delivery acceptance are required
before activated; actual rehearsal/show follow-through is required before
field-validated. Neither label can be substituted for the other.

The recommended [managed hosting configuration and budget](pilot-hosting-choice.md)
are ready for review. Jeff has asked for help selecting hosting, not approved
spend. Actual domain/account/provider setup is pending.
