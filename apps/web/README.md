# `@storyboard/web`

Next.js operator UI for StoryBoard.

The app currently provides guided onboarding, the Manager workspace, dashboard,
CRM and booking acquisition, campaign replies, tasks, approvals, notifications,
team administration, and band operations for events, setlists, projects, and
deal records.

Run from the repository root after the API and infrastructure are ready:

```bash
pnpm dev:web
```

Package-only checks:

```bash
pnpm --filter @storyboard/web typecheck
pnpm --filter @storyboard/web lint
pnpm --filter @storyboard/web build
```

`apps/web/next.config.ts` loads the repository-root `.env`. Server rendering
uses `API_URL` (or `INTERNAL_API_URL` in the container bundle), while browser
requests use `NEXT_PUBLIC_API_URL` and include the session cookie. Keep writes
behind the API; the web app must not connect directly to PostgreSQL or provider
SDKs.

Approval eligibility is owned by the API's
`GET /approvals/ready-to-execute` response. Do not add a second browser-side
action allowlist: doing so can hide approved work when a new executable action
is added. Pitch campaigns default to Gmail drafts; immediate delivery must be
chosen explicitly and still requires separate approval and execution.

The Manager page loads `GET /manager/follow-through` during server rendering
and refreshes it after recommendation mutations. Treat that projection as the
display authority for accepted work: chat JSON is only a preview, while the
linked Task, Decision, Project, Event, reviewed Manager memory fact, or Approval
owns current status. Keep internal destination links bounded to
application-relative paths and keep viewer controls read-only. Resolved memory
receipts are filtered by current role and memory sensitivity, and their saved
value is not restored from stale preview JSON. Conversation titles, messages,
actions, continuity, and answer-review queues are also re-projected from the
current fact boundary; archiving or restricting a fact therefore hides its
stale conversation copy. New remember proposals must retain their exact source
message binding; legacy unbound proposals are read-only and hidden rather than
offering an unsafe Accept control. Shared briefs always use redacted provider
context. Owner-only full-context chat turns are hidden from non-owner history
and review queues. Both messages carry durable `owner_only` visibility from the
initial user write through provider failure/rejected-output fallback; the
forward migration backfills trace-bound history and legacy unbound turns fail
closed. Their recommendations are owner-only even when a non-owner knows the
ID. Shared views
omit model-authored metadata; after accepted work reaches a shared Task, Event,
Project, or Approval, teammates see only a sanitized receipt derived from that
record.
Receipt buttons must honor both membership capability and the server's
`canMutate`/`canReconcile` flags; sanitized member receipts are navigation-only.
Message rating controls must honor `canSubmitFeedback`, because the API clears
feedback capability for owner-only and currently hidden-memory placeholders and
rechecks that boundary on write.
**Close after review** records a
note-backed closure of a failed, simulated, or orphaned receipt only; it does
not change the Approval or claim provider success. Never give an uncertain
provider attempt a close or retry button, and never offer receipt reconciliation
for a rejected or expired approval.

See [`../../docs/developer-runbook.md`](../../docs/developer-runbook.md) for
authentication and browser-test setup and
[`../../docs/package-map.md`](../../docs/package-map.md) for route entry points.
